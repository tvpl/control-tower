"use client";
import { InventoryCoverage } from "./cockpit/inventory-coverage";
import { useState } from "react";
import {
  Layers,
  ListTree,
  Share2,
  ArrowUpRight,
  ShieldCheck,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExecutiveSignal, ProjectIntelligence } from "./cockpit/intelligence";
import { FeatureLandscape } from "./management/feature-landscape";
import { ProjectPulse } from "./management/project-pulse";
import { scopedReadiness } from "./cockpit/insight-model";
import { ProjectExplorer } from "./cockpit/explorer";
import { CockpitCharts } from "./cockpit/charts";
import { DependencyCanvas } from "./cockpit/dependency-canvas";
import {
  ObservationDialog,
  ObservationFeed,
  ShareDialog,
} from "./cockpit/observations";
import {
  acceptance,
  descendantIds,
  featureDeliverables,
  type Row,
  type Select,
} from "./cockpit/model";
export function Overview({
  s,
  deliverables,
  select,
  navigate,
  userId,
  onSaved,
  capabilities,
  onProject,
}: {
  s: Row;
  deliverables: Row[];
  select: Select;
  navigate: (page: string) => void;
  userId: string;
  onSaved: () => void;
  capabilities: Row[];
  onProject: (id: string) => void;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [micro, setMicro] = useState(false),
    [focusId, setFocusId] = useState(""),
    [expanded, setExpanded] = useState(new Set<string>()),
    [notes, setNotes] = useState<{
      subject: string | null;
      initial?: Row;
    } | null>(null),
    [shareIds, setShareIds] = useState<string[] | null>(null);
  const feature = s.capabilities.find((c: Row) => c.id === focusId);
  const ds = feature
    ? featureDeliverables(s, deliverables, feature.id)
    : deliverables;
  const m = acceptance(ds),
    nodeIds = new Set(
      s.nodes
        .filter(
          (n: Row) =>
            ds.some((d) => d.id === n.entity_id) || n.entity_id === feature?.id,
        )
        .map((n: Row) => n.id),
    );
  const deps = s.dependencies.filter(
    (d: Row) => nodeIds.has(d.source_node_id) || nodeIds.has(d.target_node_id),
  );
  const featuresInContext = feature
    ? descendantIds(s.capabilities, feature.id)
    : null;
  const observationNodes = new Set(
    s.nodes
      .filter(
        (n: Row) => nodeIds.has(n.id) || featuresInContext?.has(n.entity_id),
      )
      .map((n: Row) => n.id),
  );
  const scopeNotes = s.observations.filter(
    (n: Row) =>
      !feature || !n.subject_node_id || observationNodes.has(n.subject_node_id),
  );
  function focus(id: string) {
    setFocusId(id);
    if (id) {
      setMicro(true);
      setExpanded((prev) => new Set([...prev, id]));
    }
  }
  const readiness = scopedReadiness(s, ds);
  const kpis = [
    {
      name: "Aceite",
      value: m.percentage == null ? "—" : `${m.percentage}%`,
      sub: `${m.accepted}/${m.total} entregáveis`,
      icon: CheckCircle2,
      page: "deliverables",
      color: "jade",
    },
    {
      name: "Prontidão",
      value: readiness.percentage == null ? "—" : `${readiness.percentage}%`,
      sub: `${readiness.satisfied}/${readiness.totalApplicableGates} gates no recorte`,
      icon: ShieldCheck,
      page: "readiness",
      color: "blue",
    },
    {
      name: "Dependências bloqueadas",
      value: String(deps.filter((d: Row) => d.status === "BLOCKED").length),
      sub: `${deps.length} vínculos no recorte`,
      icon: GitBranch,
      page: "dependencies",
      color: "amber",
    },
    {
      name: "Execução bloqueada",
      value: String(ds.filter((d) => d.execution_status === "BLOCKED").length),
      sub: `de ${ds.length} entregáveis`,
      icon: AlertTriangle,
      page: "deliverables",
      color: "amber",
    },
  ];
  return (
    <div className="ct-cockpit">
      <ProjectPulse
        activeId={s.programs[0].id}
        onOpen={onProject}
        onPortfolio={() => navigate("projects")}
      />
      {feature && (
        <div className="mg-focus-banner">
          <span>
            Foco:{" "}
            <strong>
              {feature.code} · {feature.name}
            </strong>
          </span>
          <button
            className="button small"
            onClick={() => {
              setFocusId("");
              setMicro(false);
            }}
          >
            Voltar ao mapa completo
          </button>
        </div>
      )}
      <FeatureLandscape
        s={s}
        ds={ds}
        capabilities={
          feature
            ? capabilities.filter((c) =>
                descendantIds(s.capabilities, feature.id).has(c.id),
              )
            : capabilities
        }
        select={select}
        onExplore={focus}
      />
      <div className="ct-toolbar">
        <div className="ct-mode" role="group" aria-label="Nível de detalhe">
          <button
            aria-pressed={!micro}
            onClick={() => {
              setMicro(false);
              setFocusId("");
            }}
          >
            <Layers size={14} />
            Macro
          </button>
          <button aria-pressed={micro} onClick={() => setMicro(true)}>
            <ListTree size={14} />
            Micro
          </button>
        </div>
        <span className="ct-scope">
          <strong>{feature?.name || "Projeto inteiro"}</strong>
          <span>
            {feature ? feature.code : `${s.capabilities.length} features`} ·{" "}
            {ds.length} entregáveis
          </span>
        </span>
        <div className="ct-toolbar-actions">
          <Button size="small" onClick={() => navigate("priorities")}>
            <ListTree size={13} />
            {s.priorityBoards.capabilities.version ||
            s.priorityBoards.deliverables.version
              ? "Revisar prioridades"
              : "Definir prioridades"}
          </Button>
          <Button
            size="small"
            variant="primary"
            onClick={() =>
              setShareIds(
                scopeNotes
                  .filter((n: Row) => n.important)
                  .map((n: Row) => n.id),
              )
            }
          >
            <Share2 size={13} />
            Compartilhar status
          </Button>
        </div>
      </div>
      <InventoryCoverage s={s} select={select} />
      <ExecutiveSignal s={s} ds={ds} select={select} />
      <div className="ct-kpis">
        {kpis.map((k) => (
          <button
            key={k.name}
            onClick={() => setInsight(k.name)}
            className={`ct-kpi ct-kpi-${k.color}`}
          >
            <k.icon size={16} />
            <span>
              <small>{k.name}</small>
              <strong>{k.value}</strong>
            </span>
            <span className="ct-kpi-sub">
              {k.sub}
              <ArrowUpRight size={12} />
            </span>
          </button>
        ))}
      </div>
      <CockpitCharts s={s} ds={ds} micro={micro} select={select} />
      <div className="ct-workspace">
        <div className="ct-explorer-wrap">
          <div className="ct-tree-actions">
            <span>Exploração hierárquica</span>
            <button
              onClick={() =>
                setExpanded(new Set(s.capabilities.map((c: Row) => c.id)))
              }
            >
              <ChevronDown size={12} />
              Expandir tudo
            </button>
            <button onClick={() => setExpanded(new Set())}>
              <ChevronUp size={12} />
              Recolher tudo
            </button>
          </div>
          <ProjectExplorer
            s={s}
            deliverables={deliverables}
            expanded={expanded}
            toggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            focusId={focusId}
            onFocus={focus}
            select={select}
            onNotes={(subject) => setNotes({ subject })}
            micro={micro}
          />
        </div>
        <DependencyCanvas
          s={s}
          ds={ds}
          micro={micro}
          focusId={focusId}
          onFeature={focus}
          select={select}
        />
      </div>
      {feature && (
        <div className="ct-feature-context">
          <span>
            <strong>{feature.code}</strong> · {feature.name}
          </span>
          <Button size="small" onClick={() => select("capabilities", feature)}>
            Abrir detalhes <ArrowUpRight size={13} />
          </Button>
          <Button
            size="small"
            onClick={() =>
              setNotes({
                subject:
                  s.nodes.find(
                    (n: Row) =>
                      n.entity_type === "capabilities" &&
                      n.entity_id === feature.id,
                  )?.id || null,
              })
            }
          >
            <MessageSquare size={13} />
            Anotar na feature
          </Button>
        </div>
      )}
      <ProjectIntelligence s={s} ds={ds} select={select} />
      <ObservationFeed
        notes={scopeNotes}
        onOpen={(initial) => setNotes({ subject: null, initial })}
      />
      <p className="ct-footnote">
        Fonte: PostgreSQL · features representam capacidades · aceite por
        contagem, sem ponderação · dimensões independentes · aceite e prontidão
        respeitam o recorte de entregáveis; agenda de governança representa o
        programa completo.
      </p>
      <Modal
        open={insight !== null}
        wide
        title={insight || "Indicador"}
        onClose={() => setInsight(null)}
        description={`${feature?.name || "Projeto inteiro"} · ${ds.length} entregáveis neste recorte. Prontidão calculada para os entregáveis deste recorte.`}
      >
        {insight && (
          <>
            <CockpitCharts
              expandable={false}
              s={s}
              ds={ds}
              micro={micro}
              select={(kind, record) => {
                setInsight(null);
                select(kind, record);
              }}
            />
            {insight === "Prontidão" && (
              <p className="ct-expanded-caption">
                {readiness.blockingGates ?? 0} gates impeditivos pendentes ·{" "}
                {readiness.requiredDeliverables ?? s.deliverables.length}{" "}
                entregáveis obrigatórios no contexto de prontidão.
              </p>
            )}
            <div className="ct-expanded-records">
              <h3>
                {insight === "Dependências bloqueadas"
                  ? "Dependências do recorte"
                  : "Entregáveis do recorte"}
              </h3>
              {insight === "Dependências bloqueadas"
                ? deps.map((d: Row) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setInsight(null);
                        select("dependencies", d);
                      }}
                    >
                      <span>{d.description || d.dependency_type}</span>
                      <span>{d.status}</span>
                    </button>
                  ))
                : ds
                    .filter(
                      (d) =>
                        insight !== "Execução bloqueada" ||
                        d.execution_status === "BLOCKED",
                    )
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setInsight(null);
                          select("deliverables", d);
                        }}
                      >
                        <span>
                          <small>{d.code}</small>
                          <strong>{d.name}</strong>
                        </span>
                        <span>{d.accepted ? "Aceito" : "Sem aceite"}</span>
                      </button>
                    ))}
            </div>
            <div className="ct-modal-actions">
              <Button
                onClick={() => {
                  const page =
                    kpis.find((k) => k.name === insight)?.page ||
                    "deliverables";
                  setInsight(null);
                  navigate(page);
                }}
              >
                Abrir módulo <ArrowUpRight size={13} />
              </Button>
            </div>
          </>
        )}
      </Modal>
      {notes && (
        <ObservationDialog
          s={s}
          userId={userId}
          subject={notes.subject}
          initial={notes.initial}
          onClose={() => setNotes(null)}
          onSaved={onSaved}
          onShare={(id) => {
            setNotes(null);
            setShareIds([id]);
          }}
        />
      )}
      {shareIds && (
        <ShareDialog
          s={s}
          ds={ds}
          feature={feature}
          notes={[
            ...scopeNotes,
            ...s.observations.filter(
              (n: Row) =>
                shareIds.includes(n.id) &&
                !scopeNotes.some((r: Row) => r.id === n.id),
            ),
          ]}
          initialIds={shareIds}
          onClose={() => setShareIds(null)}
        />
      )}
    </div>
  );
}
