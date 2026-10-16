import { SignJWT, jwtVerify } from "jose";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { DomainError, type Membership } from "../domain/rules";
import { getDb, type Database } from "./database";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(":");
  if (!salt || !value) return false;
  const check = scryptSync(password, salt, 64),
    expected = Buffer.from(value, "hex");
  return check.length === expected.length && timingSafeEqual(check, expected);
}
function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32)
    throw new Error("Configure AUTH_SECRET com pelo menos 32 caracteres");
  return new TextEncoder().encode(s);
}
export async function signSession(id: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}
export async function currentUser() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("mct_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    const [user] = await getDb().query(
      "SELECT id,display_name,email FROM iam.users WHERE id=$1",
      [payload.sub],
    );
    return user || null;
  } catch {
    return null;
  }
}
export async function requireUser(req?: Request) {
  const authorization = req?.headers.get("authorization");
  if (authorization) {
    if (!authorization.startsWith("Bearer ") || authorization.length > 8192)
      throw new DomainError(401, "Use um token Bearer válido.");
    return (await import("./access-tokens")).authenticateBearer(
      authorization.slice(7),
    );
  }
  const user = await currentUser();
  if (!user) throw new DomainError(401, "Entre para acessar este programa.");
  return user;
}
export async function memberships(
  userId: string,
  programId: string,
  database: Database = getDb(),
) {
  const rows = await database.query(
    "SELECT id,role,workstream_id,gate_categories,data_clearance,domain_ids,expires_at FROM iam.memberships WHERE user_id=$1 AND program_id=$2 AND (expires_at IS NULL OR expires_at>now())",
    [userId, programId],
  );
  if (!rows.length)
    throw new DomainError(403, "Você não tem acesso a este programa.");
  return rows as RowMembership[];
}
type RowMembership = Membership & { gate_categories: string[] };
export function assertOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_ORIGIN;
  if (!origin || origin !== expected)
    throw new DomainError(403, "Origem da solicitação não autorizada.");
}
export async function limitLogin(key: string) {
  const hash = createHash("sha256").update(key).digest("hex");
  const [record] = await getDb().query(
    "INSERT INTO iam.login_buckets(key_hash,hits,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET hits=CASE WHEN iam.login_buckets.expires_at<=now() THEN 1 ELSE iam.login_buckets.hits+1 END,expires_at=CASE WHEN iam.login_buckets.expires_at<=now() THEN now()+interval '15 minutes' ELSE iam.login_buckets.expires_at END RETURNING hits",
    [hash],
  );
  if (Number(record.hits) === 1)
    await getDb().query(
      "DELETE FROM iam.login_buckets WHERE key_hash IN (SELECT key_hash FROM iam.login_buckets WHERE expires_at<now()-interval '1 day' LIMIT 500)",
    );
  if (Number(record.hits) > 8)
    throw new DomainError(429, "Muitas tentativas. Aguarde 15 minutos.");
}
