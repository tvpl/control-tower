import { beforeAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import {
  normalizeImportFile,
  REQUIRED_IMPORT_COLUMNS,
} from "../src/server/infrastructure/import-files";
import {
  queueImportPreview,
  queueImportCommit,
  importErrorCSV,
} from "../src/server/application/import-jobs";
import {
  processNextJob,
  getJob,
  saveJobArtifact,
} from "../src/server/application/jobs";
import { snapshot } from "../src/server/application/reporting";
import { reportCommand } from "../src/server/application/report-publication";
import {
  queueReportPDF,
  renderReportPDF,
} from "../src/server/application/report-pdf";
import { compareSnapshots } from "../src/server/domain/report-comparison";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  admin = randomUUID(),
  viewer = randomUUID(),
  ws = randomUUID(),
  domain = randomUUID(),
  cap = randomUUID();
const csv = (code: string, extra = "") =>
  REQUIRED_IMPORT_COLUMNS.join(",") +
  ",external_id\n" +
  `ASYNC,DM,WS,CAP,${code},Importação válida,BACKEND,async@test.local,${extra}`;
let preview: any, commit: any;
beforeAll(async () => {
  await migrate(db);
  for (const u of [admin, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name,email) VALUES($1,$1,'Async teste',$2)",
      [u, u === admin ? "async@test.local" : "viewer@test.local"],
    );
  await db.query(
    "INSERT INTO portfolio.programs(id,code,name) VALUES($1,'ASYNC','Async')",
    [pid],
  );
  for (const [u, role] of [
    [admin, "PROGRAM_ADMIN"],
    [viewer, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [u, pid, role],
    );
  await db.query(
    "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'WS','Frente')",
    [ws, pid],
  );
  await db.query(
    "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'DM','Domínio')",
    [domain, pid],
  );
  await db.query(
    "INSERT INTO portfolio.capabilities(id,program_id,domain_id,code,name) VALUES($1,$2,$3,'CAP','Feature')",
    [cap, pid, domain],
  );
});
it("XLSX normaliza acentos, datas, fontes e planilha selecionada; rejeita fórmulas e ZIP inválido", async () => {
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Entregas");
  sheet.addRow(REQUIRED_IMPORT_COLUMNS);
  sheet.addRow([
    "ASYNC",
    "DM",
    "WS",
    "CAP",
    "XLSX-1",
    "Liquidação e autorização",
    "BACKEND",
    "async@test.local",
  ]);
  const bytes = await wb.xlsx.writeBuffer();
  const parsed = await normalizeImportFile(
    "fonte.xlsx",
    Buffer.from(bytes).toString("base64"),
    "Entregas",
  );
  expect(parsed.csv).toContain("Liquidação e autorização");
  expect(parsed.rowNumbers).toEqual([2]);
  expect(parsed.digest).toHaveLength(64);
  sheet.getCell("F2").value = { formula: "1+1", result: 2 };
  await expect(
    normalizeImportFile(
      "form.xlsx",
      Buffer.from(await wb.xlsx.writeBuffer()).toString("base64"),
    ),
  ).rejects.toThrow(/Fórmula/);
  await expect(
    normalizeImportFile(
      "invalid.xlsx",
      Buffer.from("not zip").toString("base64"),
    ),
  ).rejects.toThrow(/inválido/);
  await expect(
    normalizeImportFile("utf.csv", Buffer.from([0xff]).toString("base64")),
  ).rejects.toThrow(/UTF-8/);
  await expect(
    normalizeImportFile(
      "headers.csv",
      Buffer.from("program_code,unsafe\nASYNC,1").toString("base64"),
    ),
  ).rejects.toThrow(/Colunas/);
});
it("prévia e commit são jobs idempotentes, com fonte por campo, sem gravar antes da confirmação", async () => {
  const input = {
    filename: "entregas.csv",
    contentBase64: Buffer.from(csv("ASYNC-1", "source-1")).toString("base64"),
    sourceUrl: "https://source.test/import",
    namespace: "catalog-test",
  };
  const key = randomUUID();
  preview = await queueImportPreview(admin, pid, input, key);
  expect((await queueImportPreview(admin, pid, input, key)).id).toBe(
    preview.id,
  );
  expect((await processNextJob(pid))?.status).toBe("SUCCEEDED");
  preview = await getJob(admin, pid, preview.id);
  expect(preview.output.valid).toBe(true);
  expect(
    await db.query("SELECT id FROM delivery.deliverables WHERE code='ASYNC-1'"),
  ).toHaveLength(0);
  await expect(getJob(viewer, pid, preview.id)).rejects.toThrow(/restrito/);
  await expect(
    queueImportCommit(
      admin,
      pid,
      preview.id,
      { expectedHash: "0".repeat(64) },
      randomUUID(),
    ),
  ).rejects.toThrow(/Prévia/);
  commit = await queueImportCommit(
    admin,
    pid,
    preview.id,
    { expectedHash: preview.output.hash },
    randomUUID(),
  );
  expect((await processNextJob(pid))?.status).toBe("SUCCEEDED");
  const [d] = await db.query(
    "SELECT id FROM delivery.deliverables WHERE code='ASYNC-1'",
  );
  const fields = await db.query(
    "SELECT * FROM integration.field_provenance WHERE entity_id=$1",
    [d.id],
  );
  expect(fields.length).toBeGreaterThan(5);
  expect(
    fields.every(
      (f) =>
        f.source_type === "IMPORT" &&
        f.source_url === "https://source.test/import" &&
        f.job_id === commit.id,
    ),
  ).toBe(true);
  const duplicate = await queueImportPreview(
    admin,
    pid,
    {
      ...input,
      contentBase64: Buffer.from(csv("ASYNC-2", "source-1")).toString("base64"),
    },
    randomUUID(),
  );
  await processNextJob(pid);
  expect((await getJob(admin, pid, duplicate.id)).output.valid).toBe(false);
  expect(importErrorCSV(await getJob(admin, pid, duplicate.id))).toContain(
    "linha,codigo,erros",
  );
});
it("confirmação revalida inventário e perde a corrida sem gravar parcialmente", async () => {
  const input = {
    filename: "race.csv",
    contentBase64: Buffer.from(csv("RACE")).toString("base64"),
  };
  const a = await queueImportPreview(admin, pid, input, randomUUID());
  await processNextJob(pid);
  const v = await getJob(admin, pid, a.id);
  const first = await queueImportCommit(
    admin,
    pid,
    a.id,
    { expectedHash: v.output.hash },
    randomUUID(),
  );
  const second = await queueImportCommit(
    admin,
    pid,
    a.id,
    { expectedHash: v.output.hash },
    randomUUID(),
  );
  await processNextJob(pid);
  await processNextJob(pid);
  const statuses = [
    (await getJob(admin, pid, first.id)).status,
    (await getJob(admin, pid, second.id)).status,
  ];
  expect(statuses).toContain("SUCCEEDED");
  expect(statuses.some((s) => ["FAILED", "CONFLICT"].includes(s))).toBe(true);
  expect(
    await db.query("SELECT id FROM delivery.deliverables WHERE code='RACE'"),
  ).toHaveLength(1);
});
it("job retomado após interrupção respeita tentativas e artefato preserva hash original", async () => {
  const job = await queueImportPreview(
    admin,
    pid,
    {
      filename: "recovery.csv",
      contentBase64: Buffer.from(csv("RECOVERY")).toString("base64"),
    },
    randomUUID(),
  );
  await db.query(
    "UPDATE integration.jobs SET status='RUNNING',lease_until=now()-interval '1 minute',attempts=1 WHERE id=$1",
    [job.id],
  );
  expect((await processNextJob(pid))?.attempts).toBe(2);
  const stored = await saveJobArtifact(
    job,
    "a.txt",
    "text/plain",
    Buffer.from("original"),
  );
  const retry = await saveJobArtifact(
    job,
    "b.txt",
    "text/plain",
    Buffer.from("changed"),
  );
  expect(retry.digest).toBe(stored.digest);
  expect(retry.filename).toBe("a.txt");
  const exhausted = await queueImportPreview(
    admin,
    pid,
    {
      filename: "fail.csv",
      contentBase64: Buffer.from(csv("EXHAUSTED")).toString("base64"),
    },
    randomUUID(),
  );
  await db.query(
    "UPDATE integration.jobs SET status='RUNNING',lease_until=now()-interval '1 minute',attempts=max_attempts WHERE id=$1",
    [exhausted.id],
  );
  await processNextJob(pid);
  expect((await getJob(admin, pid, exhausted.id)).status).toBe("FAILED");
});
it("PDF nasce no servidor com várias páginas e nega versão de report obsoleta", async () => {
  const snap: any = await snapshot(admin, pid, randomUUID());
  const report: any = await reportCommand(
    admin,
    pid,
    undefined,
    undefined,
    {
      title: "Relatório de autorização",
      narrative: "Liquidação, riscos e observações. ".repeat(300),
      snapshotId: snap.id,
      previousSnapshotId: null,
    },
    randomUUID(),
  );
  const bytes = await renderReportPDF(report, snap);
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  const job = await queueReportPDF(admin, pid, report.id, randomUUID());
  expect((await processNextJob(pid))?.status).toBe("SUCCEEDED");
  expect((await getJob(admin, pid, job.id)).output.mime_type).toBe(
    "application/pdf",
  );
  const stale = await queueReportPDF(admin, pid, report.id, randomUUID());
  await db.query(
    "UPDATE integration.jobs SET input=jsonb_set(input,'{reportVersion}','999') WHERE id=$1",
    [stale.id],
  );
  expect((await processNextJob(pid))?.status).toBe("CONFLICT");
});
it("comparação detecta relações e critérios; contexto antigo ausente fica indisponível", () => {
  const before = {
    formula_version: "1",
    payload: {
      deliverables: [],
      context: {
        links: [
          {
            deliverable_id: "a",
            capability_id: "b",
            contribution_type: "REQUIRED",
          },
        ],
        gates: [{ id: "g", criteria: "Original", version: 1 }],
      },
    },
  };
  const after = structuredClone(before);
  after.payload.context.links[0].contribution_type = "OPTIONAL";
  after.payload.context.gates[0].criteria = "Novo";
  const diff = compareSnapshots(after, before);
  expect(
    diff.collections.find((c) => c.kind === "links")?.changed,
  ).toHaveLength(1);
  expect(
    diff.collections.find((c) => c.kind === "gates")?.changed,
  ).toHaveLength(1);
  expect(diff.collections.find((c) => c.kind === "contracts")?.available).toBe(
    false,
  );
});

it("projeção paginada da API preserva relações e calcula saúde apenas dos registros pedidos", async () => {
  const { resourceProjection } =
    await import("../src/server/application/resource-projection");
  const [d] = await db.query(
    "SELECT * FROM delivery.deliverables WHERE program_id=$1 AND code='ASYNC-1'",
    [pid],
  );
  const projection = await resourceProjection("deliverables", pid, [d]);
  expect(projection).toHaveLength(1);
  expect(projection[0].capability_ids).toEqual([cap]);
  expect(projection[0].health).toBeTruthy();
  expect(await resourceProjection("deliverables", pid, [])).toEqual([]);
});
it("estado resumido reduz histórico sem expor snapshot classificado nem alterar o hash original", async () => {
  const { state } = await import("../src/server/application/queries");
  const full = await state(admin, pid),
    summary = await state(admin, pid, "summary");
  expect(summary.snapshots[0].summary_only).toBe(true);
  expect(summary.snapshots[0].payload.context).toBeUndefined();
  expect(summary.snapshots[0].payload_hash).toBe(
    full.snapshots[0].payload_hash,
  );
  const original = full.snapshots[0];
  await db.query(
    "INSERT INTO reporting.snapshots(program_id,as_of,formula_version,payload,payload_hash) VALUES($1,now(),'test',$2::jsonb,$3)",
    [
      pid,
      JSON.stringify({
        ...original.payload,
        context: {
          evidence: [{ classification: "RESTRICTED", title: "Classified" }],
        },
      }),
      "private-test-hash",
    ],
  );
  const reader = await state(viewer, pid, "summary");
  expect(reader.restrictedSnapshots).toBe(1);
  expect(
    reader.snapshots.some((s: any) => s.payload_hash === "private-test-hash"),
  ).toBe(false);
});
