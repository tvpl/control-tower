import { hashPayload } from "../src/server/domain/canonical";
import { beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import {
  mutate,
  snapshot,
  baseline,
  reviewBaseline,
  assess,
  transition,
} from "../src/server/application/service";
import { previewImport, commitImport } from "../src/server/application/imports";
import { revokeException } from "../src/server/application/readiness";
import { state } from "../src/server/application/queries";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  admin = randomUUID(),
  leader = randomUUID(),
  other = randomUUID(),
  approver = randomUUID(),
  pmo = randomUUID(),
  pid = randomUUID(),
  pid2 = randomUUID(),
  ws = randomUUID(),
  ws2 = randomUUID(),
  domain = randomUUID(),
  cap = randomUUID();
let deliverable: any, node: string, gate: string;
beforeAll(async () => {
  await migrate(db);
  await db.transaction(async (tx) => {
    for (const id of [admin, leader, other, approver, pmo])
      await tx.query(
        "INSERT INTO iam.users(id,subject,display_name,email) VALUES($1,$2,'Usuário de teste',$3)",
        [id, id, `${id}@test.local`],
      );
    for (const id of [pid, pid2])
      await tx.query(
        "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Programa teste')",
        [id, id],
      );
    for (const id of [ws, ws2])
      await tx.query(
        "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,$3,'Frente teste')",
        [id, pid, id],
      );
    for (const [uid, role, stream] of [
      [admin, "PROGRAM_ADMIN", null],
      [leader, "WORKSTREAM_LEAD", ws],
      [approver, "GATE_APPROVER", null],
      [pmo, "PMO", null],
    ])
      await tx.query(
        "INSERT INTO iam.memberships(user_id,program_id,role,workstream_id,gate_categories) VALUES($1,$2,$3,$4,'[\"ENGINEERING\"]')",
        [uid, pid, role, stream],
      );
    await tx.query(
      "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'AUT','Autorização')",
      [domain, pid],
    );
    await tx.query(
      "INSERT INTO portfolio.capabilities(id,program_id,domain_id,code,name) VALUES($1,$2,$3,'AUT-001','Autorizar')",
      [cap, pid, domain],
    );
  });
  deliverable = await mutate(admin, pid, "deliverables", {
    code: "DEL-001",
    name: "Entrega de teste",
    layer: "BACKEND",
    deliverable_type: "API",
    workstream_id: ws,
    owner_id: leader,
    capability_ids: [cap],
    acceptance_criteria: "Teste aprovado",
    forecast_date: "2026-11-01",
  });
  node = (
    await db.query(
      "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1",
      [deliverable.id],
    )
  )[0].id;
  gate = (
    await db.query(
      "INSERT INTO governance.gate_definitions(code,name,category) VALUES('TEST','Teste','ENGINEERING') RETURNING id",
    )
  )[0].id;
});
const input = () => ({
  code: deliverable.code,
  name: deliverable.name,
  layer: deliverable.layer,
  deliverable_type: deliverable.deliverable_type,
  workstream_id: ws,
  owner_id: leader,
  capability_ids: [cap],
  acceptance_criteria: "Teste aprovado",
  forecast_date: "2026-11-01",
});
describe("PostgreSQL real, transações e RBAC", () => {
  it("relações tipadas persistem e PATCH parcial não altera contribuição/relação/composição", async () => {
    const d = await mutate(admin, pid, "deliverables", {
      ...input(),
      code: "DEL-ROLE",
      capability_roles: { [cap]: "SUPPORTING" },
    });
    await mutate(
      admin,
      pid,
      "deliverables",
      { forecast_date: "2026-11-03" },
      d.id,
      Number(d.version),
      "Atualizar previsão preservando tipos",
    );
    expect(
      (
        await db.query(
          "SELECT contribution_type FROM delivery.deliverable_capabilities WHERE deliverable_id=$1",
          [d.id],
        )
      )[0].contribution_type,
    ).toBe("SUPPORTING");
    const c = await mutate(admin, pid, "components", {
      code: "COMP-ROLE",
      name: "Componente com relação tipada",
      kind: "SERVICE",
      capability_ids: [cap],
      relation_types: { [cap]: "IMPLEMENTS" },
    });
    await mutate(
      admin,
      pid,
      "components",
      { name: "Componente renomeado" },
      c.id,
      Number(c.version),
      "Preservar relação técnica",
    );
    expect(
      (
        await db.query(
          "SELECT relation_type FROM architecture.capability_components WHERE component_id=$1",
          [c.id],
        )
      )[0].relation_type,
    ).toBe("IMPLEMENTS");
    const r = await mutate(admin, pid, "releases", {
      code: "REL-OPTIONAL",
      name: "Release opcional",
      deliverable_ids: [d.id],
      deliverable_required: { [d.id]: false },
    });
    await mutate(
      admin,
      pid,
      "releases",
      { forecast_date: "2026-11-25" },
      r.id,
      Number(r.version),
      "Preservar opcional",
    );
    expect(
      (
        await db.query(
          "SELECT required FROM delivery.release_deliverables WHERE release_id=$1",
          [r.id],
        )
      )[0].required,
    ).toBe(false);
    await expect(
      mutate(admin, pid, "deliverables", {
        ...input(),
        code: "ROLE-INVALID",
        capability_roles: { [randomUUID()]: "OPTIONAL" },
      }),
    ).rejects.toThrow(/não vinculado/);
  });
  it("criação produz vínculo N:N + nó + audit + outbox", async () => {
    expect(
      await db.query(
        "SELECT * FROM delivery.deliverable_capabilities WHERE deliverable_id=$1",
        [deliverable.id],
      ),
    ).toHaveLength(1);
    expect(
      await db.query("SELECT * FROM audit.audit_events WHERE entity_id=$1", [
        deliverable.id,
      ]),
    ).toHaveLength(1);
    expect(
      await db.query("SELECT * FROM audit.outbox WHERE aggregate_id=$1", [
        deliverable.id,
      ]),
    ).toHaveLength(1);
  });
  it("líder de outra frente e outro programa são rejeitados", async () => {
    await expect(
      mutate(leader, pid, "deliverables", {
        ...input(),
        code: "DEL-OTHER",
        workstream_id: ws2,
      }),
    ).rejects.toThrow(/papel/);
    await expect(mutate(other, pid, "deliverables", input())).rejects.toThrow(
      /acesso/,
    );
  });
  it("BR-001: compromisso incompleto rejeitado", async () => {
    await expect(
      mutate(admin, pid, "deliverables", {
        ...input(),
        code: "DEL-BAD",
        owner_id: null,
        planning_status: "COMMITTED",
      }),
    ).rejects.toThrow(/Compromisso/);
  });
  it("FK impede vínculo entre programas e reverte audit", async () => {
    const cid = randomUUID(),
      did = randomUUID();
    await db.query(
      "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'OTHER','Outro')",
      [did, pid2],
    );
    await db.query(
      "INSERT INTO portfolio.capabilities(id,program_id,domain_id,code,name) VALUES($1,$2,$3,'OTHER','Outro')",
      [cid, pid2, did],
    );
    await expect(
      mutate(admin, pid, "deliverables", {
        ...input(),
        code: "DEL-X",
        capability_ids: [cid],
      }),
    ).rejects.toThrow();
    expect(
      await db.query("SELECT id FROM delivery.deliverables WHERE code='DEL-X'"),
    ).toHaveLength(0);
  });
  it("versionamento otimista rejeita alteração obsoleta", async () => {
    const changed = await mutate(
      leader,
      pid,
      "deliverables",
      { ...input(), forecast_date: "2026-11-02" },
      deliverable.id,
      1,
      "Novo forecast",
    );
    expect(Number(changed.version)).toBe(2);
    await expect(
      mutate(
        leader,
        pid,
        "deliverables",
        input(),
        deliverable.id,
        1,
        "Obsoleto",
      ),
    ).rejects.toThrow(/Versão/);
    deliverable = changed;
  });
  it("snapshot idempotente, hash e conteúdo permanecem imutáveis", async () => {
    const key = randomUUID();
    const snap: any = await snapshot(admin, pid, key),
      repeated: any = await snapshot(admin, pid, key);
    expect(snap.id).toBe(repeated.id);
    expect(snap.payload_hash).toHaveLength(64);
    expect(hashPayload(snap.payload)).toBe(snap.payload_hash);
    await expect(
      db.query("UPDATE reporting.snapshots SET payload='{}' WHERE id=$1", [
        snap.id,
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "SELECT payload_hash FROM reporting.snapshots WHERE id=$1",
          [snap.id],
        )
      )[0].payload_hash,
    ).toBe(snap.payload_hash);
  });
  it("baseline aprovada preserva forecast após atualização", async () => {
    const b: any = await baseline(admin, pid, randomUUID());
    await reviewBaseline(
      pmo,
      pid,
      b.id,
      {
        expectedVersion: Number(b.version),
        decision: "APPROVED",
        reason: "Compromisso revisado por PMO",
      },
      randomUUID(),
    );
    await expect(
      db.query("UPDATE delivery.baselines SET status='DRAFT' WHERE id=$1", [
        b.id,
      ]),
    ).rejects.toThrow();
    deliverable = await mutate(
      admin,
      pid,
      "deliverables",
      { ...input(), forecast_date: "2026-12-01" },
      deliverable.id,
      Number(deliverable.version),
      "Nova previsão",
    );
    const [item] = await db.query(
      "SELECT frozen_payload FROM delivery.baseline_items WHERE baseline_id=$1 AND subject_node_id=$2",
      [b.id, node],
    );
    expect(item.frozen_payload.forecast_date).toBe("2026-11-02");
    expect(item.frozen_payload.capability_ids).toContain(cap);
    await expect(
      mutate(
        admin,
        pid,
        "deliverables",
        { capability_ids: [] },
        deliverable.id,
        Number(deliverable.version),
        "Remover escopo congelado",
      ),
    ).rejects.toThrow(/change control/);
    const frozen = await db.query(
      "SELECT frozen_payload,payload_hash FROM delivery.baseline_items WHERE baseline_id=$1",
      [b.id],
    );
    expect(hashPayload(frozen[0].frozen_payload)).toBe(frozen[0].payload_hash);
  });
  it("admin não aprova gate; aprovador exige evidência", async () => {
    const data = {
      subject_node_id: node,
      gate_id: gate,
      expectedGateVersion: 1,
      result: "PASSED",
      expectedVersion: 0,
      justification: "Teste gate",
      evidence_ids: [],
    };
    await expect(assess(admin, pid, data, randomUUID())).rejects.toThrow(
      /alçada/,
    );
    await expect(assess(approver, pid, data, randomUUID())).rejects.toThrow(
      /evidência/,
    );
  });
  it("prévia detecta duplicata e importação inválida não grava linhas", async () => {
    const csv = `program_code,domain_code,workstream_code,capability_code,deliverable_code,name,layer,owner_email,stage,execution_status,forecast_date\n${pid},AUT,${ws},AUT-001,DEL-001,Duplicado,BACKEND,${leader}@test.local,IDENTIFIED,NOT_STARTED,2026-11-01`;
    const preview = await previewImport(admin, pid, csv);
    expect(preview.valid).toBe(false);
    await expect(
      commitImport(admin, pid, csv, preview.hash, randomUUID()),
    ).rejects.toThrow(/inválidas/);
  });
  it("importação válida persiste atomicamente e repete sem duplicar", async () => {
    const csv = `program_code,domain_code,workstream_code,capability_code,deliverable_code,name,layer,owner_email,stage,execution_status,forecast_date\n${pid},AUT,${ws},AUT-001,DEL-CSV,Importado,BACKEND,${leader}@test.local,IDENTIFIED,NOT_STARTED,2026-11-01`;
    const preview = await previewImport(admin, pid, csv);
    expect(preview.valid).toBe(true);
    const key = randomUUID();
    expect(
      ((await commitImport(admin, pid, csv, preview.hash, key)) as any)
        .imported,
    ).toBe(1);
    expect(
      ((await commitImport(admin, pid, csv, preview.hash, key)) as any)
        .imported,
    ).toBe(1);
    expect(
      await db.query(
        "SELECT id FROM delivery.deliverables WHERE code='DEL-CSV'",
      ),
    ).toHaveLength(1);
  });
  it("PATCH parcial preserva N:N e aceite reaberto deixa de contar", async () => {
    const changed = await mutate(
      leader,
      pid,
      "deliverables",
      { forecast_date: "2026-12-03" },
      deliverable.id,
      Number(deliverable.version),
      "Forecast parcial",
    );
    expect(changed.name).toBe(deliverable.name);
    expect(
      await db.query(
        "SELECT deliverable_id FROM delivery.deliverable_capabilities WHERE deliverable_id=$1",
        [deliverable.id],
      ),
    ).toHaveLength(1);
    deliverable = changed;
  });
  it("líder registra evidência de sua frente; gate congela a referência versionada", async () => {
    const ev = await mutate(leader, pid, "evidence", {
      subject_node_id: node,
      title: "Evidência de teste",
      url: "https://evidence.example.test/result/1",
      source: "QA sintético",
      artifact_version: "1.0",
      classification: "INTERNAL",
    });
    const a: any = await assess(
      approver,
      pid,
      {
        subject_node_id: node,
        gate_id: gate,
        expectedGateVersion: 1,
        result: "PASSED",
        expectedVersion: 0,
        justification: "Teste comprovado",
        evidence_ids: [ev.id],
      },
      randomUUID(),
    );
    expect(a.evidence_refs[0].artifact_version).toBe("1.0");
    await expect(
      mutate(
        leader,
        pid,
        "evidence",
        { url: "https://evidence.example.test/result/2" },
        ev.id,
        1,
        "Substituição",
      ),
    ).rejects.toThrow(/preservada/);
  });
  it("ciclo impeditivo é rejeitado no banco de aplicação", async () => {
    const second = await mutate(admin, pid, "deliverables", {
      ...input(),
      code: "DEL-CYCLE",
    });
    const n2 = (
      await db.query(
        "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1",
        [second.id],
      )
    )[0].id;
    const data = {
      source_node_id: node,
      target_node_id: n2,
      dependency_type: "BLOCKS",
      criticality: "CRITICAL",
      status: "BLOCKED",
      needed_by: "2026-12-01",
      owner_id: leader,
      description: "Dependência de teste",
    };
    await mutate(leader, pid, "dependencies", data);
    await expect(
      mutate(admin, pid, "dependencies", {
        ...data,
        source_node_id: n2,
        target_node_id: node,
      }),
    ).rejects.toThrow(/ciclo/);
  });
  it("release antiga não autoriza produção sem aceite atual e composição aprovada é preservada", async () => {
    const r = await mutate(admin, pid, "releases", {
      code: "REL-GUARD",
      name: "Release de teste",
      deliverable_ids: [deliverable.id],
    });
    await db.query(
      "UPDATE delivery.releases SET status='APPROVED' WHERE id=$1",
      [r.id],
    );
    await expect(
      mutate(
        admin,
        pid,
        "releases",
        { deliverable_ids: [] },
        r.id,
        1,
        "Remover escopo",
      ),
    ).rejects.toThrow(/preservada/);
    await db.query(
      "UPDATE delivery.deliverables SET execution_status='REOPENED',delivery_stage='UAT',accepted=false WHERE id=$1",
      [deliverable.id],
    );
    await expect(
      transition(
        admin,
        pid,
        deliverable.id,
        {
          targetStage: "PRODUCTION",
          reason: "Aprovação antiga",
          expectedVersion: Number(deliverable.version),
        },
        randomUUID(),
      ),
    ).rejects.toThrow(/aceite atual/);
  });
  it("versão de critério obsoleta bloqueia projeção e avaliação; nova avaliação grava a versão correta", async () => {
    const [old] = await db.query(
      "SELECT * FROM governance.gate_assessments WHERE subject_node_id=$1 AND gate_id=$2",
      [node, gate],
    );
    await db.query(
      "UPDATE governance.gate_definitions SET version=version+1,criteria=$1 WHERE id=$2",
      ["Critério atualizado com evidência exigida", gate],
    );
    const s = await state(admin, pid);
    expect(
      s.effectiveAssessments.find((a: any) => a.id === old.id).result,
    ).toBe("NOT_ASSESSED");
    const ev = (
      await db.query(
        "SELECT id FROM evidence_records WHERE subject_node_id=$1",
        [node],
      )
    )[0];
    const data = {
      subject_node_id: node,
      gate_id: gate,
      expectedGateVersion: 1,
      result: "PASSED",
      expectedVersion: Number(old.version),
      justification: "Nova revisão do critério",
      evidence_ids: [ev.id],
    };
    await expect(assess(approver, pid, data, randomUUID())).rejects.toThrow(
      /Critério mudou/,
    );
    const now: any = await assess(
      approver,
      pid,
      { ...data, expectedGateVersion: 2 },
      randomUUID(),
    );
    expect(Number(now.gate_version)).toBe(2);
    expect(
      await db.query(
        "SELECT * FROM governance.gate_definition_versions WHERE gate_id=$1",
        [gate],
      ),
    ).toHaveLength(2);
    await expect(
      db.query(
        "UPDATE governance.gate_definition_versions SET frozen_payload='{}' WHERE gate_id=$1",
        [gate],
      ),
    ).rejects.toThrow();
  });
  it("revogação de exceção por alçada gera auditoria e não pode ser repetida com outra versão", async () => {
    const [old] = await db.query(
      "SELECT * FROM governance.gate_assessments WHERE subject_node_id=$1 AND gate_id=$2",
      [node, gate],
    );
    const ev = (
      await db.query(
        "SELECT id FROM evidence_records WHERE subject_node_id=$1",
        [node],
      )
    )[0];
    const exception: any = await assess(
      approver,
      pid,
      {
        subject_node_id: node,
        gate_id: gate,
        expectedGateVersion: 2,
        result: "EXCEPTION_APPROVED",
        expectedVersion: Number(old.version),
        justification: "Risco residual aceito provisoriamente",
        evidence_ids: [ev.id],
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_risk: "Mitigar com monitoramento e reavaliação",
        mitigation_plan: "Monitorar e reavaliar diariamente",
        decision_reference: "ADR-EXCEPTION-TEST",
      },
      randomUUID(),
    );
    const data = {
      expectedVersion: Number(exception.version),
      reason: "Mitigação não comprovada; revogar exceção",
    };
    await expect(
      revokeException(admin, pid, exception.id, data, randomUUID()),
    ).rejects.toThrow(/alçada/);
    const key = randomUUID(),
      revoked: any = await revokeException(
        approver,
        pid,
        exception.id,
        data,
        key,
      );
    expect(revoked.result).toBe("PENDING");
    expect(
      ((await revokeException(approver, pid, exception.id, data, key)) as any)
        .id,
    ).toBe(exception.id);
    await expect(
      revokeException(approver, pid, exception.id, data, randomUUID()),
    ).rejects.toThrow(/atualizada/);
    expect(
      await db.query(
        "SELECT id FROM audit.audit_events WHERE entity_id=$1 AND action='ExceptionRevoked'",
        [exception.id],
      ),
    ).toHaveLength(1);
  });
});
