import { it, expect } from "vitest";
import {
  createAdapter,
  reconcileFields,
} from "../src/server/infrastructure/adapters";
it("BR-017: atualização operacional nunca sobrescreve baseline e decisão", () => {
  const r = reconcileFields(
    {
      execution_status: "IN_PROGRESS",
      forecast_date: "2027-01-01",
      baseline: "changed",
      decision: "changed",
    },
    { forecast_date: "2026-12-01", baseline: "approved", decision: "approved" },
  );
  expect(r.updates).toEqual({ execution_status: "IN_PROGRESS" });
  expect(Object.keys(r.conflicts)).toEqual([
    "forecast_date",
    "baseline",
    "decision",
  ]);
});
it("conector sem secret e hosts internos não parecem conectados", () => {
  expect(() =>
    createAdapter({
      type: "GITHUB",
      baseUrl: "https://127.0.0.1",
      project: "a/b",
      secretEnv: "MCT_CONNECTOR_TEST",
    }),
  ).toThrow(/Host/);
  delete process.env.MCT_CONNECTOR_TEST;
  expect(() =>
    createAdapter({
      type: "GITHUB",
      baseUrl: "https://api.github.com",
      project: "a/b",
      secretEnv: "MCT_CONNECTOR_TEST",
    }),
  ).toThrow(/Credencial/);
});
it("contrato GitHub filtra PR e estado sem mapping permanece desconhecido", async () => {
  process.env.MCT_CONNECTOR_TEST = "test-only";
  const adapter = createAdapter(
    {
      type: "GITHUB",
      baseUrl: "https://api.github.com",
      project: "a/b",
      secretEnv: "MCT_CONNECTOR_TEST",
    },
    async () =>
      Response.json([
        {
          id: 1,
          html_url: "https://github.com/a/b/issues/1",
          title: "Issue teste",
          state: "closed",
          updated_at: "2026-10-13T00:00:00Z",
        },
        {
          id: 2,
          html_url: "https://github.com/a/b/pull/2",
          title: "PR",
          state: "closed",
          updated_at: "2026-10-13T00:00:00Z",
          pull_request: {},
        },
      ]),
  );
  const page = await adapter.fetchPage();
  expect(page.items).toHaveLength(1);
  expect(page.items[0].operationalState).toBe("UNKNOWN");
  delete process.env.MCT_CONNECTOR_TEST;
});
