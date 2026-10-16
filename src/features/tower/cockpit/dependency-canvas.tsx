"use client";
import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch, Expand, ArrowUpRight } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import {
  acceptance,
  featureDeliverables,
  priorityRank,
  type Row,
  type Select,
} from "./model";
function MetricNode({ data }: NodeProps) {
  const r = data.record as Row,
    m = data.metric as ReturnType<typeof acceptance>;
  return (
    <div
      className={`ct-flow-node ${data.blocked ? "blocked" : ""} ${data.context ? "context" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="ct-node-heading">
        <small>
          {data.rank ? `#${data.rank} · ` : ""}
          {r.code || (data.kind as string)}
        </small>
        <span>
          {data.context
            ? "CONTEXTO"
            : data.kind === "capabilities"
              ? "FEATURE"
              : "ENTREGA"}
        </span>
      </div>
      <strong>{r.name || r.title}</strong>
      {m && (
        <div className="ct-node-progress">
          <span>
            <i style={{ width: `${m.percentage || 0}%` }} />
          </span>
          <b>{m.percentage == null ? "—" : `${m.percentage}%`}</b>
          <small>
            {m.accepted}/{m.total}
          </small>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { metric: MetricNode };
export function DependencyCanvas({
  s,
  ds,
  micro,
  focusId,
  onFeature,
  select,
}: {
  s: Row;
  ds: Row[];
  micro: boolean;
  focusId: string;
  onFeature: (id: string) => void;
  select: Select;
}) {
  const [edgeIds, setEdgeIds] = useState<string[] | null>(null),
    [large, setLarge] = useState(false),
    [showIsolated, setShowIsolated] = useState(false);
  const graph = useMemo(() => {
    const byId = new Map<string, Row>(s.nodes.map((n: Row) => [n.id, n]));
    const included = new Set(ds.map((d) => d.id));
    const baseNodes: Row[] = micro
      ? s.nodes.filter(
          (n: Row) =>
            n.entity_type === "deliverables" && included.has(n.entity_id),
        )
      : s.nodes.filter(
          (n: Row) =>
            n.entity_type === "capabilities" &&
            featureDeliverables(s, ds, n.entity_id).length,
        );
    const visible = new Map<string, Row>(baseNodes.map((n) => [n.id, n]));
    const endpoint = (id: string): string[] => {
      const n = byId.get(id);
      if (!n) return [];
      if (!micro && n.entity_type === "deliverables") {
        const caps = s.links
          .filter((l: Row) => l.deliverable_id === n.entity_id)
          .map((l: Row) =>
            s.nodes.find(
              (node: Row) =>
                node.entity_type === "capabilities" &&
                node.entity_id === l.capability_id,
            ),
          )
          .filter(Boolean);
        if (caps.length) {
          for (const c of caps) visible.set(c.id, c);
          return caps.map((c: Row) => c.id);
        }
      }
      visible.set(id, n);
      return [id];
    };
    const relevant = s.dependencies.filter((dep: Row) =>
      [dep.source_node_id, dep.target_node_id].some((id) => {
        const n = byId.get(id);
        return n && (included.has(n.entity_id) || (!micro && visible.has(id)));
      }),
    );
    const pairs = new Map<
      string,
      { source: string; target: string; ids: string[]; blocked: number }
    >();
    for (const d of relevant)
      for (const source of endpoint(d.source_node_id))
        for (const target of endpoint(d.target_node_id)) {
          const key = `${source}:${target}`,
            pair = pairs.get(key) || { source, target, ids: [], blocked: 0 };
          if (!pair.ids.includes(d.id)) {
            pair.ids.push(d.id);
            pair.blocked += d.status === "BLOCKED" ? 1 : 0;
          }
          pairs.set(key, pair);
        }
    const connected = new Set(
      [...pairs.values()].flatMap((p) => [p.source, p.target]),
    );
    const isolated = [...visible.keys()].filter(
      (id) => !connected.has(id),
    ).length;
    const nodesRaw = [...visible.values()]
      .filter((n) => showIsolated || connected.has(n.id))
      .sort(
        (a, b) =>
          (priorityRank(s, a.entity_type, a.entity_id) ?? 1e8) -
            (priorityRank(s, b.entity_type, b.entity_id) ?? 1e8) ||
          a.entity_id.localeCompare(b.entity_id),
      );
    // Topological columns; cycles retain a bounded fallback column rather than looping.
    const ranks = new Map(nodesRaw.map((n) => [n.id, 0]));
    const indegree = new Map(nodesRaw.map((n) => [n.id, 0]));
    for (const p of pairs.values())
      if (p.source !== p.target)
        indegree.set(p.target, (indegree.get(p.target) || 0) + 1);
    const queue = nodesRaw.filter((n) => !indegree.get(n.id)).map((n) => n.id);
    while (queue.length) {
      const id = queue.shift()!;
      for (const p of pairs.values())
        if (p.source === id && p.target !== id) {
          ranks.set(
            p.target,
            Math.max(ranks.get(p.target) || 0, (ranks.get(id) || 0) + 1),
          );
          indegree.set(p.target, (indegree.get(p.target) || 0) - 1);
          if (!indegree.get(p.target)) queue.push(p.target);
        }
    }
    const maxColumnCount = Math.max(
      1,
      ...[...ranks.values()].map(
        (rank) => nodesRaw.filter((n) => ranks.get(n.id) === rank).length,
      ),
    );
    const rowHeight = Math.max(150, maxColumnCount * 136);
    const lanes = new Map<number, number>();
    const nodes = nodesRaw.map((n) => {
      const record = s[n.entity_type]?.find(
        (r: Row) => r.id === n.entity_id,
      ) || { name: n.entity_type, code: "?" };
      const col = !connected.has(n.id)
          ? 3 +
            Math.floor(
              nodesRaw
                .filter((v) => !connected.has(v.id))
                .findIndex((v) => v.id === n.id) / 5,
            )
          : ranks.get(n.id) || 0,
        lane = lanes.get(col) || 0;
      lanes.set(col, lane + 1);
      const linked =
        n.entity_type === "capabilities"
          ? featureDeliverables(s, ds, n.entity_id)
          : ds.filter((d) => d.id === n.entity_id);
      return {
        id: n.id,
        type: "metric",
        position: {
          x: (col % 2) * 300,
          y: Math.floor(col / 2) * rowHeight + lane * 136,
        },
        data: {
          record,
          kind: n.entity_type,
          metric: ["capabilities", "deliverables"].includes(n.entity_type)
            ? acceptance(
                linked.length
                  ? linked
                  : n.entity_type === "deliverables"
                    ? [record]
                    : [],
              )
            : null,
          rank: priorityRank(s, n.entity_type, n.entity_id),
          blocked:
            relevant.some(
              (d: Row) => d.status === "BLOCKED" && d.target_node_id === n.id,
            ) || linked.some((d) => d.execution_status === "BLOCKED"),
          context: !baseNodes.some((b) => b.id === n.id),
        },
        ariaLabel: `${record.code} ${record.name || record.title}`,
        style: { width: 230 },
      };
    });
    const edges = [...pairs.entries()].map(([key, p]) => ({
      id: key,
      source: p.source,
      target: p.target,
      label: p.blocked
        ? p.blocked === p.ids.length
          ? `${p.blocked} bloqueada${p.blocked > 1 ? "s" : ""}`
          : `${p.blocked}/${p.ids.length} bloq.`
        : `${p.ids.length} vínculo${p.ids.length > 1 ? "s" : ""}`,
      data: { ids: p.ids },
      style: {
        stroke: p.blocked
          ? "var(--chart-blocked, #dc9e62)"
          : "var(--chart-done, #65cbb0)",
        strokeWidth: p.blocked ? 2 : 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: p.blocked
          ? "var(--chart-blocked, #dc9e62)"
          : "var(--chart-done, #65cbb0)",
      },
      labelStyle: { fill: "var(--text)", fontSize: 10 },
      labelBgStyle: { fill: "var(--surface)" },
      labelBgPadding: [5, 4] as [number, number],
    }));
    return { nodes, edges, count: relevant.length, isolated };
  }, [s, ds, micro, showIsolated]);
  const canvas = (expanded: boolean) => (
    <div
      className={`ct-graph ${expanded ? "enlarged" : ""}`}
      role="region"
      aria-label="Grafo interativo de dependências"
    >
      <ReactFlow
        key={`${micro}-${focusId}-${expanded}-${showIsolated}`}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.15}
        onNodeClick={(_, n) => {
          const node = s.nodes.find((r: Row) => r.id === n.id);
          if (node.entity_type === "capabilities") {
            if (expanded) setLarge(false);
            onFeature(node.entity_id);
          } else {
            const record = s[node.entity_type]?.find(
              (r: Row) => r.id === node.entity_id,
            );
            if (record) {
              setLarge(false);
              select(node.entity_type, record);
            }
          }
        }}
        onEdgeClick={(_, e) => {
          setLarge(false);
          setEdgeIds(e.data?.ids as string[]);
        }}
      >
        <Background color="var(--line)" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {!graph.nodes.length && (
        <p className="ct-graph-empty">
          Sem dependências neste recorte. Ative “Sem vínculos” para ver também
          os itens isolados.
        </p>
      )}
    </div>
  );
  return (
    <section className="ct-panel ct-dependencies">
      <header>
        <div>
          <GitBranch size={15} />
          <h2>Grafo de dependências</h2>
        </div>
        <div className="ct-graph-actions">
          <button
            className="ct-small-button"
            aria-pressed={showIsolated}
            onClick={() => setShowIsolated((v) => !v)}
          >
            Sem vínculos ({graph.isolated})
          </button>
          <button className="ct-small-button" onClick={() => setLarge(true)}>
            <Expand size={13} />
            Ampliar
          </button>
        </div>
      </header>
      {canvas(false)}
      <footer>
        <span>
          <i className="ct-legend jade" />
          Dependência <i className="ct-legend amber" />
          Bloqueio
        </span>
        <span>
          {graph.count} vínculos · pré-requisito → dependente ·{" "}
          {micro ? "entregáveis" : "features agrupam vínculos reais"}
        </span>
      </footer>
      <Modal
        open={large}
        onClose={() => setLarge(false)}
        wide
        title="Explorar dependências"
        description="Arraste a área para navegar, use o zoom e clique nas setas para inspecionar os vínculos."
      >
        {canvas(true)}
      </Modal>
      <Modal
        open={edgeIds !== null}
        onClose={() => setEdgeIds(null)}
        title="Dependências desta conexão"
        description="Cada vínculo abaixo é uma dependência cadastrada; agrupamentos entre features podem conter mais de um vínculo."
      >
        {s.dependencies
          .filter((d: Row) => edgeIds?.includes(d.id))
          .map((d: Row) => (
            <button
              className="ct-dep-item"
              key={d.id}
              onClick={() => {
                setEdgeIds(null);
                select("dependencies", d);
              }}
            >
              <strong>{d.description || d.dependency_type}</strong>
              <span>
                {d.status} · {d.dependency_type}
                <ArrowUpRight size={14} />
              </span>
            </button>
          ))}
      </Modal>
    </section>
  );
}
