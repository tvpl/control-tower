import { connectorFetch } from "./connector-fetch";
import { z } from "zod";
import { DomainError } from "../domain/rules";
export type ConnectorType =
  "JIRA" | "AZURE_DEVOPS" | "GITHUB" | "GITLAB" | "CONFLUENCE" | "CATALOGUE";
export type ExternalItem = {
  externalId: string;
  externalUrl: string;
  title: string;
  operationalState: string;
  sourceState?: string;
  itemType?: string;
  reference?: string;
  labels?: string[];
  parent?: { externalId: string; title: string; url: string | null } | null;

  sourceUpdatedAt: string;
  source: ConnectorType;
};
export type AdapterConfig = {
  type: ConnectorType;
  baseUrl: string;
  project: string;
  secretEnv: string;
  jiraEmail?: string;
  stateMapping?: Record<string, string>;
  gitlabOptions?: {
    api?: "ISSUES" | "WORK_ITEMS";
    scope?: "PROJECT" | "GROUP";
    labels?: string[];
  };
  deployment?: "CLOUD" | "SERVER";
};
export type Page = { items: ExternalItem[]; nextCursor: string | null };
export interface Adapter {
  fetchPage(cursor?: string): Promise<Page>;
}
export const OPERATIONAL_FIELDS = new Set([
  "execution_status",
  "external_url",
  "source_updated_at",
]);
export function reconcileFields(
  incoming: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const updates: Record<string, unknown> = {},
    conflicts: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(incoming)) {
    if (OPERATIONAL_FIELDS.has(field)) updates[field] = value;
    else if (current[field] !== value)
      conflicts[field] = { current: current[field], incoming: value };
  }
  return { updates, conflicts };
}
export function validateConnectorURL(type: ConnectorType, value: string) {
  const base = new URL(value),
    extra = (process.env.MCT_CONNECTOR_ALLOWED_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  const cloud =
    type === "JIRA" || type === "CONFLUENCE"
      ? /^[a-z0-9-]+\.atlassian\.net$/i.test(base.hostname)
      : type === "GITHUB"
        ? base.hostname === "api.github.com"
        : type === "GITLAB"
          ? base.hostname === "gitlab.com"
          : type === "AZURE_DEVOPS"
            ? base.hostname === "dev.azure.com"
            : false;
  if (
    base.protocol !== "https:" ||
    base.port ||
    base.username ||
    base.password ||
    base.hash ||
    (!cloud && !extra.includes(base.hostname.toLowerCase()))
  )
    throw new DomainError(
      422,
      "Host de conector não autorizado. Configure allowlist para servidores privados.",
    );
  if (
    extra.includes(base.hostname.toLowerCase()) &&
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(
      base.hostname,
    ) &&
    process.env.MCT_CONNECTOR_ALLOW_PRIVATE !== "true"
  )
    throw new DomainError(
      422,
      "Host privado exige configuração explícita do operador.",
    );
  return base;
}
export function createAdapter(
  config: AdapterConfig,
  fetcher: typeof fetch = connectorFetch,
): Adapter {
  const base = new URL(config.baseUrl);
  validateConnectorURL(config.type, config.baseUrl);
  if (!/^MCT_CONNECTOR_[A-Z0-9_]+$/.test(config.secretEnv))
    throw new DomainError(422, "Referência de secret inválida.");
  const token = process.env[config.secretEnv];
  if (!token)
    throw new DomainError(503, "Credencial não configurada no ambiente.");
  const bearer =
    ["GITHUB", "GITLAB", "CATALOGUE"].includes(config.type) ||
    config.deployment === "SERVER";
  const auth = bearer
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(config.type === "JIRA" || config.type === "CONFLUENCE" ? `${config.jiraEmail || ""}:${token}` : `:${token}`).toString("base64")}`;
  async function request(url: URL, init: RequestInit = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          ...init.headers,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(config.type === "GITLAB"
            ? { "PRIVATE-TOKEN": token! }
            : { Authorization: auth }),
        },
      });
      if (response.ok) {
        const { readBody } = await import("./http");
        const bytes = await readBody(response, 2000000);
        try {
          return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
        } catch {
          throw new DomainError(502, "Fonte retornou JSON inválido.");
        }
      }
      if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
        const delay = Math.min(
          5000,
          Number(response.headers.get("retry-after") || 0) * 1000 ||
            500 * 2 ** attempt,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new DomainError(
        502,
        `Conector ${config.type}: resposta HTTP ${response.status}.`,
      );
    }
    throw new DomainError(502, "Limite de tentativas atingido.");
  }
  const mapped = (status: string) => config.stateMapping?.[status] || "UNKNOWN";
  return {
    async fetchPage(cursor) {
      if (config.type === "JIRA" && config.deployment !== "SERVER") {
        const data = await request(new URL("/rest/api/3/search/jql", base), {
          method: "POST",
          body: JSON.stringify({
            jql: `project = "${config.project.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" ORDER BY updated ASC`,
            maxResults: 100,
            fields: ["summary", "status", "updated"],
            ...(cursor ? { nextPageToken: cursor } : {}),
          }),
        });
        const result = z
          .object({
            issues: z.array(
              z.object({
                id: z.string(),
                key: z.string(),
                fields: z.object({
                  summary: z.string(),
                  updated: z.string(),
                  status: z.object({ name: z.string() }),
                }),
              }),
            ),
            nextPageToken: z.string().optional(),
          })
          .parse(data);
        return {
          items: result.issues.map((i) => ({
            externalId: i.id,
            externalUrl: new URL(`/browse/${encodeURIComponent(i.key)}`, base)
              .href,
            title: i.fields.summary,
            operationalState: mapped(i.fields.status.name),
            sourceState: i.fields.status.name,
            sourceUpdatedAt: i.fields.updated,
            source: config.type,
          })),
          nextCursor: result.nextPageToken || null,
        };
      }
      if (config.type === "GITHUB") {
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.project))
          throw new DomainError(422, "Use owner/repository para GitHub.");
        const page = Number(cursor || 1);
        if (!Number.isSafeInteger(page) || page < 1)
          throw new DomainError(422, "Cursor inválido.");
        const url = new URL(`/repos/${config.project}/issues`, base);
        url.search = new URLSearchParams({
          state: "all",
          sort: "updated",
          direction: "asc",
          per_page: "100",
          page: String(page),
        }).toString();
        const data = z
          .array(
            z.object({
              id: z.number(),
              html_url: z.url(),
              title: z.string(),
              state: z.string(),
              updated_at: z.string(),
              pull_request: z.unknown().optional(),
            }),
          )
          .parse(await request(url));
        return {
          items: data
            .filter((i) => !i.pull_request)
            .map((i) => ({
              externalId: String(i.id),
              externalUrl: i.html_url,
              title: i.title,
              operationalState: mapped(i.state),
              sourceState: i.state,
              sourceUpdatedAt: i.updated_at,
              source: config.type,
            })),
          nextCursor: data.length === 100 ? String(page + 1) : null,
        };
      }
      if (config.type === "JIRA") {
        const start = Number(cursor || 0);
        if (!Number.isSafeInteger(start) || start < 0)
          throw new DomainError(422, "Cursor inválido.");
        const root = base.pathname.replace(/\/$/, "");
        const data = await request(new URL(`${root}/rest/api/2/search`, base), {
          method: "POST",
          body: JSON.stringify({
            jql: `project = "${config.project.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" ORDER BY updated ASC`,
            startAt: start,
            maxResults: 100,
            fields: ["summary", "status", "updated"],
          }),
        });
        const result = z
          .object({
            issues: z.array(
              z.object({
                id: z.string(),
                key: z.string(),
                fields: z.object({
                  summary: z.string(),
                  updated: z.string(),
                  status: z.object({ name: z.string() }),
                }),
              }),
            ),
            total: z.number(),
          })
          .parse(data);
        return {
          items: result.issues.map((i) => ({
            externalId: i.id,
            externalUrl: new URL(
              `${root}/browse/${encodeURIComponent(i.key)}`,
              base,
            ).href,
            title: i.fields.summary,
            operationalState: mapped(i.fields.status.name),
            sourceState: i.fields.status.name,
            sourceUpdatedAt: i.fields.updated,
            source: config.type,
          })),
          nextCursor:
            start + result.issues.length < result.total
              ? String(start + result.issues.length)
              : null,
        };
      }
      if (
        config.type === "GITLAB" &&
        config.gitlabOptions?.api === "WORK_ITEMS"
      ) {
        if (cursor && (cursor.length > 1000 || /[\r\n]/.test(cursor)))
          throw new DomainError(422, "Cursor inválido.");
        const scope =
          config.gitlabOptions.scope === "GROUP" ? "group" : "project";
        const types =
          scope === "group" ? "[EPIC, ISSUE, TASK]" : "[ISSUE, TASK]";
        const query = `query TowerWorkItems($path: ID!, $after: String, $labels: [String!]) {
          ${scope}(fullPath: $path) {
            workItems(first: 100, after: $after, types: ${types}, labelName: $labels${scope === "group" ? ", includeDescendants: true" : ""}) {
              pageInfo { hasNextPage endCursor }
              nodes { id iid title state updatedAt webUrl reference(full: true) workItemType { name }
                widgets { __typename
                  ... on WorkItemWidgetLabels { labels(first: 100) { nodes { title } pageInfo { hasNextPage } } }
                  ... on WorkItemWidgetHierarchy { parent { id title webUrl } }
                }
              }
            }
          }
        }`;
        const raw = await request(new URL("/api/graphql", base), {
          method: "POST",
          body: JSON.stringify({
            query,
            variables: {
              path: config.project,
              after: cursor || null,
              labels: config.gitlabOptions.labels?.length
                ? config.gitlabOptions.labels
                : null,
            },
          }),
        });
        if (raw.errors?.length)
          throw new DomainError(
            502,
            "GitLab recusou a consulta Work Items. Confira versão, acesso ao grupo/projeto e licença para épicos no tutorial.",
          );
        const pageSchema = z.object({
          nodes: z
            .array(
              z.object({
                id: z.string().regex(/^gid:\/\/gitlab\/WorkItem\/\d+$/),
                iid: z.string(),
                title: z.string(),
                state: z.string(),
                updatedAt: z.string(),
                webUrl: z.url(),
                reference: z.string(),
                workItemType: z.object({ name: z.string() }),
                widgets: z.array(
                  z.object({
                    __typename: z.string(),
                    labels: z
                      .object({
                        nodes: z.array(z.object({ title: z.string() })),
                        pageInfo: z.object({ hasNextPage: z.boolean() }),
                      })
                      .nullish(),
                    parent: z
                      .object({
                        id: z.string(),
                        title: z.string(),
                        webUrl: z.url().nullable(),
                      })
                      .nullish(),
                  }),
                ),
              }),
            )
            .max(100),
          pageInfo: z.object({
            hasNextPage: z.boolean(),
            endCursor: z.string().nullable(),
          }),
        });
        if (!raw.data?.[scope]?.workItems)
          throw new DomainError(
            502,
            "GitLab não retornou o grupo/projeto. Confira caminho e acesso da conta.",
          );
        const page = pageSchema.parse(raw.data[scope].workItems);
        if (page.pageInfo.hasNextPage && !page.pageInfo.endCursor)
          throw new DomainError(502, "GitLab retornou paginação incompleta.");
        return {
          items: page.nodes.map((i) => {
            const widget = i.widgets.find(
              (w) => w.__typename === "WorkItemWidgetLabels",
            );
            if (widget?.labels?.pageInfo.hasNextPage)
              throw new DomainError(
                502,
                "Mais de 100 labels no item; reduza as labels para sincronizar sem omissões.",
              );
            const labels = widget?.labels?.nodes.map((l) => l.title) || [];
            const states = [
              ...new Set(
                labels
                  .map((l) => config.stateMapping?.[`label:${l}`])
                  .filter(Boolean),
              ),
            ];
            const state =
              i.state.toLowerCase() === "open"
                ? "opened"
                : i.state.toLowerCase();
            const parent = i.widgets.find(
              (w) => w.__typename === "WorkItemWidgetHierarchy",
            )?.parent;
            return {
              externalId: i.id,
              externalUrl: i.webUrl,
              title: i.title,
              reference: i.reference,
              itemType: i.workItemType.name.toUpperCase(),
              labels,
              parent: parent
                ? {
                    externalId: parent.id,
                    title: parent.title,
                    url: parent.webUrl,
                  }
                : null,
              operationalState:
                state === "closed"
                  ? mapped("closed")
                  : states.length === 1
                    ? states[0]!
                    : states.length > 1
                      ? "UNKNOWN"
                      : mapped(state),
              sourceState: i.state,
              sourceUpdatedAt: i.updatedAt,
              source: config.type,
            };
          }),
          nextCursor: page.pageInfo.hasNextPage
            ? page.pageInfo.endCursor
            : null,
        };
      }
      if (config.type === "GITLAB") {
        const page = Number(cursor || 1);
        if (!Number.isSafeInteger(page) || page < 1)
          throw new DomainError(422, "Cursor inválido.");
        const url = new URL(
          `/api/v4/projects/${encodeURIComponent(config.project)}/issues`,
          base,
        );
        url.search = new URLSearchParams({
          scope: "all",
          order_by: "updated_at",
          sort: "asc",
          per_page: "100",
          page: String(page),
          ...(config.gitlabOptions?.labels?.length
            ? { labels: config.gitlabOptions.labels.join(",") }
            : {}),
        }).toString();
        const rows = z
          .array(
            z.object({
              id: z.number(),
              title: z.string(),
              state: z.string(),
              web_url: z.url(),
              updated_at: z.string(),
              labels: z.array(z.string()).optional(),
              issue_type: z.string().optional(),
              references: z.object({ full: z.string() }).optional(),
            }),
          )
          .parse(await request(url));
        return {
          items: rows.map((i) => ({
            externalId: String(i.id),
            labels: i.labels || [],
            itemType: (i.issue_type || "issue").toUpperCase(),
            reference: i.references?.full,
            externalUrl: i.web_url,
            title: i.title,
            operationalState: mapped(i.state),
            sourceState: i.state,
            sourceUpdatedAt: i.updated_at,
            source: config.type,
          })),
          nextCursor: rows.length === 100 ? String(page + 1) : null,
        };
      }
      if (config.type === "CONFLUENCE") {
        const server = config.deployment === "SERVER",
          root = base.pathname.replace(/\/$/, "");
        const url = new URL(
          server
            ? `${root}/rest/api/content`
            : `/wiki/api/v2/spaces/${encodeURIComponent(config.project)}/pages`,
          base,
        );
        url.search = new URLSearchParams(
          server
            ? {
                spaceKey: config.project,
                type: "page",
                expand: "version",
                limit: "100",
                ...(cursor ? { start: cursor } : {}),
              }
            : { limit: "100", ...(cursor ? { cursor } : {}) },
        ).toString();
        const result = z
          .object({
            results: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                status: z.string().optional(),
                version: z
                  .object({
                    createdAt: z.string().optional(),
                    when: z.string().optional(),
                  })
                  .optional(),
                createdAt: z.string().optional(),
                _links: z.object({ webui: z.string().optional() }).optional(),
              }),
            ),
            _links: z.object({ next: z.string().optional() }).optional(),
          })
          .parse(await request(url));
        const next = result._links?.next
          ? new URL(result._links.next, base).searchParams.get(
              server ? "start" : "cursor",
            )
          : null;
        return {
          items: result.results.map((i) => ({
            externalId: i.id,
            externalUrl: i._links?.webui
              ? new URL(i._links.webui, base).href
              : new URL(
                  `${server ? root : "/wiki"}/pages/viewpage.action?pageId=${encodeURIComponent(i.id)}`,
                  base,
                ).href,
            title: i.title,
            operationalState: mapped(i.status || "current"),
            sourceState: i.status || "current",
            sourceUpdatedAt:
              i.version?.createdAt || i.version?.when || i.createdAt || "",
            source: config.type,
          })),
          nextCursor: next,
        };
      }
      if (config.type === "CATALOGUE") {
        const url = new URL(base);
        url.searchParams.set("limit", "100");
        if (cursor) url.searchParams.set("cursor", cursor);
        const result = z
          .object({
            items: z
              .array(
                z.object({
                  externalId: z.string().max(200),
                  externalUrl: z.url(),
                  title: z.string().max(2000),
                  operationalState: z.string().max(100),
                  sourceUpdatedAt: z.string(),
                }),
              )
              .max(100),
            nextCursor: z.string().nullable(),
          })
          .parse(await request(url));
        return {
          items: result.items.map((i) => ({
            ...i,
            operationalState: mapped(i.operationalState),
            sourceState: i.operationalState,
            source: config.type,
          })),
          nextCursor: result.nextCursor,
        };
      }
      if (!/^\/[A-Za-z0-9_.%-]+\/?$/.test(base.pathname))
        throw new DomainError(
          422,
          "URL Azure DevOps deve incluir organização.",
        );
      const last = Number(cursor || 0);
      if (!Number.isSafeInteger(last) || last < 0)
        throw new DomainError(422, "Cursor inválido.");
      const root = `${base.pathname.replace(/\/$/, "")}/${encodeURIComponent(config.project)}/_apis/wit/`;
      const query = await request(
        new URL(`${root}wiql?api-version=7.1&$top=200`, base),
        {
          method: "POST",
          body: JSON.stringify({
            query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Id] > ${last} ORDER BY [System.Id] ASC`,
          }),
        },
      );
      const ids = z
        .object({ workItems: z.array(z.object({ id: z.number() })) })
        .parse(query)
        .workItems.map((i) => i.id);
      if (!ids.length) return { items: [], nextCursor: null };
      const data = z
        .object({
          value: z.array(
            z.object({
              id: z.number(),
              fields: z.record(z.string(), z.unknown()),
            }),
          ),
        })
        .parse(
          await request(
            new URL(`${root}workitemsbatch?api-version=7.1`, base),
            {
              method: "POST",
              body: JSON.stringify({
                ids,
                fields: ["System.Title", "System.State", "System.ChangedDate"],
              }),
            },
          ),
        );
      return {
        items: data.value.map((i) => ({
          externalId: String(i.id),
          externalUrl: new URL(
            `${base.pathname.replace(/\/$/, "")}/${encodeURIComponent(config.project)}/_workitems/edit/${i.id}`,
            base,
          ).href,
          title: String(i.fields["System.Title"]),
          operationalState: mapped(String(i.fields["System.State"])),
          sourceState: String(i.fields["System.State"]),
          sourceUpdatedAt: String(i.fields["System.ChangedDate"]),
          source: config.type,
        })),
        nextCursor: ids.length === 200 ? String(Math.max(...ids)) : null,
      };
    },
  };
}
