import { randomUUID } from "node:crypto";
import { beforeAll, expect, it } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import {
  saveCatalog,
  subjectGateReadiness,
} from "../src/server/application/catalogs";
import { assess } from "../src/server/application/readiness";
import { mutate } from "../src/server/application/inventory";
import { state } from "../src/server/application/queries";
import { snapshot } from "../src/server/application/reporting";
import { applicability } from "../src/server/domain/applicability";
import { deliverableReadiness } from "../src/server/domain/readiness";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  approver = randomUUID(),
  viewer = randomUUID(),
  ws = randomUUID(),
  d = randomUUID(),
  node = randomUUID(),
  ev = randomUUID();
let gate: any, profile: any;
const rule = {
  layers: ["BACKEND"],
  types: [],
  criticalities: [],
  workstream_ids: [],
};
beforeAll(async () => {
  await migrate(db);
  for (const id of [admin, approver, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$2,'Catalog test')",
      [id, id],
    );
  for (const id of [pid, other])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Catalog program')",
      [id, id],
    );
  for (const [id, role] of [
    [admin, "PROGRAM_ADMIN"],
    [approver, "GATE_APPROVER"],
    [viewer, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role,gate_categories) VALUES($1,$2,$3,$4::jsonb)",
      [id, pid, role, JSON.stringify(["ENGINEERING"])],
    );
  await db.query(
    "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'DEV','Development')",
    [ws, pid],
  );
  await db.query(
    "INSERT INTO delivery.deliverables(id,program_id,code,name,layer,deliverable_type,workstream_id,owner_id,scope_status,execution_status,accepted) VALUES($1,$2,'API','Backend API','BACKEND','API',$3,$4,'APPROVED','DONE',true)",
    [d, pid, ws, admin],
  );
  await db.query(
    "INSERT INTO portfolio.program_nodes(id,program_id,entity_type,entity_id) VALUES($1,$2,'deliverables',$3)",
    [node, pid, d],
  );
  await db.query(
    "INSERT INTO evidence_records(id,program_id,subject_node_id,title,url,source,artifact_version,classification,author_id) VALUES($1,$2,$3,'Test evidence','https://example.test/evidence','QA','v1','INTERNAL',$4)",
    [ev, pid, node, approver],
  );
});
const gateInput = {
  code: "CUSTOM_SIT",
  name: "SIT verificável",
  category: "ENGINEERING",
  blocking: true,
  criteria: "Teste integrado aprovado",
  reason: "Definir política de qualidade",
  expectedVersion: 0,
};
it("catálogo de camadas é inicializado por programa e aceita nova camada", async () => {
  expect(
    await db.query("SELECT code FROM portfolio.layers WHERE program_id=$1", [
      pid,
    ]),
  ).toHaveLength(9);
  await saveCatalog(
    admin,
    pid,
    "layers",
    undefined,
    {
      code: "AUTOMATION",
      name: "Automação",
      active: true,
      reason: "Nova frente de execução",
      expectedVersion: 0,
    },
    randomUUID(),
  );
  const created: any = await mutate(admin, pid, "deliverables", {
    code: "AUTO",
    name: "Automação de testes",
    layer: "AUTOMATION",
    deliverable_type: "TEST",
    workstream_id: ws,
  });
  expect(created.layer).toBe("AUTOMATION");
  await expect(
    mutate(admin, pid, "deliverables", {
      code: "BAD",
      name: "Camada inválida",
      layer: "INVALID",
      deliverable_type: "TEST",
      workstream_id: ws,
    }),
  ).rejects.toThrow(/Camada/);
});
it("somente gestores do catálogo configuram; código e escopo são protegidos", async () => {
  await expect(
    saveCatalog(viewer, pid, "gates", undefined, gateInput, randomUUID()),
  ).rejects.toThrow(/administrador/);
  gate = await saveCatalog(
    admin,
    pid,
    "gates",
    undefined,
    gateInput,
    randomUUID(),
  );
  expect(gate.program_id).toBe(pid);
  await expect(
    saveCatalog(
      admin,
      pid,
      "profiles",
      undefined,
      {
        code: "INVALID",
        name: "Invalid profile",
        rule,
        gate_ids: [randomUUID()],
        active: true,
        reason: "Teste de referência",
        expectedVersion: 0,
      },
      randomUUID(),
    ),
  ).rejects.toThrow(/Gate/);
  await expect(
    saveCatalog(
      admin,
      pid,
      "profiles",
      undefined,
      {
        code: "INVALID",
        name: "Invalid profile",
        rule: { ...rule, workstream_ids: [randomUUID()] },
        gate_ids: [gate.id],
        active: true,
        reason: "Teste de referência",
        expectedVersion: 0,
      },
      randomUUID(),
    ),
  ).rejects.toThrow(/Frente/);
});
it("perfil seleciona critérios por interseção e preserva versões imutáveis", async () => {
  profile = await saveCatalog(
    admin,
    pid,
    "profiles",
    undefined,
    {
      code: "BACKEND_SERVICE",
      name: "Serviço backend",
      rule,
      gate_ids: [gate.id],
      active: true,
      reason: "Aplicar por camada",
      expectedVersion: 0,
    },
    randomUUID(),
  );
  expect(
    applicability({ layer: "BACKEND" }, [gate], [profile]).gates,
  ).toHaveLength(1);
  expect(applicability({ layer: "CLIENT" }, [gate], [profile])).toMatchObject({
    unknown: true,
    gates: [],
  });
  expect(
    await db.query(
      "SELECT version FROM governance.dod_profile_versions WHERE profile_id=$1",
      [profile.id],
    ),
  ).toHaveLength(1);
  await expect(
    db.query(
      "UPDATE governance.dod_profile_versions SET frozen_payload='{}' WHERE profile_id=$1",
      [profile.id],
    ),
  ).rejects.toThrow();
});
it("avaliação exige o contexto exibido; ausência/versão antiga não libera prontidão", async () => {
  await expect(
    assess(
      approver,
      pid,
      {
        subject_node_id: node,
        gate_id: gate.id,
        expectedGateVersion: 1,
        result: "PASSED",
        justification: "Testes aprovados",
        evidence_ids: [ev],
        expectedVersion: 0,
      },
      randomUUID(),
    ),
  ).rejects.toThrow(/Perfil mudou/);
  const contextKey = applicability(
    {
      layer: "BACKEND",
      deliverable_type: "API",
      workstream_id: ws,
      criticality: "MEDIUM",
    },
    [gate],
    [profile],
  ).contextKey;
  await assess(
    approver,
    pid,
    {
      subject_node_id: node,
      gate_id: gate.id,
      expectedGateVersion: 1,
      expectedContextKey: contextKey,
      result: "PASSED",
      justification: "Testes aprovados",
      evidence_ids: [ev],
      expectedVersion: 0,
    },
    randomUUID(),
  );
  expect(await subjectGateReadiness(db, pid, d)).toMatchObject({
    blockingGates: 0,
    known: true,
    percentage: 100,
  });
});
it("alterar perfil invalida aprovação contextual e concorrência é rejeitada", async () => {
  profile = await saveCatalog(
    admin,
    pid,
    "profiles",
    profile.id,
    {
      code: profile.code,
      name: profile.name,
      rule: profile.rule,
      gate_ids: profile.gate_ids,
      active: true,
      expectedVersion: 1,
      reason: "Revisão da regra de aplicação",
    },
    randomUUID(),
  );
  expect(await subjectGateReadiness(db, pid, d)).toMatchObject({
    blockingGates: 1,
    known: true,
    percentage: 0,
  });
  await expect(
    saveCatalog(
      admin,
      pid,
      "profiles",
      profile.id,
      {
        code: profile.code,
        name: profile.name,
        rule,
        gate_ids: [gate.id],
        active: true,
        expectedVersion: 1,
        reason: "Edição concorrente",
      },
      randomUUID(),
    ),
  ).rejects.toThrow(/alterado/);
  const s = await state(admin, pid);
  expect(s.effectiveAssessments[0].stale_context).toBe(true);
  expect(
    ((await snapshot(admin, pid, randomUUID())) as any).payload.context
      .dodProfiles[0].version,
  ).toBe(2);
});
it("nenhum perfil aplicável é desconhecido; não equivale a N/A", () => {
  const result = deliverableReadiness(
    [
      {
        id: "ui",
        layer: "CLIENT",
        accepted: true,
        execution_status: "DONE",
        scope_status: "APPROVED",
      },
    ],
    [{ id: "ui-node", entity_id: "ui", entity_type: "deliverables" }],
    [gate],
    [],
    [],
    [],
    [profile],
  );
  expect(result.status).toBe("NOT_ASSESSED");
  expect(result.percentage).toBeNull();
  expect(result.unknownApplicability).toBe(1);
});
