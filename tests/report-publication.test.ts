import { randomUUID } from "node:crypto";
import { beforeAll, expect, it } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { snapshot } from "../src/server/application/reporting";
import { reportCommand } from "../src/server/application/report-publication";
import { hashPayload } from "../src/server/domain/canonical";
import { compareSnapshots } from "../src/server/domain/report-comparison";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  other = randomUUID(),
  author = randomUUID(),
  reviewer = randomUUID(),
  viewer = randomUUID();
let snap: any, report: any;
beforeAll(async () => {
  await migrate(db);
  for (const id of [author, reviewer, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$2,'Test report')",
      [id, id],
    );
  for (const id of [pid, other])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Test program')",
      [id, id],
    );
  for (const [id, role] of [
    [author, "PROGRAM_ADMIN"],
    [reviewer, "PMO"],
    [viewer, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [id, pid, role],
    );
  snap = await snapshot(author, pid, randomUUID());
});
const input = () => ({
  title: "Reporte semanal governado",
  narrative: "Conferir evidências e liberar homologação.",
  snapshotId: snap.id,
  previousSnapshotId: null,
});
it("submete uma vez, com hash e auditoria transacional", async () => {
  const key = randomUUID();
  report = await reportCommand(author, pid, undefined, undefined, input(), key);
  expect(report.status).toBe("SUBMITTED");
  expect(
    (
      (await reportCommand(
        author,
        pid,
        undefined,
        undefined,
        input(),
        key,
      )) as any
    ).id,
  ).toBe(report.id);
  expect(report.payload_hash).toBe(
    hashPayload({
      title: input().title,
      narrative: input().narrative,
      snapshotId: snap.id,
      snapshotHash: snap.payload_hash,
      previousSnapshotId: null,
    }),
  );
  expect(
    await db.query("SELECT id FROM audit.outbox WHERE aggregate_id=$1", [
      report.id,
    ]),
  ).toHaveLength(1);
});
it("nega viewer, auto-revisão, outro programa e referência anterior inválida", async () => {
  await expect(
    reportCommand(viewer, pid, undefined, undefined, input(), randomUUID()),
  ).rejects.toThrow(/requer/);
  await expect(
    reportCommand(
      author,
      pid,
      report.id,
      "review",
      { expectedVersion: 1, decision: "APPROVED", reason: "Validado" },
      randomUUID(),
    ),
  ).rejects.toThrow(/outra pessoa/);
  await expect(
    reportCommand(
      reviewer,
      other,
      report.id,
      "review",
      { expectedVersion: 1, decision: "APPROVED", reason: "Validado" },
      randomUUID(),
    ),
  ).rejects.toThrow(/acesso/);
  await expect(
    reportCommand(
      author,
      pid,
      undefined,
      undefined,
      { ...input(), snapshotId: randomUUID() },
      randomUUID(),
    ),
  ).rejects.toThrow(/pertence/);
  await expect(
    reportCommand(
      author,
      pid,
      undefined,
      undefined,
      { ...input(), previousSnapshotId: snap.id },
      randomUUID(),
    ),
  ).rejects.toThrow(/anterior/);
});
it("publicação exige revisão aprovada e versão atual", async () => {
  await expect(
    reportCommand(
      author,
      pid,
      report.id,
      "publish",
      { expectedVersion: 1, reason: "Publicar" },
      randomUUID(),
    ),
  ).rejects.toThrow(/revisão/);
  report = await reportCommand(
    reviewer,
    pid,
    report.id,
    "review",
    {
      expectedVersion: 1,
      decision: "APPROVED",
      reason: "Números e texto conferidos",
    },
    randomUUID(),
  );
  expect(report.reviewer_id).toBe(reviewer);
  expect(Number(report.version)).toBe(2);
  await expect(
    reportCommand(
      author,
      pid,
      report.id,
      "publish",
      { expectedVersion: 1, reason: "Publicar" },
      randomUUID(),
    ),
  ).rejects.toThrow(/alterado/);
  report = await reportCommand(
    author,
    pid,
    report.id,
    "publish",
    { expectedVersion: 2, reason: "Revisão independente concluída" },
    randomUUID(),
  );
  expect(report.status).toBe("PUBLISHED");
  expect(report.published_at).toBeTruthy();
  expect(
    await db.query("SELECT id FROM audit.outbox WHERE aggregate_id=$1", [
      report.id,
    ]),
  ).toHaveLength(3);
});
it("SQL protege texto enviado e relatório final contra alteração e exclusão", async () => {
  await expect(
    db.query("UPDATE reporting.reports SET title='Alterado' WHERE id=$1", [
      report.id,
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("DELETE FROM reporting.reports WHERE id=$1", [report.id]),
  ).rejects.toThrow();
  expect(
    (
      await db.query("SELECT title,status FROM reporting.reports WHERE id=$1", [
        report.id,
      ])
    )[0],
  ).toMatchObject({ title: input().title, status: "PUBLISHED" });
  const submitted: any = await reportCommand(
    author,
    pid,
    undefined,
    undefined,
    input(),
    randomUUID(),
  );
  await expect(
    db.query(
      "UPDATE reporting.reports SET narrative='Texto alterado' WHERE id=$1",
      [submitted.id],
    ),
  ).rejects.toThrow();
});
it("rejeição encerra a versão e exige novo envio", async () => {
  const submitted: any = await reportCommand(
    author,
    pid,
    undefined,
    undefined,
    input(),
    randomUUID(),
  );
  const rejected: any = await reportCommand(
    reviewer,
    pid,
    submitted.id,
    "review",
    {
      expectedVersion: 1,
      decision: "REJECTED",
      reason: "Complementar recomendação",
    },
    randomUUID(),
  );
  expect(rejected.status).toBe("REJECTED");
  await expect(
    reportCommand(
      author,
      pid,
      rejected.id,
      "publish",
      { expectedVersion: 2, reason: "Publicar" },
      randomUUID(),
    ),
  ).rejects.toThrow(/revisão/);
});
it("comparação identifica adição, remoção e mudanças de estado sem confundir fórmulas", () => {
  const old = {
    formula_version: "1",
    payload: {
      deliverables: [
        { id: "a", name: "Um", accepted: false, forecast_date: null },
        { id: "b", name: "Dois" },
      ],
    },
  };
  const current = {
    formula_version: "2",
    payload: {
      deliverables: [
        { id: "a", name: "Um", accepted: true, forecast_date: "2026-11-01" },
        { id: "c", name: "Três" },
      ],
    },
  };
  const delta = compareSnapshots(current, old);
  expect(delta.comparable).toBe(false);
  expect(delta.added.map((d) => d.id)).toEqual(["c"]);
  expect(delta.removed.map((d) => d.id)).toEqual(["b"]);
  expect(delta.changed[0].fields.map((f) => f.field)).toEqual([
    "accepted",
    "forecast_date",
  ]);
  expect(compareSnapshots(current, current).changed).toEqual([]);
});
