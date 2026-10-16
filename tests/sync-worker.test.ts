import { beforeAll, it, expect } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { mutate } from "../src/server/application/inventory";
import {
  linkExternal,
  queueConnectionSync,
  processSyncJob,
  reconcileConflict,
} from "../src/server/application/sync-worker";
import { verifyWebhook } from "../src/server/application/webhooks";
import {
  publishOutbox,
  notifications,
  readNotification,
} from "../src/server/application/notifications";
import { privateAddress } from "../src/server/infrastructure/connector-fetch";
import { createAdapter } from "../src/server/infrastructure/adapters";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  admin = randomUUID(),
  viewer = randomUUID(),
  ws = randomUUID();
let connection: any, d: any, node: string, job: any;
beforeAll(async () => {
  await migrate(db);
  for (const u of [admin, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$1,'Sync teste')",
      [u],
    );
  await db.query(
    "INSERT INTO portfolio.programs(id,code,name) VALUES($1,'SYNC','Sync')",
    [pid],
  );
  for (const [u, role] of [
    [admin, "PROGRAM_ADMIN"],
    [viewer, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [u, pid, role],
    );
  await db.query(
    "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'WS','Frente')",
    [ws, pid],
  );
  d = await mutate(admin, pid, "deliverables", {
    code: "D-SYNC",
    name: "Gerencial preservado",
    layer: "BACKEND",
    deliverable_type: "API",
    workstream_id: ws,
  });
  node = (
    await db.query(
      "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1",
      [d.id],
    )
  )[0].id;
  process.env.MCT_CONNECTOR_TEST = "test-only";
  connection = await mutate(admin, pid, "connections", {
    name: "GitHub teste",
    connector_type: "GITHUB",
    base_url: "https://api.github.com",
    project: "owner/repo",
    secret_env: "MCT_CONNECTOR_TEST",
    state_mapping: { open: "IN_PROGRESS", closed: "DONE" },
    field_mapping: { execution_status: "operationalState" },
    execution_owner: "CONTROL_TOWER",
  });
});
function response(state = "open", updated = "2026-10-15T10:00:00Z") {
  return async () =>
    Response.json([
      {
        id: 42,
        html_url: "https://github.com/owner/repo/issues/42",
        title: "Título externo",
        state,
        updated_at: updated,
      },
    ]);
}
async function sync(fetcher: typeof fetch = response()) {
  job = await queueConnectionSync(admin, pid, connection.id, randomUUID());
  const [full] = await db.query("SELECT * FROM integration.jobs WHERE id=$1", [
    job.id,
  ]);
  try {
    return await processSyncJob(full, fetcher);
  } finally {
    await db.query(
      "UPDATE integration.jobs SET status='SUCCEEDED' WHERE id=$1",
      [job.id],
    );
  }
}
it("sem vínculo externo nada é criado; mapping/vínculo e ownership são explícitos", async () => {
  expect((await sync()).unmapped).toBe(1);
  expect(
    await db.query("SELECT id FROM delivery.deliverables WHERE program_id=$1", [
      pid,
    ]),
  ).toHaveLength(1);
  await expect(
    linkExternal(
      viewer,
      pid,
      connection.id,
      {
        externalId: "42",
        subjectNodeId: node,
        mode: "EXECUTION",
        reason: "Vincular origem",
      },
      randomUUID(),
    ),
  ).rejects.toThrow(/administrador/);
  await linkExternal(
    admin,
    pid,
    connection.id,
    {
      externalId: "42",
      subjectNodeId: node,
      mode: "EXECUTION",
      reason: "Vincular origem",
    },
    randomUUID(),
  );
  const out = await sync();
  expect(out.openConflicts).toBe(1);
  expect(
    (
      await db.query(
        "SELECT execution_status FROM delivery.deliverables WHERE id=$1",
        [d.id],
      )
    )[0].execution_status,
  ).toBe("NOT_STARTED");
});
it("conflito reconciliado com versão e alçada; histórico preservado e deduplicado", async () => {
  const [conflict] = await db.query(
    "SELECT * FROM integration.sync_conflicts WHERE status='OPEN'",
  );
  await expect(
    reconcileConflict(
      viewer,
      pid,
      conflict.id,
      {
        expectedVersion: 1,
        expectedEntityVersion: 1,
        decision: "APPLY",
        reason: "Aplicar estado",
      },
      randomUUID(),
    ),
  ).rejects.toThrow(/alçada/);
  const result: any = await reconcileConflict(
    admin,
    pid,
    conflict.id,
    {
      expectedVersion: 1,
      expectedEntityVersion: 1,
      decision: "APPLY",
      reason: "Aplicar estado validado",
    },
    randomUUID(),
  );
  expect(result.status).toBe("APPLIED");
  expect(
    (
      await db.query(
        "SELECT execution_status FROM delivery.deliverables WHERE id=$1",
        [d.id],
      )
    )[0].execution_status,
  ).toBe("IN_PROGRESS");
  await expect(
    db.query("DELETE FROM integration.sync_conflicts WHERE id=$1", [
      conflict.id,
    ]),
  ).rejects.toThrow();
  await sync();
  expect(
    await db.query("SELECT id FROM integration.inbox WHERE program_id=$1", [
      pid,
    ]),
  ).toHaveLength(1);
});
it("fonte antiga ignorada e execução externa nunca reabre aceite silenciosamente", async () => {
  connection = await mutate(
    admin,
    pid,
    "connections",
    { execution_owner: "EXTERNAL" },
    connection.id,
    Number(connection.version),
    "Delegar execução",
  );
  await sync(response("closed", "2026-10-15T11:00:00Z"));
  let [record] = await db.query(
    "SELECT * FROM delivery.deliverables WHERE id=$1",
    [d.id],
  );
  expect(record.execution_status).toBe("DONE");
  expect(record.accepted).toBe(false);
  await sync(response("open", "2026-10-14T10:00:00Z"));
  expect(
    (
      await db.query(
        "SELECT execution_status FROM delivery.deliverables WHERE id=$1",
        [d.id],
      )
    )[0].execution_status,
  ).toBe("DONE");
  await db.query("UPDATE delivery.deliverables SET accepted=true WHERE id=$1", [
    d.id,
  ]);
  await sync(response("open", "2026-10-16T10:00:00Z"));
  [record] = await db.query("SELECT * FROM delivery.deliverables WHERE id=$1", [
    d.id,
  ]);
  expect(record.accepted).toBe(true);
  expect(record.execution_status).toBe("DONE");
  expect(
    (
      await db.query(
        "SELECT count(*)::integer AS n FROM integration.sync_conflicts WHERE status='OPEN'",
      )
    )[0].n,
  ).toBeGreaterThan(0);
});
it("três falhas abrem circuit breaker persistente; nenhuma configuração é tida como conectada", async () => {
  for (let i = 0; i < 3; i++)
    await expect(
      sync(async () => Response.json({}, { status: 401 })),
    ).rejects.toThrow(/HTTP 401/);
  const [c] = await db.query(
    "SELECT * FROM integration.connections WHERE id=$1",
    [connection.id],
  );
  expect(c.status).toBe("ERROR");
  expect(c.failures).toBe(3);
  expect(c.circuit_open_until).toBeTruthy();
  await expect(
    queueConnectionSync(admin, pid, c.id, randomUUID()),
  ).rejects.toThrow(/Circuit/);
});
it("webhook valida corpo, assinatura e janela; DNS privado precisa de opt-in explícito", () => {
  const body = Buffer.from('{"action":"updated"}'),
    timestamp = String(Math.floor(Date.now() / 1000)),
    secret = "test-webhook";
  const headers = new Headers({
    "x-hub-signature-256":
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex"),
  });
  expect(verifyWebhook("GITHUB", secret, body, headers)).toBe(true);
  expect(verifyWebhook("GITHUB", secret, Buffer.from("{}"), headers)).toBe(
    false,
  );
  const generic = new Headers({
    "x-mct-timestamp": timestamp,
    "x-mct-signature":
      "sha256=" +
      createHmac("sha256", secret)
        .update(timestamp + ".")
        .update(body)
        .digest("hex"),
  });
  expect(verifyWebhook("JIRA", secret, body, generic)).toBe(true);
  expect(
    verifyWebhook("JIRA", secret, body, generic, Date.now() + 600000),
  ).toBe(false);
  for (const ip of [
    "127.0.0.1",
    "172.16.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
  ])
    expect(privateAddress(ip)).toBe(true);
  expect(privateAddress("8.8.8.8")).toBe(false);
});
it("GitLab e Confluence normalizam fontes; server Confluence usa start e não segue URL remota", async () => {
  const git = createAdapter(
    {
      type: "GITLAB",
      baseUrl: "https://gitlab.com",
      project: "org/repo",
      secretEnv: "MCT_CONNECTOR_TEST",
      stateMapping: { closed: "DONE" },
    },
    async (url, init) => {
      expect(new URL(String(url)).pathname).toContain("org%2Frepo");
      expect((init?.headers as any)["PRIVATE-TOKEN"]).toBe("test-only");
      return Response.json([
        {
          id: 1,
          title: "Issue",
          state: "closed",
          web_url: "https://gitlab.com/org/repo/-/issues/1",
          updated_at: "2026-10-15T10:00:00Z",
        },
      ]);
    },
  );
  expect((await git.fetchPage()).items[0]).toMatchObject({
    sourceState: "closed",
    operationalState: "DONE",
  });
  process.env.MCT_CONNECTOR_ALLOWED_HOSTS = "wiki.test";
  const wiki = createAdapter(
    {
      type: "CONFLUENCE",
      baseUrl: "https://wiki.test/confluence",
      project: "SPACE",
      secretEnv: "MCT_CONNECTOR_TEST",
      deployment: "SERVER",
    },
    async (url) => {
      expect(new URL(String(url)).searchParams.get("start")).toBe("100");
      return Response.json({
        results: [
          {
            id: "1",
            title: "ADR",
            version: { when: "2026-10-15T00:00:00Z" },
            _links: { webui: "/confluence/pages/1" },
          },
        ],
        _links: { next: "/confluence/rest/api/content?start=200" },
      });
    },
  );
  expect((await wiki.fetchPage("100")).nextCursor).toBe("200");
  delete process.env.MCT_CONNECTOR_ALLOWED_HOSTS;
});
it("outbox produz notificações internas uma vez, sem copiar conteúdo restrito; leitura é individual", async () => {
  const event = randomUUID();
  await db.query(
    "INSERT INTO audit.outbox(id,program_id,event_type,aggregate_id,correlation_id,payload) VALUES($1,$2,'reports.Published',$3,'test','{\"narrative\":\"RESTRICTED SECRET\"}')",
    [event, pid, randomUUID()],
  );
  await publishOutbox();
  await publishOutbox();
  const first = await notifications(viewer, pid);
  expect(first.unread).toBeGreaterThan(0);
  expect(JSON.stringify(first)).not.toContain("RESTRICTED SECRET");
  expect(
    await db.query(
      "SELECT id FROM governance.notifications WHERE event_id=$1 AND user_id=$2",
      [event, viewer],
    ),
  ).toHaveLength(1);
  const n = first.items[0];
  await expect(
    readNotification(admin, pid, n.id, randomUUID()),
  ).rejects.toThrow(/encontrada/);
  await readNotification(viewer, pid, n.id, randomUUID());
  expect((await notifications(viewer, pid)).unread).toBe(first.unread - 1);
});

it("GitLab Work Items vincula IDs globais, aplica andamento da tarefa e protege o namespace da conexão", async () => {
  process.env.MCT_CONNECTOR_GL_TEST = "test-only";
  const gl = await mutate(admin, pid, "connections", {
    name: "GitLab Work Items",
    connector_type: "GITLAB",
    base_url: "https://gitlab.com",
    project: "org/group",
    secret_env: "MCT_CONNECTOR_GL_TEST",
    execution_owner: "EXTERNAL",
    gitlab_options: {
      api: "WORK_ITEMS",
      scope: "GROUP",
      labels: ["tower::project"],
    },
    state_mapping: { opened: "IN_PROGRESS", closed: "DONE" },
  });
  const target = await mutate(admin, pid, "deliverables", {
    code: "GL-TASK",
    name: "Tarefa GitLab",
    layer: "BACKEND",
    deliverable_type: "API",
    workstream_id: ws,
  });
  const [node] = await db.query(
    "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1",
    [target.id],
  );
  let closed = false;
  const fetcher: typeof fetch = async () =>
    Response.json({
      data: {
        group: {
          workItems: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "gid://gitlab/WorkItem/100",
                iid: "10",
                title: "Tarefa fonte",
                state: closed ? "CLOSED" : "OPEN",
                updatedAt: closed
                  ? "2026-10-17T01:00:00Z"
                  : "2026-10-16T01:00:00Z",
                webUrl: "https://gitlab.com/org/group/-/work_items/10",
                reference: "org/group#10",
                workItemType: { name: "Task" },
                widgets: [],
              },
            ],
          },
        },
      },
    });
  const pull = async () => {
    const j = await queueConnectionSync(admin, pid, gl.id, randomUUID());
    const [full] = await db.query(
      "SELECT * FROM integration.jobs WHERE id=$1",
      [j.id],
    );
    const r = await processSyncJob(full, fetcher);
    await db.query(
      "UPDATE integration.jobs SET status='SUCCEEDED' WHERE id=$1",
      [j.id],
    );
    return r;
  };
  expect((await pull()).unmapped).toBe(1);
  await linkExternal(
    admin,
    pid,
    gl.id,
    {
      externalId: "gid://gitlab/WorkItem/100",
      subjectNodeId: node.id,
      mode: "EXECUTION",
      reason: "Delegar tarefa vinculada",
    },
    randomUUID(),
  );
  await pull();
  expect(
    (
      await db.query(
        "SELECT execution_status,accepted FROM delivery.deliverables WHERE id=$1",
        [target.id],
      )
    )[0],
  ).toMatchObject({ execution_status: "IN_PROGRESS", accepted: false });
  closed = true;
  await pull();
  expect(
    (
      await db.query(
        "SELECT execution_status,accepted,delivery_stage FROM delivery.deliverables WHERE id=$1",
        [target.id],
      )
    )[0],
  ).toMatchObject({
    execution_status: "DONE",
    accepted: false,
    delivery_stage: "IDENTIFIED",
  });
  await expect(
    mutate(
      admin,
      pid,
      "connections",
      { project: "another/group" },
      gl.id,
      Number(gl.version),
      "Trocar origem com vínculos",
    ),
  ).rejects.toThrow(/outra conexão/);
});
