import { randomUUID } from "node:crypto";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import {
  mutate,
  baseline,
  reviewBaseline,
} from "../src/server/application/service";
import {
  previewChange,
  proposeChange,
  reviewChange,
  applyChange,
  cancelChange,
} from "../src/server/application/change-control";
import { hashPayload } from "../src/server/domain/canonical";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  otherPid = randomUUID(),
  admin = randomUUID(),
  pmo = randomUUID(),
  leader = randomUUID(),
  viewer = randomUUID(),
  ws = randomUUID(),
  ws2 = randomUUID(),
  domain = randomUUID();
let counter = 0;
beforeAll(async () => {
  await migrate(db);
  for (const uid of [admin, pmo, leader, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$2,'Teste de governança')",
      [uid, uid],
    );
  for (const id of [pid, otherPid])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Programa de change control')",
      [id, id],
    );
  for (const id of [ws, ws2])
    await db.query(
      "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,$3,'Frente governada')",
      [id, pid, id],
    );
  for (const [uid, role, stream] of [
    [admin, "PROGRAM_ADMIN", null],
    [admin, "PMO", null],
    [pmo, "PMO", null],
    [leader, "WORKSTREAM_LEAD", ws],
    [viewer, "VIEWER", null],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role,workstream_id) VALUES($1,$2,$3,$4)",
      [uid, pid, role, stream],
    );
  await db.query(
    "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'GOV','Governança')",
    [domain, pid],
  );
});
async function capability() {
  return mutate(admin, pid, "capabilities", {
    code: `CAP-${++counter}`,
    name: "Capacidade governada",
    domain_id: domain,
    acceptance_criteria: ["Critério verificável"],
  });
}
async function delivery(cap: string, stream = ws) {
  return mutate(admin, pid, "deliverables", {
    code: `DEL-${++counter}`,
    name: "Entregável governado",
    workstream_id: stream,
    layer: "BACKEND",
    deliverable_type: "API",
    owner_id: leader,
    capability_ids: [cap],
    acceptance_criteria: "Aceite verificável",
    forecast_date: "2026-11-20",
    weight: 2,
  });
}
async function proposal(
  entity: any,
  changes: any = { scope_status: "APPROVED" },
) {
  const [node] = await db.query(
    "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1 AND program_id=$2",
    [entity.id, pid],
  );
  return {
    subject_node_id: node.id,
    expectedVersion: Number(entity.version),
    title: "Mudança governada",
    reason: "Justificativa verificável",
    alternatives: "Preservar escopo atual ou alterar por onda",
    risk_and_mitigation: "Revalidar testes, aceite e plano de rollout",
    changes,
  };
}
async function freeze() {
  const b: any = await baseline(admin, pid, randomUUID());
  return reviewBaseline(
    pmo,
    pid,
    b.id,
    {
      expectedVersion: Number(b.version),
      decision: "APPROVED",
      reason: "Revisão independente do compromisso",
    },
    randomUUID(),
  );
}
async function approve(r: any) {
  return reviewChange(
    pmo,
    pid,
    r.id,
    {
      expectedVersion: Number(r.version),
      decision: "APPROVED",
      reason: "Impacto analisado e risco aceito",
    },
    randomUUID(),
  ) as Promise<any>;
}
describe("Change control segregado e preservação de baseline", () => {
  it("contribuição congelada exige decisão e é aplicada sem modificar o tipo na baseline anterior", async () => {
    const c = await capability(),
      d = await delivery(c.id),
      b: any = await freeze();
    await expect(
      mutate(
        admin,
        pid,
        "deliverables",
        { capability_roles: { [c.id]: "OPTIONAL" } },
        d.id,
        Number(d.version),
        "Remover obrigação diretamente",
      ),
    ).rejects.toThrow(/change control/);
    const r: any = await proposeChange(
        admin,
        pid,
        await proposal(d, { capability_roles: { [c.id]: "OPTIONAL" } }),
        randomUUID(),
      ),
      approved = await approve(r);
    await applyChange(
      admin,
      pid,
      r.id,
      { expectedVersion: Number(approved.version) },
      randomUUID(),
    );
    expect(
      (
        await db.query(
          "SELECT contribution_type FROM delivery.deliverable_capabilities WHERE deliverable_id=$1",
          [d.id],
        )
      )[0].contribution_type,
    ).toBe("OPTIONAL");
    const items = await db.query(
      "SELECT frozen_payload FROM delivery.baseline_items WHERE baseline_id=$1",
      [b.id],
    );
    expect(
      items.find((i) => i.frozen_payload.id === d.id)!.frozen_payload
        .capability_roles[c.id],
    ).toBe("REQUIRED");
  });
  it("baseline submetida congela itens, exige outra pessoa e aprova idempotentemente", async () => {
    const c = await capability();
    await delivery(c.id);
    const b: any = await baseline(
      admin,
      pid,
      randomUUID(),
      "Compromisso por onda para o programa",
    );
    expect(b.status).toBe("SUBMITTED");
    expect(b.approved_by).toBeNull();
    const [item] = await db.query(
      "SELECT * FROM delivery.baseline_items WHERE baseline_id=$1",
      [b.id],
    );
    await expect(
      db.query(
        "UPDATE delivery.baseline_items SET frozen_payload='{}' WHERE id=$1",
        [item.id],
      ),
    ).rejects.toThrow();
    const review = {
      expectedVersion: Number(b.version),
      decision: "APPROVED",
      reason: "Compromisso conferido com todos os responsáveis",
    };
    await expect(
      reviewBaseline(admin, pid, b.id, review, randomUUID()),
    ).rejects.toThrow(/própria/);
    await expect(
      reviewBaseline(viewer, pid, b.id, review, randomUUID()),
    ).rejects.toThrow(/PMO/);
    const key = randomUUID(),
      approved: any = await reviewBaseline(pmo, pid, b.id, review, key);
    expect(approved.status).toBe("APPROVED");
    expect(
      ((await reviewBaseline(pmo, pid, b.id, review, key)) as any).id,
    ).toBe(b.id);
    expect(
      approved.proposal_context.capabilities.some(
        (cap: any) => cap.id === c.id,
      ),
    ).toBe(true);
  });
  it("baseline obsoleta não é aprovada; rejeição preserva o compromisso proposto", async () => {
    const c = await capability(),
      d = await delivery(c.id),
      b: any = await baseline(admin, pid, randomUUID());
    await mutate(
      admin,
      pid,
      "deliverables",
      { forecast_date: "2026-12-10" },
      d.id,
      Number(d.version),
      "Forecast após proposta",
    );
    const review = {
      expectedVersion: Number(b.version),
      decision: "APPROVED",
      reason: "Conferir baseline obsoleta",
    };
    await expect(
      reviewBaseline(pmo, pid, b.id, review, randomUUID()),
    ).rejects.toThrow(/Inventário mudou/);
    const rejected: any = await reviewBaseline(
      pmo,
      pid,
      b.id,
      {
        ...review,
        decision: "REJECTED",
        reason: "Refazer proposta com o novo forecast",
      },
      randomUUID(),
    );
    expect(rejected.status).toBe("REJECTED");
    const items = await db.query(
      "SELECT frozen_payload FROM delivery.baseline_items WHERE baseline_id=$1",
      [b.id],
    );
    expect(
      items.find((i) => i.frozen_payload.id === d.id)!.frozen_payload
        .forecast_date,
    ).toBe("2026-11-20");
    await expect(
      db.query("DELETE FROM delivery.baselines WHERE id=$1", [b.id]),
    ).rejects.toThrow();
  });
  it("impacto percorre dependentes e identifica releases/baselines sem escrever no preview", async () => {
    const c = await capability(),
      a = await delivery(c.id),
      b = await delivery(c.id);
    const nodes = await db.query(
      "SELECT * FROM portfolio.program_nodes WHERE entity_id IN ($1,$2)",
      [a.id, b.id],
    );
    await mutate(admin, pid, "dependencies", {
      source_node_id: nodes.find((n) => n.entity_id === a.id)!.id,
      target_node_id: nodes.find((n) => n.entity_id === b.id)!.id,
      dependency_type: "BLOCKS",
      description: "Dependência governada",
    });
    await mutate(admin, pid, "releases", {
      code: `REL-${++counter}`,
      name: "Release governada",
      deliverable_ids: [b.id],
    });
    await freeze();
    const p = await proposal(a, { weight: 3 });
    const requestsBefore = await db.query(
      "SELECT id FROM governance.change_requests ORDER BY id",
    );
    const preview = await previewChange(admin, pid, p);
    expect(preview.impact.affected_nodes).toHaveLength(2);
    expect(preview.impact.releases).toHaveLength(1);
    expect(preview.impact.baselines).toHaveLength(2);
    expect(
      await db.query("SELECT id FROM governance.change_requests ORDER BY id"),
    ).toEqual(requestsBefore);
  });
  it("alçadas por programa/frente, ausência de autoaprovação e whitelist de campos", async () => {
    const c = await capability(),
      d = await delivery(c.id, ws2),
      p = await proposal(c);
    await expect(proposeChange(viewer, pid, p, randomUUID())).rejects.toThrow(
      /alçada/,
    );
    await expect(
      proposeChange(leader, pid, await proposal(d), randomUUID()),
    ).rejects.toThrow(/alçada/);
    await expect(
      proposeChange(admin, otherPid, p, randomUUID()),
    ).rejects.toThrow(/encontrado/);
    await expect(
      proposeChange(
        admin,
        pid,
        { ...p, changes: { accepted: true } },
        randomUUID(),
      ),
    ).rejects.toThrow(/fora do escopo/);
    const r: any = await proposeChange(admin, pid, p, randomUUID());
    await expect(
      reviewChange(
        admin,
        pid,
        r.id,
        { expectedVersion: 1, decision: "APPROVED", reason: "Sou também PMO" },
        randomUUID(),
      ),
    ).rejects.toThrow(/própria/);
    await expect(
      reviewChange(
        viewer,
        pid,
        r.id,
        { expectedVersion: 1, decision: "APPROVED", reason: "Não autorizado" },
        randomUUID(),
      ),
    ).rejects.toThrow(/PMO/);
    await expect(
      applyChange(admin, pid, r.id, { expectedVersion: 1 }, randomUUID()),
    ).rejects.toThrow(/aprovada/);
  });
  it("proposta, decisão e aplicação idempotentes; payload/decisão encerrados imutáveis", async () => {
    const c = await capability(),
      p = await proposal(c),
      key = randomUUID();
    const r: any = await proposeChange(admin, pid, p, key);
    expect(((await proposeChange(admin, pid, p, key)) as any).id).toBe(r.id);
    const approved = await approve(r),
      applyKey = randomUUID();
    const applied: any = await applyChange(
      admin,
      pid,
      r.id,
      { expectedVersion: Number(approved.version) },
      applyKey,
    );
    expect(applied.status).toBe("APPLIED");
    expect(
      (
        (await applyChange(
          admin,
          pid,
          r.id,
          { expectedVersion: 2 },
          applyKey,
        )) as any
      ).id,
    ).toBe(r.id);
    expect(
      (
        await db.query(
          "SELECT scope_status FROM portfolio.capabilities WHERE id=$1",
          [c.id],
        )
      )[0].scope_status,
    ).toBe("APPROVED");
    await expect(
      db.query(
        "UPDATE governance.change_requests SET title='Fraude' WHERE id=$1",
        [r.id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "UPDATE governance.decisions SET rationale='Fraude' WHERE id=$1",
        [approved.decision_id],
      ),
    ).rejects.toThrow();
    expect(
      await db.query(
        "SELECT id FROM audit.audit_events WHERE entity_id=$1 AND action='Applied'",
        [r.id],
      ),
    ).toHaveLength(1);
    expect(
      await db.query(
        "SELECT id FROM audit.outbox WHERE aggregate_id=$1 AND event_type='change_requests.Applied'",
        [r.id],
      ),
    ).toHaveLength(1);
  });
  it("peso e vínculos mudam por decisão, baseline mantém hash, aceite/gates exigem revalidação", async () => {
    const c = await capability(),
      d = await delivery(c.id),
      p = await proposal(d, { weight: 5 });
    const [n] = await db.query(
      "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1",
      [d.id],
    );
    const [g] = await db.query(
      "INSERT INTO governance.gate_definitions(code,name,category) VALUES($1,'Gate de escopo','ENGINEERING') RETURNING id",
      [`G-${++counter}`],
    );
    await db.query(
      "INSERT INTO governance.gate_assessments(program_id,subject_node_id,gate_id,gate_version,result,assessed_by,justification) VALUES($1,$2,$3,1,'PASSED',$4,'Escopo anterior')",
      [pid, n.id, g.id, pmo],
    );
    await db.query(
      "UPDATE delivery.deliverables SET accepted=true WHERE id=$1",
      [d.id],
    );
    const b: any = await freeze();
    const [frozen] = await db.query(
      "SELECT * FROM delivery.baseline_items WHERE baseline_id=$1 AND subject_node_id=$2",
      [b.id, n.id],
    );
    await expect(
      mutate(
        admin,
        pid,
        "deliverables",
        { weight: 5 },
        d.id,
        Number(d.version),
        "Mudar peso diretamente",
      ),
    ).rejects.toThrow(/change control/);
    const r: any = await proposeChange(leader, pid, p, randomUUID()),
      approved = await approve(r);
    await applyChange(
      leader,
      pid,
      r.id,
      { expectedVersion: Number(approved.version) },
      randomUUID(),
    );
    const [now] = await db.query(
      "SELECT * FROM delivery.deliverables WHERE id=$1",
      [d.id],
    );
    expect(Number(now.weight)).toBe(5);
    expect(now.accepted).toBe(false);
    expect(
      (
        await db.query(
          "SELECT result FROM governance.gate_assessments WHERE subject_node_id=$1",
          [n.id],
        )
      )[0].result,
    ).toBe("PENDING");
    const [preserved] = await db.query(
      "SELECT * FROM delivery.baseline_items WHERE id=$1",
      [frozen.id],
    );
    expect(preserved).toEqual(frozen);
    expect(hashPayload(preserved.frozen_payload)).toBe(preserved.payload_hash);
  });
  it("escopo alterado enquanto aguarda revisão é rejeitado por versão", async () => {
    const c = await capability(),
      r: any = await proposeChange(admin, pid, await proposal(c), randomUUID());
    await mutate(
      admin,
      pid,
      "capabilities",
      { name: "Nome mudou antes da decisão" },
      c.id,
      Number(c.version),
      "Atualização concorrente",
    );
    await expect(approve(r)).rejects.toThrow(/Versão do escopo/);
    expect(
      (
        await db.query(
          "SELECT status FROM governance.change_requests WHERE id=$1",
          [r.id],
        )
      )[0].status,
    ).toBe("SUBMITTED");
  });
  it("impacto alterado depois da aprovação bloqueia aplicação e permite cancelar sem apagar decisão", async () => {
    const c = await capability(),
      d = await delivery(c.id),
      r: any = await proposeChange(admin, pid, await proposal(c), randomUUID()),
      approved = await approve(r);
    await mutate(
      admin,
      pid,
      "deliverables",
      { forecast_date: "2026-12-05" },
      d.id,
      Number(d.version),
      "Mudança no plano dependente",
    );
    await expect(
      applyChange(admin, pid, r.id, { expectedVersion: 2 }, randomUUID()),
    ).rejects.toThrow(/Impacto mudou/);
    const cancelled: any = await cancelChange(
      admin,
      pid,
      r.id,
      { expectedVersion: 2, reason: "Proposta obsoleta; refazer impacto" },
      randomUUID(),
    );
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.decision_id).toBe(approved.decision_id);
    expect(
      (
        await db.query(
          "SELECT scope_status FROM portfolio.capabilities WHERE id=$1",
          [c.id],
        )
      )[0].scope_status,
    ).toBe("PROPOSED");
  });
  it("hierarquia protege ciclo em CRUD e proposta; referência de outro programa rejeitada", async () => {
    const a = await capability(),
      b = await capability();
    await mutate(
      admin,
      pid,
      "capabilities",
      { parent_id: a.id },
      b.id,
      Number(b.version),
      "Definir hierarquia",
    );
    await expect(
      mutate(
        admin,
        pid,
        "capabilities",
        { parent_id: b.id },
        a.id,
        Number(a.version),
        "Criar ciclo",
      ),
    ).rejects.toThrow(/ciclo/);
    await expect(
      proposeChange(
        admin,
        pid,
        await proposal(a, { parent_id: b.id }),
        randomUUID(),
      ),
    ).rejects.toThrow(/ciclo/);
    await expect(
      proposeChange(
        admin,
        pid,
        await proposal(a, { domain_id: randomUUID() }),
        randomUUID(),
      ),
    ).rejects.toThrow(/programa/);
  });
  it("aprovação inicial e exclusão requerem workflow; rejeição não pode ser aplicada", async () => {
    const c = await capability();
    await expect(
      mutate(
        admin,
        pid,
        "capabilities",
        { scope_status: "APPROVED" },
        c.id,
        Number(c.version),
        "Aprovar diretamente",
      ),
    ).rejects.toThrow(/change control/);
    const r: any = await proposeChange(
      admin,
      pid,
      await proposal(c, { scope_status: "EXCLUDED" }),
      randomUUID(),
    );
    const rejected: any = await reviewChange(
      pmo,
      pid,
      r.id,
      {
        expectedVersion: 1,
        decision: "REJECTED",
        reason: "Não excluir a capacidade",
      },
      randomUUID(),
    );
    expect(rejected.status).toBe("REJECTED");
    await expect(
      applyChange(admin, pid, r.id, { expectedVersion: 2 }, randomUUID()),
    ).rejects.toThrow(/aprovada/);
    await expect(
      db.query("DELETE FROM governance.change_requests WHERE id=$1", [r.id]),
    ).rejects.toThrow();
  });
});
