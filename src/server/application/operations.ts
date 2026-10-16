import { DomainError } from "../domain/rules";
import { getDb } from "../infrastructure/database";
import { memberships } from "../infrastructure/auth";
export async function operationalMetrics(userId: string, pid: string) {
  const roles = await memberships(userId, pid);
  if (!roles.some((r) => r.role === "PROGRAM_ADMIN"))
    throw new DomainError(403, "Operação restrita ao administrador.");
  const db = getDb();
  return {
    asOf: new Date().toISOString(),
    jobs: await db.query(
      "SELECT kind,status,count(*)::integer AS total FROM integration.jobs WHERE program_id=$1 GROUP BY kind,status",
      [pid],
    ),
    outbox: (
      await db.query(
        "SELECT count(*)::integer AS pending, min(occurred_at) AS oldest FROM audit.outbox WHERE program_id=$1 AND published_at IS NULL",
        [pid],
      )
    )[0],
    workers: await db.query(
      "SELECT id,last_seen_at,status FROM integration.worker_heartbeats ORDER BY last_seen_at DESC",
    ),
    connections: await db.query(
      "SELECT id,status,last_synced_at,last_attempt_at,failures,circuit_open_until FROM integration.connections WHERE program_id=$1",
      [pid],
    ),
  };
}
export async function workerHeartbeat(
  id: string,
  status: string,
  detail: Record<string, unknown> = {},
) {
  await getDb().query(
    "INSERT INTO integration.worker_heartbeats(id,status,detail) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET last_seen_at=now(),status=excluded.status,detail=excluded.detail",
    [id, status, JSON.stringify(detail)],
  );
}
export function retentionDays(
  value = process.env.MCT_TRANSIENT_RETENTION_DAYS || "30",
) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 7 || days > 3650)
    throw new DomainError(
      422,
      "Retenção transitória deve ser entre 7 e 3650 dias.",
    );
  return days;
}
export async function transientRetention(apply = false) {
  const days = retentionDays(),
    db = getDb();
  return db.transaction(async (tx) => {
    const [jobs] = await tx.query(
      "SELECT count(*)::integer AS total FROM integration.jobs WHERE status IN ('SUCCEEDED','FAILED','CONFLICT','CANCELLED') AND updated_at<now()-($1::int*interval '1 day') AND (input ? 'csv' OR input ? 'rowNumbers')",
      [days],
    );
    const [artifacts] = await tx.query(
      "SELECT count(*)::integer AS total FROM integration.job_artifacts WHERE job_id IN (SELECT id FROM integration.jobs WHERE updated_at<now()-($1::int*interval '1 day'))",
      [days],
    );
    const [hooks] = await tx.query(
      "SELECT count(*)::integer AS total FROM integration.webhook_deliveries WHERE received_at<now()-($1::int*interval '1 day')",
      [days],
    );
    if (apply) {
      // Preserve job metadata, provenance, source digests, preview errors, snapshots, reviews and immutable audit history.
      await tx.query(
        "UPDATE integration.jobs SET input=input-'csv'-'rowNumbers',output=CASE WHEN kind='IMPORT_PREVIEW' THEN (output-'lines')||'{\"expired\":true}'::jsonb ELSE output END WHERE status IN ('SUCCEEDED','FAILED','CONFLICT','CANCELLED') AND updated_at<now()-($1::int*interval '1 day') AND (input ? 'csv' OR input ? 'rowNumbers')",
        [days],
      );
      await tx.query(
        "DELETE FROM integration.job_artifacts WHERE job_id IN (SELECT id FROM integration.jobs WHERE updated_at<now()-($1::int*interval '1 day'))",
        [days],
      );
      await tx.query(
        "DELETE FROM integration.webhook_deliveries WHERE received_at<now()-($1::int*interval '1 day')",
        [days],
      );
      await tx.query(
        "DELETE FROM iam.login_buckets WHERE expires_at<now()-interval '1 day'",
      );
    }
    return {
      mode: apply ? "APPLIED" : "DRY_RUN",
      days,
      jobs: jobs.total,
      artifacts: artifacts.total,
      webhookReceipts: hooks.total,
    };
  });
}
