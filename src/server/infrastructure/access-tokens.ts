import { createHash, createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { DomainError } from "../domain/rules";
import { getDb } from "./database";
function tokenKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET inválido");
  return createHmac("sha256", secret).update("mct-api-access-v1").digest();
}
export const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function signAccessToken(
  userId: string,
  id: string,
  expiresAt: string,
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "mct-api" })
    .setSubject(userId)
    .setJti(id)
    .setIssuer("urn:mct:api")
    .setAudience("mct-api")
    .setIssuedAt()
    .setExpirationTime(Math.floor(new Date(expiresAt).getTime() / 1000))
    .sign(tokenKey());
}
export async function authenticateBearer(token: string) {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, tokenKey(), {
      algorithms: ["HS256"],
      issuer: "urn:mct:api",
      audience: "mct-api",
    });
    if (protectedHeader.typ !== "mct-api" || !payload.jti || !payload.sub)
      throw new Error("Invalid token type");
    const [record] = await getDb().query(
      "SELECT t.*,u.display_name,u.email FROM iam.api_tokens t JOIN iam.users u ON u.id=t.user_id WHERE t.id=$1 AND t.user_id=$2 AND t.revoked_at IS NULL AND t.expires_at>now()",
      [payload.jti, payload.sub],
    );
    if (!record || record.token_digest !== tokenDigest(token))
      throw new Error("Revoked or unknown token");
    return {
      id: record.user_id,
      display_name: record.display_name,
      email: record.email,
      apiToken: {
        id: record.id,
        programIds: record.program_ids as string[],
        access: record.access as "READ" | "WRITE",
      },
    };
  } catch {
    throw new DomainError(401, "Token de API inválido, expirado ou revogado.");
  }
}
