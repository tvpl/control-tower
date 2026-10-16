import { randomUUID } from "node:crypto";
import { beforeAll, expect, it } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import {
  accessState,
  saveMembership,
  provisionIdentity,
  issueAPIToken,
  revokeAPIToken,
} from "../src/server/application/access-management";
import { authenticateBearer } from "../src/server/infrastructure/access-tokens";
import {
  memberships,
  signSession,
  verifyPassword,
  limitLogin,
} from "../src/server/infrastructure/auth";
import {
  gateAuthority,
  readable,
  redactState,
} from "../src/server/domain/access";
process.env.PGLITE_DATA_DIR = "memory://";
process.env.AUTH_MODE = "local";
process.env.AUTH_SECRET = "test-only-access-key-with-at-least-32-characters";
const db = getDb(),
  pid = randomUUID(),
  other = randomUUID(),
  admin = randomUUID(),
  reader = randomUUID(),
  lead = randomUUID(),
  ws = randomUUID(),
  domain = randomUUID();
let member: any, token: any;
beforeAll(async () => {
  await migrate(db);
  for (const id of [admin, reader, lead])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name,email) VALUES($1,$2,'Access test',$3)",
      [id, id, `${id}@test.local`],
    );
  for (const id of [pid, other])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Access program')",
      [id, id],
    );
  for (const [id, role] of [
    [admin, "PROGRAM_ADMIN"],
    [reader, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [id, pid, role],
    );
  await db.query(
    "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'DEV','Development')",
    [ws, pid],
  );
  await db.query(
    "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'DOM','Domain')",
    [domain, pid],
  );
  await db.query(
    "INSERT INTO governance.gate_definitions(code,name,category) VALUES('ENG','Engineering gate','ENGINEERING')",
  );
});
const grant = () => ({
  email: `${lead}@test.local`,
  role: "WORKSTREAM_LEAD",
  workstream_id: ws,
  gate_categories: [],
  domain_ids: [],
  data_clearance: "INTERNAL",
  expires_at: null,
  expectedVersion: 0,
  reason: "Designar liderança da frente",
});
it("gestão exige admin e valida escopo; líder recebe frente explícita", async () => {
  await expect(
    saveMembership(reader, pid, undefined, "save", grant(), randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    saveMembership(
      admin,
      pid,
      undefined,
      "save",
      { ...grant(), workstream_id: randomUUID() },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    saveMembership(
      admin,
      pid,
      undefined,
      "save",
      { ...grant(), workstream_id: null },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 422 });
  member = await saveMembership(
    admin,
    pid,
    undefined,
    "save",
    grant(),
    randomUUID(),
  );
  expect(member.workstream_id).toBe(ws);
  expect((await memberships(lead, pid))[0].role).toBe("WORKSTREAM_LEAD");
});
it("vínculos têm versão e não removem o último admin permanente", async () => {
  await expect(
    saveMembership(
      admin,
      pid,
      member.id,
      "save",
      { ...grant(), expectedVersion: 99 },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409 });
  const [last] = await db.query(
    "SELECT * FROM iam.memberships WHERE user_id=$1 AND program_id=$2",
    [admin, pid],
  );
  await expect(
    saveMembership(
      admin,
      pid,
      last.id,
      "revoke",
      { expectedVersion: 1, reason: "Remover último admin" },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409 });
  member = await saveMembership(
    admin,
    pid,
    member.id,
    "save",
    { ...grant(), expectedVersion: 1, data_clearance: "CONFIDENTIAL" },
    randomUUID(),
  );
  expect(Number(member.version)).toBe(2);
});
it("alçadas de gate validam categoria, frente e todos os domínios", () => {
  const roles = [
    {
      role: "GATE_APPROVER",
      gate_categories: ["ENGINEERING"],
      workstream_id: ws,
      domain_ids: [domain],
    },
  ];
  expect(gateAuthority(roles, "ENGINEERING", ws, [domain])).toBe(true);
  expect(gateAuthority(roles, "SECURITY", ws, [domain])).toBe(false);
  expect(gateAuthority(roles, "ENGINEERING", randomUUID(), [domain])).toBe(
    false,
  );
  expect(gateAuthority(roles, "ENGINEERING", ws, [domain, randomUUID()])).toBe(
    false,
  );
  expect(gateAuthority(roles, "ENGINEERING", ws, [])).toBe(false);
});
it("provisionamento não concede papel nem persiste senha no audit/outbox", async () => {
  const password = "Initial-Test-Password-2026!",
    email = `new-${randomUUID()}@test.local`;
  const identity: any = await provisionIdentity(
    admin,
    pid,
    {
      mode: "LOCAL",
      email,
      name: "Nova identidade",
      password,
      reason: "Provisionar conta local de teste",
    },
    randomUUID(),
  );
  expect(identity.password_hash).toBeUndefined();
  await expect(memberships(identity.id, pid)).rejects.toMatchObject({
    status: 403,
  });
  const [stored] = await db.query(
    "SELECT password_hash FROM iam.users WHERE id=$1",
    [identity.id],
  );
  expect(verifyPassword(password, stored.password_hash)).toBe(true);
  const events = await db.query(
    "SELECT after_data FROM audit.audit_events WHERE entity_id=$1",
    [identity.id],
  );
  expect(JSON.stringify(events)).not.toContain(password);
  expect(JSON.stringify(events)).not.toContain("password_hash");
});
it("token JWT tem escopo e separação da sessão; metadata não revela credencial", async () => {
  token = await issueAPIToken(admin, {
    name: "Token de leitura",
    programIds: [pid],
    access: "READ",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const user = await authenticateBearer(token.token);
  expect(user.apiToken).toMatchObject({ programIds: [pid], access: "READ" });
  const session = await signSession(admin);
  await expect(authenticateBearer(session)).rejects.toMatchObject({
    status: 401,
  });
  const a = await accessState(admin, pid);
  expect(JSON.stringify(a)).not.toContain(token.token);
  expect(a.tokens[0].token_digest).toBeUndefined();
  await expect(
    issueAPIToken(reader, {
      name: "Token de escrita",
      programIds: [pid],
      access: "WRITE",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    issueAPIToken(admin, {
      name: "Outro programa",
      programIds: [other],
      access: "READ",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it("revogação torna token inválido imediatamente e não permite token alheio", async () => {
  await expect(revokeAPIToken(reader, pid, token.id)).rejects.toMatchObject({
    status: 404,
  });
  await revokeAPIToken(admin, pid, token.id);
  await expect(authenticateBearer(token.token)).rejects.toMatchObject({
    status: 401,
  });
  await saveMembership(
    admin,
    pid,
    member.id,
    "revoke",
    { expectedVersion: 2, reason: "Encerrar designação da frente" },
    randomUUID(),
  );
  await expect(memberships(lead, pid)).rejects.toMatchObject({ status: 403 });
});
it("classificação é aplicada a dados congelados, evidências e auditoria", () => {
  const low = [{ role: "VIEWER", data_clearance: "INTERNAL" }],
    high = [{ role: "VIEWER", data_clearance: "RESTRICTED" }];
  const classified = {
    classification: "RESTRICTED",
    url: "https://example.test/restricted",
  };
  expect(readable(classified, low)).toBe(false);
  expect(readable(classified, high)).toBe(true);
  const s = {
    evidence: [classified],
    suppliers: [],
    contracts: [],
    assessments: [{ result: "PASSED", evidence_refs: [classified] }],
    effectiveAssessments: [{ result: "PASSED", evidence_refs: [classified] }],
    snapshots: [{ id: "s", payload: { context: { evidence: [classified] } } }],
    reports: [{ snapshot_id: "s" }],
    audit: [{ before_data: null, after_data: classified }],
  };
  const projected = redactState(s, low);
  expect(projected.evidence).toEqual([]);
  expect(projected.assessments[0]).toMatchObject({
    result: "PASSED",
    evidence_refs: [],
    evidence_redacted: true,
  });
  expect(projected.snapshots).toEqual([]);
  expect(projected.reports).toEqual([]);
  expect(projected.audit[0].after_data).toBeNull();
});
it("rate limit persistente e atômico mantém a janela entre processos", async () => {
  const key = `login-${randomUUID()}`;
  for (let i = 0; i < 8; i++) await limitLogin(key);
  await expect(limitLogin(key)).rejects.toMatchObject({ status: 429 });
  expect(await db.query("SELECT key_hash FROM iam.login_buckets")).toHaveLength(
    1,
  );
});
