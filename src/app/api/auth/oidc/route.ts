import { problem } from "@/server/infrastructure/http";
import { startOidc } from "@/server/infrastructure/oidc";
export async function GET(req: Request) {
  try {
    const { url, token } = await startOidc();
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        "Set-Cookie": `mct_oidc=${token}; HttpOnly; SameSite=Lax; Path=/api/auth/oidc; Max-Age=600${process.env.APP_ORIGIN?.startsWith("https:") ? "; Secure" : ""}`,
      },
    });
  } catch (e) {
    return problem(e, req, crypto.randomUUID());
  }
}
