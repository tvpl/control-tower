/** Remove only this suite's own synthetic capability fixtures; preserve audit/snapshots. */
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const login = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@demo.local",
    password: "Tower-Demo-2026!",
  }),
});
if (!login.ok) throw new Error(`Login de limpeza: ${login.status}`);
const cookie = login.headers.get("set-cookie")!.split(";")[0];
const request = (path: string, init: RequestInit = {}) =>
  fetch(origin + path, {
    ...init,
    headers: { Cookie: cookie, Origin: origin, ...init.headers },
  });
const { items } = await (await request("/api/v1/programs")).json();
const pid = items.find((p: { code: string }) => p.code === "ACQ-MOD").id;
const state = await (await request(`/api/v1/state?programId=${pid}`)).json();
let count = 0;
for (const row of state.capabilities.filter(
  (c: { code: string; name: string }) =>
    c.code.startsWith("E2E-") && c.name === "Capacidade criada em teste E2E",
)) {
  const response = await request(
    `/api/v1/capabilities/${row.id}?programId=${pid}`,
    { method: "DELETE", headers: { "If-Match": `"${row.version}"` } },
  );
  if (!response.ok)
    throw new Error(`Falha removendo fixture: ${response.status}`);
  count++;
}
console.log(
  `${count} fixtures próprias removidas; auditoria e snapshots preservados.`,
);

export {};
