import { describe, expect, it } from "vitest";
import {
  isOverdue,
  managementCounts,
  programDay,
} from "../src/shared/management-signals";
import {
  featureLandscape,
  signalMatches,
  featureSituation,
  landscapeGroups,
} from "../src/features/tower/management/model";
import { relationshipGraph } from "../src/features/tower/management/relationship-model";
const today = "2026-10-16";
describe("Sinais de gestão visual", () => {
  it("compara calendário no fuso do projeto, inclusive na virada do dia", () => {
    expect(programDay("2026-10-16T01:00:00Z", "America/Sao_Paulo")).toBe(
      "2026-10-15",
    );
    expect(programDay("2026-10-16T01:00:00Z", "Asia/Tokyo")).toBe(today);
  });
  it("prazo vencido não inclui hoje, data desconhecida, DONE ou cancelamento", () => {
    expect(
      isOverdue(
        { forecast_date: "2026-10-15", execution_status: "IN_PROGRESS" },
        today,
      ),
    ).toBe(true);
    for (const d of [
      { forecast_date: today, execution_status: "IN_PROGRESS" },
      { forecast_date: null, execution_status: "BLOCKED" },
      {
        forecast_date: "2026-10-01",
        execution_status: "DONE",
        accepted: false,
      },
      { forecast_date: "2026-10-01", execution_status: "CANCELLED" },
    ])
      expect(isOverdue(d, today)).toBe(false);
  });
  it("deduplica entregas e mantém execução, aceite, bloqueio e prazo como dimensões independentes", () => {
    const d = {
      id: "done",
      execution_status: "DONE",
      accepted: false,
      forecast_date: "2026-10-01",
    };
    const c = managementCounts(
      [
        d,
        d,
        {
          id: "blocked",
          execution_status: "BLOCKED",
          forecast_date: "2026-10-01",
        },
        { id: "unknown", execution_status: "ON_HOLD" },
      ],
      today,
    );
    expect(c).toMatchObject({
      total: 3,
      done: 1,
      accepted: 0,
      active: 0,
      blocked: 1,
      overdue: 1,
      withoutForecast: 1,
      percentage: 0,
    });
  });
  it("universo vazio continua desconhecido", () => {
    expect(managementCounts([], today)).toMatchObject({
      total: 0,
      percentage: null,
      done: 0,
      overdue: 0,
    });
  });
  const caps = [
    { id: "parent", code: "P", name: "Pai" },
    { id: "child", code: "C", name: "Filha", parent_id: "parent" },
    { id: "empty", code: "E", name: "Sem entrega" },
  ];
  const ds = [
    {
      id: "shared",
      execution_status: "IN_PROGRESS",
      forecast_date: "2026-10-15",
    },
    { id: "orphan", execution_status: "DONE", accepted: false },
  ];
  const s = {
    asOf: "2026-10-16T12:00:00Z",
    programs: [{ timezone: "America/Sao_Paulo" }],
    capabilities: caps,
    links: [
      { capability_id: "parent", deliverable_id: "shared" },
      { capability_id: "child", deliverable_id: "shared" },
    ],
    baselineItems: [
      { frozen_payload: { id: "shared", forecast_date: "2026-10-20" } },
    ],
  };
  it("inclui descendentes sem duplicar N:N e exibe features sem entregas e itens fora do mapa", () => {
    const m = featureLandscape(s, ds, caps);
    expect(m.counts.total).toBe(2);
    expect(m.features.find((f) => f.record.id === "parent")).toMatchObject({
      total: 1,
      overdue: 1,
      slipped: 0,
    });
    expect(
      m.features.find((f) => f.record.id === "empty")?.percentage,
    ).toBeNull();
    expect(m.unlinked.map((d) => d.id)).toEqual(["orphan"]);
  });
  it("forecast vencido e desvio da baseline podem divergir", () => {
    const m = featureLandscape(
      s,
      [{ ...ds[0], forecast_date: "2026-10-25" }],
      caps,
    );
    expect(m.features[0]).toMatchObject({ overdue: 0, slipped: 1 });
  });
  it("features filtradas não recuperam entregas de fora do recorte", () => {
    const m = featureLandscape(s, [], caps.slice(0, 1));
    expect(m.features).toHaveLength(1);
    expect(m.features[0].total).toBe(0);
    expect(m.counts.total).toBe(0);
  });
  it("filtros por sinal preservam desconhecidos e estados de execução", () => {
    expect(signalMatches(ds[0], "ACTIVE", today)).toBe(true);
    expect(signalMatches(ds[0], "OVERDUE", today)).toBe(true);
    expect(signalMatches(ds[1], "DONE", today)).toBe(true);
    expect(signalMatches(ds[1], "NO_DATE", today)).toBe(true);
    expect(signalMatches(ds[0], "BLOCKED", today)).toBe(false);
  });
});

