import { beforeAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { snapshot } from "../src/server/application/reporting";
import { mutate } from "../src/server/application/inventory";
import { intelligence } from "../src/server/application/intelligence";
import { simulateDelay } from "../src/server/domain/intelligence";
import {
  normalizeResourceInput,
  resourceEnvelope,
} from "../src/server/domain/api-contract";
import { buildOpenAPI } from "../src/server/domain/openapi";
import { projectHealth } from "../src/server/domain/rules";
import {
  transientRetention,
  retentionDays,
} from "../src/server/application/operations";
import { governanceAnomalies } from "../src/features/tower/cockpit/insight-model";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  admin = randomUUID(),
  pid = randomUUID();
beforeAll(async () => {
  await migrate(db);
  await db.query(
    "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$1,'Intelligence test')",
    [admin],
  );
  await db.query(
    "INSERT INTO portfolio.programs(id,code,name) VALUES($1,'INTEL','Intelligence')",
    [pid],
  );
  await db.query(
    "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,'PROGRAM_ADMIN')",
    [admin, pid],
  );
});
it("análise usa snapshot autorizado e provedor externo exige configuração e opt-in", async () => {
  const [ws] = await db.query(
    "INSERT INTO portfolio.workstreams(program_id,code,name) VALUES($1,'INT','Frente teste') RETURNING id",
    [pid],
  );
  await mutate(admin, pid, "deliverables", {
    code: "D1",
    workstream_id: ws.id,
    name: "Entrega teste",
    layer: "BACKEND",
    deliverable_type: "API",
  });
  const snap: any = await snapshot(admin, pid, randomUUID());
  const output: any = await intelligence(admin, pid, {
    snapshotId: snap.id,
    action: "SUMMARY",
  });
  expect(output.mode).toBe("RULES");
  expect(output.readOnly).toBe(true);
  expect(output.sources[0].code).toBe("D1");
  await expect(
    intelligence(admin, pid, { snapshotId: randomUUID(), action: "SUMMARY" }),
  ).rejects.toThrow(/encontrado/);
  await expect(
    intelligence(admin, pid, { snapshotId: snap.id, action: "ASSIST" }),
  ).rejects.toThrow(/não configurada/);
  expect(
    (
      await db.query(
        "SELECT accepted FROM delivery.deliverables WHERE program_id=$1",
        [pid],
      )
    )[0].accepted,
  ).toBe(false);
});
it("simulação propaga só por pré-requisitos, preserva desconhecidos e não modifica fonte", () => {
  const snapshot = {
    id: "s",
    payload_hash: "hash",
    payload: {
      deliverables: [
        { id: "a", code: "A", forecast_date: "2026-10-15", accepted: true },
        { id: "b", code: "B" },
        { id: "c", code: "C", forecast_date: "2026-11-01" },
      ],
      context: {
        nodes: [
          { id: "n1", entity_type: "deliverables", entity_id: "a" },
          { id: "n2", entity_type: "deliverables", entity_id: "b" },
          { id: "n3", entity_type: "deliverables", entity_id: "c" },
        ],
        dependencies: [
          {
            source_node_id: "n1",
            target_node_id: "n2",
            dependency_type: "BLOCKS",
          },
          {
            source_node_id: "n1",
            target_node_id: "n3",
            dependency_type: "INTEGRATES_WITH",
          },
        ],
      },
    },
  };
  const original = JSON.stringify(snapshot),
    result = simulateDelay(snapshot, "n1", 5);
  expect(result.proposals).toHaveLength(2);
  expect(result.proposals[0]?.simulatedForecast).toBe("2026-10-20");
  expect(result.proposals[1]?.simulatedForecast).toBeNull();
  expect(JSON.stringify(snapshot)).toBe(original);
  expect(result.assumptionHash).toHaveLength(64);
});
it("aliases camelCase normalizam sem ambiguidades e preservam payload congelado", () => {
  expect(
    normalizeResourceInput("deliverables", {
      programId: pid,
      ownerId: admin,
      forecastDate: "2026-11-01",
    }),
  ).toEqual({ owner_id: admin, forecast_date: "2026-11-01" });
  expect(() =>
    normalizeResourceInput("deliverables", { ownerId: admin, owner_id: admin }),
  ).toThrow(/apenas/);
  expect(
    normalizeResourceInput("gate-assessments", {
      subjectNodeId: pid,
      gateDefinitionId: admin,
      evidenceIds: [],
    }),
  ).toEqual({ subject_node_id: pid, gate_id: admin, evidence_ids: [] });
  const payload = { as_of: "frozen" };
  expect(resourceEnvelope({ program_id: pid, payload })).toMatchObject({
    programId: pid,
    payload,
  });
  expect(resourceEnvelope({ payload }).payload).toBe(payload);
});
it("OpenAPI cobre CRUD e comandos sensíveis e todo $ref local existe", () => {
  const doc = buildOpenAPI();
  for (const path of [
    "/import-jobs",
    "/reports/{id}/pdf",
    "/reports/{id}",
    "/change-requests/{id}",
    "/catalogs/profiles",
    "/access/tokens",
    "/intelligence",
    "/sync-conflicts/{id}/resolve",
  ])
    expect(doc.paths[path]).toBeTruthy();
  const walk = (v: any) => {
    if (v && typeof v === "object") {
      if (v.$ref) {
        const target = v.$ref
          .split("/")
          .slice(1)
          .reduce((o: any, key: string) => o?.[key], doc);
        expect(target, v.$ref).toBeTruthy();
      }
      for (const child of Object.values(v)) walk(child);
    }
  };
  walk(doc);
  expect(
    doc.paths["/access/tokens"].post.requestBody.content["application/json"]
      .schema.required,
  ).toContain("expiresAt");
});
it("cadência e tolerância de saúde são explícitas e congeladas no programa", async () => {
  const [p] = await db.query("SELECT * FROM portfolio.programs WHERE id=$1", [
    pid,
  ]);
  const changed = await mutate(
    admin,
    pid,
    "programs",
    {
      health_policy: {
        stale_days: 30,
        delay_tolerance_days: 5,
        dependency_minimum: "CRITICAL",
      },
    },
    pid,
    Number(p.version),
    "Ajustar política",
  );
  expect(changed.health_policy.stale_days).toBe(30);
  const now = new Date("2026-10-15"),
    d = {
      id: "x",
      owner_id: admin,
      forecast_date: "2026-10-18",
      updated_at: "2026-10-01",
      execution_status: "IN_PROGRESS",
    },
    baseline = [{ frozen_payload: { id: "x", forecast_date: "2026-10-15" } }];
  expect(projectHealth([d], [], [], baseline, now)[0].health).toBe("AT_RISK");
  expect(
    projectHealth([d], [], [], baseline, now, changed.health_policy)[0].health,
  ).toBe("ON_TRACK");
  const frozen: any = await snapshot(admin, pid, randomUUID());
  expect(frozen.payload.context.programs[0].health_policy).toEqual(
    changed.health_policy,
  );
  await expect(
    mutate(
      admin,
      pid,
      "programs",
      { timezone: "Invalid/Zone" },
      pid,
      Number(changed.version),
      "Inválido",
    ),
  ).rejects.toThrow();
});
it("retenção tem dry-run e remove só conteúdo transitório elegível", async () => {
  expect(() => retentionDays("1")).toThrow(/Retenção/);
  const [job] = await db.query(
    'INSERT INTO integration.jobs(program_id,actor_id,kind,status,input,output,updated_at) VALUES($1,$2,\'IMPORT_PREVIEW\',\'SUCCEEDED\',\'{"csv":"transient","digest":"preserved"}\',\'{"lines":[],"valid":true}\',now()-interval \'40 days\') RETURNING id',
    [pid, admin],
  );
  expect((await transientRetention()).jobs).toBe(1);
  expect(
    (
      await db.query("SELECT input FROM integration.jobs WHERE id=$1", [job.id])
    )[0].input.csv,
  ).toBe("transient");
  await transientRetention(true);
  const [cleaned] = await db.query(
    "SELECT input,output FROM integration.jobs WHERE id=$1",
    [job.id],
  );
  expect(cleaned.input.csv).toBeUndefined();
  expect(cleaned.input.digest).toBe("preserved");
  expect(cleaned.output.expired).toBe(true);
  expect(
    await db.query("SELECT id FROM reporting.snapshots WHERE program_id=$1", [
      pid,
    ]),
  ).toHaveLength(2);
});
it("radar mantém tipo de origem e não duplica componentes compartilhados", () => {
  const s = {
    asOf: "2026-10-15T12:00:00Z",
    links: [{ deliverable_id: "d", capability_id: "cap" }],
    components: [{ id: "comp" }],
    componentLinks: [
      { component_id: "comp", capability_id: "cap" },
      { component_id: "comp", capability_id: "other" },
    ],
    nodes: [{ id: "n", entity_id: "comp" }],
    dependencies: [
      {
        source_node_id: "n",
        target_node_id: "other",
        status: "BLOCKED",
        criticality: "CRITICAL",
        dependency_type: "BLOCKS",
      },
    ],
    contracts: [
      { id: "contract", source_component_id: "comp", status: "DRAFT" },
    ],
    connections: [{ id: "connection", enabled: true }],
    raid: [],
    suppliers: [],
  };
  const radar = governanceAnomalies(s, [{ id: "d" }]);
  expect(radar.find((r) => r.key === "shared-critical")?.items).toHaveLength(1);
  expect(radar.find((r) => r.key === "contracts-unapproved")?.kind).toBe(
    "contracts",
  );
  expect(radar.find((r) => r.key === "sync-stale")?.items).toHaveLength(1);
});

it("cobertura só usa universo com fonte auditável e distingue estimativa ultrapassada", async () => {
  const { inventoryCoverage } =
    await import("../src/server/domain/inventory-coverage");
  expect(inventoryCoverage({}, 20).percentage).toBeNull();
  expect(inventoryCoverage({ inventory_estimate: 10 }, 20).status).toBe(
    "ESTIMATE_OUTDATED",
  );
  const [p] = await db.query("SELECT * FROM portfolio.programs WHERE id=$1", [
    pid,
  ]);
  await expect(
    mutate(
      admin,
      pid,
      "programs",
      { inventory_estimate: 10 },
      pid,
      Number(p.version),
      "Estimar universo",
    ),
  ).rejects.toThrow(/data e fonte/);
  const changed = await mutate(
    admin,
    pid,
    "programs",
    {
      owner_id: admin,
      inventory_estimate: 10,
      inventory_estimate_as_of: "2026-10-15",
      inventory_estimate_notes: "Catálogo aprovado em reunião de descoberta",
    },
    pid,
    Number(p.version),
    "Registrar estimativa auditável",
  );
  expect(inventoryCoverage(changed, 2)).toMatchObject({
    percentage: 20,
    numerator: 2,
    denominator: 10,
    status: "ESTIMATED",
  });
  expect(changed.owner_id).toBe(admin);
});
it("assistência configurada valida citações e permanece sem comandos autônomos", async () => {
  const [programme] = await db.query(
    "SELECT * FROM portfolio.programs WHERE id=$1",
    [pid],
  );
  await mutate(
    admin,
    pid,
    "programs",
    { ai_enabled: true },
    pid,
    Number(programme.version),
    "Permitir provedor sintético de QA",
  );
  const snap: any = await snapshot(admin, pid, randomUUID()),
    source = snap.payload.deliverables[0];
  const previous = {
    endpoint: process.env.MCT_AI_ENDPOINT,
    token: process.env.MCT_AI_TOKEN,
    hosts: process.env.MCT_CONNECTOR_ALLOWED_HOSTS,
  };
  process.env.MCT_AI_ENDPOINT = "https://assistant.test/status";
  process.env.MCT_AI_TOKEN = "synthetic-test-token";
  process.env.MCT_CONNECTOR_ALLOWED_HOSTS = "assistant.test";
  try {
    const result: any = await intelligence(
      admin,
      pid,
      { snapshotId: snap.id, action: "ASSIST" },
      async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        expect(request.sources[0].id).toBe(source.id);
        expect(request.sources[0].evidence).toBeUndefined();
        expect(request.instructions).toContain("Não execute ferramentas");
        return Response.json({
          summary: "Revisar o inventário com o responsável.",
          suggestions: [
            {
              text: "Confirmar o forecast desta entrega.",
              citations: [source.id],
            },
          ],
        });
      },
    );
    expect(result.mode).toBe("ASSISTED");
    expect(result.readOnly).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
    await expect(
      intelligence(
        admin,
        pid,
        { snapshotId: snap.id, action: "ASSIST" },
        async () =>
          Response.json({
            summary: "Fonte inválida",
            suggestions: [{ text: "Inventado", citations: [randomUUID()] }],
          }),
      ),
    ).rejects.toThrow(/citações/);
    expect(
      (
        await db.query(
          "SELECT accepted FROM delivery.deliverables WHERE id=$1",
          [source.id],
        )
      )[0].accepted,
    ).toBe(false);
  } finally {
    for (const [key, value] of [
      ["MCT_AI_ENDPOINT", previous.endpoint],
      ["MCT_AI_TOKEN", previous.token],
      ["MCT_CONNECTOR_ALLOWED_HOSTS", previous.hosts],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  }
});
