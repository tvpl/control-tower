import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { Row } from "../cockpit/model";
import type { Feature, LandscapeGroup } from "./model";

/** Collapse features into their actual domain/situation group; edge IDs retain source records for inspection. */
export function relationshipGraph(
  s: Row,
  features: Feature[],
  groups: LandscapeGroup[],
  micro: boolean,
  connections: boolean,
  onFeature: (id: string) => void,
  onGroup: (id: string) => void,
) {
  const nodes: Node[] = micro
    ? features.map((f, i) => ({
        id: f.record.id,
        type: "feature",
        position: { x: (i % 3) * 450, y: Math.floor(i / 3) * 226 },
        width: 320,
        height: 204,
        style: { width: 320 },
        data: { feature: f, onOpen: () => onFeature(f.record.id) },
        ariaRole: "group",
        ariaLabel: `Feature ${f.record.code}`,
        focusable: false,
      }))
    : groups.map((g, i) => ({
        id: g.id,
        type: "domain",
        position: { x: (i % 3) * 450, y: Math.floor(i / 3) * 246 },
        width: 310,
        height: 220,
        style: { width: 310 },
        data: { group: g, onOpen: () => onGroup(g.id) },
        ariaRole: "group",
        ariaLabel: `Grupo ${g.name}`,
        focusable: false,
      }));
  const ids = new Set(nodes.map((n) => n.id)),
    edges: Edge[] = [];
  if (micro)
    for (const f of features)
      if (f.record.parent_id && ids.has(f.record.parent_id))
        edges.push({
          id: `parent:${f.record.id}`,
          source: f.record.parent_id,
          target: f.record.id,
          label: "Subfeature",
          style: { stroke: "var(--muted)", strokeDasharray: "5 5" },
          labelStyle: { fill: "var(--text)", fontSize: 11 },
          labelBgStyle: { fill: "var(--surface)" },
        });
  if (connections) {
    const groupOf = new Map(
      groups.flatMap((g) =>
        g.features.map((f) => [f.record.id, g.id] as const),
      ),
    );
    const endpoint = (id: string): string[] => {
      const node = s.nodes.find((n: Row) => n.id === id);
      if (!node) return [];
      return [
        ...new Set(
          features
            .filter((f) =>
              node.entity_type === "capabilities"
                ? f.record.id === node.entity_id
                : node.entity_type === "deliverables" &&
                  f.items.some((d) => d.id === node.entity_id),
            )
            .map((f) => (micro ? f.record.id : groupOf.get(f.record.id)!)),
        ),
      ];
    };
    const pairs = new Map<
      string,
      { source: string; target: string; ids: Set<string>; blocked: boolean }
    >();
    for (const d of s.dependencies || [])
      for (const source of endpoint(d.source_node_id))
        for (const target of endpoint(d.target_node_id))
          if (source !== target) {
            const key = `${source}|${target}`,
              pair = pairs.get(key) || {
                source,
                target,
                ids: new Set<string>(),
                blocked: false,
              };
            pair.ids.add(d.id);
            pair.blocked ||= d.status === "BLOCKED";
            pairs.set(key, pair);
          }
    for (const [id, p] of pairs)
      edges.push({
        id: `dep:${id}`,
        source: p.source,
        target: p.target,
        label: `${p.ids.size} vínculo${p.ids.size > 1 ? "s" : ""}${p.blocked ? " · bloqueio" : ""}`,
        style: {
          stroke: p.blocked ? "var(--red)" : "var(--blue)",
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: p.blocked ? "var(--red)" : "var(--blue)",
        },
        labelStyle: { fill: "var(--text)", fontSize: 11 },
        labelBgStyle: { fill: "var(--surface)" },
        data: { dependencyIds: [...p.ids] },
      });
  }
  // Keep connected groups in dependency order instead of drawing through an alphabetic grid.
  if (edges.length) {
    const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
    const ranks = new Map(nodes.map((n) => [n.id, 0]));
    const indegree = new Map(
      nodes.map((n) => [n.id, edges.filter((e) => e.target === n.id).length]),
    );
    const queue = nodes
      .filter((n) => connected.has(n.id) && !indegree.get(n.id))
      .map((n) => n.id);
    while (queue.length) {
      const id = queue.shift()!;
      for (const edge of edges.filter((e) => e.source === id)) {
        ranks.set(
          edge.target,
          Math.max(ranks.get(edge.target) || 0, (ranks.get(id) || 0) + 1),
        );
        indegree.set(edge.target, indegree.get(edge.target)! - 1);
        if (!indegree.get(edge.target)) queue.push(edge.target);
      }
    }
    const lanes = new Map<number, number>();
    for (const node of nodes.filter((n) => connected.has(n.id))) {
      const column = ranks.get(node.id) || 0,
        lane = lanes.get(column) || 0;
      node.position = { x: column * 450, y: lane * 246 };
      lanes.set(column, lane + 1);
    }
    const top = Math.max(...lanes.values()) * 246 + 40;
    const columns = Math.max(3, Math.min(4, Math.max(...ranks.values()) + 1));
    nodes
      .filter((n) => !connected.has(n.id))
      .forEach((node, i) => {
        node.position = {
          x: (i % columns) * 450,
          y: top + Math.floor(i / columns) * 246,
        };
      });
  }
  return { nodes, edges };
}