describe("Leitura por grupos e relações", () => {
  const domains = [
    { id: "a", name: "Mesmo nome", code: "A" },
    { id: "b", name: "Mesmo nome", code: "B" },
  ];
  const caps = [
    { id: "a1", code: "A1", name: "Primeira", domain_id: "a" },
    { id: "a2", code: "A2", name: "Segunda", domain_id: "a", parent_id: "a1" },
    { id: "b1", code: "B1", name: "Terceira", domain_id: "b" },
  ];
  const shared = { id: "shared", execution_status: "DONE", accepted: false };
  const s = {
    asOf: "2026-10-16T12:00:00Z",
    programs: [{}],
    capabilities: caps,
    links: caps.map((c) => ({
      capability_id: c.id,
      deliverable_id: shared.id,
    })),
    nodes: caps.map((c) => ({
      id: `n:${c.id}`,
      entity_type: "capabilities",
      entity_id: c.id,
    })),
    dependencies: [
      {
        id: "internal",
        source_node_id: "n:a1",
        target_node_id: "n:a2",
        status: "OPEN",
      },
      {
        id: "external",
        source_node_id: "n:a2",
        target_node_id: "n:b1",
        status: "BLOCKED",
      },
    ],
  };
  const features = featureLandscape(s, [shared], caps).features;
  it("não confunde execução completa com aceite confirmado", () => {
    expect(featureSituation(features[0])).toMatchObject({
      key: "REVIEW",
      name: "Aguardando aceite",
    });
    expect(featureSituation({ ...features[0], accepted: 1 })).toMatchObject({
      key: "ACCEPTED",
    });
    expect(
      featureSituation({ ...features[0], total: 0, accepted: 0, done: 0 }),
    ).toMatchObject({ key: "EMPTY" });
  });
  it("rótulos preservam bloqueio, atraso, espera, cancelamento e reabertura", () => {
    expect(
      featureSituation({ ...features[0], blocked: 1, overdue: 1 }).key,
    ).toBe("BLOCKED");
    expect(featureSituation({ ...features[0], overdue: 1 }).key).toBe(
      "OVERDUE",
    );
    for (const [status, key] of [
      ["NOT_STARTED", "NOT_STARTED"],
      ["ON_HOLD", "HOLD"],
      ["CANCELLED", "CANCELLED"],
      ["REOPENED", "REOPENED"],
    ])
      expect(
        featureSituation({
          ...features[0],
          done: 0,
          items: [{ id: "d", execution_status: status }],
        }).key,
      ).toBe(key);
  });
  it("deduplica entregas do grupo sem fundir domínios de mesmo nome", () => {
    const groups = landscapeGroups(features, domains, "DOMAIN", today);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.id === "domain:a")).toMatchObject({
      counts: { total: 1, done: 1, accepted: 0 },
    });
    expect(groups.find((g) => g.id === "domain:a")?.features).toHaveLength(2);
  });
  it("situação sem entregas não é agrupada como a iniciar", () => {
    const groups = landscapeGroups(
      [features[0], { ...features[1], total: 0, items: [] }],
      domains,
      "STATE",
      today,
    );
    expect(groups.map((g) => g.id).sort()).toEqual([
      "state:EMPTY",
      "state:REVIEW",
    ]);
  });
  it("macro agrega relações reais entre grupos e omite auto-conexões internas", () => {
    const groups = landscapeGroups(features, domains, "DOMAIN", today);
    const graph = relationshipGraph(
      s,
      features,
      groups,
      false,
      true,
      () => {},
      () => {},
    );
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      source: "domain:a",
      target: "domain:b",
      data: { dependencyIds: ["external"] },
    });
    expect(
      relationshipGraph(
        s,
        features,
        groups,
        false,
        false,
        () => {},
        () => {},
      ).edges,
    ).toHaveLength(0);
  });
  it("micro distingue hierarquia de dependência sem puxar features externas", () => {
    const subset = features.slice(0, 2),
      groups = landscapeGroups(subset, domains, "DOMAIN", today);
    const graph = relationshipGraph(
      s,
      subset,
      groups,
      true,
      true,
      () => {},
      () => {},
    );
    expect(graph.nodes.map((n) => n.id)).toEqual(["a1", "a2"]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.find((e) => e.id === "parent:a2")?.label).toBe(
      "Subfeature",
    );
    expect(graph.edges.flatMap((e) => e.data?.dependencyIds || [])).toEqual([
      "internal",
    ]);
  });
});
