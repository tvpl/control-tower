import { expect, it } from "vitest";
import {
  createAdapter,
  type AdapterConfig,
} from "../src/server/infrastructure/adapters";
const config: AdapterConfig = {
  type: "GITLAB",
  baseUrl: "https://gitlab.com",
  project: "org/grupo",
  secretEnv: "MCT_CONNECTOR_GL_TEST",
  gitlabOptions: { api: "WORK_ITEMS", scope: "GROUP", labels: ["tower::app"] },
  stateMapping: {
    opened: "NOT_STARTED",
    closed: "DONE",
    "label:status::doing": "IN_PROGRESS",
    "label:status::blocked": "BLOCKED",
  },
};
const item = (id: number, state = "OPEN", labels = ["tower::app"]) => ({
  id: `gid://gitlab/WorkItem/${id}`,
  iid: String(id),
  title: `Item ${id}`,
  state,
  updatedAt: "2026-10-16T00:00:00Z",
  webUrl: `https://gitlab.com/org/grupo/-/work_items/${id}`,
  reference: `org/grupo#${id}`,
  workItemType: { name: id === 1 ? "Epic" : "Task" },
  widgets: [
    {
      __typename: "WorkItemWidgetLabels",
      labels: {
        nodes: labels.map((title) => ({ title })),
        pageInfo: { hasNextPage: false },
      },
    },
    {
      __typename: "WorkItemWidgetHierarchy",
      parent:
        id === 1
          ? null
          : {
              id: "gid://gitlab/WorkItem/1",
              title: "Item 1",
              webUrl: "https://gitlab.com/org/grupo/-/work_items/1",
            },
    },
  ],
});
function page(nodes: any[], next: string | null = null, scope = "group") {
  return Response.json({
    data: {
      [scope]: {
        workItems: {
          nodes,
          pageInfo: { hasNextPage: !!next, endCursor: next },
        },
      },
    },
  });
}
it("consulta épicos/issues/tasks por grupo com variáveis, autenticação, labels e cursor opaco", async () => {
  process.env.MCT_CONNECTOR_GL_TEST = "test-only";
  const adapter = createAdapter(config, async (url, init) => {
    expect(String(url)).toBe("https://gitlab.com/api/graphql");
    expect((init?.headers as any)["PRIVATE-TOKEN"]).toBe("test-only");
    const body = JSON.parse(init!.body as string);
    expect(body.variables).toEqual({
      path: "org/grupo",
      after: "opaque==",
      labels: ["tower::app"],
    });
    expect(body.query).toContain("[EPIC, ISSUE, TASK]");
    expect(body.query).not.toContain("org/grupo");
    return page([item(1), item(2, "OPEN", ["status::doing"])], "next==");
  });
  const p = await adapter.fetchPage("opaque==");
  expect(p.nextCursor).toBe("next==");
  expect(p.items[1]).toMatchObject({
    externalId: "gid://gitlab/WorkItem/2",
    itemType: "TASK",
    operationalState: "IN_PROGRESS",
    parent: { externalId: "gid://gitlab/WorkItem/1" },
  });
});
it("projeto consulta issues e tarefas; fechado tem prioridade; labels ambíguas permanecem desconhecidas", async () => {
  process.env.MCT_CONNECTOR_GL_TEST = "test-only";
  const adapter = createAdapter(
    { ...config, gitlabOptions: { api: "WORK_ITEMS", scope: "PROJECT" } },
    async (_, init) => {
      expect(JSON.parse(init!.body as string).query).toContain("[ISSUE, TASK]");
      return page(
        [
          item(2, "CLOSED", ["status::doing"]),
          item(3, "OPEN", ["status::doing", "status::blocked"]),
        ],
        null,
        "project",
      );
    },
  );
  expect(
    (await adapter.fetchPage()).items.map((i) => i.operationalState),
  ).toEqual(["DONE", "UNKNOWN"]);
});
it("falha explícita em erros GraphQL, namespace invisível e labels truncadas", async () => {
  process.env.MCT_CONNECTOR_GL_TEST = "test-only";
  for (const result of [
    { errors: [{ message: "secret upstream detail" }] },
    { data: { group: null } },
  ])
    await expect(
      createAdapter(config, async () => Response.json(result)).fetchPage(),
    ).rejects.toThrow(/GitLab/);
  const bad = item(2);
  (bad.widgets[0] as any).labels.pageInfo.hasNextPage = true;
  await expect(
    createAdapter(config, async () => page([bad])).fetchPage(),
  ).rejects.toThrow(/100 labels/);
});
it("modo REST preserva IDs numéricos existentes e aplica filtro de labels", async () => {
  process.env.MCT_CONNECTOR_GL_TEST = "test-only";
  const p = await createAdapter(
    { ...config, gitlabOptions: { api: "ISSUES", labels: ["tower::app"] } },
    async (url) => {
      expect(new URL(String(url)).searchParams.get("labels")).toBe(
        "tower::app",
      );
      return Response.json([
        {
          id: 42,
          title: "Legado",
          state: "closed",
          updated_at: "2026-10-16T00:00:00Z",
          web_url: "https://gitlab.com/org/repo/-/issues/1",
        },
      ]);
    },
  ).fetchPage();
  expect(p.items[0].externalId).toBe("42");
});
