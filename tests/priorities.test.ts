import { randomUUID } from "node:crypto";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import {
  mutate,
  baseline,
  reviewBaseline,
  snapshot,
} from "../src/server/application/service";
import {
  priorityBoards,
  reorderPriorities,
} from "../src/server/application/priorities";
import { moveInOrder, reorderVisible } from "../src/server/domain/priorities";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  admin = randomUUID(),
  pmo = randomUUID(),
  viewer = randomUUID(),
  leader = randomUUID(),
  pid = randomUUID(),
  otherPid = randomUUID(),
  ws = randomUUID(),
  domain = randomUUID();
let initial: any, caps: any, dels: any;
beforeAll(async () => {
  await migrate(db);
  for (const id of [admin, pmo, viewer, leader])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$2,'Teste de prioridade')",
      [id, id],
    );
  for (const id of [pid, otherPid])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Programa priorizado')",
      [id, id],
    );
  await db.query(
    "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'CORE','Frente principal')",
    [ws, pid],
  );
  await db.query(
    "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'AUT','Autorização')",
    [domain, pid],
  );
  for (const [id, role] of [
    [admin, "PROGRAM_ADMIN"],
    [pmo, "PMO"],
    [viewer, "VIEWER"],
    [leader, "WORKSTREAM_LEAD"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role,workstream_id) VALUES($1,$2,$3,$4)",
      [id, pid, role, role === "WORKSTREAM_LEAD" ? ws : null],
    );
  caps = await mutate(admin, pid, "capabilities", {
    code: "CAP-ONE",
    name: "Capacidade principal",
    domain_id: domain,
    acceptance_criteria: ["Aceite da capacidade"],
  });
  dels = [];
  for (const code of ["DEL-C", "DEL-A", "DEL-B"])
    dels.push(
      await mutate(admin, pid, "deliverables", {
        code,
        name: `Entrega ${code}`,
        layer: "BACKEND",
        deliverable_type: "API",
        owner_id: leader,
        workstream_id: ws,
        capability_ids: [caps.id],
        forecast_date: "2026-11-10",
        acceptance_criteria: "Evidência e aceite verificáveis",
        weight: 2,
      }),
    );
  initial = await priorityBoards(pid);
});
const input = (board: any, order = board.orderedIds) => ({
  kind: board.kind,
  orderedIds: order,
  expectedVersion: board.version,
  universeHash: board.universeHash,
  reason: "Revisar sequência por dependência e disponibilidade",
});
describe("Priorização transacional e interativa", () => {
  it("ordem inicial é neutra, sem prioridade inventada ou gravação na consulta", async () => {
    expect(initial.deliverables.version).toBe(0);
    expect(initial.deliverables.savedIds).toHaveLength(0);
    expect(initial.deliverables.unrankedIds).toHaveLength(3);
    const nodes = await db.query(
      "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1",
      [dels.find((d: any) => d.code === "DEL-A").id],
    );
    expect(initial.deliverables.orderedIds[0]).toBe(nodes[0].id);
    expect(
      await db.query("SELECT * FROM portfolio.priority_boards"),
    ).toHaveLength(0);
  });
  it("arraste filtrado preserva as posições e a ordem dos itens ocultos", () => {
    expect(
      reorderVisible(
        ["a", "hidden", "b", "other", "c"],
        ["a", "b", "c"],
        moveInOrder(["a", "b", "c"], "c", 0),
      ),
    ).toEqual(["c", "hidden", "a", "other", "b"]);
    expect(() => reorderVisible(["a", "b"], ["a", "b"], ["a", "a"])).toThrow(
      /preservar/,
    );
  });
  it("salva ordem, versão, audit e outbox atomicamente; idempotência não duplica", async () => {
    const b = initial.deliverables,
      order = [...b.orderedIds].reverse(),
      key = randomUUID(),
      data = input(b, order);
    const after: any = await reorderPriorities(admin, pid, data, key);
    expect(after.version).toBe(1);
    expect(after.orderedIds).toEqual(order);
    expect(after.unrankedIds).toHaveLength(0);
    expect(
      ((await reorderPriorities(admin, pid, data, key)) as any).version,
    ).toBe(1);
    expect(
      await db.query(
        "SELECT id FROM audit.audit_events WHERE program_id=$1 AND entity_type='priorities'",
        [pid],
      ),
    ).toHaveLength(1);
    expect(
      await db.query(
        "SELECT id FROM audit.outbox WHERE program_id=$1 AND event_type='priorities.Reordered'",
        [pid],
      ),
    ).toHaveLength(1);
    expect((await priorityBoards(pid)).deliverables.orderedIds).toEqual(order);
  });
  it("ordem completa, tipo e acesso são validados; erro não regrava board ou auditoria", async () => {
    const b = (await priorityBoards(pid)).deliverables;
    await expect(
      reorderPriorities(viewer, pid, input(b), randomUUID()),
    ).rejects.toThrow(/exige/);
    await expect(
      reorderPriorities(leader, pid, input(b), randomUUID()),
    ).rejects.toThrow(/exige/);
    await expect(
      reorderPriorities(admin, otherPid, input(b), randomUUID()),
    ).rejects.toThrow(/acesso/);
    await expect(
      reorderPriorities(
        admin,
        pid,
        input(b, b.orderedIds.slice(1)),
        randomUUID(),
      ),
    ).rejects.toThrow(/exatamente/);
    await expect(
      reorderPriorities(
        admin,
        pid,
        input(b, [b.orderedIds[0], b.orderedIds[0], b.orderedIds[2]]),
        randomUUID(),
      ),
    ).rejects.toThrow(/exatamente/);
    await expect(
      reorderPriorities(
        admin,
        pid,
        input(b, [
          initial.capabilities.orderedIds[0],
          ...b.orderedIds.slice(1),
        ]),
        randomUUID(),
      ),
    ).rejects.toThrow(/exatamente/);
    expect((await priorityBoards(pid)).deliverables.version).toBe(1);
    expect(
      await db.query(
        "SELECT id FROM audit.audit_events WHERE program_id=$1 AND entity_type='priorities'",
        [pid],
      ),
    ).toHaveLength(1);
  });
  it("atualização concorrente de outro gestor rejeita versão antiga", async () => {
    const before = (await priorityBoards(pid)).deliverables;
    const after: any = await reorderPriorities(
      pmo,
      pid,
      input(before, [...before.orderedIds].reverse()),
      randomUUID(),
    );
    expect(after.version).toBe(2);
    await expect(
      reorderPriorities(admin, pid, input(before), randomUUID()),
    ).rejects.toThrow(/Outra pessoa/);
  });
  it("novo item aparece sem prioridade e invalida proposta de universo antigo", async () => {
    const before = (await priorityBoards(pid)).deliverables;
    const extra = await mutate(admin, pid, "deliverables", {
      code: "DEL-NEW",
      name: "Nova entrega sem prioridade",
      layer: "DATA",
      deliverable_type: "API",
      owner_id: leader,
      workstream_id: ws,
      capability_ids: [caps.id],
      forecast_date: "2026-11-15",
      acceptance_criteria: "Aceite verificável",
    });
    const now = (await priorityBoards(pid)).deliverables;
    expect(now.unrankedIds).toHaveLength(1);
    expect(now.orderedIds.slice(0, 3)).toEqual(before.orderedIds);
    await expect(
      reorderPriorities(admin, pid, input(before), randomUUID()),
    ).rejects.toThrow(/inventário mudou/);
    expect(
      (
        await db.query(
          "SELECT entity_id FROM portfolio.program_nodes WHERE id=$1",
          [now.unrankedIds[0]],
        )
      )[0].entity_id,
    ).toBe(extra.id);
  });
  it("listas independentes por tipo e priorização preserva compromisso/estado; snapshot captura a ordem", async () => {
    const b: any = await baseline(admin, pid, randomUUID());
    await reviewBaseline(
      pmo,
      pid,
      b.id,
      {
        expectedVersion: Number(b.version),
        decision: "APPROVED",
        reason: "Compromisso revisado por outra pessoa",
      },
      randomUUID(),
    );
    const frozen = await db.query(
      "SELECT * FROM delivery.baseline_items WHERE baseline_id=$1 ORDER BY id",
      [b.id],
    );
    const stateBefore = await db.query(
      "SELECT * FROM delivery.deliverables WHERE program_id=$1 ORDER BY id",
      [pid],
    );
    const boards = await priorityBoards(pid);
    await reorderPriorities(
      admin,
      pid,
      input(boards.capabilities),
      randomUUID(),
    );
    const now: any = await reorderPriorities(
      admin,
      pid,
      input(boards.deliverables, [...boards.deliverables.orderedIds].reverse()),
      randomUUID(),
    );
    expect(
      await db.query(
        "SELECT * FROM delivery.baseline_items WHERE baseline_id=$1 ORDER BY id",
        [b.id],
      ),
    ).toEqual(frozen);
    expect(
      await db.query(
        "SELECT * FROM delivery.deliverables WHERE program_id=$1 ORDER BY id",
        [pid],
      ),
    ).toEqual(stateBefore);
    expect((await priorityBoards(pid)).capabilities.version).toBe(1);
    const snap: any = await snapshot(admin, pid, randomUUID());
    expect(
      snap.payload.context.priorityEntries
        .filter(
          (r: any) =>
            r.board_id ===
            snap.payload.context.priorityBoards.find(
              (b: any) => b.entity_type === "deliverables",
            ).id,
        )
        .sort((a: any, b: any) => a.position - b.position)
        .map((r: any) => r.subject_node_id),
    ).toEqual(now.orderedIds);
  });
});
