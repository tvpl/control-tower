import { agentContextSchema } from "../domain/agent-context";
import { DomainError } from "../domain/rules";
import { filterDeliverables } from "../../shared/workspace-filtering";
import type { Row } from "../infrastructure/database";

export function agentFocus(s: Row, raw: unknown) {
  const request = agentContextSchema.parse(raw);
  let ds = filterDeliverables(s, s.deliverables, request.filters);
  let subject: Row | undefined;
  const relatedCapabilities = new Set<string>();
  if (request.subject) {
    const { kind, id } = request.subject;
    subject = s[kind]?.find((r: Row) => r.id === id);
    if (!subject)
      throw new DomainError(
        404,
        "Registro não disponível neste projeto para sua identidade.",
      );
    if (kind === "capabilities") {
      relatedCapabilities.add(id);
      for (let changed = true; changed;) {
        changed = false;
        for (const c of s.capabilities)
          if (
            c.parent_id &&
            relatedCapabilities.has(c.parent_id) &&
            !relatedCapabilities.has(c.id)
          ) {
            relatedCapabilities.add(c.id);
            changed = true;
          }
      }
      ds = ds.filter((d) =>
        s.links.some(
          (l: Row) =>
            l.deliverable_id === d.id &&
            relatedCapabilities.has(l.capability_id),
        ),
      );
    } else if (kind === "deliverables") ds = ds.filter((d) => d.id === id);
    else if (kind === "workstreams")
      ds = ds.filter((d) => d.workstream_id === id);
    else if (kind === "releases")
      ds = ds.filter((d) =>
        s.releaseLinks.some(
          (l: Row) => l.release_id === id && l.deliverable_id === d.id,
        ),
      );
    else ds = [];
  }
  if (request.selection) {
    if (
      new Set(request.selection).size !== request.selection.length ||
      request.selection.some((id) => !ds.some((d) => d.id === id))
    )
      throw new DomainError(
        422,
        "A seleção contém registros repetidos ou fora do recorte autorizado.",
      );
    ds = ds.filter((d) => request.selection!.includes(d.id));
  }
  const dids = new Set(ds.map((d) => d.id));
  for (const l of s.links)
    if (dids.has(l.deliverable_id)) relatedCapabilities.add(l.capability_id);
  const rids = new Set(
    s.releaseLinks
      .filter((l: Row) => dids.has(l.deliverable_id))
      .map((l: Row) => l.release_id),
  );
  const componentIds = new Set(
    s.componentLinks
      .filter((l: Row) => relatedCapabilities.has(l.capability_id))
      .map((l: Row) => l.component_id),
  );
  const nodes = new Set(
    s.nodes
      .filter(
        (n: Row) =>
          dids.has(n.entity_id) ||
          relatedCapabilities.has(n.entity_id) ||
          componentIds.has(n.entity_id),
      )
      .map((n: Row) => n.id),
  );
  const restricted =
    !!request.subject ||
    !!request.selection ||
    Object.values(request.filters).some(Boolean);
  const ids: Record<string, Set<string>> = {
    deliverables: dids,
    capabilities: relatedCapabilities,
    workstreams: new Set(ds.map((d) => d.workstream_id)),
    releases: rids as Set<string>,
    components: componentIds as Set<string>,
    milestones: new Set(
      s.milestones
        .filter((m: Row) => rids.has(m.release_id))
        .map((m: Row) => m.id),
    ),
    dependencies: new Set(
      s.dependencies
        .filter(
          (d: Row) =>
            nodes.has(d.source_node_id) || nodes.has(d.target_node_id),
        )
        .map((d: Row) => d.id),
    ),
    evidence: new Set(
      s.evidence
        .filter((e: Row) => nodes.has(e.subject_node_id))
        .map((e: Row) => e.id),
    ),
  };
  const viewKinds: Record<string, string[]> = {
    overview: ["deliverables", "capabilities"],
    fronts: ["workstreams", "deliverables"],
    capabilities: ["capabilities", "deliverables"],
    architecture: ["components", "contracts", "suppliers"],
    deliverables: ["deliverables"],
    delivery: ["releases", "milestones", "deliverables"],
    priorities: ["deliverables", "capabilities"],
    dependencies: ["dependencies", "raid", "decisions"],
    readiness: ["deliverables", "capabilities"],
    evidence: ["evidence"],
    settings: ["domains", "workstreams", "areas", "squads"],
  };
  const kinds = request.subject
    ? [
        request.subject.kind,
        ...(ds.length ? ["deliverables", "capabilities"] : []),
      ]
    : viewKinds[request.view] || ["deliverables", "capabilities"];
  function includes(kind: string, id: string) {
    if (request.subject?.kind === kind && request.subject.id === id)
      return true;
    if (!kinds.includes(kind)) return false;
    if (!restricted) return true;
    return ids[kind]?.has(id) || false;
  }
  const metrics = {
    total: ds.length,
    done: ds.filter((d) => d.execution_status === "DONE").length,
    accepted: ds.filter((d) => d.accepted).length,
    blocked: ds.filter((d) => d.execution_status === "BLOCKED").length,
    withoutOwner: ds.filter((d) => !d.owner_id).length,
    withoutForecast: ds.filter((d) => !d.forecast_date).length,
    withoutAcceptanceCriteria: ds.filter((d) => !d.acceptance_criteria?.trim())
      .length,
  };
  return {
    includes,
    focus: {
      ...request,
      record: subject,
      deliverableIds: [...dids],
      capabilityIds: [...relatedCapabilities],
      metrics,
      indicatorScope:
        "Os indicadores gerais descrevem o projeto completo. As contagens desta janela consideram apenas o recorte selecionado.",
    },
  };
}
