"use client";
import { useState } from "react";
import { useVirtualWindow } from "./virtual-window";
import { canEdit } from "@/server/domain/rules";
import { deliverableReadiness } from "@/server/domain/readiness";
import { Background, Controls, MarkerType, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileBarChart2,
  Grid2X2,
  History,
  Network,
  Plug,
  Plus,
  Search,
  ShieldCheck,
  Target,
} from "lucide-react";
import { api, download } from "./client";
import { ContractPortfolio } from "./governance/contract-portfolio";
import type { Kind } from "@/server/domain/schemas";
import { programLayerCodes } from "./filtering";
import { applicability } from "@/server/domain/applicability";
import { ReportWorkspace } from "./reporting/report-workspace";
import { Baselines } from "./baselines";
import { DataTable } from "./data-table";
import { FeatureLandscape } from "./management/feature-landscape";
import { nodeName } from "./forms";
import { label, TITLES } from "./metadata";
import { Badge, Empty, fmt, fullDate, genericColumns } from "./presentation";
type Row = Record<string, any>;
type User = { id: string; name: string; email: string };
export function CapabilityMap({
  s,
  deliverables,
  domain,
  stream,
  search,
  restrictToDeliverables = false,
  setSearch,
  select,
}: {
  s: Row;
  deliverables: Row[];
  domain: string;
  stream: string;
  search: string;
  restrictToDeliverables?: boolean;
  setSearch: (v: string) => void;
  select: (kind: string, r: Row) => void;
}) {
  const [visual, setVisual] = useState(false);
  const caps = s.capabilities.filter(
    (c: Row) =>
      (!domain || c.domain_id === domain) &&
      (!(stream || restrictToDeliverables) ||
        s.links.some(
          (l: Row) =>
            l.capability_id === c.id &&
            deliverables.some((d) => d.id === l.deliverable_id),
        )) &&
      `${c.code} ${c.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const windowed = useVirtualWindow(caps.length, 112, 600);
  const displayed = caps.slice(windowed.start, windowed.end);
  if (visual)
    return (
      <>
        <div className="section-toolbar">
          <div className="view-tabs">
            <button onClick={() => setVisual(false)}>
              <Grid2X2 size={14} /> Matriz de capacidades{" "}
              <span>{caps.length}</span>
            </button>
            <button className="selected" aria-pressed="true">
              <Network size={14} /> Mapa visual de features
            </button>
          </div>
        </div>
        <FeatureLandscape
          s={s}
          ds={deliverables}
          capabilities={caps}
          select={select}
        />
      </>
    );
  return (
    <>
      <div className="section-toolbar">
        <div className="view-tabs">
          <button className="selected">
            <Grid2X2 size={14} />
            Matriz de capacidades <span>{caps.length}</span>
          </button>
          <button onClick={() => setVisual(true)}>
            <Network size={14} /> Mapa visual de features
          </button>
        </div>
        <div className="inline-search">
          <Search size={14} />
          <input
            placeholder="Buscar capacidade…"
            aria-label="Buscar capacidade"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="map-legend">
          <span>
            <i className="legend-dot green" />
            Aceito
          </span>
          <span>
            <i className="legend-dot blue" />
            Em execução
          </span>
          <span>
            <i className="legend-dot amber-bg" />
            Bloqueado
          </span>
          <span>
            <i className="legend-dot muted-dot" />
            Não avaliado
          </span>
        </div>
      </div>
      {windowed.controls}
      <div
        id={windowed.id}
        onScroll={windowed.onScroll}
        className={`capability-matrix ${windowed.virtual ? "matrix-virtual-scroll" : ""}`}
      >
        <table>
          <thead>
            <tr>
              <th>CAPACIDADE DE NEGÓCIO</th>
              {programLayerCodes(s).map((l) => (
                <th key={l}>
                  {label(l)}
                  <small>{l}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {windowed.top > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={programLayerCodes(s).length + 1}
                  style={{ height: windowed.top, padding: 0 }}
                />
              </tr>
            )}
            {windowed.virtual
              ? displayed.map((c: Row) => (
                  <DomainRows
                    key={c.id}
                    domain={
                      s.domains.find((d: Row) => d.id === c.domain_id) || {}
                    }
                    caps={[c]}
                    s={s}
                    deliverables={deliverables}
                    select={select}
                    compact
                  />
                ))
              : s.domains.map((d: Row) => {
                  const group = displayed.filter(
                    (c: Row) => c.domain_id === d.id,
                  );
                  return group.length ? (
                    <DomainRows
                      key={d.id}
                      domain={d}
                      caps={group}
                      s={s}
                      deliverables={deliverables}
                      select={select}
                    />
                  ) : null;
                })}
            {windowed.bottom > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={programLayerCodes(s).length + 1}
                  style={{ height: windowed.bottom, padding: 0 }}
                />
              </tr>
            )}
          </tbody>
        </table>
        {!caps.length && (
          <Empty text="Nenhuma capacidade corresponde aos filtros." />
        )}
      </div>
      <div className="matrix-footnote">
        <span>
          <Target size={14} />
          {caps.length} capacidades · {s.domains.length} domínios registrados
        </span>
        <span>
          Ausência de entregável = não avaliado. N/A exige justificativa e
          aprovação.
        </span>
      </div>
    </>
  );
}
function DomainRows({
  compact = false,
  domain,
  caps,
  s,
  deliverables,
  select,
}: {
  compact?: boolean;
  domain: Row;
  caps: Row[];
  s: Row;
  deliverables: Row[];
  select: (k: string, r: Row) => void;
}) {
  return (
    <>
      <tr className="domain-row">
        <td
          colSpan={programLayerCodes(s).length + 1}
          style={compact ? { height: 36, padding: "4px 12px" } : undefined}
        >
          <span className="mono">{domain.code}</span>
          <strong>{domain.name}</strong>
          <span className="count-badge">{caps.length}</span>
          <span className="domain-maturity">
            {label(domain.inventory_maturity)}
          </span>
        </td>
      </tr>
      {caps.map((c) => (
        <tr key={c.id} className={compact ? "matrix-virtual-row" : ""}>
          <td>
            <button
              className="capability-name"
              onClick={() => select("capabilities", c)}
            >
              <span className="mono muted">{c.code}</span>
              <strong>{c.name}</strong>
              <ChevronRight size={13} />
            </button>
          </td>
          {programLayerCodes(s).map((layer) => {
            const ds = deliverables.filter(
              (d) =>
                d.layer === layer &&
                s.links.some(
                  (l: Row) =>
                    l.capability_id === c.id && l.deliverable_id === d.id,
                ),
            );
            const state = !ds.length
              ? "NOT_ASSESSED"
              : ds.some((d) => d.execution_status === "BLOCKED")
                ? "BLOCKED"
                : ds.every((d) => d.accepted)
                  ? "PASSED"
                  : ds.some((d) => d.delivery_stage === "UAT")
                    ? "UAT"
                    : ds.some((d) => d.execution_status === "IN_PROGRESS")
                      ? "IN_PROGRESS"
                      : ds.every((d) => d.execution_status === "DONE")
                        ? "DONE"
                        : "NOT_STARTED";
            return (
              <td key={layer}>
                <button
                  className={`matrix-cell state-${state}`}
                  aria-label={`${c.name}, ${label(layer)}, ${label(state)}, ${ds.length} entregáveis`}
                  onClick={() =>
                    select("cell", {
                      capability: c,
                      layer,
                      deliverables: ds,
                      name: `${c.name} · ${label(layer)}`,
                    })
                  }
                >
                  {!ds.length ? (
                    <span>—</span>
                  ) : (
                    <>
                      <span className="cell-dots">
                        {ds.slice(0, 12).map((d) => (
                          <i key={d.id} />
                        ))}
                      </span>
                      <span>
                        {state === "PASSED" ? (
                          <Check size={11} />
                        ) : state === "BLOCKED" ? (
                          <AlertTriangle size={11} />
                        ) : (
                          <span>
                            {ds.filter((d) => d.accepted).length}/{ds.length}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

export function Architecture({
  s,
  select,
  domain,
  onCreate,
}: {
  s: Row;
  select: (k: string, r: Row, records?: Row[]) => void;
  domain: string;
  onCreate: (kind: Kind) => void;
}) {
  const components = s.components.filter(
    (c: Row) =>
      !domain ||
      s.componentLinks.some(
        (l: Row) =>
          l.component_id === c.id &&
          s.capabilities.some(
            (cap: Row) =>
              cap.id === l.capability_id && cap.domain_id === domain,
          ),
      ),
  );
  const nodes = [
    ...s.capabilities
      .filter((c: Row) => !domain || c.domain_id === domain)
      .map((c: Row, i: number) => ({
        id: c.id,
        position: { x: 0, y: i * 95 },
        data: {
          label: (
            <div className="flow-label">
              <small>{c.code} · CAPACIDADE</small>
              <strong>{c.name}</strong>
            </div>
          ),
        },
        style: { width: 250 },
      })),
    ...components.map((c: Row, i: number) => ({
      id: c.id,
      position: { x: 410, y: i * 95 },
      data: {
        label: (
          <div className="flow-label">
            <small>{c.kind} · COMPONENTE</small>
            <strong>{c.name}</strong>
          </div>
        ),
      },
      style: { width: 260 },
    })),
  ];
  const edges = s.componentLinks
    .filter(
      (l: Row) =>
        nodes.some((n) => n.id === l.capability_id) &&
        nodes.some((n) => n.id === l.component_id),
    )
    .map((l: Row) => ({
      id: `${l.capability_id}-${l.component_id}`,
      source: l.capability_id,
      target: l.component_id,
      label: label(l.relation_type),
      style: { stroke: "#596671" },
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
  edges.push(
    ...s.contracts
      .filter(
        (c: Row) =>
          nodes.some((n) => n.id === c.source_component_id) &&
          nodes.some((n) => n.id === c.target_component_id),
      )
      .map((c: Row) => ({
        id: `contract-${c.id}`,
        source: c.source_component_id,
        target: c.target_component_id,
        label: `${c.protocol} · ${c.contract_version}`,
        style: {
          stroke:
            c.status === "APPROVED" ? "var(--accent-strong)" : "var(--amber)",
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
  );
  return (
    <>
      <div className="canvas-heading">
        <span>
          <Network size={16} />
          {nodes.length} nós · {edges.length} relações tipadas
        </span>
        <span>Selecione um nó para explorar o contexto</span>
      </div>
      <div className="graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.1}
          onEdgeClick={(_, edge) => {
            const contract = s.contracts.find(
              (c: Row) => `contract-${c.id}` === edge.id,
            );
            if (contract) select("contracts", contract);
          }}
          onNodeClick={(_, n) => {
            const c = s.capabilities.find((r: Row) => r.id === n.id);
            select(
              c ? "capabilities" : "components",
              c || s.components.find((r: Row) => r.id === n.id),
            );
          }}
        >
          <Background color="#39444e" gap={24} />
          <Controls />
        </ReactFlow>
      </div>
      <div className="section-toolbar">
        <h2>Catálogo de componentes</h2>
        <span className="muted small-text">
          Componentes compartilhados contam uma única vez
        </span>
      </div>
      <DataTable
        items={components}
        columns={genericColumns("components", s)}
        onSelect={(r, records) => select("components", r, records)}
      />
      <ContractPortfolio s={s} select={select} onCreate={onCreate} />
    </>
  );
}
export function DependencyGraph({
  s,
  select,
}: {
  s: Row;
  select: (k: string, r: Row) => void;
}) {
  const involved = new Set(
    s.dependencies.flatMap((d: Row) => [d.source_node_id, d.target_node_id]),
  );
  const nodes = s.nodes
    .filter((n: Row) => involved.has(n.id))
    .map((n: Row, i: number) => ({
      id: n.id,
      position: { x: i * 300, y: (i % 2) * 110 },
      data: {
        label: (
          <div className="flow-label">
            <small>{TITLES[n.entity_type]}</small>
            <strong>{nodeName(n, s)}</strong>
          </div>
        ),
      },
      style: { width: 245 },
    }));
  const edges = s.dependencies.map((d: Row) => ({
    id: d.id,
    source: d.source_node_id,
    target: d.target_node_id,
    label: label(d.dependency_type),
    style: { stroke: d.status === "BLOCKED" ? "#d9a366" : "#64d5b4" },
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
  return (
    <section className="panel dependency-graph">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ANÁLISE DE IMPACTO</span>
          <h2>Conexões que condicionam a entrega</h2>
        </div>
        <span className="muted small-text">
          Direção: pré-requisito → dependente
        </span>
      </div>
      <div className="graph-canvas compact">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onEdgeClick={(_, e) =>
            select(
              "dependencies",
              s.dependencies.find((d: Row) => d.id === e.id),
            )
          }
          onNodeClick={(_, n) => {
            const node = s.nodes.find((r: Row) => r.id === n.id);
            const record = s[node.entity_type]?.find(
              (r: Row) => r.id === node.entity_id,
            );
            if (record) select(node.entity_type, record);
          }}
        >
          <Background color="#39444e" gap={24} />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}

export function Delivery({
  s,
  release,
  select,
  operation,
  pid,
  busy,
  newMilestone,
  userId,
  onRefresh,
}: {
  s: Row;
  release: string;
  select: (k: string, r: Row) => void;
  operation: (f: () => Promise<unknown>, m: string) => void;
  pid: string;
  busy: boolean;
  newMilestone: () => void;
  userId: string;
  onRefresh: () => void;
}) {
  const rows = s.releases.filter((r: Row) => !release || r.id === release);
  const dates = s.milestones
    .flatMap((m: Row) => [m.baseline_date, m.forecast_date])
    .filter(Boolean)
    .map((v: string) => new Date(v).getTime());
  const min = Math.min(...dates) - 14 * 86400000,
    max = Math.max(...dates) + 14 * 86400000;
  const position = (date: string) =>
    ((new Date(date).getTime() - min) / (max - min)) * 100;
  return (
    <>
      <div className="section-toolbar">
        <div className="view-tabs">
          <button className="selected">
            Ondas & releases <span>{rows.length}</span>
          </button>
        </div>
        <button
          className="button small"
          disabled={!canEdit(s.roles, "milestones")}
          onClick={newMilestone}
        >
          <Plus size={14} />
          Marco
        </button>
      </div>
      <div className="timeline-panel">
        <div className="timeline-header">
          <span>RELEASE / COMPROMISSO</span>
          <div>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i}>
                {dates.length
                  ? fmt(new Date(min + ((max - min) * i) / 4).toISOString())
                  : "—"}
              </span>
            ))}
          </div>
        </div>
        {rows.map((r: Row) => {
          const ds = s.releaseLinks
            .filter((l: Row) => l.release_id === r.id)
            .map((l: Row) =>
              s.deliverables.find((d: Row) => d.id === l.deliverable_id),
            );
          const ms = s.milestones.filter((m: Row) => m.release_id === r.id);
          return (
            <div className="timeline-row" key={r.id}>
              <button
                className="release-title"
                onClick={() => select("releases", r)}
              >
                <span className="mono">{r.code}</span>
                <strong>{r.name}</strong>
                <small>
                  {ds.length} entregáveis · {label(r.status)}
                </small>
              </button>
              <div className="timeline-track">
                {ms.map((m: Row) => (
                  <button
                    className="timeline-mark"
                    key={m.id}
                    onClick={() => select("milestones", m)}
                    style={{
                      left: `${position(m.baseline_date || m.forecast_date)}%`,
                      width: `${Math.max(2, Math.abs(position(m.forecast_date) - position(m.baseline_date)))}%`,
                    }}
                    title={`${m.name}: referência ${fmt(m.baseline_date)} / forecast ${fmt(m.forecast_date)}`}
                  >
                    <span className="baseline-mark" />
                    <span className="forecast-mark" />
                    <small>{fmt(m.forecast_date)}</small>
                  </button>
                ))}
              </div>
              <Badge
                value={
                  r.forecast_date &&
                  r.planned_date &&
                  r.forecast_date > r.planned_date
                    ? "AT_RISK"
                    : "PLANNED"
                }
              />
            </div>
          );
        })}
        {!rows.length && <Empty />}
        <div className="timeline-legend">
          <span>◇ Referência de marco</span>
          <span>◆ Forecast</span>
          <span>
            Referência de release não substitui baseline aprovada de
            entregáveis.
          </span>
        </div>
      </div>
      <Baselines s={s} pid={pid} userId={userId} onSaved={onRefresh} />
      <div className="policy-note">
        <Clock size={19} />
        <p>
          Forecast é uma previsão mutável com justificativa. Baseline é um
          compromisso aprovado e preservado. Datas reais de conclusão exigem
          evidência.
        </p>
      </div>
    </>
  );
}
export function Readiness({
  s,
  release,
  select,
  assessGate,
}: {
  s: Row;
  release: string;
  select: (k: string, r: Row) => void;
  assessGate: (v: any) => void;
}) {
  const ds = s.deliverables.filter(
    (d: Row) =>
      !release ||
      s.releaseLinks.some(
        (l: Row) => l.release_id === release && l.deliverable_id === d.id,
      ),
  );
  const approver = s.roles.some((r: Row) => r.role === "GATE_APPROVER");
  const selectionReadiness = deliverableReadiness(
    ds,
    s.nodes,
    s.gates,
    s.assessments,
    s.links,
    s.capabilities,
    s.dodProfiles || [],
  );
  return (
    <>
      <div className="readiness-summary">
        <div>
          <ShieldCheck size={22} />
          <div>
            <strong>{label(selectionReadiness.status)}</strong>
            <p>
              {selectionReadiness.blockingGates} gates impeditivos não
              satisfeitos nesta seleção · {selectionReadiness.unapprovedScope}{" "}
              escopos sem aprovação.
            </p>
          </div>
        </div>
        <span>
          Aceite de negócio + gates + autorização de release → produção
        </span>
      </div>
      <div className="readiness-table table-wrap">
        <table>
          <thead>
            <tr>
              <th>ENTREGÁVEL</th>
              {s.gates.map((g: Row) => (
                <th key={g.id}>
                  {g.name}
                  <small>
                    {g.category} · v{g.version}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ds.map((d: Row) => {
              const node = s.nodes.find(
                (n: Row) =>
                  n.entity_id === d.id && n.entity_type === "deliverables",
              );
              return (
                <tr key={d.id}>
                  <td>
                    <button
                      className="record-title row-link"
                      onClick={() => select("deliverables", d)}
                    >
                      <span className="mono muted">{d.code}</span>
                      <strong>{d.name}</strong>
                    </button>
                  </td>
                  {s.gates.map((g: Row) => {
                    const applicable = applicability(
                      d,
                      s.gates,
                      s.dodProfiles || [],
                    ).gates.some((gate) => gate.id === g.id);
                    if (!applicable)
                      return (
                        <td key={g.id}>
                          <span className="muted">Fora do perfil</span>
                        </td>
                      );
                    const a = s.effectiveAssessments.find(
                      (a: Row) =>
                        a.subject_node_id === node?.id && a.gate_id === g.id,
                    );
                    const expired =
                      a?.result === "EXCEPTION_APPROVED" &&
                      new Date(a.expires_at) < new Date();
                    return (
                      <td key={g.id}>
                        <button
                          className="gate-cell"
                          disabled={!approver}
                          onClick={() =>
                            assessGate({
                              subject: node,
                              gate: g,
                              assessment: a,
                            })
                          }
                          aria-label={`Avaliar ${g.name} de ${d.code}`}
                        >
                          <Badge
                            value={
                              expired ? "FAILED" : a?.result || "NOT_ASSESSED"
                            }
                          />
                          {(a?.stale_criterion || a?.stale_context) && (
                            <small>Critério mudou; reavaliar</small>
                          )}
                          {a?.assessed_at && (
                            <small>{fmt(a.assessed_at)}</small>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="policy-note">
        <ShieldCheck size={20} />
        <p>
          Critérios e perfis são versionados por programa. Fora do perfil não
          significa N/A aprovado. Sem perfil aplicável, a prontidão permanece
          não avaliada. N/A exige avaliação e justificativa. Exceção expirada
          reabre bloqueio. Critério atualizado exige reavaliação. Administrador
          não pode aprovar gates sem alçada.
        </p>
      </div>
    </>
  );
}
export function Reports({
  s,
  select,
  pid,
  userId,
  onSaved,
}: {
  s: Row;
  select: (k: string, r: Row) => void;
  pid: string;
  userId: string;
  onSaved: () => void;
}) {
  const [exportError, setExportError] = useState("");
  return (
    <>
      <ReportWorkspace s={s} pid={pid} userId={userId} onSaved={onSaved} />
      {exportError && (
        <p className="error" role="alert">
          {exportError}
        </p>
      )}
      <div className="section-toolbar">
        <span className="muted">
          {s.snapshots.length} observações preservadas · hash SHA-256 · fórmula
          versionada
        </span>
      </div>
      <div className="reports-list">
        {!s.snapshots.length ? (
          <Empty text="Crie um snapshot para gerar um relatório reproduzível do estado do programa." />
        ) : (
          s.snapshots.map((snap: Row, i: number) => {
            const m = snap.payload.metrics;
            const previous =
              s.snapshots[i + 1]?.formula_version === snap.formula_version
                ? s.snapshots[i + 1]?.payload.metrics
                : null;
            return (
              <article className="panel snapshot" key={snap.id}>
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">SNAPSHOT OBSERVADO</span>
                    <h2>{fullDate(snap.as_of, s.programs?.[0]?.timezone)}</h2>
                  </div>
                  <span className="mono muted">{snap.formula_version}</span>
                </div>
                <div className="snapshot-metrics">
                  <div>
                    <strong>
                      {m.accepted}/{m.total}
                    </strong>
                    <span>entregáveis aceitos</span>
                  </div>
                  <div>
                    <strong>{m.blocked}</strong>
                    <span>execuções bloqueadas</span>
                  </div>
                  <div>
                    <strong>
                      {previous
                        ? `${m.accepted - previous.accepted >= 0 ? "+" : ""}${m.accepted - previous.accepted}`
                        : "—"}
                    </strong>
                    <span>aceites vs. observação anterior</span>
                  </div>
                </div>
                <p>
                  {
                    snap.payload.raid.filter(
                      (r: Row) => r.status !== "RESOLVED",
                    ).length
                  }{" "}
                  riscos/ações em aberto.{" "}
                  {
                    snap.payload.decisions.filter(
                      (d: Row) => d.status === "PROPOSED",
                    ).length
                  }{" "}
                  decisões propostas. Este relatório usa exclusivamente o
                  payload congelado.
                </p>
                <div className="snapshot-hash mono">
                  {snap.payload.hashScheme === "canonical-json-v1"
                    ? "SHA-256 canônico v1"
                    : "Hash legado de desenvolvimento (não verificado)"}{" "}
                  · {snap.payload_hash}
                </div>
                <div className="form-actions">
                  <button
                    className="button small"
                    onClick={() => select("snapshots", snap)}
                  >
                    Consultar relatório
                  </button>
                  <button
                    className="button small"
                    onClick={async () => {
                      try {
                        setExportError("");
                        const frozen = await api(`snapshots/${snap.id}`, pid);
                        download(
                          `snapshot-${snap.id}.json`,
                          JSON.stringify(frozen, null, 2),
                        );
                      } catch (e) {
                        setExportError((e as Error).message);
                      }
                    }}
                  >
                    <Download size={14} />
                    Exportar JSON
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
      <div className="policy-note">
        <FileBarChart2 size={20} />
        <p>
          Relatórios observados não equivalem a reports executivos publicados.
          Reports executivos exigem revisão independente antes de publicação. A
          impressão permite salvar PDF pelo navegador; o JSON inclui os dados e
          hashes congelados.
        </p>
      </div>
    </>
  );
}
export function Audit({
  events,
  timezone,
}: {
  events: Row[];
  timezone?: string;
}) {
  return (
    <div className="audit-list">
      {!events.length ? (
        <Empty text="As próximas operações aparecerão aqui, com ator, motivo e valores anteriores." />
      ) : (
        events.map((e) => (
          <article key={e.id} className="audit-item">
            <span className="audit-icon">
              <History size={15} />
            </span>
            <div>
              <div>
                <strong>{e.display_name || "Sistema"}</strong>
                <Badge value={e.action} />
                <span>{TITLES[e.entity_type] || e.entity_type}</span>
              </div>
              <p>
                {e.after_data?.name ||
                  e.before_data?.name ||
                  e.after_data?.title ||
                  e.entity_id}
              </p>
              <small>
                {e.reason} · Correlação{" "}
                <span className="mono">{e.correlation_id}</span>
              </small>
              <details>
                <summary>Consultar valores anteriores e posteriores</summary>
                <pre>
                  {JSON.stringify(
                    { before: e.before_data, after: e.after_data },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
            <time>{fullDate(e.occurred_at, timezone)}</time>
          </article>
        ))
      )}
    </div>
  );
}
