export const FORMULA_VERSION = "mct-1.3.0";
export const LAYERS = [
  "CLIENT",
  "CAAL",
  "BACKEND",
  "PARTNER",
  "DATA",
  "INFRA",
  "SECURITY",
  "OPERATIONS",
  "QUALITY",
] as const;
export const STAGES = [
  "IDENTIFIED",
  "SPECIFICATION",
  "DEVELOPMENT",
  "SIT",
  "UAT",
  "PRODUCTION",
] as const;
export type Membership = {
  role: string;
  workstream_id?: string | null;
  gate_categories?: string[];
  domain_ids?: string[];
  data_clearance?: string;
  expires_at?: string | null;
};
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function canEdit(
  memberships: Membership[],
  kind: string,
  workstream?: string | null,
): boolean {
  return memberships.some((m) => {
    if (m.role === "PROGRAM_ADMIN") return kind !== "assessments";
    if (m.role === "CHIEF_ARCHITECT")
      return [
        "domains",
        "workstreams",
        "areas",
        "squads",
        "capabilities",
        "components",
        "suppliers",
        "contracts",
        "dependencies",
        "raid",
        "decisions",
        "evidence",
        "deliverables",
      ].includes(kind);
    if (m.role === "PMO")
      return [
        "releases",
        "milestones",
        "baselines",
        "snapshots",
        "reports",
        "dependencies",
        "raid",
      ].includes(kind);
    if (m.role === "WORKSTREAM_LEAD")
      return (
        ["deliverables", "dependencies", "raid", "evidence"].includes(kind) &&
        !!workstream &&
        m.workstream_id === workstream
      );
    return false;
  });
}
export function hasCycle(
  edges: { source_node_id: string; target_node_id: string }[],
): boolean {
  const adjacent = new Map<string, string[]>();
  for (const e of edges)
    adjacent.set(e.source_node_id, [
      ...(adjacent.get(e.source_node_id) || []),
      e.target_node_id,
    ]);
  const active = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): boolean {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    for (const target of adjacent.get(id) || []) if (visit(target)) return true;
    active.delete(id);
    visited.add(id);
    return false;
  }
  return [...adjacent.keys()].some(visit);
}
export function impactedNodes(
  start: string,
  edges: { source_node_id: string; target_node_id: string; status?: string }[],
): string[] {
  const seen = new Set<string>();
  function walk(id: string) {
    for (const e of edges.filter(
      (e) =>
        e.source_node_id === id &&
        !["RESOLVED", "WAIVED"].includes(e.status || ""),
    )) {
      if (!seen.has(e.target_node_id)) {
        seen.add(e.target_node_id);
        walk(e.target_node_id);
      }
    }
  }
  walk(start);
  seen.delete(start);
  return [...seen];
}
export function gateSatisfied(
  g: {
    result: string;
    expires_at?: string | null;
    gate_version?: number;
    definition_version?: number;
  },
  now = new Date(),
): boolean {
  return (
    (g.definition_version === undefined ||
      g.gate_version === undefined ||
      Number(g.gate_version) === Number(g.definition_version)) &&
    (g.result === "PASSED" ||
      g.result === "NOT_APPLICABLE" ||
      (g.result === "EXCEPTION_APPROVED" &&
        !!g.expires_at &&
        new Date(g.expires_at) > now))
  );
}
export function readiness(
  assessments: {
    result: string;
    blocking?: boolean;
    expires_at?: string | null;
    gate_version?: number;
    definition_version?: number;
  }[],
  expected: number,
  now = new Date(),
) {
  assessments = assessments.filter((g) => g.blocking !== false);
  const notApplicable = assessments.filter(
    (g) => g.result === "NOT_APPLICABLE" && gateSatisfied(g, now),
  ).length;
  const applicable = Math.max(0, expected - notApplicable);
  const satisfied = assessments.filter(
    (g) => g.result !== "NOT_APPLICABLE" && gateSatisfied(g, now),
  ).length;
  const blockers =
    assessments.filter((g) => g.blocking !== false && !gateSatisfied(g, now))
      .length + Math.max(0, expected - assessments.length);
  return {
    status:
      expected === 0
        ? "NOT_ASSESSED"
        : blockers > 0
          ? "NOT_READY"
          : assessments.some((g) => g.result === "EXCEPTION_APPROVED")
            ? "READY_WITH_EXCEPTIONS"
            : "READY",
    blockingGates: blockers,
    assessedGates: assessments.filter(
      (g) => !["PENDING", "NOT_ASSESSED", "NOT_APPLICABLE"].includes(g.result),
    ).length,
    totalApplicableGates: applicable,
    satisfied,
    percentage: applicable ? Math.round((satisfied / applicable) * 100) : null,
  };
}
export function metrics(
  deliverables: {
    id: string;
    accepted: boolean;
    execution_status: string;
    updated_at: string;
    owner_id?: string;
    acceptance_criteria?: string;
    forecast_date?: string;
    weight?: number;
    layer?: string;
    has_scope?: boolean;
    has_evidence?: boolean;
  }[],
  baselineItems: { id: string; weight?: number }[] = [],
  now = new Date(),
  staleDays = 7,
) {
  const unique = [...new Map(deliverables.map((d) => [d.id, d])).values()];
  const baseline = [...new Map(baselineItems.map((d) => [d.id, d])).values()];
  const weighted =
    baseline.length > 0 && baseline.every((d) => Number(d.weight) > 0);
  const denominator = weighted
    ? baseline.reduce((s, d) => s + Number(d.weight), 0)
    : unique.length;
  const numerator = weighted
    ? baseline
        .filter((b) => unique.some((d) => d.id === b.id && d.accepted))
        .reduce((s, d) => s + Number(d.weight), 0)
    : unique.filter((d) => d.accepted).length;
  return {
    total: unique.length,
    accepted: unique.filter((d) => d.accepted).length,
    done: unique.filter((d) => d.execution_status === "DONE").length,
    blocked: unique.filter((d) => d.execution_status === "BLOCKED").length,
    progress: denominator ? Math.round((numerator / denominator) * 100) : null,
    provisional: !weighted,
    numerator,
    denominator,
    stale: unique.filter(
      (d) =>
        now.getTime() - new Date(d.updated_at).getTime() > staleDays * 86400000,
    ).length,
    quality: unique.length
      ? Math.round(
          (unique.reduce(
            (s, d) =>
              s +
              [
                !!d.owner_id,
                !!d.acceptance_criteria,
                !!d.forecast_date,
                !!d.layer,
                !!d.has_scope,
                !!d.has_evidence,
                now.getTime() - new Date(d.updated_at).getTime() <=
                  staleDays * 86400000,
              ].filter(Boolean).length,
            0,
          ) /
            (unique.length * 7)) *
            100,
        )
      : null,
  };
}
export function assertTransition(
  current: string,
  target: string,
  ready: boolean,
  authorizedRelease: boolean,
  reason: string,
) {
  if (reason.trim().length < 3)
    throw new DomainError(422, "Informe uma justificativa.");
  const from = STAGES.indexOf(current as (typeof STAGES)[number]),
    to = STAGES.indexOf(target as (typeof STAGES)[number]);
  if (to !== from + 1)
    throw new DomainError(409, "O estágio deve avançar uma etapa por vez.");
  if (["UAT", "PRODUCTION"].includes(target) && !ready)
    throw new DomainError(
      409,
      "Gates obrigatórios e evidências precisam estar aprovados.",
    );
  if (target === "PRODUCTION" && !authorizedRelease)
    throw new DomainError(409, "Produção exige uma release autorizada.");
}
export function assertExecutionChange(
  current: string,
  target: string,
  reason: string,
) {
  if (current === target) return;
  const allowed: Record<string, string[]> = {
    NOT_STARTED: ["IN_PROGRESS", "BLOCKED", "ON_HOLD", "CANCELLED"],
    IN_PROGRESS: ["DONE", "BLOCKED", "ON_HOLD", "CANCELLED"],
    BLOCKED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
    ON_HOLD: ["IN_PROGRESS", "NOT_STARTED", "CANCELLED"],
    DONE: ["REOPENED"],
    REOPENED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
    CANCELLED: ["REOPENED"],
  };
  if (!allowed[current]?.includes(target))
    throw new DomainError(
      409,
      "Transição de execução inválida. Siga o fluxo de estados.",
    );
  if (reason.trim().length < 3)
    throw new DomainError(422, "Mudança de execução exige motivo.");
}
export function projectHealth<T extends Record<string, any>>(
  deliverables: T[],
  nodes: Record<string, any>[],
  dependencies: Record<string, any>[],
  baselineItems: Record<string, any>[],
  now = new Date(),
  policy: {
    stale_days?: number;
    delay_tolerance_days?: number;
    dependency_minimum?: string;
  } = {},
) {
  const blocked = new Set<string>();
  for (const edge of dependencies.filter(
    (d) =>
      d.status === "BLOCKED" &&
      (policy.dependency_minimum === "CRITICAL"
        ? ["CRITICAL"]
        : ["HIGH", "CRITICAL"]
      ).includes(d.criticality) &&
      ["BLOCKS", "REQUIRES", "PRECEDES"].includes(d.dependency_type),
  ))
    for (const id of [
      edge.target_node_id,
      ...impactedNodes(edge.target_node_id, dependencies as any),
    ])
      blocked.add(id);
  return deliverables.map((d) => {
    const node = nodes.find(
      (n) => n.entity_id === d.id && n.entity_type === "deliverables",
    );
    const baseline = baselineItems.find(
      (b) => b.frozen_payload?.id === d.id,
    )?.frozen_payload;
    const reasons: string[] = [];
    let health = "ON_TRACK";
    if (node && blocked.has(node.id)) {
      health = "CRITICAL";
      reasons.push("Dependência impeditiva crítica (direta ou transitiva).");
    }
    if (d.execution_status === "BLOCKED") {
      health = "CRITICAL";
      reasons.push("Execução bloqueada.");
    }
    if (
      baseline?.forecast_date &&
      d.forecast_date &&
      new Date(d.forecast_date).getTime() -
        new Date(baseline.forecast_date).getTime() >
        (policy.delay_tolerance_days || 0) * 86400000
    ) {
      if (health !== "CRITICAL") health = "AT_RISK";
      reasons.push("Forecast posterior à tolerância da baseline aprovada.");
    }
    if (
      now.getTime() - new Date(d.updated_at).getTime() >
        (policy.stale_days || 7) * 86400000 ||
      !d.owner_id ||
      !d.forecast_date
    ) {
      if (health === "ON_TRACK") health = "UNKNOWN";
      reasons.push(
        "Atualização fora da cadência ou informações essenciais ausentes.",
      );
    }
    return { ...d, health, health_reasons: reasons };
  });
}
