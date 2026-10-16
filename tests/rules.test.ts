import { describe, it, expect } from "vitest";
import {
  metrics,
  readiness,
  hasCycle,
  impactedNodes,
  canEdit,
  assertTransition,
  assertExecutionChange,
  projectHealth,
} from "../src/server/domain/rules";
describe("Invariantes normativas", () => {
  it("BR-003: DONE sem aceite não é progresso aceito", () => {
    const m = metrics([
      {
        id: "a",
        accepted: false,
        execution_status: "DONE",
        updated_at: new Date().toISOString(),
      },
    ]);
    expect(m.progress).toBe(0);
    expect(m.done).toBe(1);
    expect(m.provisional).toBe(true);
  });
  it("BR-013: entrega compartilhada conta uma vez e peso congelado governa fórmula", () => {
    const d = {
      id: "a",
      accepted: true,
      execution_status: "DONE",
      updated_at: new Date().toISOString(),
    };
    const m = metrics(
      [d, d, { ...d, id: "b", accepted: false }],
      [
        { id: "a", weight: 1 },
        { id: "a", weight: 1 },
        { id: "b", weight: 3 },
      ],
    );
    expect(m.total).toBe(2);
    expect(m.progress).toBe(25);
    expect(m.denominator).toBe(4);
    expect(m.provisional).toBe(false);
  });
  it("Ausência mantém percentual desconhecido", () => {
    expect(metrics([]).progress).toBeNull();
    expect(readiness([], 0).status).toBe("NOT_ASSESSED");
    expect(readiness([], 0).percentage).toBeNull();
  });
  it("BR-006/019: gate pendente ou ausente impede release", () => {
    expect(
      readiness([{ result: "PASSED" }, { result: "PENDING" }], 2).status,
    ).toBe("NOT_READY");
    expect(readiness([{ result: "PASSED" }], 2).blockingGates).toBe(1);
  });
  it("BR-007: N/A aprovado exclui denominador", () => {
    const r = readiness(
      [{ result: "NOT_APPLICABLE" }, { result: "PENDING" }],
      2,
    );
    expect(r.totalApplicableGates).toBe(1);
    expect(r.percentage).toBe(0);
    expect(r.status).toBe("NOT_READY");
  });
  it("BR-016: exceção expirada volta a bloquear", () => {
    expect(
      readiness(
        [{ result: "EXCEPTION_APPROVED", expires_at: "2025-01-01T00:00:00Z" }],
        1,
        new Date("2026-10-13"),
      ).status,
    ).toBe("NOT_READY");
    expect(
      readiness(
        [{ result: "EXCEPTION_APPROVED", expires_at: "2027-01-01T00:00:00Z" }],
        1,
        new Date("2026-10-13"),
      ).status,
    ).toBe("READY_WITH_EXCEPTIONS");
  });
  it("BR-004/010: ciclo detectado e propagação transitiva finita", () => {
    const edges = [
      { source_node_id: "a", target_node_id: "b" },
      { source_node_id: "b", target_node_id: "c" },
      { source_node_id: "c", target_node_id: "a" },
    ];
    expect(hasCycle(edges)).toBe(true);
    expect(impactedNodes("a", edges).sort()).toEqual(["b", "c"]);
    expect(hasCycle(edges.slice(0, 2))).toBe(false);
  });
  it("BR-014: stale reduz confiança, não altera aceite", () => {
    const m = metrics(
      [
        {
          id: "a",
          accepted: false,
          execution_status: "IN_PROGRESS",
          updated_at: "2026-01-01",
        },
      ],
      [],
      new Date("2026-10-13"),
    );
    expect(m.stale).toBe(1);
    expect(m.accepted).toBe(0);
  });
  it("BR-020: líder limitado à frente e admin sem alçada de gates", () => {
    expect(
      canEdit(
        [{ role: "WORKSTREAM_LEAD", workstream_id: "a" }],
        "deliverables",
        "b",
      ),
    ).toBe(false);
    expect(
      canEdit(
        [{ role: "WORKSTREAM_LEAD", workstream_id: "a" }],
        "deliverables",
        "a",
      ),
    ).toBe(true);
    expect(canEdit([{ role: "PROGRAM_ADMIN" }], "assessments")).toBe(false);
  });
  it("Produção exige gates e release; salto de estágio rejeitado", () => {
    expect(() =>
      assertTransition("UAT", "PRODUCTION", true, false, "Teste"),
    ).toThrow(/release/);
    expect(() => assertTransition("SIT", "UAT", false, false, "Teste")).toThrow(
      /Gates/,
    );
    expect(() =>
      assertTransition("IDENTIFIED", "UAT", true, true, "Teste"),
    ).toThrow(/etapa/);
  });
  it("execução aceita só pode reabrir pelo estado REOPENED", () => {
    expect(() =>
      assertExecutionChange("DONE", "IN_PROGRESS", "Alteração"),
    ).toThrow(/inválida/);
    expect(() =>
      assertExecutionChange("DONE", "REOPENED", "Correção necessária"),
    ).not.toThrow();
  });
  it("saúde propaga bloqueio crítico aos dependentes sem dupla contagem", () => {
    const now = new Date("2026-10-13");
    const deliveries = ["a", "b", "c"].map((id) => ({
      id,
      execution_status: "IN_PROGRESS",
      updated_at: "2026-10-13",
      owner_id: "u",
      forecast_date: "2026-11-01",
    }));
    const nodes = deliveries.map((d) => ({
      id: d.id + "-node",
      entity_id: d.id,
      entity_type: "deliverables",
    }));
    const edges = [
      {
        source_node_id: "a-node",
        target_node_id: "b-node",
        status: "BLOCKED",
        dependency_type: "BLOCKS",
        criticality: "CRITICAL",
      },
      {
        source_node_id: "b-node",
        target_node_id: "c-node",
        status: "OPEN",
        dependency_type: "BLOCKS",
        criticality: "HIGH",
      },
    ];
    const result = projectHealth(deliveries, nodes, edges, [], now);
    expect(result.find((d) => d.id === "a")?.health).toBe("ON_TRACK");
    expect(result.find((d) => d.id === "b")?.health).toBe("CRITICAL");
    expect(result.find((d) => d.id === "c")?.health).toBe("CRITICAL");
  });
});
