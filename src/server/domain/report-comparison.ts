type Row = Record<string, any>;
export const COMPARISON_FIELDS = [
  "name",
  "execution_status",
  "accepted",
  "delivery_stage",
  "scope_status",
  "planning_status",
  "forecast_date",
  "owner_id",
  "layer",
  "workstream_id",
  "area_id",
  "squad_id",
  "criticality",
  "weight",
  "acceptance_criteria",
  "transverse_obligation",
] as const;
export const SNAPSHOT_COLLECTIONS = [
  "programs",
  "domains",
  "workstreams",
  "areas",
  "squads",
  "capabilities",
  "components",
  "contracts",
  "suppliers",
  "releases",
  "milestones",
  "dependencies",
  "raid",
  "decisions",
  "evidence",
  "assessments",
  "gates",
  "gateVersions",
  "dodProfiles",
  "layers",
  "links",
  "componentLinks",
  "releaseLinks",
  "observations",
  "healthOverrides",
  "priorityBoards",
  "priorityEntries",
  "baselineItems",
] as const;
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}
function identity(r: Row) {
  return (
    r.id ||
    (r.gate_id && r.version
      ? `${r.gate_id}:${r.version}`
      : r.capability_id && r.deliverable_id
        ? `${r.capability_id}:${r.deliverable_id}`
        : r.capability_id && r.component_id
          ? `${r.capability_id}:${r.component_id}`
          : r.release_id && r.deliverable_id
            ? `${r.release_id}:${r.deliverable_id}`
            : r.board_id && r.node_id
              ? `${r.board_id}:${r.node_id}`
              : r.code || r.kind)
  );
}
function diff(current: Row[], previous: Row[], fields?: readonly string[]) {
  const before = new Map<string, Row>(previous.map((r) => [identity(r), r])),
    after = new Map<string, Row>(current.map((r) => [identity(r), r]));
  return {
    added: [...after.values()].filter((r) => !before.has(identity(r))),
    removed: [...before.values()].filter((r) => !after.has(identity(r))),
    changed: [...after.values()].flatMap((r) => {
      const old = before.get(identity(r));
      if (!old) return [];
      const keys =
        fields ||
        [...new Set([...Object.keys(old), ...Object.keys(r)])].filter(
          (k) => !["id", "program_id", "recorded_at", "updated_at"].includes(k),
        );
      const changes = keys
        .filter((f) => stable(old[f]) !== stable(r[f]))
        .map((field) => ({
          field,
          before: old[field] ?? null,
          after: r[field] ?? null,
        }));
      return changes.length
        ? [{ id: identity(r), code: r.code, name: r.name, fields: changes }]
        : [];
    }),
  };
}
export function compareSnapshots(current: Row, previous: Row) {
  const primary = diff(
    current.payload.deliverables || [],
    previous.payload.deliverables || [],
    COMPARISON_FIELDS,
  );
  const collections = SNAPSHOT_COLLECTIONS.map((kind) => {
    const get = (snapshot: Row) =>
      kind === "baselineItems"
        ? snapshot.payload.baselineItems?.map((r: Row) => r.frozen_payload || r)
        : snapshot.payload[kind] || snapshot.payload.context?.[kind];
    const before = get(previous),
      after = get(current),
      available = Array.isArray(before) && Array.isArray(after);
    return {
      kind,
      available,
      ...diff(available ? after : [], available ? before : []),
    };
  });
  return {
    comparable: current.formula_version === previous.formula_version,
    ...primary,
    collections,
  };
}
