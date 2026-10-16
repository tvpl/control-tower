"use client";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  MessageSquare,
  Box,
  ArrowUpRight,
} from "lucide-react";
import { label } from "../metadata";
import {
  acceptance,
  featureDeliverables,
  priorityRank,
  type Row,
  type Select,
} from "./model";
export function Progress({ ds }: { ds: Row[] }) {
  const m = acceptance(ds);
  return (
    <span className="ct-progress">
      <span className="ct-progress-track" aria-hidden="true">
        <i style={{ width: `${m.percentage || 0}%` }} />
      </span>
      <b>{m.percentage === null ? "—" : `${m.percentage}%`}</b>
      <small>
        {m.accepted}/{m.total}
      </small>
    </span>
  );
}
export function ProjectExplorer({
  s,
  deliverables,
  expanded,
  toggle,
  focusId,
  onFocus,
  select,
  onNotes,
  micro,
}: {
  s: Row;
  deliverables: Row[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  focusId: string;
  onFocus: (id: string) => void;
  select: Select;
  onNotes: (node: string | null) => void;
  micro: boolean;
}) {
  const ordered = [...s.capabilities].sort(
    (a, b) =>
      (priorityRank(s, "capabilities", a.id) ?? 1e8) -
        (priorityRank(s, "capabilities", b.id) ?? 1e8) ||
      a.code.localeCompare(b.code),
  );
  const filtered = ordered.filter(
    (c) =>
      deliverables.length === s.deliverables.length ||
      featureDeliverables(s, deliverables, c.id).length > 0,
  );
  const renderFeature = (c: Row, depth = 0): React.ReactNode => {
    const ds = featureDeliverables(s, deliverables, c.id),
      children = filtered.filter((c2) => c2.parent_id === c.id);
    const node = s.nodes.find(
      (n: Row) => n.entity_type === "capabilities" && n.entity_id === c.id,
    );
    const count = s.observations.filter(
      (n: Row) => n.subject_node_id === node?.id,
    ).length;
    const rank = priorityRank(s, "capabilities", c.id),
      open = expanded.has(c.id);
    const directIds = new Set(
      s.links
        .filter((l: Row) => l.capability_id === c.id)
        .map((l: Row) => l.deliverable_id),
    );
    return (
      <div key={c.id}>
        <div
          className={`ct-feature-row ${focusId === c.id ? "selected" : ""}`}
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          <button
            className="ct-expand"
            aria-label={`${open ? "Recolher" : "Expandir"} ${c.name}`}
            aria-expanded={open}
            onClick={() => toggle(c.id)}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            className="ct-feature-name"
            onClick={() => onFocus(c.id)}
            title={`Explorar ${c.name}`}
          >
            <span>
              <small>
                {rank ? `#${rank} · ` : ""}
                {c.code}
              </small>
              <strong>{c.name}</strong>
            </span>
          </button>
          <Progress ds={ds} />
          <button
            className="ct-expand"
            aria-label={`Observações de ${c.name}${count ? ` (${count})` : ""}`}
            onClick={() => onNotes(node?.id || null)}
          >
            <MessageSquare size={14} />
            {count > 0 && <sup>{count}</sup>}
          </button>
        </div>
        {open && (
          <div className="ct-children">
            {children.map((child) => renderFeature(child, depth + 1))}
            {deliverables
              .filter((d) => directIds.has(d.id))
              .map((d) => (
                <div
                  className="ct-delivery-row"
                  key={d.id}
                  style={{ paddingLeft: 38 + depth * 14 }}
                >
                  <Box size={12} />
                  <button onClick={() => select("deliverables", d)}>
                    <small>{d.code}</small>
                    <span>{d.name}</span>
                  </button>
                  <span
                    className={`ct-status-dot ${d.accepted ? "accepted" : d.execution_status === "BLOCKED" ? "blocked" : ""}`}
                    title={d.accepted ? "Aceito" : d.execution_status}
                  />
                  <span className="ct-delivery-status">
                    {d.accepted
                      ? "Aceito"
                      : d.execution_status === "DONE"
                        ? "Concluído"
                        : d.execution_status === "BLOCKED"
                          ? "Bloqueado"
                          : label(d.execution_status)}
                  </span>
                  <button
                    className="ct-expand"
                    aria-label={`Observações de ${d.name}`}
                    onClick={() =>
                      onNotes(
                        s.nodes.find(
                          (n: Row) =>
                            n.entity_type === "deliverables" &&
                            n.entity_id === d.id,
                        )?.id || null,
                      )
                    }
                  >
                    <MessageSquare size={12} />
                  </button>
                </div>
              ))}
            {!ds.length && !children.length && (
              <p className="ct-empty">Sem entregáveis vinculados.</p>
            )}
          </div>
        )}
      </div>
    );
  };
  const unlinked = deliverables.filter(
    (d) => !s.links.some((l: Row) => l.deliverable_id === d.id),
  );
  return (
    <section className="ct-panel ct-explorer">
      <header>
        <div>
          <Layers size={15} />
          <h2>Projeto → features</h2>
        </div>
        <span>{s.capabilities.length} features</span>
      </header>
      <button
        className={`ct-project-row ${!focusId ? "selected" : ""}`}
        onClick={() => onFocus("")}
      >
        <Layers size={16} />
        <strong>{s.programs[0]?.name}</strong>
        <Progress ds={deliverables} />
      </button>
      <div
        className="ct-tree"
        role="region"
        aria-label="Features e entregáveis"
        tabIndex={0}
      >
        {filtered
          .filter(
            (c) => !c.parent_id || !filtered.some((p) => p.id === c.parent_id),
          )
          .map((c) => renderFeature(c))}
        {!filtered.length && (
          <p className="ct-empty">Nenhuma feature neste recorte.</p>
        )}
        {unlinked.length > 0 && (
          <details className="ct-unlinked">
            <summary>{unlinked.length} entregáveis sem feature</summary>
            {unlinked.map((d) => (
              <button key={d.id} onClick={() => select("deliverables", d)}>
                {d.code} · {d.name}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </details>
        )}
      </div>
      <footer>
        {micro
          ? "Micro: selecione uma feature para isolar suas entregas."
          : "Clique para focar · expanda para ver os entregáveis."}
        <span>
          Feature = capacidade · aceite por contagem · vínculos compartilhados
          deduplicados no projeto.
        </span>
      </footer>
    </section>
  );
}
