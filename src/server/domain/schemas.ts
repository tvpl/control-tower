import { z } from "zod";
import { STAGES } from "./rules";
import { SCOPE_STATUSES } from "./scope";
const id = z.uuid(),
  text = z.string().trim().min(2).max(500),
  code = z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/),
  date = z.iso.date().nullable().optional(),
  owner = id.nullable().optional();
const base = { code, name: text },
  severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  maturity = z.enum(["IDENTIFIED", "STRUCTURED", "VALIDATED", "GOVERNED"]);
export const schemas = {
  programs: z.object({
    ...base,
    owner_id: owner,
    inventory_estimate: z
      .number()
      .int()
      .min(1)
      .max(10000000)
      .nullable()
      .optional(),
    inventory_estimate_as_of: date,
    inventory_estimate_notes: z.string().max(2000).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    timezone: z
      .string()
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("pt-BR", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Timezone IANA inválido")
      .default("America/Sao_Paulo"),
    health_policy: z
      .object({
        stale_days: z.number().int().min(1).max(90),
        delay_tolerance_days: z.number().int().min(0).max(30),
        dependency_minimum: z.enum(["HIGH", "CRITICAL"]),
      })
      .strict()
      .optional(),
    ai_enabled: z.boolean().optional(),
  }),
  domains: z.object({
    ...base,
    owner_id: owner,
    inventory_maturity: maturity.default("IDENTIFIED"),
  }),
  areas: z.object({ ...base, owner_id: owner }),
  squads: z.object({ ...base, area_id: owner, lead_id: owner }),
  workstreams: z.object({
    ...base,
    lead_id: owner,
    kind: z
      .enum([
        "DEVELOPMENT",
        "BUSINESS",
        "INFRASTRUCTURE",
        "PROVISIONING",
        "SPIKE",
        "OTHER",
      ])
      .default("OTHER"),
  }),
  capabilities: z.object({
    ...base,
    domain_id: id,
    parent_id: owner,
    description: z.string().max(2000).nullable().optional(),
    criticality: severity.default("MEDIUM"),
    inventory_maturity: maturity.default("IDENTIFIED"),
    acceptance_criteria: z.array(text).default([]),
    scope_status: z.enum(SCOPE_STATUSES).default("PROPOSED"),
  }),
  deliverables: z.object({
    ...base,
    scope_status: z.enum(SCOPE_STATUSES).default("PROPOSED"),
    workstream_id: id,
    area_id: owner,
    squad_id: owner,
    layer: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/),
    criticality: severity.default("MEDIUM"),
    deliverable_type: z.enum([
      "API",
      "UI",
      "CONTRACT",
      "INFRA",
      "EVENT",
      "TEST",
      "DOCUMENTATION",
      "OPERATION",
    ]),
    owner_id: owner,
    forecast_date: date,
    acceptance_criteria: z.string().max(2000).default(""),
    capability_ids: z.array(id).default([]),
    capability_roles: z
      .record(id, z.enum(["REQUIRED", "OPTIONAL", "SUPPORTING"]))
      .optional(),
    transverse_obligation: z.string().max(500).nullable().optional(),
    planning_status: z
      .enum(["BACKLOG", "PLANNED", "COMMITTED", "REPLANNED"])
      .default("BACKLOG"),
    execution_status: z
      .enum([
        "NOT_STARTED",
        "IN_PROGRESS",
        "DONE",
        "BLOCKED",
        "ON_HOLD",
        "CANCELLED",
        "REOPENED",
      ])
      .default("NOT_STARTED"),
    weight: z.number().positive().nullable().optional(),
  }),
  components: z.object({
    ...base,
    kind: z.enum(["SERVICE", "SYSTEM", "DATABASE", "GATEWAY", "PLATFORM"]),
    supplier: z.string().max(150).nullable().optional(),
    supplier_id: owner,
    owner_id: owner,
    capability_ids: z.array(id).default([]),
    relation_types: z
      .record(id, z.enum(["USES", "IMPLEMENTS", "SUPPORTS", "DEPENDS_ON"]))
      .optional(),
  }),
  suppliers: z.object({
    ...base,
    owner_id: owner,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    contact_url: z
      .url()
      .refine((u) => u.startsWith("https://"), "Use HTTPS")
      .nullable()
      .optional(),
    classification: z
      .enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"])
      .default("INTERNAL"),
  }),
  contracts: z.object({
    ...base,
    source_component_id: id,
    target_component_id: id,
    supplier_id: owner,
    supersedes_id: owner,
    protocol: z.enum([
      "HTTP_REST",
      "GRPC",
      "ISO8583",
      "EVENT",
      "FILE",
      "OTHER",
    ]),
    contract_version: z.string().trim().min(1).max(40),
    specification_url: z
      .url()
      .refine((u) => u.startsWith("https://"), "Use HTTPS")
      .nullable()
      .optional(),
    sla_ms: z.number().int().positive().nullable().optional(),
    sla_notes: z.string().max(2000).nullable().optional(),
    availability_target: z.number().positive().max(100).nullable().optional(),
    owner_id: owner,
  }),
  releases: z.object({
    ...base,
    planned_date: date,
    forecast_date: date,
    deliverable_ids: z.array(id).default([]),
    deliverable_required: z.record(id, z.boolean()).optional(),
  }),
  milestones: z.object({
    name: text,
    release_id: id,
    baseline_date: date,
    forecast_date: date,
  }),
  dependencies: z.object({
    source_node_id: id,
    target_node_id: id,
    dependency_type: z.enum([
      "BLOCKS",
      "REQUIRES",
      "INTEGRATES_WITH",
      "PRECEDES",
    ]),
    criticality: severity.default("MEDIUM"),
    status: z.enum(["OPEN", "BLOCKED", "RESOLVED"]).default("OPEN"),
    needed_by: date,
    owner_id: owner,
    description: text,
  }),
  raid: z.object({
    workstream_id: owner,
    kind: z.enum(["RISK", "ASSUMPTION", "ISSUE", "ACTION"]),
    title: text,
    severity: severity.default("MEDIUM"),
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).default("OPEN"),
    owner_id: owner,
    action_plan: z.string().max(2000).optional(),
    due_date: date,
  }),
  decisions: z.object({
    ...base,
    rationale: text,
    alternatives: text,
    approval_role: z
      .enum(["PMO", "EXECUTIVE", "CHIEF_ARCHITECT"])
      .default("PMO"),
    owner_id: owner,
    due_date: date,
    status: z.enum(["PROPOSED", "APPROVED", "REJECTED"]).default("PROPOSED"),
  }),
  evidence: z.object({
    subject_node_id: id,
    title: text,
    url: z
      .url()
      .refine(
        (u) => u.startsWith("https://"),
        "Utilize uma URL HTTPS protegida.",
      ),
    source: text,
    artifact_version: text,
    classification: z.enum(["INTERNAL", "CONFIDENTIAL", "RESTRICTED"]),
  }),
  connections: z.object({
    name: text,
    connector_type: z.enum([
      "JIRA",
      "AZURE_DEVOPS",
      "GITHUB",
      "GITLAB",
      "CONFLUENCE",
      "CATALOGUE",
    ]),
    base_url: z.url().refine((u) => u.startsWith("https://"), "Use HTTPS"),
    secret_env: z.string().regex(/^MCT_CONNECTOR_[A-Z0-9_]+$/),
    project: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((v) => !/[\r\n\0]/.test(v)),
    deployment: z.enum(["CLOUD", "SERVER"]).default("CLOUD"),
    jira_email: z.email().nullable().optional(),
    gitlab_options: z
      .object({
        api: z.enum(["ISSUES", "WORK_ITEMS"]).default("ISSUES"),
        scope: z.enum(["PROJECT", "GROUP"]).default("PROJECT"),
        labels: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(100)
              .refine((v) => !/[\r\n,]/.test(v)),
          )
          .max(20)
          .default([]),
      })
      .strict()
      .default({ api: "ISSUES", scope: "PROJECT", labels: [] }),
    state_mapping: z
      .record(
        z.string().min(1).max(100),
        z.enum([
          "NOT_STARTED",
          "IN_PROGRESS",
          "DONE",
          "BLOCKED",
          "ON_HOLD",
          "CANCELLED",
          "REOPENED",
          "UNKNOWN",
        ]),
      )
      .refine((v) => Object.keys(v).length <= 100)
      .default({}),
    field_mapping: z
      .object({
        execution_status: z.literal("operationalState").optional(),
        name: z.literal("title").optional(),
      })
      .strict()
      .default({ execution_status: "operationalState" }),
    execution_owner: z
      .enum(["CONTROL_TOWER", "EXTERNAL"])
      .default("CONTROL_TOWER"),
    webhook_secret_env: z
      .string()
      .regex(/^MCT_CONNECTOR_[A-Z0-9_]+$/)
      .nullable()
      .optional(),
    enabled: z.boolean().default(false),
    poll_interval_seconds: z.number().int().min(60).max(86400).default(900),
  }),
};
export type Kind = keyof typeof schemas;
export const TABLES: Record<Kind, string> = {
  programs: "portfolio.programs",
  domains: "portfolio.domains",
  workstreams: "portfolio.workstreams",
  areas: "portfolio.areas",
  squads: "portfolio.squads",
  capabilities: "portfolio.capabilities",
  deliverables: "delivery.deliverables",
  components: "architecture.components",
  suppliers: "architecture.suppliers",
  contracts: "architecture.contracts",
  releases: "delivery.releases",
  milestones: "delivery.milestones",
  dependencies: "governance.dependencies",
  raid: "governance.raid_items",
  decisions: "governance.decisions",
  evidence: "evidence_records",
  connections: "integration.connections",
};
export const transitionSchema = z.object({
  targetStage: z.enum(STAGES),
  reason: z.string().min(3),
  expectedVersion: z.number().int().positive(),
});
export const assessmentSchema = z.object({
  subject_node_id: id,
  gate_id: id,
  expectedGateVersion: z.number().int().positive(),
  expectedContextKey: z.string().max(20000).nullable().optional(),
  result: z.enum([
    "PENDING",
    "PASSED",
    "FAILED",
    "NOT_APPLICABLE",
    "EXCEPTION_APPROVED",
  ]),
  justification: z.string().trim().min(3).max(2000),
  evidence_ids: z.array(id),
  expectedVersion: z.number().int().nonnegative(),
  expires_at: z.iso.datetime().nullable().optional(),
  accepted_risk: z.string().max(2000).optional(),
  mitigation_plan: z.string().max(2000).optional(),
  decision_reference: z.string().max(500).optional(),
});
