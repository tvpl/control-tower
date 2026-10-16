import { test, expect } from "@playwright/test";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
test("API: ETag, PATCH parcial, paginação, isolamento e snapshot idempotente", async ({
  request,
}) => {
  const login = await request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email: "admin@demo.local", password: "Tower-Demo-2026!" },
  });
  expect(login.status()).toBe(200);
  const pid = (await (await request.get("/api/v1/programs")).json()).items[0]
    .id;
  const first = await (
    await request.get(`/api/v1/deliverables?programId=${pid}&limit=2`)
  ).json();
  expect(first.items).toHaveLength(2);
  expect(first.nextCursor).toBeTruthy();
  const next = await (
    await request.get(
      `/api/v1/deliverables?programId=${pid}&limit=2&cursor=${first.nextCursor}`,
    )
  ).json();
  expect(next.items[0].id).not.toBe(first.items[0].id);
  const d = first.items[0];
  const get = await request.get(`/api/v1/deliverables/${d.id}`);
  expect(get.status()).toBe(200);
  expect(get.headers().etag).toBe(`"${d.version}"`);
  const partial = await request.patch(`/api/v1/deliverables/${d.id}`, {
    headers: { Origin: origin, "If-Match": `"${d.version}"` },
    data: {
      forecast_date: d.forecast_date,
      changeReason: "Teste de contrato: preservar previsão",
    },
  });
  expect(partial.status()).toBe(200);
  expect((await partial.json()).name).toBe(d.name);
  const stale = await request.patch(`/api/v1/deliverables/${d.id}`, {
    headers: { Origin: origin, "If-Match": `"${d.version}"` },
    data: {
      forecast_date: d.forecast_date,
      changeReason: "Repetição obsoleta",
    },
  });
  expect(stale.status()).toBe(409);
  expect(stale.headers()["content-type"]).toContain("application/problem+json");
  const idor = await request.get(
    `/api/v1/state?programId=${crypto.randomUUID()}`,
  );
  expect(idor.status()).toBe(403);
  const key = crypto.randomUUID(),
    headers = { Origin: origin, "Idempotency-Key": key };
  const one = await (
    await request.post(`/api/v1/programs/${pid}/snapshots`, {
      headers,
      data: {},
    })
  ).json();
  const two = await (
    await request.post(`/api/v1/programs/${pid}/snapshots`, {
      headers,
      data: {},
    })
  ).json();
  expect(one.id).toBe(two.id);
  const map = await (
    await request.get(`/api/v1/programs/${pid}/capability-map`)
  ).json();
  expect(map.layers).toHaveLength(9);
  expect(map.capabilities[0].cells).toHaveLength(9);
  const bad = await request.post(`/api/v1/domains?programId=${pid}`, {
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },
    data: Buffer.from("{bad-json"),
  });
  expect(bad.status()).toBe(400);
});
