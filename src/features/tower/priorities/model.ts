import { matchesDeliverable, type TowerFilters } from "../filtering";
import { impactedNodes } from "@/server/domain/rules";
import { type PriorityKind } from "@/server/domain/priorities";
import { type QueueItem, type TowerState } from "./types";
export function queueItems(s: TowerState, kind: PriorityKind): QueueItem[] {
  const edges = s.dependencies.filter((e: TowerState) =>
    ["BLOCKS", "REQUIRES", "PRECEDES"].includes(e.dependency_type),
  );
  return s[kind].flatMap((record: TowerState) => {
    const node = s.nodes.find(
      (n: TowerState) => n.entity_type === kind && n.entity_id === record.id,
    );
    if (!node) return [];
    const deliveries =
      kind === "deliverables"
        ? [record]
        : s.deliverables.filter((d: TowerState) =>
            s.links.some(
              (l: TowerState) =>
                l.capability_id === record.id && l.deliverable_id === d.id,
            ),
          );
    const roots = new Set([
      node.id,
      ...s.nodes
        .filter(
          (n: TowerState) =>
            n.entity_type === "deliverables" &&
            deliveries.some((d: TowerState) => d.id === n.entity_id),
        )
        .map((n: TowerState) => n.id),
    ]);
    const impacted = [
      ...new Set([...roots].flatMap((id) => impactedNodes(String(id), edges))),
    ].filter((id) => !roots.has(id));
    const blockers = edges
      .filter(
        (e: TowerState) =>
          roots.has(e.target_node_id) && e.status === "BLOCKED",
      )
      .map((e: TowerState) => ({ id: e.id, name: e.description }));
    const owner = s.users.find(
      (u: TowerState) =>
        u.id ===
        (record.owner_id ||
          s.domains.find((d: TowerState) => d.id === record.domain_id)
            ?.owner_id),
    );
    const ownerName = owner?.display_name || "Sem responsável";
    return [
      {
        id: node.id,
        entityId: record.id,
        kind,
        code: record.code,
        name: record.name,
        status:
          kind === "deliverables"
            ? record.execution_status
            : record.scope_status,
        health:
          kind === "deliverables"
            ? record.health
            : deliveries.some((d: TowerState) => d.health === "CRITICAL")
              ? "CRITICAL"
              : deliveries.some((d: TowerState) => d.health === "AT_RISK")
                ? "AT_RISK"
                : "UNKNOWN",
        owner: ownerName,
        ownerInitials: owner
          ? ownerName
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part: string) => part[0])
              .join("")
          : "—",
        context:
          kind === "deliverables"
            ? `${s.workstreams.find((w: TowerState) => w.id === record.workstream_id)?.name || "Sem frente"} · ${record.layer}`
            : s.domains.find((d: TowerState) => d.id === record.domain_id)
                ?.name || "Sem domínio",
        forecast: record.forecast_date,
        accepted:
          kind === "deliverables"
            ? record.accepted
            : record.readiness?.status === "READY",
        impactIds: impacted,
        blockers,
        relatedDeliverables: deliveries.length,
        criticality: record.criticality,
        record,
      },
    ];
  });
}
export function matchesFilters(
  item: QueueItem,
  s: TowerState,
  filters: TowerFilters,
) {
  const ds =
    item.kind === "deliverables"
      ? [item.record]
      : s.deliverables.filter((d: TowerState) =>
          s.links.some(
            (l: TowerState) =>
              l.capability_id === item.entityId && l.deliverable_id === d.id,
          ),
        );
  const context =
    item.kind !== "capabilities" ||
    !filters.domain ||
    item.record.domain_id === filters.domain;
  const hasDeliveryFilter = !!(
    filters.stream ||
    filters.release ||
    filters.area ||
    filters.squad ||
    filters.layer ||
    filters.owner
  );
  return (
    context &&
    (item.kind === "deliverables" || hasDeliveryFilter
      ? ds.some((d: TowerState) => matchesDeliverable(d, s, filters))
      : true)
  );
}
