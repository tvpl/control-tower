import { it, expect } from "vitest";
import { assessmentSchema } from "../src/server/domain/schemas";
import { randomUUID } from "node:crypto";
import {
  capabilityReadiness,
  deliverableReadiness,
  effectiveAssessments,
} from "../src/server/domain/readiness";
const cap = {
  id: "cap",
  scope_status: "APPROVED",
  acceptance_criteria: ["Aceite"],
};
const required = {
  id: "required",
  execution_status: "DONE",
  accepted: true,
  scope_status: "APPROVED",
};
const optional = {
  id: "optional",
  execution_status: "BLOCKED",
  accepted: false,
  scope_status: "PROPOSED",
};
const nodes = [
  { id: "n1", entity_type: "deliverables", entity_id: "required" },
  { id: "n2", entity_type: "deliverables", entity_id: "optional" },
];
const gate = { id: "gate", version: 2, blocking: true };
const approved = {
  id: "a",
  subject_node_id: "n1",
  gate_id: "gate",
  gate_version: 2,
  result: "PASSED",
};
const links = [
  {
    capability_id: "cap",
    deliverable_id: "required",
    contribution_type: "REQUIRED",
  },
  {
    capability_id: "cap",
    deliverable_id: "optional",
    contribution_type: "OPTIONAL",
  },
];
it("BR002: opcionais e apoio não bloqueiam capacidade; obrigatório exige aceite, escopo e gates", () => {
  const result = capabilityReadiness(
    cap,
    [required, optional],
    links,
    nodes,
    [gate],
    [approved],
  );
  expect(result.status).toBe("READY");
  expect(result.requiredDeliverables).toBe(1);
  expect(
    capabilityReadiness(
      cap,
      [{ ...required, accepted: false }, optional],
      links,
      nodes,
      [gate],
      [approved],
    ).status,
  ).toBe("NOT_READY");
  expect(
    capabilityReadiness(
      cap,
      [required, optional],
      links.map((l) => ({ ...l, contribution_type: "REQUIRED" })),
      nodes,
      [gate],
      [approved],
    ).status,
  ).toBe("NOT_READY");
});
it("sem obrigatórios ou catálogo, prontidão desconhecida; não vira verde", () => {
  expect(
    capabilityReadiness(
      cap,
      [optional],
      [{ ...links[1], contribution_type: "SUPPORTING" }],
      nodes,
      [gate],
      [],
    ).status,
  ).toBe("NOT_ASSESSED");
  expect(deliverableReadiness([required], nodes, [], []).status).toBe(
    "NOT_ASSESSED",
  );
});
it("critério de versão antiga, inclusive N/A, não satisfaz nem reduz denominador", () => {
  const old = { ...approved, gate_version: 1, result: "NOT_APPLICABLE" };
  const result = deliverableReadiness([required], nodes, [gate], [old]);
  expect(result.status).toBe("NOT_READY");
  expect(result.totalApplicableGates).toBe(1);
  expect(result.percentage).toBe(0);
  expect(effectiveAssessments([gate], [old])[0].stale_criterion).toBe(true);
});
it("escopo proposto/excluído não autoriza prontidão; contagem deduplica item compartilhado", () => {
  expect(
    deliverableReadiness([required, required], nodes, [gate], [approved])
      .requiredDeliverables,
  ).toBe(1);
  expect(
    capabilityReadiness(
      { ...cap, scope_status: "EXCLUDED" },
      [required],
      links,
      nodes,
      [gate],
      [approved],
    ).status,
  ).toBe("NOT_READY");
  expect(
    deliverableReadiness([required], nodes, [gate], [approved], links, [
      { ...cap, scope_status: "PROPOSED" },
    ]).status,
  ).toBe("NOT_READY");
});

it("BR007: espaços em branco não substituem justificativa de N/A", () => {
  expect(
    assessmentSchema.safeParse({
      subject_node_id: randomUUID(),
      gate_id: randomUUID(),
      expectedGateVersion: 1,
      result: "NOT_APPLICABLE",
      expectedVersion: 0,
      justification: "   ",
      evidence_ids: [],
    }).success,
  ).toBe(false);
});
