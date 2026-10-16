import { agentTemplateSchema } from "./agent-template";
import { bulkEditSchema, gitLabLinksSchema } from "./workspace-batches";
import { agentContextSchema } from "./agent-context";
import { catalogSchemas } from "./catalog-schemas";
import { z } from "zod";
import {
  schemas,
  assessmentSchema,
  transitionSchema,
  type Kind,
} from "./schemas";
type Obj = Record<string, any>;
const uuid = { type: "string", format: "uuid" },
  reason = { type: "string", minLength: 3, maxLength: 2000 },
  version = { type: "integer", minimum: 1 };
export function buildOpenAPI() {
  const components: Obj = {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "mct_session" },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "JWT de API emitido por /access/tokens. Escopo, expiração e revogação persistentes. Não aceita JWT de sessão ou access token externo sem troca.",
      },
    },
    schemas: {
      Problem: {
        type: "object",
        required: ["type", "title", "status", "detail", "correlationId"],
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          status: { type: "integer" },
          detail: { type: "string" },
          instance: { type: "string" },
          correlationId: { type: "string" },
        },
      },
    },
    parameters: {
      Program: { name: "programId", in: "query", required: true, schema: uuid },
      Id: { name: "id", in: "path", required: true, schema: uuid },
      Key: {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 200 },
      },
      Match: {
        name: "If-Match",
        in: "header",
        required: true,
        schema: {
          type: "string",
          description: "ETag da versão atual, entre aspas.",
        },
      },
    },
  };
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` }),
    param = (name: string) => ({ $ref: `#/components/parameters/${name}` });
  const responses = (
    status = "200",
    schema: Obj = { type: "object", additionalProperties: true },
  ) =>
    Object.fromEntries([
      [
        status,
        {
          description: "Operação concluída",
          content: { "application/json": { schema } },
        },
      ],
      ...[
        "400",
        "401",
        "403",
        "404",
        "409",
        "413",
        "422",
        "429",
        "500",
        "502",
        "503",
      ].map((code) => [
        code,
        {
          description: "Problem Details",
          content: { "application/problem+json": { schema: ref("Problem") } },
        },
      ]),
    ]);
  const paths: Obj = {};
  const body = (schema: Obj) => ({
    required: true,
    content: { "application/json": { schema } },
  });
  const command = (
    path: string,
    summary: string,
    properties: Obj = {},
    required: string[] = [],
    status = "200",
    key = true,
  ) => {
    const existing = paths[path] || {};
    paths[path] = {
      ...existing,
      post: {
        summary,
        parameters: [
          param("Program"),
          ...(path.includes("{id}") ? [param("Id")] : []),
          ...(key ? [param("Key")] : []),
        ],
        requestBody: body({
          type: "object",
          properties,
          required,
          additionalProperties: false,
        }),
        responses: responses(status),
      },
    };
  };
  for (const [kind, schema] of Object.entries(schemas)) {
    const input = z.toJSONSchema(schema, {
      io: "input",
      unrepresentable: "any",
    }) as Obj;
    delete input.$schema;
    const name = kind as Kind;
    components.schemas[`${name}Input`] = {
      ...input,
      description:
        "Nomes snake_case canônicos; aliases camelCase aceitos, sem duplicar a mesma propriedade. programId pode ser enviado no contexto ou no corpo.",
    };
    const properties = Object.fromEntries(
      Object.entries(input.properties || {}).map(([k, v]) => [k, v]),
    );
    for (const [key, v] of Object.entries(properties))
      if (key.includes("_"))
        properties[
          key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
        ] = v;
    components.schemas[`${name}Resource`] = {
      type: "object",
      properties: { ...properties, id: uuid, version },
      required: ["id", "version"],
      additionalProperties: true,
    };
    paths[`/${kind}`] = {
      get: {
        summary: `Listar ${kind}`,
        parameters: [
          param("Program"),
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          { name: "cursor", in: "query", schema: uuid },
          ...(kind === "deliverables"
            ? [
                "domainId",
                "workstreamId",
                "releaseId",
                "areaId",
                "squadId",
                "ownerId",
                "layer",
                "criticality",
                "executionStatus",
                "deliveryStage",
                "q",
              ].map((name) => ({
                name,
                in: "query",
                schema: { type: "string" },
              }))
            : []),
        ],
        responses: responses("200", {
          type: "object",
          required: ["items"],
          properties: {
            items: { type: "array", items: ref(`${name}Resource`) },
            nextCursor: { type: ["string", "null"] },
          },
        }),
      },
      post: {
        summary: `Criar ${kind}`,
        parameters: [param("Program")],
        requestBody: body(ref(`${name}Input`)),
        responses: responses("201", ref(`${name}Resource`)),
      },
    };
    paths[`/${kind}/{id}`] = {
      get: {
        summary: `Consultar ${kind}`,
        parameters: [param("Program"), param("Id")],
        responses: responses("200", ref(`${name}Resource`)),
      },
      patch: {
        summary: `Editar ${kind} com versão e motivo`,
        parameters: [param("Program"), param("Id"), param("Match")],
        requestBody: body({
          type: "object",
          properties: { ...input.properties, changeReason: reason },
          required: ["changeReason"],
          additionalProperties: false,
        }),
        responses: responses("200", ref(`${name}Resource`)),
      },
      delete: {
        summary: `Excluir ${kind} respeitando restrições e histórico`,
        parameters: [param("Program"), param("Id"), param("Match")],
        responses: responses(),
      },
    };
  }
  // Programs list does not require a context; creation requires an existing administration context.
  paths["/programs"].get.parameters = [];
  const get = (path: string, summary: string) => {
    paths[path] = {
      ...(paths[path] || {}),
      get: {
        summary,
        parameters: [
          param("Program"),
          ...(path.includes("{id}") ? [param("Id")] : []),
        ],
        responses: responses(),
      },
    };
  };
  for (const [path, summary] of Object.entries({
    "/state":
      "Projeção autorizada de toda a torre; snapshots e evidências filtrados por classificação",
    "/projects": "Portfólio autorizado",
    "/priorities": "Filas e versões da priorização",
    "/change-requests": "Solicitações de escopo",
    "/observations": "Observações contextuais",
    "/reports": "Reports autorizados",
    "/access/state": "Permissões e metadados de tokens",
    "/notifications": "Notificações individuais e preferência",
    "/integrations/status": "Inbox, conflitos e execuções; administrador",
    "/operations/metrics": "Backlogs e frescor; administrador",
    "/jobs/{id}": "Status, tentativas, resultado e erro do job",
  }))
    get(path, summary);
  command(
    "/deliverables/{id}/transitions",
    "Avançar estágio com escopo, evidências e gates atuais",
    z.toJSONSchema(transitionSchema).properties as Obj,
    ["targetStage", "reason", "expectedVersion"],
  );
  command(
    "/deliverables/{id}/accept",
    "Registrar aceite independente de DONE",
    { reason, expectedVersion: version },
    ["reason", "expectedVersion"],
  );
  command(
    "/deliverables/{id}/health-override",
    "Ajuste temporário sem alterar gates, baseline ou aceite",
    {
      action: { enum: ["SET", "CLEAR"] },
      health: { enum: ["UNKNOWN", "ON_TRACK", "AT_RISK", "CRITICAL"] },
      expires_at: { type: "string", format: "date-time" },
      reason,
      expectedOverrideId: { type: ["string", "null"], format: "uuid" },
    },
    ["action", "reason", "expectedOverrideId"],
  );
  command(
    "/releases/{id}/approve",
    "Aprovar composição somente com aceite e prontidão atuais",
    { reason, expectedVersion: version },
    ["reason", "expectedVersion"],
  );
  command(
    "/gate-assessments",
    "Avaliar gate com alçada e versão de critério/perfil",
    z.toJSONSchema(assessmentSchema).properties as Obj,
    [
      "subject_node_id",
      "gate_id",
      "result",
      "expectedGateVersion",
      "expectedVersion",
      "justification",
      "evidence_ids",
    ],
    "201",
  );
  command(
    "/gate-assessments/{id}/revoke",
    "Revogar exceção por alçada",
    { reason, expectedVersion: version },
    ["reason", "expectedVersion"],
  );
  for (const path of ["/snapshots", "/baselines"])
    command(path, "Congelar versão reproduzível", { reason }, [], "201");
  command(
    "/baselines/{id}/review",
    "Revisão segregada da baseline",
    {
      reason,
      expectedVersion: version,
      decision: { enum: ["APPROVED", "REJECTED"] },
    },
    ["reason", "expectedVersion", "decision"],
  );
  command(
    "/reports",
    "Submeter texto imutável para revisão",
    {
      title: { type: "string", minLength: 3, maxLength: 160 },
      narrative: { type: "string", minLength: 3, maxLength: 12000 },
      snapshotId: uuid,
      previousSnapshotId: { type: ["string", "null"], format: "uuid" },
    },
    ["title", "narrative", "snapshotId"],
    "201",
  );
  for (const resource of ["reports", "contracts", "decisions"])
    command(
      `/${resource}/{id}/review`,
      "Revisão independente com alçada",
      {
        reason,
        expectedVersion: version,
        decision: { enum: ["APPROVED", "REJECTED"] },
      },
      ["reason", "expectedVersion", "decision"],
    );
  command(
    "/reports/{id}/publish",
    "Publicação interna ao programa",
    { reason, expectedVersion: version },
    ["reason", "expectedVersion"],
  );
  command("/reports/{id}/pdf", "Enfileirar PDF da versão atual", {}, [], "202");
  command(
    "/import-jobs",
    "Prévia assíncrona CSV/XLSX sem gravação de inventário",
    {
      filename: { type: "string" },
      contentBase64: { type: "string", maxLength: 6700000 },
      sheet: { type: "string" },
      sourceUrl: { type: "string", format: "uri" },
      namespace: { type: "string" },
    },
    ["filename", "contentBase64"],
    "202",
  );
  command(
    "/import-jobs/{id}/commit",
    "Confirmar prévia com revalidação atômica",
    { expectedHash: { type: "string", minLength: 64, maxLength: 64 } },
    ["expectedHash"],
    "202",
  );
  command(
    "/imports/preview",
    "Compatibilidade CSV síncrono até 500 linhas",
    { csv: { type: "string" } },
    ["csv"],
  );
  command(
    "/imports/commit",
    "Confirmar importação CSV síncrona",
    { csv: { type: "string" }, expectedHash: { type: "string" } },
    ["csv", "expectedHash"],
  );
  components.schemas.AgentTemplate = z.toJSONSchema(agentTemplateSchema, {
    io: "input",
  });
  components.schemas.BulkDeliverables = z.toJSONSchema(bulkEditSchema, {
    io: "input",
  });
  components.schemas.GitLabLinksBatch = z.toJSONSchema(gitLabLinksSchema, {
    io: "input",
  });
  components.schemas.AgentContext = z.toJSONSchema(agentContextSchema, {
    io: "input",
  });
  for (const [path, schema, description] of [
    [
      "/deliverables/bulk",
      "BulkDeliverables",
      "Edição operacional e planejamento de entregáveis",
    ],
    [
      "/connections/{id}/links",
      "GitLabLinksBatch",
      "Vínculos GitLab em lote com versões",
    ],
  ]) {
    command(
      `${path}/preview`,
      `${description}: prévia revertida`,
      { batch: ref(schema) },
      ["batch"],
      "200",
      false,
    );
    command(
      `${path}/commit`,
      `${description}: confirmação atômica`,
      {
        batch: ref(schema),
        expectedHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
      ["batch", "expectedHash"],
    );
  }
  paths["/agents/package"] = {
    get: {
      summary: "Exportar contexto, relatório, checklist e template para IA",
      parameters: [
        param("Program"),
        {
          name: "context",
          in: "query",
          required: false,
          description:
            "JSON conforme AgentContext para exportação de tela, recorte ou registro. Catálogo de referências continua sendo o projeto autorizado.",
          schema: { type: "string", maxLength: 8000 },
        },
      ],
      responses: responses(),
    },
  };
  command(
    "/agents/preview",
    "Validar lote de preenchimento sem persistir",
    { template: ref("AgentTemplate") },
    ["template"],
    "200",
    false,
  );
  command(
    "/agents/commit",
    "Aplicar lote revisado, atômico e auditado",
    {
      template: ref("AgentTemplate"),
      expectedHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    },
    ["template", "expectedHash"],
  );
  command(
    "/connections/{id}/test",
    "Testar leitura da primeira página sem alterar inventário",
    {},
    [],
    "200",
    false,
  );
  command(
    "/connections/{id}/sync",
    "Enfileirar consulta autenticada à fonte",
    {},
    [],
    "202",
  );
  command(
    "/connections/{id}/links",
    "Relacionar ID externo sem remapeamento silencioso",
    {
      externalId: { type: "string" },
      subjectNodeId: uuid,
      mode: { enum: ["REFERENCE", "EXECUTION"] },
      reason,
    },
    ["externalId", "subjectNodeId", "mode", "reason"],
  );
  command(
    "/sync-conflicts/{id}/resolve",
    "Reconciliar conflito preservando histórico",
    {
      expectedVersion: version,
      expectedEntityVersion: version,
      decision: { enum: ["KEEP", "APPLY"] },
      reason,
    },
    ["expectedVersion", "expectedEntityVersion", "decision", "reason"],
  );
  command(
    "/notifications/{id}/read",
    "Marcar notificação individual como lida",
  );
  command(
    "/notifications/preferences",
    "Configurar recebimento interno",
    { enabled: { type: "boolean" } },
    ["enabled"],
  );
  command(
    "/intelligence",
    "Síntese com fontes ou cenário sem mutações gerenciais",
    {
      snapshotId: uuid,
      action: { enum: ["SUMMARY", "SIMULATE", "ASSIST"] },
      nodeId: uuid,
      days: { type: "integer", minimum: 0, maximum: 365 },
    },
    ["snapshotId", "action"],
    "200",
    false,
  );
  command(
    "/access/identities",
    "Provisionar identidade sem concessão automática",
    {
      mode: { enum: ["LOCAL", "OIDC"] },
      email: { type: "string", format: "email" },
      name: { type: "string" },
      password: { type: "string", writeOnly: true, minLength: 12 },
      subject: { type: "string" },
      reason,
    },
    ["mode", "email", "name", "reason"],
    "201",
  );
  const member = {
    email: { type: "string", format: "email" },
    role: {
      enum: [
        "PROGRAM_ADMIN",
        "CHIEF_ARCHITECT",
        "WORKSTREAM_LEAD",
        "PMO",
        "EXECUTIVE",
        "GATE_APPROVER",
        "VIEWER",
      ],
    },
    workstream_id: { type: ["string", "null"], format: "uuid" },
    gate_categories: { type: "array", items: { type: "string" } },
    domain_ids: { type: "array", items: uuid },
    data_clearance: { enum: ["INTERNAL", "CONFIDENTIAL", "RESTRICTED"] },
    expires_at: { type: ["string", "null"], format: "date-time" },
    expectedVersion: { type: "integer", minimum: 0 },
    reason,
  };
  for (const path of ["/access/members", "/access/members/{id}"])
    command(path, "Conceder/editar membership por programa e frente", member, [
      "email",
      "role",
      "workstream_id",
      "gate_categories",
      "expires_at",
      "expectedVersion",
      "reason",
    ]);
  command(
    "/access/members/{id}/revoke",
    "Revogar acesso preservando administrador permanente",
    { reason, expectedVersion: version },
    ["reason", "expectedVersion"],
  );
  command(
    "/access/tokens",
    "Emitir JWT de API uma vez; somente sessão interativa",
    {
      name: { type: "string" },
      programIds: { type: "array", items: uuid },
      access: { enum: ["READ", "WRITE"] },
      expiresAt: { type: "string", format: "date-time" },
    },
    ["name", "programIds", "access", "expiresAt"],
    "201",
    false,
  );
  command(
    "/access/tokens/{id}/revoke",
    "Revogar token próprio",
    {},
    [],
    "200",
    false,
  );
  for (const kind of ["layers", "gates", "profiles"] as const) {
    get(`/catalogs/${kind}`, "Consultar catálogo do programa");
    for (const suffix of ["", "/{id}"]) {
      const schema = z.toJSONSchema(catalogSchemas[kind], {
        io: "input",
        unrepresentable: "any",
      }) as Obj;
      command(
        `/catalogs/${kind}${suffix}`,
        "Criar nova versão de catálogo",
        {
          ...schema.properties,
          reason,
          expectedVersion: { type: "integer", minimum: 0 },
        },
        [...(schema.required || []), "reason", "expectedVersion"],
        suffix ? "200" : "201",
      );
      if (kind === "layers" && suffix)
        paths[`/catalogs/${kind}${suffix}`].post.parameters = paths[
          `/catalogs/${kind}${suffix}`
        ].post.parameters.map((p: Obj) =>
          p.$ref?.endsWith("/Id")
            ? {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string", pattern: "^[A-Z0-9_-]+$" },
              }
            : p,
        );
    }
  }
  for (const path of ["/jobs/{id}/artifact", "/jobs/{id}/errors.csv"]) {
    get(path, "Download privado do job autorizado");
    paths[path].get.responses = responses("200", {
      type: "string",
      format: "binary",
    });
  }
  // Generic command families retain explicit contracts in API-IMPLEMENTED.md, including their resource schemas.
  for (const action of ["preview", "review", "apply", "cancel"])
    command(
      action === "preview"
        ? "/change-requests/preview"
        : `/change-requests/{id}/${action}`,
      "Change control versionado",
      {
        subject_node_id: uuid,
        expectedVersion: version,
        title: { type: "string" },
        reason,
        alternatives: { type: "string" },
        risk_and_mitigation: { type: "string" },
        changes: { type: "object" },
        decision: { enum: ["APPROVED", "REJECTED"] },
      },
      ["expectedVersion"],
    );
  command(
    "/change-requests",
    "Submeter impacto e proposta de escopo",
    {
      subject_node_id: uuid,
      expectedVersion: version,
      title: { type: "string" },
      reason,
      alternatives: { type: "string" },
      risk_and_mitigation: { type: "string" },
      changes: { type: "object" },
    },
    [
      "subject_node_id",
      "expectedVersion",
      "title",
      "reason",
      "alternatives",
      "risk_and_mitigation",
      "changes",
    ],
  );
  command(
    "/priorities/reorder",
    "Persistir universo e ordem compartilhada",
    {
      kind: { enum: ["deliverables", "capabilities"] },
      orderedIds: { type: "array", items: uuid },
      expectedVersion: { type: "integer", minimum: 0 },
      universeHash: { type: "string" },
      reason,
    },
    ["kind", "orderedIds", "expectedVersion", "universeHash", "reason"],
  );
  command(
    "/saved-views",
    "Salvar filtros privados",
    { name: { type: "string" }, filters: { type: "object" } },
    ["name", "filters"],
  );
  for (const path of [
    "/programs/{id}/overview",
    "/programs/{id}/capability-map",
    "/programs/{id}/reports/weekly",
    "/releases/{id}/readiness",
  ])
    get(path, "Projeção calculada e autorizada");
  for (const kind of ["domains", "workstreams"])
    paths[`/programs/{id}/${kind}`] = {
      get: { ...paths[`/${kind}`].get, parameters: [param("Id")] },
      post: { ...paths[`/${kind}`].post, parameters: [param("Id")] },
    };
  get(
    "/provenance/{kind}/{id}",
    "Última origem por campo até checkpoint opcional",
  );
  paths["/provenance/{kind}/{id}"].get.parameters.push(
    {
      name: "kind",
      in: "path",
      required: true,
      schema: { enum: Object.keys(schemas) },
    },
    {
      name: "checkpoint",
      in: "query",
      schema: { type: "string", pattern: "^[0-9]+$" },
    },
  );
  const observationFields = {
    title: { type: "string", minLength: 3, maxLength: 160 },
    body: { type: "string", minLength: 3, maxLength: 8000 },
    important: { type: "boolean" },
  };
  command(
    "/observations",
    "Criar observação contextual",
    {
      ...observationFields,
      subject_node_id: { type: ["string", "null"], format: "uuid" },
    },
    ["title", "body", "important", "subject_node_id"],
    "201",
  );
  get("/observations/{id}", "Consultar observação");
  get("/reports/{id}", "Consultar report autorizado e sua revisão");
  get(
    "/change-requests/{id}",
    "Consultar solicitação de escopo e impacto congelado",
  );
  paths["/observations/{id}"].patch = {
    summary: "Editar observação com versão",
    parameters: [param("Program"), param("Id"), param("Key")],
    requestBody: body({
      type: "object",
      properties: { ...observationFields, expectedVersion: version },
      required: ["title", "body", "important", "expectedVersion"],
      additionalProperties: false,
    }),
    responses: responses(),
  };
  get("/snapshots", "Snapshots integrais autorizados (até 52)");
  get("/snapshots/{id}", "Snapshot integral e hash preservado");
  paths["/programs/{id}/snapshots"] = {
    post: {
      ...paths["/snapshots"].post,
      parameters: [param("Id"), param("Key")],
    },
  };
  paths["/programs/{id}/capability-map"].get.parameters.push(
    ...[
      "domainId",
      "workstreamId",
      "releaseId",
      "ownerId",
      "criticality",
      "includeUnknown",
    ].map((name) => ({
      name,
      in: "query",
      schema: { type: name === "includeUnknown" ? "boolean" : "string" },
    })),
  );
  paths["/programs/{id}/reports/weekly"].get.parameters.push({
    name: "snapshotId",
    in: "query",
    required: true,
    schema: uuid,
  });
  paths["/projects"].get.parameters = [];
  paths["/webhooks/{id}"] = {
    post: {
      summary:
        "Receber webhook autenticado e agendar pull; corpo nunca altera inventário",
      description:
        "GitHub: X-Hub-Signature-256 + X-GitHub-Delivery; GitLab: X-Gitlab-Token + X-Gitlab-Event-UUID. Demais: X-MCT-Signature SHA256 HMAC(timestamp + '.' + bytes), X-MCT-Timestamp Unix até 5 minutos, X-MCT-Delivery. Secret separado configurado no ambiente. Limite 256 kB.",
      security: [],
      parameters: [param("Id")],
      requestBody: body({ type: "object", additionalProperties: true }),
      responses: responses("202"),
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "Modernization Control Tower API",
      version: "1.3.0",
      description:
        "Contrato da implementação. Cookie web com Origin nas escritas, ou JWT de API escopado. Campos gerenciais e histórico preservados por comandos e alçadas. Artefatos classificados exigem clearance.",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ sessionCookie: [] }, { bearerAuth: [] }],
    paths,
    components,
  };
}
