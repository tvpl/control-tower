import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
if (process.env.DATABASE_URL)
  throw new Error(
    "Benchmark sintético exige ambiente isolado, sem DATABASE_URL.",
  );
process.env.PGLITE_DATA_DIR = "memory://";
const { getDb } = await import("../src/server/infrastructure/database"),
  { migrate } = await import("../src/server/infrastructure/migrations"),
  { state } = await import("../src/server/application/queries"),
  { resourceProjection } =
    await import("../src/server/application/resource-projection");
const db = getDb(),
  pid = randomUUID(),
  uid = randomUUID(),
  ws = randomUUID(),
  domain = randomUUID(),
  total = Number(process.env.BENCHMARK_ITEMS || 5000),
  caps = Math.ceil(total / 10);
if (!Number.isInteger(total) || total < 100 || total > 10000)
  throw new Error("Use 100–10000 itens.");
await migrate(db);
await db.query(
  "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$1,'Benchmark sintético')",
  [uid],
);
await db.query(
  "INSERT INTO portfolio.programs(id,code,name,demo) VALUES($1,'BENCH','Benchmark fictício',true)",
  [pid],
);
await db.query(
  "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,'PROGRAM_ADMIN')",
  [uid, pid],
);
await db.query(
  "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'WS','Frente sintética')",
  [ws, pid],
);
await db.query(
  "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'DOMAIN','Domínio sintético')",
  [domain, pid],
);
await db.query(
  "INSERT INTO portfolio.capabilities(id,program_id,domain_id,code,name) SELECT md5('benchmark-cap-'||i)::uuid,$1,$2,'CAP-'||i,'Feature sintética '||i FROM generate_series(1,$3::integer) i",
  [pid, domain, caps],
);
await db.query(
  "INSERT INTO delivery.deliverables(id,program_id,workstream_id,code,name,layer,deliverable_type,owner_id,forecast_date,acceptance_criteria) SELECT md5('benchmark-del-'||i)::uuid,$1,$2,'DEL-'||i,'Entregável sintético '||i,'BACKEND','API',$3,'2026-12-01','Critério sintético' FROM generate_series(1,$4::integer) i",
  [pid, ws, uid, total],
);
await db.query(
  "INSERT INTO portfolio.program_nodes(program_id,entity_type,entity_id) SELECT $1::uuid,'deliverables',id FROM delivery.deliverables WHERE program_id=$1 UNION ALL SELECT $1::uuid,'capabilities',id FROM portfolio.capabilities WHERE program_id=$1",
  [pid],
);
await db.query(
  "INSERT INTO delivery.deliverable_capabilities(program_id,deliverable_id,capability_id) SELECT $1,md5('benchmark-del-'||i)::uuid,md5('benchmark-cap-'||(1+(i-1)%$3::integer))::uuid FROM generate_series(1,$2::integer) i",
  [pid, total, caps],
);
const samples: number[] = [],
  pages: number[] = [];
let bytes = 0;
for (let i = 0; i < 11; i++) {
  let start = performance.now();
  const projection = await state(uid, pid);
  if (i) samples.push(performance.now() - start);
  bytes = Buffer.byteLength(JSON.stringify(projection));
  start = performance.now();
  const rows = await db.query(
    "SELECT * FROM delivery.deliverables WHERE program_id=$1 ORDER BY id LIMIT 50",
    [pid],
  );
  await resourceProjection("deliverables", pid, rows);
  if (i) pages.push(performance.now() - start);
}
const percentiles = (values: number[]) => {
  values.sort((a, b) => a - b);
  return {
    samples: values.length,
    p50Ms: Math.round(values[Math.floor(values.length * 0.5)]),
    p95Ms: Math.round(values[Math.ceil(values.length * 0.95) - 1]),
    maxMs: Math.round(values.at(-1)!),
  };
};
const result = {
  asOf: new Date().toISOString(),
  environment:
    "PGlite memory / Node local; synthetic only, no concurrent users or network",
  deliverables: total,
  capabilities: caps,
  snapshots: 0,
  state: percentiles(samples),
  page50: percentiles(pages),
  stateBytes: bytes,
  limitations: [
    "Medição local da aplicação; não certifica PostgreSQL servidor, rede, concorrência, HA ou SLA.",
    "Carga de snapshots históricos precisa de ensaio separado.",
  ],
};
await writeFile(
  "docs/implementation/benchmark-local.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
process.exit(0);
