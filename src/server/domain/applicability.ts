export type Row = Record<string, any>;
export function ruleMatches(rule: Row, d: Row) {
  return [
    ["layers", "layer"],
    ["types", "deliverable_type"],
    ["criticalities", "criticality"],
    ["workstream_ids", "workstream_id"],
  ].every(([key, field]) => !rule[key]?.length || rule[key].includes(d[field]));
}
export function applicability(d: Row, gates: Row[], profiles: Row[] = []) {
  const active = profiles.filter((p) => p.active);
  const matches = active.filter((p) => ruleMatches(p.rule, d));
  const allowed = new Set(matches.flatMap((p) => p.gate_ids));
  const selected = gates.filter(
    (g) =>
      (!profiles.length || allowed.has(g.id)) &&
      ruleMatches(g.applicability_rule || {}, d),
  );
  // A stable, inspectable context binds approval to the rule versions used, never to inferred completion.
  const contextKey = profiles.length
    ? JSON.stringify({
        profiles: matches
          .map((p) => [p.id, p.version])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        catalog: profiles
          .map((p) => [p.id, p.version, p.active])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        classification: [
          d.layer,
          d.deliverable_type,
          d.workstream_id,
          d.criticality,
        ],
      })
    : null;
  return {
    gates: selected,
    contextKey,
    profileIds: matches.map((p) => p.id),
    unknown:
      selected.filter((g) => g.blocking).length === 0 ||
      (!!profiles.length && !matches.length),
  };
}
export function contextualAssessment(a: Row, contextKey: string | null): Row {
  const stale = contextKey !== null && a.context_key !== contextKey;
  return {
    ...a,
    stale_context: stale,
    result: stale ? "NOT_ASSESSED" : a.result,
  };
}
