type Row = Record<string, any>;
/** Explicit markers only; ambiguous matches always require a human choice. */
export function gitLabCandidates(item: Row, nodes: Row[], s: Row): string[] {
  const tags = (item.labels || []).map((v: string) => v.toLowerCase());
  const titleTags = [
    ...String(item.title || "").matchAll(/\[mct:([a-z0-9_-]+)\]/gi),
  ].map((m) => `mct:${m[1].toLowerCase()}`);
  const markers = new Set([...tags, ...titleTags]);
  return nodes
    .filter((n) => {
      const record = s[n.entity_type]?.find((r: Row) => r.id === n.entity_id);
      return record?.code && markers.has(`mct:${record.code.toLowerCase()}`);
    })
    .map((n) => n.id);
}
