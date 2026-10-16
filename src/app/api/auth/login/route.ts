import { DomainError } from "@/server/domain/rules";
import {
  assertOrigin,
  limitLogin,
  signSession,
  verifyPassword,
} from "@/server/infrastructure/auth";
import { getDb } from "@/server/infrastructure/database";
import { problem, readJSON } from "@/server/infrastructure/http";
import { z } from "zod";
export async function POST(req: Request) {
  const cid = crypto.randomUUID();
  try {
    assertOrigin(req);
    if (
      process.env.AUTH_MODE !== "local" ||
      (process.env.NODE_ENV === "production" &&
        process.env.ALLOW_LOCAL_PREVIEW !== "true")
    )
      throw new DomainError(403, "Login local desabilitado.");
    const { email, password } = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(await readJSON(req, 4096));
    await limitLogin(email.toLowerCase());
    const [user] = await getDb().query(
      "SELECT * FROM iam.users WHERE email=$1",
      [email.toLowerCase()],
    );
    if (!user?.password_hash || !verifyPassword(password, user.password_hash))
      throw new DomainError(401, "E-mail ou senha inválidos.");
    const token = await signSession(user.id);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": `mct_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.APP_ORIGIN?.startsWith("https:") ? "; Secure" : ""}`,
        },
      },
    );
  } catch (error) {
    return problem(error, req, cid);
  }
}
