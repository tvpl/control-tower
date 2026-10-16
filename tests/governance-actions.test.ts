import { randomUUID } from "node:crypto";
import { beforeAll, expect, it } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { mutate } from "../src/server/application/inventory";
import {
  reviewRecord,
  overrideHealth,
  applyHealthOverrides,
} from "../src/server/application/governance-actions";
import { state } from "../src/server/application/queries";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  architect = randomUUID(),
  pmo = randomUUID(),
  viewer = randomUUID(),
  ws = randomUUID();
let supplier: any,
  source: any,
  target: any,
  contract: any,
  decision: any,
  d: any,
  node: any,
  health: any;
beforeAll(async () => {
  await migrate(db);
  for (const id of [admin, architect, pmo, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$2,'Governance tester')",
      [id, id],
    );
  for (const id of [pid, other])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Governance program')",
      [id, id],
    );
  for (const [id, role] of [
    [admin, "PROGRAM_ADMIN"],
    [architect, "CHIEF_ARCHITECT"],
    [pmo, "PMO"],
    [viewer, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [id, pid, role],
    );
  await db.query(
    "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'DEV','Development')",
    [ws, pid],
  );
  source = await mutate(admin, pid, "components", {
    code: "SRC",
    name: "Source API",
    kind: "SERVICE",
  });
  target = await mutate(admin, pid, "components", {
    code: "DST",
    name: "Target API",
    kind: "SERVICE",
  });
  d = await mutate(admin, pid, "deliverables", {
    code: "D",
    name: "Deliverable",
    layer: "BACKEND",
    deliverable_type: "API",
    workstream_id: ws,
  });
  node = (
    await db.query("SELECT * FROM portfolio.program_nodes WHERE entity_id=$1", [
      d.id,
    ])
  )[0];
});
it("catálogo vincula contratos e fornecedores com FK de programa", async () => {
  supplier = await mutate(architect, pid, "suppliers", {
    code: "SUP",
    name: "Fornecedor de teste",
  });
  const input = {
    code: "API",
    name: "Contrato REST",
    contract_version: "v1",
    protocol: "HTTP_REST",
    source_component_id: source.id,
    target_component_id: target.id,
    supplier_id: supplier.id,
    owner_id: admin,
    specification_url: "https://example.test/spec",
  };
  await expect(mutate(viewer, pid, "contracts", input)).rejects.toThrow(
    /permite/,
  );
  await expect(
    mutate(admin, pid, "contracts", {
      ...input,
      target_component_id: randomUUID(),
    }),
  ).rejects.toThrow(/programa/);
  await expect(
    mutate(admin, pid, "contracts", {
      ...input,
      target_component_id: source.id,
    }),
  ).rejects.toThrow(/distintos/);
  contract = await mutate(admin, pid, "contracts", input);
  expect(contract.status).toBe("DRAFT");
  expect(contract.created_by).toBe(admin);
});
it("revisão exige alçada independente e especificação/SLA", async () => {
  await expect(
    reviewRecord(
      admin,
      pid,
      "contracts",
      contract.id,
      { expectedVersion: 1, decision: "APPROVED", reason: "Revisar" },
      randomUUID(),
    ),
  ).rejects.toThrow(/alçada/);
  await expect(
    reviewRecord(
      architect,
      pid,
      "contracts",
      contract.id,
      { expectedVersion: 1, decision: "APPROVED", reason: "Revisar" },
      randomUUID(),
    ),
  ).rejects.toThrow(/SLA/);
  contract = await mutate(
    admin,
    pid,
    "contracts",
    { sla_ms: 250 },
    contract.id,
    1,
  );
  contract = await reviewRecord(
    architect,
    pid,
    "contracts",
    contract.id,
    {
      expectedVersion: 2,
      decision: "APPROVED",
      reason: "Especificação e SLA validados",
    },
    randomUUID(),
  );
  expect(contract.status).toBe("APPROVED");
  await expect(
    mutate(
      admin,
      pid,
      "contracts",
      { name: "Mudar após aprovação" },
      contract.id,
      3,
    ),
  ).rejects.toThrow(/imutável/);
  await expect(
    db.query("UPDATE architecture.contracts SET sla_ms=999 WHERE id=$1", [
      contract.id,
    ]),
  ).rejects.toThrow();
  const next: any = await mutate(admin, pid, "contracts", {
    code: contract.code,
    name: contract.name,
    contract_version: "v2",
    protocol: contract.protocol,
    source_component_id: source.id,
    target_component_id: target.id,
    supersedes_id: contract.id,
  });
  expect(next.status).toBe("DRAFT");
});
it("decisões não são aprovadas via CRUD; review tem motivo, versão e segregação", async () => {
  const input = {
    code: "DEC",
    name: "Adotar protocolo",
    rationale: "Rastrear a decisão",
    alternatives: "REST ou eventos",
    owner_id: admin,
    approval_role: "PMO",
  };
  await expect(
    mutate(admin, pid, "decisions", { ...input, status: "APPROVED" }),
  ).rejects.toThrow(/revisão/);
  decision = await mutate(admin, pid, "decisions", input);
  await expect(
    reviewRecord(
      admin,
      pid,
      "decisions",
      decision.id,
      { expectedVersion: 1, decision: "APPROVED", reason: "Aprovar" },
      randomUUID(),
    ),
  ).rejects.toThrow(/alçada/);
  decision = await reviewRecord(
    pmo,
    pid,
    "decisions",
    decision.id,
    {
      expectedVersion: 1,
      decision: "APPROVED",
      reason: "Alternativas e impacto conferidos",
    },
    randomUUID(),
  );
  expect(decision.reviewed_by).toBe(pmo);
  await expect(
    db.query("DELETE FROM governance.decisions WHERE id=$1", [decision.id]),
  ).rejects.toThrow();
});
it("auto-revisão é rejeitada mesmo com o papel exigido", async () => {
  const own: any = await mutate(architect, pid, "decisions", {
    code: "OWN",
    name: "Decisão arquitetural",
    rationale: "Decidir plataforma",
    alternatives: "Alternativa A ou B",
    approval_role: "CHIEF_ARCHITECT",
  });
  await expect(
    reviewRecord(
      architect,
      pid,
      "decisions",
      own.id,
      { expectedVersion: 1, decision: "APPROVED", reason: "Conferido" },
      randomUUID(),
    ),
  ).rejects.toThrow(/outra pessoa/);
});
it("ajuste de saúde é temporário, auditado, concorrente e não altera aceite", async () => {
  const input = {
    action: "SET",
    health: "ON_TRACK",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    reason: "Mitigação confirmada pelo responsável",
    expectedOverrideId: null,
  };
  await expect(
    overrideHealth(viewer, pid, d.id, input, randomUUID()),
  ).rejects.toThrow(/alçada/);
  await expect(
    overrideHealth(
      admin,
      pid,
      d.id,
      { ...input, expires_at: "2020-01-01T00:00:00Z" },
      randomUUID(),
    ),
  ).rejects.toThrow(/validade/);
  health = await overrideHealth(admin, pid, d.id, input, randomUUID());
  let s = await state(admin, pid);
  const projected = s.deliverables.find((v: any) => v.id === d.id);
  expect(projected.health).toBe("ON_TRACK");
  expect(projected.derived_health).toBe("UNKNOWN");
  expect(projected.accepted).toBe(false);
  await expect(
    overrideHealth(admin, pid, d.id, input, randomUUID()),
  ).rejects.toThrow(/outra pessoa/);
  await expect(
    db.query(
      "UPDATE governance.health_overrides SET health='CRITICAL' WHERE id=$1",
      [health.id],
    ),
  ).rejects.toThrow();
  await overrideHealth(
    pmo,
    pid,
    d.id,
    {
      action: "CLEAR",
      reason: "Voltar à projeção calculada",
      expectedOverrideId: health.id,
    },
    randomUUID(),
  );
  s = await state(admin, pid);
  expect(
    s.deliverables.find((v: any) => v.id === d.id).health_override,
  ).toBeNull();
});
it("expiração retoma saúde derivada sem reativar ajuste antigo", () => {
  const ds = [{ id: d.id, health: "CRITICAL" }],
    overrides = [
      {
        subject_node_id: node.id,
        action: "SET",
        health: "ON_TRACK",
        expires_at: "2020-01-01T00:00:00Z",
      },
      {
        subject_node_id: node.id,
        action: "SET",
        health: "AT_RISK",
        expires_at: "2099-01-01T00:00:00Z",
      },
    ];
  expect(applyHealthOverrides(ds, [node], overrides)[0]).toMatchObject({
    health: "CRITICAL",
    derived_health: "CRITICAL",
    health_override: null,
  });
});
