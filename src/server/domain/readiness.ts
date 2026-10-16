import { applicability, contextualAssessment } from "./applicability";
import { readiness } from "./rules";
type Row = Record<string, any>;
export const READINESS_VERSION = "readiness-1.2.0";
export function effectiveAssessments(
  gates: Row[],
  assessments: Row[],
  context?: { deliverables: Row[]; nodes: Row[]; profiles: Row[] },
): Row[] {
  return assessments.map((a) => {
    const g = gates.find((g) => g.id === a.gate_id);
    const d = context?.deliverables.find((d) =>
      context.nodes.some(
        (n) =>
          n.id === a.subject_node_id &&
          n.entity_id === d.id &&
          n.entity_type === "deliverables",
      ),
    );
    const current = d
      ? contextualAssessment(
          a,
          applicability(d, gates, context!.profiles).contextKey,
        )
      : a;
    return {
      ...current,
      blocking: g?.blocking ?? true,
      definition_version: g?.version,
      stale_criterion: !g || Number(a.gate_version) !== Number(g.version),
      result:
        !g || Number(a.gate_version) !== Number(g.version)
          ? "NOT_ASSESSED"
          : current.result,
    };
  });
}
export function deliverableReadiness(
  ds: Row[],
  nodes: Row[],
  gates: Row[],
  assessments: Row[],
  links: Row[] = [],
  capabilities: Row[] = [],
  profiles: Row[] = [],
) {
  const unique = [...new Map(ds.map((d) => [d.id, d])).values()];
  let expected = 0,
    unknownApplicability = 0;
  const effective = effectiveAssessments(gates, assessments, {
    deliverables: unique,
    nodes,
    profiles,
  });
  const current = unique.flatMap((d) => {
    const selection = applicability(d, gates, profiles);
    if (selection.unknown) unknownApplicability++;
    const selected = selection.gates.filter((g) => g.blocking);
    expected += selected.length;
    const node = nodes.find(
      (n) => n.entity_type === "deliverables" && n.entity_id === d.id,
    );
    return effective.filter(
      (a) =>
        a.subject_node_id === node?.id &&
        selected.some((g) => g.id === a.gate_id),
    );
  });
  const result = readiness(current as any, expected);
  if (unknownApplicability && result.status !== "NOT_ASSESSED")
    result.status = "NOT_READY";
  const unacceptedDeliverables = unique.filter(
    (d) => !d.accepted || d.execution_status !== "DONE",
  ).length;
  const unapprovedScope = unique.filter(
    (d) =>
      !["APPROVED", "CHANGED"].includes(d.scope_status) ||
      links.some(
        (l) =>
          l.deliverable_id === d.id &&
          l.contribution_type === "REQUIRED" &&
          !capabilities.some(
            (c) =>
              c.id === l.capability_id &&
              ["APPROVED", "CHANGED"].includes(c.scope_status),
          ),
      ),
  ).length;
  if (
    (unacceptedDeliverables || unapprovedScope) &&
    result.status !== "NOT_ASSESSED"
  )
    result.status = "NOT_READY";
  return {
    ...result,
    unknownApplicability,
    unacceptedDeliverables,
    unapprovedScope,
    requiredDeliverables: unique.length,
    formulaVersion: READINESS_VERSION,
  };
}
export function capabilityReadiness(
  cap: Row,
  ds: Row[],
  links: Row[],
  nodes: Row[],
  gates: Row[],
  assessments: Row[],
  profiles: Row[] = [],
) {
  const ids = new Set(
    links
      .filter(
        (l) => l.capability_id === cap.id && l.contribution_type === "REQUIRED",
      )
      .map((l) => l.deliverable_id),
  );
  const result = deliverableReadiness(
    ds.filter((d) => ids.has(d.id)),
    nodes,
    gates,
    assessments,
    [],
    [],
    profiles,
  );
  if (
    (!["APPROVED", "CHANGED"].includes(cap.scope_status) ||
      !cap.acceptance_criteria?.length) &&
    result.status !== "NOT_ASSESSED"
  )
    result.status = "NOT_READY";
  return {
    ...result,
    unapprovedCapabilityScope: !["APPROVED", "CHANGED"].includes(
      cap.scope_status,
    ),
    missingAcceptanceCriteria: !cap.acceptance_criteria?.length,
  };
}
