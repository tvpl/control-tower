import { it, expect } from "vitest";
import { z } from "zod";
import { normalizeRow } from "../src/server/infrastructure/database";
it("contrato PostgreSQL servidor/embedded preserva date e distingue timestamp UTC", () => {
  const server = normalizeRow({
    forecast_date: new Date("2026-11-01T00:00:00Z"),
    needed_by: new Date("2026-10-25T00:00:00Z"),
    updated_at: new Date("2026-10-14T02:30:00Z"),
    name: "Entrega",
  });
  expect(z.iso.date().parse(server.forecast_date)).toBe("2026-11-01");
  expect(server.needed_by).toBe("2026-10-25");
  expect(server.updated_at).toBe("2026-10-14T02:30:00.000Z");
  const embedded = normalizeRow({
    forecast_date: "2026-11-01",
    needed_by: "2026-10-25",
    updated_at: "2026-10-14T02:30:00.000Z",
    name: "Entrega",
  });
  expect(server).toEqual(embedded);
});
