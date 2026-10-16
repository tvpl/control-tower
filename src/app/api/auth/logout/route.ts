import { assertOrigin } from "@/server/infrastructure/auth";
import { problem } from "@/server/infrastructure/http";
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie":
            "mct_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        },
      },
    );
  } catch (e) {
    return problem(e, req, crypto.randomUUID());
  }
}
