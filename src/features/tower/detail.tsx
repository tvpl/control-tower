"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { ProvenancePanel } from "./governance/provenance-panel";
import { GovernanceActions } from "./governance/review-actions";
import { useState } from "react";
import { applicability } from "@/server/domain/applicability";
import { Modal } from "@/components/ui/dialog";
import { canEdit, impactedNodes, STAGES } from "@/server/domain/rules";
import { type Kind } from "@/server/domain/schemas";
import { type ScopeKind } from "@/server/domain/scope";
import "@xyflow/react/dist/style.css";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Expand,
  Minimize2,
  FileCheck2,
  History,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { effectiveArea } from "./filtering";
import { nodeName } from "./forms";
import { FIELDS, label, TITLES } from "./metadata";
import { Badge, fullDate } from "./presentation";
type Row = Record<string, any>;
type User = { id: string; name: string; email: string };
export function Detail({
  selected,
  s,
  userId,
  onSaved,
  onClose,
  onEdit,
  onSelect,
  onGate,
  onAction,
  onChangeScope,
  position,
  onPrevious,
  onNext,
  onAgent,
}: {
  selected: { kind: string; record: Row };
  userId: string;
  onSaved: () => void;
  s: Row;
  onClose: () => void;
  onEdit: (k: string, r: Row) => void;
  onSelect: (k: string, r: Row) => void;
  onGate: (v: any) => void;
  onAction: (a: string, r: Row) => void;
  onChangeScope: (kind: ScopeKind, r: Row) => void;
  position?: { index: number; total: number };
  onPrevious?: () => void;
  onNext?: () => void;
  onAgent?: (kind: string, r: Row) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { kind } = selected;
  const fullSnapshot = useQuery({
    queryKey: ["snapshot", s.programs[0].id, selected.record.id],
    queryFn: () => api(`snapshots/${selected.record.id}`, s.programs[0].id),
    enabled: kind === "snapshots",
  });
  const r =
    fullSnapshot.data ||
    (s[kind] || []).find((d: Row) => d.id === selected.record.id) ||
    selected.record;
  const node = s.nodes.find(
    (n: Row) => n.entity_id === r.id && n.entity_type === kind,
  );
  const editable =
    kind in FIELDS &&
    canEdit(s.roles, kind, r.workstream_id) &&
    !(
      ["decisions", "contracts"].includes(kind) &&
      ["APPROVED", "REJECTED"].includes(r.status)
    );
  const ds =
    kind === "capabilities"
      ? s.deliverables.filter((d: Row) =>
          s.links.some(
            (l: Row) => l.capability_id === r.id && l.deliverable_id === d.id,
          ),
        )
      : kind === "cell"
        ? r.deliverables
        : kind === "workstreams"
          ? s.deliverables.filter((d: Row) => d.workstream_id === r.id)
          : kind === "releases"
            ? s.deliverables.filter((d: Row) =>
                s.releaseLinks.some(
                  (l: Row) =>
                    l.release_id === r.id && l.deliverable_id === d.id,
                ),
              )
            : [];
  const dependencies = node
    ? s.dependencies.filter(
        (d: Row) =>
          d.source_node_id === node.id || d.target_node_id === node.id,
      )
    : [];
  const evidence = node
    ? s.evidence.filter((e: Row) => e.subject_node_id === node.id)
    : [];
  const gates = node
    ? s.effectiveAssessments.filter((g: Row) => g.subject_node_id === node.id)
    : [];
  const audit = s.audit.filter((a: Row) => a.entity_id === r.id);
  return (
    <Modal
      open
      drawer={!expanded}
      wide={expanded}
      onClose={onClose}
      title={r.name || r.title || r.description || "Detalhe"}
      description={`${TITLES[kind] || "Contexto"} ${r.code ? `· ${r.code}` : ""} · ${r.id ? `v${r.version || 1}` : "drill-down"}`}
    >
      {position && position.total > 1 && (
        <div
          className="detail-record-navigation"
          aria-label="Navegar entre registros"
        >
          <span>
            Registro <strong>{position.index + 1}</strong> de {position.total}{" "}
            do recorte
          </span>
          <div>
            <button
              className="button small"
              disabled={!onPrevious}
              onClick={onPrevious}
              aria-label="Registro anterior"
            >
              <ArrowLeft size={14} /> Anterior
            </button>
            <button
              className="button small"
              disabled={!onNext}
              onClick={onNext}
              aria-label="Próximo registro"
            >
              Próximo <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
      {kind === "deliverables" && (
        <div className="ct-note-meta">
          <span>
            Área:{" "}
            {s.areas.find((a: Row) => a.id === effectiveArea(r, s))?.name ||
              "Sem área"}
            {!r.area_id && r.squad_id && effectiveArea(r, s)
              ? " (do squad)"
              : ""}
          </span>
          <span>
            Squad:{" "}
            {s.squads.find((q: Row) => q.id === r.squad_id)?.name ||
              "Sem squad"}
          </span>
        </div>
      )}
      <div className="detail-actions">
        {onAgent && (
          <button className="button small" onClick={() => onAgent(kind, r)}>
            <Sparkles size={14} />
            IA deste registro
          </button>
        )}
        <button className="button small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <Minimize2 size={14} /> : <Expand size={14} />}{" "}
          {expanded ? "Voltar ao painel" : "Ampliar detalhes"}
        </button>
        {editable && ["capabilities", "deliverables"].includes(kind) && (
          <button
            className="button small"
            onClick={() => onChangeScope(kind as ScopeKind, r)}
          >
            Propor mudança de escopo
          </button>
        )}
        {editable && (
          <button className="button small" onClick={() => onEdit(kind, r)}>
            <Settings2 size={14} />
            Editar
          </button>
        )}
        {editable && (
          <button
            className="button small"
            onClick={() => onAction("delete", r)}
          >
            Excluir
          </button>
        )}
        {kind === "deliverables" &&
          editable &&
          r.delivery_stage !== "PRODUCTION" && (
            <button
              className="button small"
              onClick={() => onAction("transition", r)}
            >
              Avançar para {label(STAGES[STAGES.indexOf(r.delivery_stage) + 1])}
              <ArrowRight size={13} />
            </button>
          )}
        {kind === "releases" && editable && r.status !== "APPROVED" && (
          <button
            className="button small"
            onClick={() => onAction("approve-release", r)}
          >
            <ShieldCheck size={14} />
            Autorizar release
          </button>
        )}
        {kind === "deliverables" &&
          !r.accepted &&
          s.roles.some((r: Row) =>
            ["CHIEF_ARCHITECT", "GATE_APPROVER"].includes(r.role),
          ) && (
            <button
              className="button small"
              onClick={() => onAction("accept", r)}
            >
              Registrar aceite
            </button>
          )}
      </div>
      {kind === "snapshots" ? (
        <>
          <div className="detail-section">
            <h3>Relatório preservado</h3>
            <p>
              {r.payload.metrics.accepted} de {r.payload.metrics.total}{" "}
              entregáveis aceitos.
            </p>
            <p>
              {r.payload.metrics.blocked} execuções bloqueadas. Fórmula{" "}
              {r.formula_version}.
            </p>
            <p className="mono small-text">{r.payload_hash}</p>
          </div>
          {fullSnapshot.error ? (
            <p role="alert" className="error">
              {fullSnapshot.error.message}
            </p>
          ) : r.summary_only ? (
            <p role="status">Carregando snapshot completo…</p>
          ) : (
            <pre>{JSON.stringify(r.payload, null, 2)}</pre>
          )}
        </>
      ) : (
        <>
          {kind === "deliverables" && (
            <div className="dimension-grid">
              <div>
                <small>EXECUÇÃO</small>
                <Badge value={r.execution_status} />
              </div>
              <div>
                <small>ESTÁGIO</small>
                <Badge value={r.delivery_stage} />
              </div>
              <div>
                <small>PLANEJAMENTO</small>
                <Badge value={r.planning_status} />
              </div>
              <div>
                <small>ACEITE</small>
                <Badge value={r.accepted ? "PASSED" : "NOT_ASSESSED"} />
              </div>
            </div>
          )}
          {kind === "capabilities" && (
            <section className="detail-section">
              <h3>Prontidão da capacidade</h3>
              <Badge value={r.readiness?.status || "NOT_ASSESSED"} />
              <p>
                {r.readiness?.requiredDeliverables ?? 0} entregáveis
                obrigatórios · {r.readiness?.blockingGates ?? 0} gates
                pendentes. Opcionais e apoio preservam o contexto sem bloquear
                esta capacidade.
              </p>
            </section>
          )}
          {kind === "capabilities" && (
            <div className="dimension-grid">
              <div>
                <small>ESCOPO</small>
                <Badge value={r.scope_status} />
              </div>
              <div>
                <small>MATURIDADE</small>
                <Badge value={r.inventory_maturity} />
              </div>
              <div>
                <small>CRITICIDADE</small>
                <Badge value={r.criticality} />
              </div>
              <div>
                <small>DOMÍNIO</small>
                <button
                  className="text-button"
                  onClick={() =>
                    onSelect(
                      "domains",
                      s.domains.find((d: Row) => d.id === r.domain_id),
                    )
                  }
                >
                  {s.domains.find((d: Row) => d.id === r.domain_id)?.name}
                </button>
              </div>
            </div>
          )}
          <section className="detail-section">
            <h3>Informação do registro</h3>
            {kind === "cell" ? (
              <p>
                {ds.length
                  ? `${ds.length} entregáveis nesta camada.`
                  : "Nenhum entregável registrado. Estado não avaliado; ausência não implica N/A."}
              </p>
            ) : (
              <dl className="detail-fields">
                {Object.entries(r)
                  .filter(
                    ([k, v]) =>
                      ![
                        "id",
                        "program_id",
                        "version",
                        "name",
                        "title",
                        "code",
                        "acceptance_criteria",
                        "readiness",
                      ].includes(k) &&
                      v !== null &&
                      typeof v !== "object",
                  )
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>
                        {FIELDS[kind as Kind]?.find((f) => f.key === key)
                          ?.label || key.replaceAll("_", " ")}
                      </dt>
                      <dd>
                        {key.includes("owner") || key === "lead_id" ? (
                          s.users.find((u: Row) => u.id === value)
                            ?.display_name || "Não definido"
                        ) : key === "area_id" || key === "squad_id" ? (
                          s[key === "area_id" ? "areas" : "squads"].find(
                            (v: Row) => v.id === value,
                          )?.name || "Não definido"
                        ) : key === "url" ? (
                          <a
                            href={String(value)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Abrir evidência
                            <ExternalLink size={12} />
                          </a>
                        ) : typeof value === "boolean" ? (
                          value ? (
                            "Sim"
                          ) : (
                            "Não"
                          )
                        ) : (
                          label(String(value))
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
            )}
          </section>
          {r.acceptance_criteria && (
            <section className="detail-section">
              <h3>Critérios de aceite</h3>
              {Array.isArray(r.acceptance_criteria) ? (
                r.acceptance_criteria.map((a: string, i: number) => (
                  <p key={i}>
                    <CheckCircle2 size={13} />
                    {a}
                  </p>
                ))
              ) : (
                <p>{r.acceptance_criteria}</p>
              )}
            </section>
          )}
          {!!ds.length && (
            <section className="detail-section">
              <h3>
                Entregáveis relacionados <span>{ds.length}</span>
              </h3>
              {ds.map((d: Row) => (
                <button
                  className="related-row"
                  key={d.id}
                  onClick={() => onSelect("deliverables", d)}
                >
                  <div>
                    <small className="mono">
                      {d.code} · {label(d.layer)}
                      {kind === "capabilities" &&
                        ` · ${label(s.links.find((l: Row) => l.capability_id === r.id && l.deliverable_id === d.id)?.contribution_type || "REQUIRED")}`}
                      {kind === "releases" &&
                        ` · ${s.releaseLinks.find((l: Row) => l.release_id === r.id && l.deliverable_id === d.id)?.required ? "Obrigatório" : "Opcional"}`}
                    </small>
                    <strong>{d.name}</strong>
                  </div>
                  <Badge value={d.execution_status} />
                  <ChevronRight size={13} />
                </button>
              ))}
            </section>
          )}
          {kind === "deliverables" && (
            <section className="detail-section">
              <h3>Escopo de contribuição</h3>
              {s.links
                .filter((l: Row) => l.deliverable_id === r.id)
                .map((l: Row) => {
                  const cap = s.capabilities.find(
                    (c: Row) => c.id === l.capability_id,
                  );
                  return (
                    <button
                      key={cap.id}
                      className="related-row"
                      onClick={() => onSelect("capabilities", cap)}
                    >
                      <strong>{cap.name}</strong>
                      <span className="muted small-text">
                        {label(l.contribution_type)}
                      </span>
                      <span className="mono muted">{cap.code}</span>
                      <ChevronRight size={14} />
                    </button>
                  );
                })}
            </section>
          )}
          {kind === "capabilities" && (
            <section className="detail-section">
              <h3>Componentes técnicos</h3>
              {s.componentLinks
                .filter((l: Row) => l.capability_id === r.id)
                .map((l: Row) => {
                  const c = s.components.find(
                    (c: Row) => c.id === l.component_id,
                  );
                  return (
                    <button
                      key={c.id}
                      className="related-row"
                      onClick={() => onSelect("components", c)}
                    >
                      <strong>{c.name}</strong>
                      <span className="muted small-text">
                        {label(l.relation_type)}
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  );
                })}
            </section>
          )}
          {!!dependencies.length && (
            <section className="detail-section">
              <h3>Dependências & impactos</h3>
              {dependencies.map((d: Row) => (
                <button
                  className="related-row"
                  key={d.id}
                  onClick={() => onSelect("dependencies", d)}
                >
                  <strong>{d.description}</strong>
                  <Badge value={d.status} />
                </button>
              ))}
            </section>
          )}
          {kind === "dependencies" && (
            <section className="detail-section">
              <h3>Impacto transitivo determinístico</h3>
              {impactedNodes(r.source_node_id, s.dependencies).map((id) => {
                const n = s.nodes.find((n: Row) => n.id === id);
                return (
                  <p key={id}>
                    <ArrowRight size={13} />
                    {n ? nodeName(n, s) : id}
                  </p>
                );
              })}
            </section>
          )}
          {kind === "deliverables" && node && (
            <section className="detail-section">
              <h3>Gates de prontidão</h3>
              {(kind === "deliverables"
                ? applicability(r, s.gates, s.dodProfiles || []).gates
                : s.gates
              ).map((g: Row) => {
                const a = gates.find((a: Row) => a.gate_id === g.id);
                return (
                  <div className="gate-detail" key={g.id}>
                    <div>
                      <strong>{g.name}</strong>
                      <small>
                        {g.category} · critério v{g.version}
                      </small>
                    </div>
                    <Badge value={a?.result || "NOT_ASSESSED"} />
                    {a?.stale_criterion && (
                      <small>Critério mudou; reavaliar</small>
                    )}
                    {s.roles.some((r: Row) => r.role === "GATE_APPROVER") && (
                      <button
                        className="button small"
                        onClick={() =>
                          onGate({ subject: node, gate: g, assessment: a })
                        }
                      >
                        Avaliar
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          )}
          {kind in FIELDS && r.id && (
            <ProvenancePanel
              key={`${kind}:${r.id}`}
              kind={kind}
              id={r.id}
              pid={s.programs[0].id}
              timezone={s.programs[0]?.timezone}
            />
          )}
          <GovernanceActions
            kind={kind}
            record={r}
            s={s}
            userId={userId}
            onSaved={onSaved}
          />
          {node && (
            <section className="detail-section">
              <h3>
                Evidências <span>{evidence.length}</span>
              </h3>
              {!evidence.length ? (
                <p className="muted">
                  Nenhuma evidência registrada. Aprovação não pode ser inferida.
                </p>
              ) : (
                evidence.map((ev: Row) => (
                  <button
                    className="related-row"
                    key={ev.id}
                    onClick={() => onSelect("evidence", ev)}
                  >
                    <FileCheck2 size={15} />
                    <strong>{ev.title}</strong>
                    <span className="mono">v{ev.artifact_version}</span>
                    <ChevronRight size={13} />
                  </button>
                ))
              )}
            </section>
          )}
          <section className="detail-section">
            <h3>Histórico contextual</h3>
            {!audit.length ? (
              <p className="muted">
                Nenhuma alteração registrada após o inventário inicial.
              </p>
            ) : (
              audit.map((a: Row) => (
                <div className="detail-history" key={a.id}>
                  <History size={13} />
                  <div>
                    <strong>
                      {a.display_name} · {a.action}
                    </strong>
                    <p>{a.reason}</p>
                    <small>
                      {fullDate(a.occurred_at, s.programs?.[0]?.timezone)}
                    </small>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </Modal>
  );
}
