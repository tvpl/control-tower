import { assertReadable } from "../domain/access";
import { randomUUID, createHash } from "node:crypto";
import { DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { getDb, type Row } from "../infrastructure/database";
import { audit, idempotent } from "./transactions";
const safe = (job: Row) => ({
  id: job.id,
  program_id: job.program_id,
  actor_id: job.actor_id,
  kind: job.kind,
  status: job.status,
  attempts: job.attempts,
  created_at: job.created_at,
  updated_at: job.updated_at,
  error: job.error,
  output: job.output,
});
export async function enqueueJob(
  userId: string,
  pid: string,
  kind: "IMPORT_PREVIEW" | "IMPORT_COMMIT" | "REPORT_PDF" | "SYNC",
  input: Row,
  key: string,
) {
  const job = (await idempotent(
    userId,
    key,
    { op: "job", pid, kind, input },
    async (tx) => {
      await memberships(userId, pid, tx);
      const [pending] = await tx.query(
        "SELECT count(*)::integer AS total FROM integration.jobs WHERE actor_id=$1 AND program_id=$2 AND status IN ('QUEUED','RUNNING')",
        [userId, pid],
      );
      if (pending.total >= 5)
        throw new DomainError(
          429,
          "Aguarde os jobs em processamento antes de enviar outros.",
        );
      const [record] = await tx.query(
        "INSERT INTO integration.jobs(program_id,actor_id,kind,input) VALUES($1,$2,$3,$4::jsonb) RETURNING *",
        [pid, userId, kind, JSON.stringify(input)],
      );
      const metadata = safe(record);
      await audit(
        tx,
        userId,
        pid,
        "jobs",
        record.id,
        "Queued",
        null,
        { ...metadata, output: null },
        "Processamento assíncrono solicitado",
        randomUUID(),
      );
      return metadata;
    },
  )) as Row;
  kickLocalWorker(pid);
  return job;
}
export async function getJob(userId: string, pid: string, id: string) {
  const roles = await memberships(userId, pid);
  const [job] = await getDb().query(
    "SELECT * FROM integration.jobs WHERE id=$1 AND program_id=$2",
    [id, pid],
  );
  if (!job) throw new DomainError(404, "Job não encontrado.");
  if (
    job.kind !== "REPORT_PDF" &&
    job.actor_id !== userId &&
    !roles.some((r) => r.role === "PROGRAM_ADMIN")
  )
    throw new DomainError(403, "Job restrito ao solicitante e administrador.");
  if (job.kind === "REPORT_PDF") {
    const refs = await getDb().query(
      "SELECT s.* FROM reporting.snapshots s JOIN reporting.reports r ON s.id=r.snapshot_id OR s.id=r.previous_snapshot_id WHERE r.id=$1 AND r.program_id=$2",
      [job.input.reportId, pid],
    );
    for (const ref of refs) assertReadable(ref, roles);
  }
  return safe(job);
}
export async function processNextJob(pid?: string) {
  const db = getDb(),
    lease = randomUUID();
  await db.query(
    "UPDATE integration.jobs SET status='FAILED',error='Limite de tentativas após interrupção do worker.',updated_at=now() WHERE status='RUNNING' AND lease_until<now() AND attempts>=max_attempts AND ($1::uuid IS NULL OR program_id=$1)",
    [pid || null],
  );
  const [job] = await db.query(
    "UPDATE integration.jobs SET status='RUNNING',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=(SELECT id FROM integration.jobs WHERE ((status='QUEUED' AND available_at<=now()) OR (status='RUNNING' AND lease_until<now())) AND attempts<max_attempts AND ($2::uuid IS NULL OR program_id=$2) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",
    [lease, pid || null],
  );
  if (!job) return null;
  await db.query(
    "UPDATE integration.job_attempts SET status='FAILED',error='Lease interrompido; execução retomada.',finished_at=now() WHERE job_id=$1 AND status='RUNNING' AND lease_token<>$2",
    [job.id, lease],
  );
  await db.query(
    "INSERT INTO integration.job_attempts(job_id,lease_token) VALUES($1,$2)",
    [job.id, lease],
  );
  try {
    await memberships(job.actor_id, job.program_id);
    let output: unknown;
    if (job.kind === "IMPORT_PREVIEW" || job.kind === "IMPORT_COMMIT")
      output = await (await import("./import-jobs")).processImportJob(job);
    else if (job.kind === "REPORT_PDF")
      output = await (await import("./report-pdf")).processPDFJob(job);
    else if (job.kind === "SYNC")
      output = await (await import("./sync-worker")).processSyncJob(job);
    else throw new DomainError(422, "Tipo de job desconhecido.");
    await db.query(
      "UPDATE integration.job_attempts SET status='SUCCEEDED',finished_at=now() WHERE lease_token=$1",
      [lease],
    );
    const [done] = await db.query(
      "UPDATE integration.jobs SET status='SUCCEEDED',output=$1::jsonb,error=NULL,lease_until=NULL,updated_at=now() WHERE id=$2 AND lease_token=$3 RETURNING *",
      [JSON.stringify(output), job.id, lease],
    );
    return done ? safe(done) : null;
  } catch (error) {
    const conflict = error instanceof DomainError && error.status === 409,
      terminal = error instanceof DomainError && error.status < 500;
    const retry = !terminal && Number(job.attempts) < Number(job.max_attempts);
    const message =
      error instanceof DomainError
        ? error.message
        : "Falha de processamento. Consulte a correlação e tente novamente.";
    await db.query(
      "UPDATE integration.job_attempts SET status='FAILED',finished_at=now(),error=$1 WHERE lease_token=$2",
      [message, lease],
    );
    const [failed] = await db.query(
      "UPDATE integration.jobs SET status=$1,error=$2,available_at=now()+($3::integer*interval '1 second'),lease_until=NULL,updated_at=now() WHERE id=$4 AND lease_token=$5 RETURNING *",
      [
        retry ? "QUEUED" : conflict ? "CONFLICT" : "FAILED",
        message,
        Math.min(300, 2 ** Number(job.attempts) * 5),
        job.id,
        lease,
      ],
    );
    return failed ? safe(failed) : null;
  }
}
const workerGlobal = globalThis as typeof globalThis & {
  mctWorkerPumps?: Set<string>;
};
export function kickLocalWorker(pid: string) {
  if (
    process.env.NODE_ENV === "test" ||
    (process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_PREVIEW !== "true")
  )
    return;
  const active = (workerGlobal.mctWorkerPumps ||= new Set());
  if (active.has(pid)) return;
  active.add(pid);
  setTimeout(async () => {
    try {
      for (let i = 0; i < 10; i++) if (!(await processNextJob(pid))) break;
    } catch {
      console.error(
        JSON.stringify({ event: "worker.failure", programId: pid }),
      );
    } finally {
      active.delete(pid);
    }
  }, 0);
}
export async function saveJobArtifact(
  job: Row,
  filename: string,
  mime: string,
  bytes: Uint8Array,
) {
  if (bytes.length > 10000000)
    throw new DomainError(413, "Artefato excede 10 MB.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  await getDb().query(
    "INSERT INTO integration.job_artifacts(job_id,program_id,filename,mime_type,payload_base64,digest) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(job_id) DO NOTHING",
    [
      job.id,
      job.program_id,
      filename,
      mime,
      Buffer.from(bytes).toString("base64"),
      digest,
    ],
  );
  const [stored] = await getDb().query(
    "SELECT filename,mime_type,digest,length(decode(payload_base64,'base64')) AS bytes FROM integration.job_artifacts WHERE job_id=$1",
    [job.id],
  );
  return stored;
}
