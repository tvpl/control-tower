import { describe, expect, it } from "vitest";
import {
  deliveryAnomalies,
  scopeMetrics,
  scopedReadiness,
  snapshotTrend,
} from "../src/features/tower/cockpit/insight-model";
import { filterDeliverables } from "../src/features/tower/filtering";
const asOf = "2026-10-15T12:00:00Z";
const a = {
  id: "a",
  accepted: true,
  execution_status: "DONE",
  owner_id: "u",
  layer: "BACKEND",
  updated_at: asOf,
  forecast_date: "2026-11-01",
  acceptance_criteria: "Validar retorno",
  has_scope: true,
  has_evidence: true,
  scope_status: "APPROVED",
};
const b = {
  ...a,
  id: "b",
  accepted: false,
  execution_status: "BLOCKED",
  owner_id: null,
  updated_at: "2026-10-01T12:00:00Z",
  forecast_date: "2026-11-12",
};
const s = {
  asOf,
  formulaVersion: "v1",
  deliverables: [a, b],
  baselineItems: [
    { frozen_payload: { ...a, weight: 1 } },
    { frozen_payload: { ...b, weight: 3, forecast_date: "2026-11-01" } },
  ],
  nodes: [
    { id: "na", entity_id: "a", entity_type: "deliverables" },
    { id: "nb", entity_id: "b", entity_type: "deliverables" },
  ],
  gates: [{ id: "g", blocking: true, version: 1 }],
  assessments: [
    {
      subject_node_id: "na",
      gate_id: "g",
      gate_version: 1,
      result: "PASSED",
      blocking: true,
    },
  ],
  links: [],
  capabilities: [],
  squads: [],
};
describe("indicadores do dashboard preservam contexto e denominadores", () => {
  it("pondera com pesos congelados e recalcula o recorte", () => {
    expect(scopeMetrics(s, [a, b]).progress).toBe(25);
    expect(scopeMetrics(s, [a]).progress).toBe(100);
    expect(scopeMetrics(s, []).progress).toBeNull();
    expect(scopeMetrics({ ...s, baselineItems: [] }, [a, b])).toMatchObject({
      progress: 50,
      provisional: true,
    });
  });
  it("prontidão filtrada não inclui bloqueio de outra entrega", () => {
    expect(scopedReadiness(s, [a]).percentage).toBe(100);
    expect(scopedReadiness(s, [a, b]).percentage).toBe(50);
    expect(scopedReadiness(s, []).percentage).toBeNull();
  });
  it("radar detecta drift real da baseline e freshness determinística", () => {
    const radar = deliveryAnomalies(s, [a, b]);
    expect(radar.find((r) => r.key === "late")?.items.map((d) => d.id)).toEqual(
      ["b"],
    );
    expect(
      radar.find((r) => r.key === "stale")?.items.map((d) => d.id),
    ).toEqual(["b"]);
    expect(radar.find((r) => r.key === "owner")?.items).toEqual([b]);
    expect(deliveryAnomalies(s, [a]).every((r) => r.items.length === 0)).toBe(
      true,
    );
  });
  it("radar localiza avaliações ausentes ou obsoletas sem duplicar entregáveis", () => {
    expect(
      deliveryAnomalies(s, [a, b])
        .find((r) => r.key === "gates")
        ?.items.map((d) => d.id),
    ).toEqual(["b"]);
    expect(
      deliveryAnomalies(
        { ...s, gates: [{ id: "g", blocking: true, version: 2 }] },
        [a, b],
      )
        .find((r) => r.key === "gates")
        ?.items.map((d) => d.id),
    ).toEqual(["a", "b"]);
  });
  it("fórmulas diferentes e ausência de IDs não inventam série histórica", () => {
    const snapshots = [
      {
        id: "3",
        as_of: asOf,
        formula_version: "v2",
        payload: { deliverables: [a, b] },
      },
      {
        id: "2",
        as_of: asOf,
        formula_version: "v1",
        payload: { deliverables: [b] },
      },
      {
        id: "1",
        as_of: asOf,
        formula_version: "v1",
        payload: { deliverables: [a, b] },
      },
    ];
    expect(
      snapshotTrend({ ...s, snapshots }, [a]).map((p) => p.accepted),
    ).toEqual([100, null, null]);
    expect(snapshotTrend({ ...s, snapshots: [] }, [a])).toEqual([]);
  });
  it("camada e responsável intersectam sobre o mesmo entregável", () => {
    expect(
      filterDeliverables(s, [a, b], { layer: "BACKEND", owner: "u" }),
    ).toEqual([a]);
    expect(
      filterDeliverables(s, [a, b], { layer: "DATA", owner: "u" }),
    ).toEqual([]);
    expect(filterDeliverables(s, [a, b], { owner: "__unassigned__" })).toEqual([
      b,
    ]);
  });
});
