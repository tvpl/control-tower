import { DomainError } from "@/server/domain/rules";
import { signSession } from "@/server/infrastructure/auth";
import { getDb } from "@/server/infrastructure/database";
import { problem } from "@/server/infrastructure/http";
import { finishOidc } from "@/server/infrastructure/oidc";
import { cookies } from "next/headers";
export async function GET(req: Request) {
  try {
    const token = (await cookies()).get("mct_oidc")?.value;
    if (!token) throw new DomainError(401, "Fluxo de autenticação expirado.");
    const identity = await finishOidc(new URL(req.url), token);
    const [user] = await getDb().query(
      "SELECT id FROM iam.users WHERE subject=$1",
      [identity.subject],
    );
    if (!user)
      throw new DomainError(
        403,
        "Identidade autenticada, porém sem provisionamento. Solicite acesso ao administrador.",
      );
    const session = await signSession(user.id);
    const res = new Response(null, {
      status: 302,
      headers: { Location: `${process.env.APP_ORIGIN}/` },
    });
    res.headers.append(
      "Set-Cookie",
      `mct_session=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`,
    );
    res.headers.append(
      "Set-Cookie",
      "mct_oidc=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/oidc; Max-Age=0",
    );
    return res;
  } catch (e) {
    return problem(e, req, crypto.randomUUID());
  }
}
