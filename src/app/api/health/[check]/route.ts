import { getDb } from "@/server/infrastructure/database";
import { SCHEMA_MANIFEST } from "@/server/infrastructure/schema-manifest";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ check: string }> },
) {
  const { check } = await ctx.params;
  if (check === "live")
    return Response.json(
      { status: "UP" },
      { headers: { "Cache-Control": "no-store" } },
    );
  if (check !== "ready") return new Response(null, { status: 404 });
  try {
    const rows = await getDb().query(
      "SELECT name,hash FROM public.schema_migrations",
    );
    if (
      SCHEMA_MANIFEST.some(
        (m) => !rows.some((r) => r.name === m.name && r.hash === m.hash),
      )
    )
      return Response.json({ status: "NOT_READY" }, { status: 503 });
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_PREVIEW !== "true"
    ) {
      const [worker] = await getDb().query(
        "SELECT id FROM integration.worker_heartbeats WHERE status='RUNNING' AND last_seen_at>now()-interval '45 seconds' LIMIT 1",
      );
      if (!worker)
        return Response.json({ status: "NOT_READY" }, { status: 503 });
    }
    return Response.json(
      { status: "READY" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "NOT_READY" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
