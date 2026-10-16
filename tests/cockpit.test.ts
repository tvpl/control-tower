import { it, expect } from "vitest";
import {
  acceptance,
  featureDeliverables,
  statusBrief,
} from "../src/features/tower/cockpit/model";
it("hierarquia inclui descendentes e deduplica entregas compartilhadas", () => {
  const s = {
    capabilities: [
      { id: "a" },
      { id: "b", parent_id: "a" },
      { id: "c", parent_id: "b" },
    ],
    links: [
      { capability_id: "a", deliverable_id: "one" },
      { capability_id: "b", deliverable_id: "one" },
      { capability_id: "c", deliverable_id: "two" },
    ],
  };
  const ds = [
    { id: "one", accepted: true },
    { id: "two", accepted: false },
    { id: "other", accepted: true },
  ];
  expect(featureDeliverables(s, ds, "a")).toEqual(ds.slice(0, 2));
  expect(acceptance(featureDeliverables(s, ds, "a"))).toEqual({
    accepted: 1,
    total: 2,
    percentage: 50,
  });
  expect(featureDeliverables(s, ds.slice(0, 1), "a")).toHaveLength(1);
});
it("denominador vazio é desconhecido; DONE não é aceite", () => {
  expect(acceptance([]).percentage).toBeNull();
  expect(
    acceptance([{ id: "one", execution_status: "DONE", accepted: false }]),
  ).toEqual({ total: 1, accepted: 0, percentage: 0 });
  expect(
    acceptance([
      { id: "one", accepted: true },
      { id: "one", accepted: true },
    ]).total,
  ).toBe(1);
});
it("resumo explicita data, filtros, denominadores e somente os pontos selecionados", () => {
  const s = {
    programs: [{ name: "Torre" }],
    asOf: "2026-10-14T12:00:00Z",
    nodes: [],
    dependencies: [],
    users: [{ id: "u", display_name: "Autor" }],
    readiness: { percentage: null },
    gates: [],
    assessments: [],
    links: [],
    capabilities: [],
  };
  const text = statusBrief(
    s,
    [{ id: "d", accepted: false, execution_status: "DONE" }],
    undefined,
    [
      {
        title: "Status do parceiro",
        body: "Aguardando evidência",
        author_id: "u",
        version: 1,
        important: true,
      },
    ],
  );
  expect(text).toContain("0/1 (0%)");
  expect(text).toContain("1 concluídos");
  expect(text).toContain("visão ao vivo");
  expect(text).toContain("após filtros");
  expect(text).toContain("Aguardando evidência");
  expect(text).toContain("não avaliada");
});
