/** Invoked only by the isolated Docker infrastructure runner. Never load .env.local. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { getDb } from "../src/server/infrastructure/database";
import { SCHEMA_MANIFEST } from "../src/server/infrastructure/schema-manifest";
import { issueAPIToken } from "../src/server/application/access-management";
import { mutate } from "../src/server/application/inventory";
import { hashPayload } from "../src/server/domain/canonical";
const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.equal(url.hostname, "db", "Somente a rede privada de QA é aceita.");
assert.equal(
  url.pathname,
  "/mct_qa",
  "Somente o banco isolado mct_qa é aceito.",
);
const phase = process.argv[2],
  file = "/qa-output/context.json",
  db = getDb();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function context() {
  return JSON.parse(await readFile(file, "utf8"));
}
async function save(value: unknown) {
  await writeFile(file, JSON.stringify(value), { mode: 0o600 });
}
async function api(
  c: any,
  path: string,
  body?: unknown,
  options: {
    token?: string;
    status?: number;
    key?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const response = await fetch(
    `http://web:3000/api/v1/${path}${path.includes("?") ? "&" : "?"}programId=${c.pid}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${options.token || c.token}`,
        ...(body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "Idempotency-Key": options.key || randomUUID(),
            }),
        ...options.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  const expected = options.status || (body === undefined ? 200 : 201);
  if (response.status !== expected) {
    const problem = await response
      .clone()
      .json()
      .catch(() => ({}));
    assert.fail(
      `${path}: HTTP ${response.status}, esperado ${expected}; ${String(problem.detail || "Resposta inesperada").slice(0, 500)}`,
    );
  }
  return response;
}
async function waitStatus(route: string, status: number) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`http://web:3000${route}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (r.status === status) return;
    } catch {
      /* Still starting. */
    }
    await sleep(500);
  }
  throw new Error(`Timeout aguardando ${route} = ${status}`);
}
async function waitJob(c: any, id: string) {
  for (let i = 0; i < 120; i++) {
    const job = await (await api(c, `jobs/${id}`)).json();
    if (job.status === "SUCCEEDED") return job;
    assert.ok(
      !["FAILED", "CONFLICT", "CANCELLED"].includes(job.status),
      `Job ${job.kind} terminou em ${job.status}`,
    );
    await sleep(500);
  }
  throw new Error("Timeout do worker separado");
}
async function prepare() {
  const migrations = await db.query(
    "SELECT name,hash FROM public.schema_migrations",
  );
  assert.equal(migrations.length, SCHEMA_MANIFEST.length);
  for (const m of SCHEMA_MANIFEST)
    assert.ok(migrations.some((r) => r.name === m.name && r.hash === m.hash));
  assert.equal(
    Number(
      (await db.query("SELECT count(*) AS total FROM portfolio.programs"))[0]
        .total,
    ),
    0,
    "QA precisa começar vazio.",
  );
  const uid = randomUUID(),
    pid = randomUUID();
  await db.query(
    "INSERT INTO iam.users(id,subject,display_name,email) VALUES($1,$1,'QA isolado','qa@infra.test')",
    [uid],
  );
  await db.query(
    "INSERT INTO portfolio.programs(id,code,name,demo) VALUES($1,'INFRA_QA','Programa fictício de infraestrutura',true)",
    [pid],
  );
  await db.query(
    "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,'PROGRAM_ADMIN')",
    [uid, pid],
  );
  const ws = await mutate(uid, pid, "workstreams", {
    code: "WS",
    name: "Frente sintética",
  });
  const domain = await mutate(uid, pid, "domains", {
    code: "DOM",
    name: "Domínio sintético",
  });
  const cap = await mutate(uid, pid, "capabilities", {
    code: "CAP",
    name: "Capacidade sintética",
    domain_id: domain.id,
  });
  const d = await mutate(uid, pid, "deliverables", {
    code: "INITIAL",
    name: "Entrega sintética",
    layer: "BACKEND",
    deliverable_type: "API",
    workstream_id: ws.id,
    owner_id: uid,
    forecast_date: "2026-12-01",
    acceptance_criteria: "Critério de QA",
    capability_ids: [cap.id],
  });
  const options = {
    name: "Token descartável QA",
    programIds: [pid],
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const token = await issueAPIToken(uid, { ...options, access: "WRITE" }),
    read = await issueAPIToken(uid, { ...options, access: "READ" });
  await save({
    pid,
    uid,
    capId: cap.id,
    deliverableId: d.id,
    token: token.token,
    readToken: read.token,
  });
  const password = process.env.MCT_QA_RUNTIME_PASSWORD || "";
  assert.match(password, /^[a-f0-9]{64}$/);
  // Generated hexadecimal fixture only; utility statements do not accept bind parameters here.
  await db.query(
    `CREATE ROLE mct_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`,
  );
  const schemas =
    "public,iam,portfolio,architecture,delivery,governance,integration,reporting,audit";
  await db.query(`GRANT USAGE ON SCHEMA ${schemas} TO mct_runtime`);
  await db.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schemas} TO mct_runtime`,
  );
  await db.query(
    `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schemas} TO mct_runtime`,
  );
  await db.query("REVOKE ALL ON public.schema_migrations FROM mct_runtime");
  await db.query("GRANT SELECT ON public.schema_migrations TO mct_runtime");
  await db.query("CREATE DATABASE mct_qa_restore");
}
async function beforeWorker() {
  const c = await context();
  await waitStatus("/api/health/live", 200);
  await waitStatus("/api/health/ready", 503);
  assert.equal((await fetch("http://web:3000/api/v1/programs")).status, 401);
  await api(c, "programs");
  await api(c, "state", undefined, { token: c.readToken });
  await api(
    c,
    "observations",
    {
      title: "Negativa de escrita",
      body: "Não deve persistir",
      important: false,
      subject_node_id: null,
    },
    { token: c.readToken, status: 403 },
  );
  await api({ ...c, pid: randomUUID() }, "state", undefined, { status: 403 });
  const csv =
    "program_code,domain_code,workstream_code,capability_code,deliverable_code,name,layer,owner_email,stage,execution_status,forecast_date,source_url,acceptance_criteria\nINFRA_QA,DOM,WS,CAP,IMPORTED,Origem sintética,BACKEND,qa@infra.test,IDENTIFIED,NOT_STARTED,2026-12-01,https://source.test/record,Comprovar origem";
  const job = await (
    await api(
      c,
      "import-jobs",
      {
        filename: "qa.csv",
        contentBase64: Buffer.from(csv).toString("base64"),
        namespace: "infra-qa",
      },
      { status: 202 },
    )
  ).json();
  assert.equal(job.status, "QUEUED");
  assert.equal(
    Number(
      (await db.query("SELECT count(*) AS n FROM delivery.deliverables"))[0].n,
    ),
    1,
  );
  await save({ ...c, previewId: job.id });
}
async function afterWorker() {
  const c = await context();
  await waitStatus("/api/health/ready", 200);
  const preview = await waitJob(c, c.previewId);
  assert.equal(preview.output.valid, true);
  assert.equal(
    Number(
      (await db.query("SELECT count(*) AS n FROM delivery.deliverables"))[0].n,
    ),
    1,
    "Preview não escreve inventário",
  );
  const commit = await (
    await api(
      c,
      `import-jobs/${c.previewId}/commit`,
      { expectedHash: preview.output.hash },
      { status: 202 },
    )
  ).json();
  await waitJob(c, commit.id);
  const [imported] = await db.query(
    "SELECT * FROM delivery.deliverables WHERE code='IMPORTED'",
  );
  assert.ok(imported);
  const provenance = await (
    await api(c, `provenance/deliverables/${imported.id}`)
  ).json();
  assert.ok(
    provenance.items.some((item: any) => item.source_type === "IMPORT"),
  );
  const key = randomUUID(),
    note = {
      title: "Concorrência de QA",
      body: "Idempotência entre requisições simultâneas",
      important: true,
      subject_node_id: null,
    };
  const duplicates = await Promise.all([
    api(c, "observations", note, { key }),
    api(c, "observations", note, { key }),
  ]);
  const [one, two] = await Promise.all(duplicates.map((r) => r.json()));
  assert.equal(one.id, two.id);
  const snap = await (await api(c, "snapshots", {})).json();
  assert.equal(hashPayload(snap.payload), snap.payload_hash);
  const report = await (
    await api(c, "reports", {
      title: "Report sintético de infraestrutura",
      narrative: "Verificação PostgreSQL, worker e PDF",
      snapshotId: snap.id,
      previousSnapshotId: null,
    })
  ).json();
  const pdfJob = await (
    await api(c, `reports/${report.id}/pdf`, {}, { status: 202 })
  ).json();
  await waitJob(c, pdfJob.id);
  const pdf = await api(c, `jobs/${pdfJob.id}/artifact`);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    pdf.headers.get("X-Content-SHA256"),
  );
  const runtime = postgres(process.env.MCT_QA_RUNTIME_URL!, { max: 1 });
  try {
    const [rights] =
      await runtime`SELECT current_user,has_database_privilege(current_user,current_database(),'CREATE') AS ddl,has_table_privilege(current_user,'public.schema_migrations','UPDATE') AS migration_write`;
    assert.equal(rights.current_user, "mct_runtime");
    assert.equal(rights.ddl, false);
    assert.equal(rights.migration_write, false);
    await assert.rejects(
      runtime`CREATE TABLE public.forbidden_qa(id int)`,
      (e: any) => e.code === "42501",
    );
    await assert.rejects(
      runtime`UPDATE reporting.snapshots SET payload=payload WHERE id=${snap.id}`,
    );
    await assert.rejects(
      runtime`UPDATE audit.audit_events SET reason=reason WHERE program_id=${c.pid}`,
    );
  } finally {
    await runtime.end();
  }
  await save({ ...c, snapshotId: snap.id, snapshotHash: snap.payload_hash });
}
async function backupRestore() {
  const c = await context(),
    backup = "/qa-output/synthetic.mct",
    run = promisify(execFile);
  const call = (script: string, env = process.env) =>
    run(process.execPath, ["--import", "tsx", script, backup], {
      env,
      timeout: 60000,
    });
  await call("scripts/pg-backup.ts");
  const encrypted = await readFile(backup);
  assert.equal(encrypted.subarray(0, 9).toString(), "MCTBKP001");
  await assert.rejects(
    call("scripts/pg-restore-test.ts", {
      ...process.env,
      MCT_BACKUP_KEY_HEX: "0".repeat(64),
    }),
  );
  await assert.rejects(
    call("scripts/pg-restore-test.ts", {
      ...process.env,
      RESTORE_DATABASE_URL: process.env.DATABASE_URL,
    }),
  );
  await call("scripts/pg-restore-test.ts");
  const restored = postgres(process.env.RESTORE_DATABASE_URL!, { max: 1 });
  try {
    const migrations =
      await restored`SELECT name,hash FROM public.schema_migrations ORDER BY name`;
    assert.deepEqual(
      migrations.map((r) => ({ name: r.name, hash: r.hash })),
      SCHEMA_MANIFEST,
    );
    const snaps =
      await restored`SELECT payload,payload_hash FROM reporting.snapshots ORDER BY id`;
    assert.ok(snaps.length > 0);
    for (const snap of snaps)
      assert.equal(hashPayload(snap.payload), snap.payload_hash);
    assert.equal(
      snaps.find((s) => s.payload_hash === c.snapshotHash)?.payload_hash,
      c.snapshotHash,
    );
    const [rows] =
      await restored`SELECT count(*)::integer AS n FROM delivery.deliverables`;
    assert.equal(rows.n, 2);
    // A nonempty destination must be refused without modifying its frozen rows.
    await assert.rejects(call("scripts/pg-restore-test.ts"));
    const [unchanged] =
      await restored`SELECT payload_hash FROM reporting.snapshots WHERE id=${c.snapshotId}`;
    assert.equal(unchanged.payload_hash, c.snapshotHash);
  } finally {
    await restored.end();
  }
  await writeFile(
    "/qa-output/result.json",
    JSON.stringify({
      snapshotsVerified: 1,
      deliverables: 2,
      encryptedBackup: true,
      wrongKeyRejected: true,
      nonemptyTargetRejected: true,
    }),
    { mode: 0o600 },
  );
}
try {
  switch (phase) {
    case "prepare":
      await prepare();
      break;
    case "before-worker":
      await beforeWorker();
      break;
    case "after-worker":
      await afterWorker();
      break;
    case "backup-restore":
      await backupRestore();
      break;
    case "after-stop":
      await waitStatus("/api/health/ready", 503);
      await waitStatus("/api/health/live", 200);
      break;
    default:
      throw new Error("Fase desconhecida");
  }
  console.log(JSON.stringify({ phase, status: "PASSED" }));
  process.exit(0);
} catch (error) {
  let message = (error as Error).message || "Falha sem detalhes";
  for (const key of [
    "AUTH_SECRET",
    "MCT_QA_RUNTIME_PASSWORD",
    "DATABASE_URL",
    "MCT_QA_RUNTIME_URL",
    "RESTORE_DATABASE_URL",
    "MCT_BACKUP_KEY_HEX",
  ])
    if (process.env[key])
      message = message.replaceAll(process.env[key]!, "[redacted]");
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database]")
    .replace(/[a-f0-9]{64}/gi, "[digest]");
  console.error(
    JSON.stringify({
      phase,
      status: "FAILED",
      errorClass: (error as Error).name,
      message,
      databaseCode: (error as any).code || (error as any).cause?.code,
    }),
  );
  process.exit(1);
}
