type Row = Record<string, any>;
export const UNASSIGNED = "__unassigned__";
export type TowerFilters = {
  domain?: string;
  stream?: string;
  release?: string;
  area?: string;
  squad?: string;
  layer?: string;
  owner?: string;
  search?: string;
};
export function effectiveArea(d: Row, s: Row): string | null {
  return (
    d.area_id ||
    s.squads?.find((q: Row) => q.id === d.squad_id)?.area_id ||
    null
  );
}
const match = (id: string | null | undefined, value?: string) =>
  !value || (value === UNASSIGNED ? !id : id === value);
export function matchesDeliverable(d: Row, s: Row, f: TowerFilters) {
  return (
    match(d.workstream_id, f.stream) &&
    match(d.layer, f.layer) &&
    match(d.owner_id, f.owner) &&
    match(effectiveArea(d, s), f.area) &&
    match(d.squad_id, f.squad) &&
    (!f.domain ||
      s.links.some(
        (l: Row) =>
          l.deliverable_id === d.id &&
          s.capabilities.some(
            (c: Row) => c.id === l.capability_id && c.domain_id === f.domain,
          ),
      )) &&
    (!f.release ||
      s.releaseLinks.some(
        (l: Row) => l.deliverable_id === d.id && l.release_id === f.release,
      )) &&
    (!f.search ||
      `${d.code} ${d.name}`.toLowerCase().includes(f.search.toLowerCase()))
  );
}
export function filterDeliverables(s: Row, ds: Row[], f: TowerFilters) {
  return ds.filter((d) => matchesDeliverable(d, s, f));
}

export function programLayerCodes(s: Row): string[] {
  return [
    ...new Set<string>([
      ...(s.layers || []).filter((l: Row) => l.active).map((l: Row) => l.code),
      ...s.deliverables.map((d: Row) => d.layer),
    ]),
  ];
}

export function contextualState(s: Row, visible: Row[], f: TowerFilters): Row {
  const active = Object.values(f).some(Boolean);
  if (!active) return s;
  const dids = new Set(visible.map((d) => d.id)),
    restrict = !!(
      f.stream ||
      f.release ||
      f.area ||
      f.squad ||
      f.layer ||
      f.owner ||
      f.search
    );
  const caps = s.capabilities.filter(
    (c: Row) =>
      (!f.domain || c.domain_id === f.domain) &&
      (!restrict ||
        s.links.some(
          (l: Row) => l.capability_id === c.id && dids.has(l.deliverable_id),
        )),
  );
  const cids = new Set(caps.map((c: Row) => c.id)),
    components = s.components.filter((c: Row) =>
      s.componentLinks.some(
        (l: Row) => l.component_id === c.id && cids.has(l.capability_id),
      ),
    ),
    componentIds = new Set(components.map((c: Row) => c.id));
  const nids = new Set(
    s.nodes
      .filter(
        (n: Row) =>
          dids.has(n.entity_id) ||
          cids.has(n.entity_id) ||
          componentIds.has(n.entity_id),
      )
      .map((n: Row) => n.id),
  );
  const releases = s.releases.filter(
      (r: Row) =>
        (!f.release || r.id === f.release) &&
        s.releaseLinks.some(
          (l: Row) => l.release_id === r.id && dids.has(l.deliverable_id),
        ),
    ),
    rids = new Set(releases.map((r: Row) => r.id));
  const contracts = (s.contracts || []).filter(
    (c: Row) =>
      componentIds.has(c.source_component_id) ||
      componentIds.has(c.target_component_id),
  );
  return {
    ...s,
    deliverables: visible,
    capabilities: caps,
    components,
    contracts,
    suppliers: (s.suppliers || []).filter((v: Row) =>
      contracts.some((c: Row) => c.supplier_id === v.id),
    ),
    releases,
    milestones: s.milestones.filter((m: Row) => rids.has(m.release_id)),
    dependencies: s.dependencies.filter(
      (d: Row) => nids.has(d.source_node_id) || nids.has(d.target_node_id),
    ),
    raid: s.raid.filter((r: Row) => !f.stream || r.workstream_id === f.stream),
  };
}
