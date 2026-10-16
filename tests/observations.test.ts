import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { saveObservation } from "../src/server/application/observations";
import { snapshot } from "../src/server/application/reporting";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  author = randomUUID(),
  peer = randomUUID(),
  viewer = randomUUID(),
  node = randomUUID();
let note: any;
beforeAll(async () => {
  await migrate(db);
  for (const id of [admin, author, peer, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$2,'Autor de teste')",
      [id, id],
    );
  for (const id of [pid, other])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Projeto de teste')",
      [id, id],
    );
  for (const [id, role] of [
    [admin, "PROGRAM_ADMIN"],
    [author, "WORKSTREAM_LEAD"],
    [peer, "GATE_APPROVER"],
    [viewer, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [id, pid, role],
    );
  await db.query(
    "INSERT INTO portfolio.program_nodes(id,program_id,entity_type,entity_id) VALUES($1,$2,'capabilities',$3)",
    [node, pid, randomUUID()],
  );
});
const input = {
  title: "Validação do parceiro",
  body: "Contrato validado. Próximo passo: evidenciar homologação.",
  important: true,
  subject_node_id: node,
};
describe("Observações persistidas", () => {
  it("contribuidor registra contexto e auditoria atomicamente; repetição idempotente preserva autor", async () => {
    const key = randomUUID();
    note = await saveObservation(author, pid, undefined, input, key);
    expect(note.author_id).toBe(author);
    expect(note.subject_node_id).toBe(node);
    expect(note.important).toBe(true);
    expect(
      ((await saveObservation(author, pid, undefined, input, key)) as any).id,
    ).toBe(note.id);
    expect(
      await db.query(
        "SELECT id FROM governance.observations WHERE program_id=$1",
        [pid],
      ),
    ).toHaveLength(1);
    expect(
      await db.query("SELECT id FROM audit.outbox WHERE aggregate_id=$1", [
        note.id,
      ]),
    ).toHaveLength(1);
  });
  it("leitor, programa alheio, assunto externo e campos de autoria não podem escrever", async () => {
    await expect(
      saveObservation(viewer, pid, undefined, input, randomUUID()),
    ).rejects.toThrow(/Leitor/);
    await expect(
      saveObservation(author, other, undefined, input, randomUUID()),
    ).rejects.toThrow(/acesso/);
    await expect(
      saveObservation(
        author,
        pid,
        undefined,
        { ...input, subject_node_id: randomUUID() },
        randomUUID(),
      ),
    ).rejects.toThrow(/pertencer/);
    await expect(
      saveObservation(
        author,
        pid,
        undefined,
        { ...input, author_id: admin },
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect(
      await db.query("SELECT id FROM governance.observations"),
    ).toHaveLength(1);
  });
  it("somente autor ou gestor altera; versão antiga não sobrescreve a nota", async () => {
    const update = {
      title: input.title,
      body: "Homologação concluída com evidência anexada.",
      important: false,
      expectedVersion: 1,
    };
    await expect(
      saveObservation(peer, pid, note.id, update, randomUUID()),
    ).rejects.toThrow(/autor ou gestor/);
    const after: any = await saveObservation(
      author,
      pid,
      note.id,
      update,
      randomUUID(),
    );
    expect(Number(after.version)).toBe(2);
    expect(after.author_id).toBe(author);
    await expect(
      saveObservation(admin, pid, note.id, update, randomUUID()),
    ).rejects.toThrow(/atualizada/);
    note = after;
  });
  it("gestor pode revisar ponto importante; snapshot congela observações sem alterar histórico", async () => {
    const snap: any = await snapshot(admin, pid, randomUUID());
    const after: any = await saveObservation(
      admin,
      pid,
      note.id,
      {
        title: note.title,
        body: "Revisão de status pelo gestor.",
        important: true,
        expectedVersion: 2,
      },
      randomUUID(),
    );
    expect(after.author_id).toBe(author);
    expect(snap.payload.context.observations[0].body).toBe(note.body);
    expect(
      (
        await db.query("SELECT payload FROM reporting.snapshots WHERE id=$1", [
          snap.id,
        ])
      )[0].payload.context.observations[0].body,
    ).toBe(note.body);
  });
});
