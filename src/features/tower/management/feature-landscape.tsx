"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Expand,
  GitBranch,
  Grid2X2,
  Layers3,
  Network,
  Search,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { isOverdue } from "@/shared/management-signals";
import {
  featureLandscape,
  SIGNALS,
  signalMatches,
  featureGroup,
  landscapeGroups,
  type Feature,
  type Signal,
} from "./model";
import type { Row, Select } from "../cockpit/model";
import { label } from "../metadata";
import { fmt } from "../presentation";
import { FeatureCard, DomainSummary, GroupedFeatures } from "./feature-cards";
import { relationshipGraph } from "./relationship-model";

export function ExecutionBand({ counts }: { counts: Row }) {
  const rest = Math.max(
    0,
    counts.total - counts.active - counts.blocked - counts.done,
  );
  return (
    <div
      className="mg-execution-band"
      role="img"
      aria-label={`${counts.done} concluídas, ${counts.active} em andamento, ${counts.blocked} bloqueadas, ${rest} em outros estados`}
    >
      {[
        ["done", counts.done],
        ["active", counts.active],
        ["blocked", counts.blocked],
        ["waiting", rest],
      ].map(([key, count]) => (
        <i
          key={key as string}
          className={`mg-${key}`}
          style={{ flex: Number(count) }}
        />
      ))}
    </div>
  );
}
function FeatureNode({ data }: NodeProps) {
  return (
    <>
      <Handle className="mg-handle" type="target" position={Position.Left} />
      <FeatureCard
        f={data.feature as Feature}
        onOpen={data.onOpen as () => void}
      />
      <Handle className="mg-handle" type="source" position={Position.Right} />
    </>
  );
}
function DomainNode({ data }: NodeProps) {
  return (
    <>
      <Handle className="mg-handle" type="target" position={Position.Left} />
      <DomainSummary
        group={data.group as Parameters<typeof DomainSummary>[0]["group"]}
        onOpen={data.onOpen as () => void}
      />
      <Handle className="mg-handle" type="source" position={Position.Right} />
    </>
  );
}
const nodeTypes = { feature: FeatureNode, domain: DomainNode };

export function FeatureLandscape({
  s,
  ds,
  capabilities,
  select,
  onExplore,
}: {
  s: Row;
  ds: Row[];
  capabilities?: Row[];
  select: Select;
  onExplore?: (id: string) => void;
}) {
  const [signal, setSignal] = useState<Signal>("ALL"),
    [search, setSearch] = useState(""),
    [grouping, setGrouping] = useState("DOMAIN"),
    [groupId, setGroupId] = useState(""),
    [mode, setMode] = useState<"MAP" | "TILES">("TILES"),
    [small, setSmall] = useState(false),
    [connections, setConnections] = useState(true),
    [large, setLarge] = useState(false),
    [focusId, setFocusId] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [collapsed, setCollapsed] = useState(new Set<string>()),
    [orphans, setOrphans] = useState(false),
    [linkIds, setLinkIds] = useState<string[] | null>(null);
  useEffect(() => {
    const media = matchMedia("(max-width: 700px)");
    const update = () => setSmall(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const model = useMemo(
    () => featureLandscape(s, ds, capabilities || s.capabilities),
    [s, ds, capabilities],
  );
  const groups = landscapeGroups(
    model.features,
    s.domains,
    grouping,
    model.today,
  );
  const groupFor = (f: Feature) => featureGroup(f, s.domains, grouping);
  const filtered = model.features
    .filter(
      (f) =>
        (!groupId || groupFor(f).id === groupId) &&
        `${f.record.code} ${f.record.name}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")) &&
        (signal === "ALL" ||
          f.items.some((d) => signalMatches(d, signal, model.today))),
    )
    .sort(
      (a, b) =>
        groupFor(a).name.localeCompare(groupFor(b).name, "pt-BR") ||
        b.overdue - a.overdue ||
        b.blocked - a.blocked ||
        a.record.code.localeCompare(b.record.code),
    );
  const maxPage = Math.max(0, Math.ceil(filtered.length / 20) - 1),
    currentPage = Math.min(page, maxPage),
    visible = filtered.slice(currentPage * 20, (currentPage + 1) * 20),
    focused = model.features.find((f) => f.record.id === focusId),
    view = mode;
  const visibleGroups = landscapeGroups(
    visible,
    s.domains,
    grouping,
    model.today,
  );
  const reset = () => {
    setSignal("ALL");
    setSearch("");
    setGroupId("");
    setPage(0);
  };
  const graph = relationshipGraph(
    s,
    visible,
    visibleGroups,
    !!groupId,
    connections,
    setFocusId,
    (id) => {
      setGroupId(id);
      setPage(0);
    },
  );
  const canvas = (expanded: boolean) => (
    <div className="mg-relations-view">
      <div className="mg-relation-level">
        <span>
          {groupId
            ? `${groups.find((g) => g.id === groupId)?.name} → features`
            : `${grouping === "DOMAIN" ? "Domínios" : "Situações"} → selecione um grupo para explorar as features`}
        </span>
        {groupId && (
          <button
            className="button small"
            onClick={() => {
              setGroupId("");
              setPage(0);
            }}
          >
            Voltar aos grupos
          </button>
        )}
      </div>
      <div
        className={`mg-canvas ${expanded ? "mg-canvas-large" : ""}`}
        role="region"
        aria-label="Mapa navegável de features"
      >
        <ReactFlow
          id={expanded ? "management-expanded" : "management-inline"}
          key={`${graph.nodes.map((n) => n.id).join("|")}:${expanded}`}
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          onEdgeClick={(_, edge) => {
            if (edge.data?.dependencyIds)
              setLinkIds(edge.data.dependencyIds as string[]);
            else setFocusId(edge.target);
          }}
          edgesFocusable={false}
          panOnScroll
          zoomOnScroll={false}
          preventScrolling={false}
        >
          <Background color="var(--line)" gap={24} />
          <Controls showInteractive={false} />
          {!small && (
            <MiniMap
              style={{ width: 110, height: 70 }}
              pannable
              zoomable
              nodeColor="var(--accent)"
              maskColor="var(--mg-mask)"
              ariaLabel="Minimapa das features"
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
  const tiles = (
    <GroupedFeatures
      groups={visibleGroups}
      collapsed={collapsed}
      onToggle={(id) =>
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onOpen={setFocusId}
    />
  );
  const counts = model.counts as Row;
  return (
    <section className="mg-landscape" aria-label="Gestão visual do projeto">
      <div className="mg-heading">
        <div>
          <span className="mg-eyebrow">
            <Network size={15} /> GESTÃO À VISTA
          </span>
          <h2>Mapa vivo do projeto</h2>
          <p>
            Domínios agrupam as features. Selecione uma feature para consultar
            suas entregas.
          </p>
        </div>
        <span className="mg-scope">
          <b>{model.features.length}</b> features · <b>{counts.total}</b>{" "}
          entregas no recorte
        </span>
      </div>
      <div
        className="mg-signal-grid"
        role="group"
        aria-label="Sinais de gestão"
      >
        {SIGNALS.filter((v) => v.id !== "NO_DATE").map((v) => (
          <button
            key={v.id}
            className={`mg-signal mg-${v.id.toLowerCase()}`}
            aria-pressed={signal === v.id}
            onClick={() => {
              setSignal(signal === v.id ? "ALL" : v.id);
              setPage(0);
            }}
          >
            <span>{v.id === "ALL" ? "Entregas no recorte" : v.name}</span>
            <strong>{counts[v.count]}</strong>
            <span className="mg-signal-caption">
              {v.id === "ALL"
                ? `${model.features.length} features mapeadas`
                : "Filtrar features →"}
            </span>
          </button>
        ))}
      </div>
      <div className="mg-map-shell">
        <div className="mg-map-toolbar">
          <div className="mg-search">
            <Search size={15} />
            <input
              aria-label="Buscar feature no mapa"
              placeholder="Encontrar uma feature…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <select
            aria-label="Organizar mapa por"
            value={grouping}
            onChange={(e) => {
              setGrouping(e.target.value);
              setGroupId("");
              setPage(0);
            }}
          >
            <option value="DOMAIN">Por domínio</option>
            <option value="STATE">Por situação</option>
          </select>
          <select
            aria-label="Filtrar grupo do mapa"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos os grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <div
            className="mg-view-toggle"
            role="group"
            aria-label="Apresentação das features"
          >
            <button
              aria-pressed={view === "TILES"}
              onClick={() => setMode("TILES")}
            >
              <Grid2X2 size={14} /> Panorama
            </button>
            <button
              aria-pressed={view === "MAP"}
              onClick={() => setMode("MAP")}
            >
              <Network size={14} /> Relações
            </button>
          </div>
          <button
            className="button small"
            aria-label="Ampliar mapa do projeto"
            onClick={() => setLarge(true)}
          >
            <Expand size={14} /> Ampliar mapa
          </button>
        </div>
        <div className="mg-reading-key">
          <span>
            <b>1</b> Domínio ou situação
          </span>
          <span>→</span>
          <span>
            <b>2</b> Feature e completude
          </span>
          <span>→</span>
          <span>
            <b>3</b> Entregas e detalhes
          </span>
        </div>
        <div className="mg-map-subbar">
          <span role="status">
            {filtered.length} de {model.features.length} features ·{" "}
            {signal === "ALL"
              ? "todas as situações"
              : SIGNALS.find((v) => v.id === signal)?.name}
          </span>
          <div>
            {view === "TILES" && (
              <>
                <button
                  disabled={
                    !visibleGroups.length ||
                    visibleGroups.every((g) => collapsed.has(g.id))
                  }
                  onClick={() =>
                    setCollapsed(new Set(visibleGroups.map((g) => g.id)))
                  }
                >
                  Recolher grupos
                </button>
                <button
                  disabled={!visibleGroups.some((g) => collapsed.has(g.id))}
                  onClick={() => setCollapsed(new Set())}
                >
                  Expandir grupos
                </button>
              </>
            )}
            {view === "MAP" &&
              graph.edges.some((e) => e.data?.dependencyIds) && (
                <button
                  onClick={() =>
                    setLinkIds([
                      ...new Set(
                        graph.edges.flatMap(
                          (e) => (e.data?.dependencyIds as string[]) || [],
                        ),
                      ),
                    ])
                  }
                >
                  Inspecionar vínculos
                </button>
              )}
            {view === "MAP" && (
              <button
                aria-pressed={connections}
                onClick={() => setConnections((v) => !v)}
              >
                <GitBranch size={13} /> Dependências{" "}
                {connections ? "visíveis" : "ocultas"}
              </button>
            )}
            {(signal !== "ALL" || search || groupId) && (
              <button onClick={reset}>
                <X size={13} /> Limpar mapa
              </button>
            )}
          </div>
        </div>
        {visible.length ? (
          view === "MAP" ? (
            canvas(false)
          ) : (
            tiles
          )
        ) : (
          <div className="mg-empty">
            <Layers3 size={30} />
            <h3>Nenhuma feature neste recorte</h3>
            <p>Ajuste os filtros ou vincule as entregas às features.</p>
            <button className="button" onClick={reset}>
              Limpar filtros do mapa
            </button>
          </div>
        )}
        <footer className="mg-map-footer">
          <span>
            {view === "MAP"
              ? "Selecione um grupo para explorar as features. Arraste e use +/− para navegar."
              : "Execução = entregas concluídas. Aceite = entregas aceitas. Sem entregas = sem medição."}
          </span>
          {view === "MAP" && (
            <span>
              Seta: dependência real agrupada · tracejado: subfeature · vínculos
              entre itens desta página.
            </span>
          )}
          <span>
            Entregas compartilhadas são deduplicadas nos totais de cada grupo;
            não some as contagens das features.
          </span>
          {filtered.length > 20 && (
            <div>
              <button
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </button>
              <b>
                {currentPage + 1}/{maxPage + 1} · até 20 features por mapa
              </b>
              <button
                disabled={currentPage === maxPage}
                onClick={() => setPage(currentPage + 1)}
              >
                Próximas
              </button>
            </div>
          )}
        </footer>
      </div>
      <div className="mg-overview-row">
        <ExecutionOrbit counts={counts} />
        <div className="mg-map-story">
          <h3>O projeto, além do percentual</h3>
          <p>
            <b>
              {counts.accepted}/{counts.total}
            </b>{" "}
            entregas aceitas ·{" "}
            {model.features.some((f) => f.baselineComparable) ? (
              <>
                <b>
                  {model.features.reduce(
                    (n, f) => n + Number(f.slipped > 0),
                    0,
                  )}
                </b>{" "}
                features com forecast posterior à baseline.
              </>
            ) : (
              "Comparação com baseline indisponível neste recorte."
            )}
          </p>
          <div>
            <button
              aria-pressed={signal === "NO_DATE"}
              onClick={() => {
                setSignal(signal === "NO_DATE" ? "ALL" : "NO_DATE");
                setPage(0);
              }}
            >
              <Clock3 size={14} /> {counts.withoutForecast} sem previsão
            </button>
            <button onClick={() => setOrphans(true)}>
              <GitBranch size={14} /> {model.unlinked.length} entregas fora do
              mapa
            </button>
          </div>
          <small>
            Prazo vencido = forecast anterior a {fmt(model.today)}, sem execução
            concluída e sem cancelamento. Desvio da baseline é um sinal
            separado.
          </small>
        </div>
      </div>
      <Modal
        open={large}
        onClose={() => setLarge(false)}
        wide
        className="mg-map-modal"
        title="Mapa ampliado do projeto"
        description="Features no recorte atual. Cores mostram situação operacional; vínculos hierárquicos tracejados e dependências com setas são distintos."
      >
        {visible.length ? (
          view === "MAP" ? (
            canvas(true)
          ) : (
            tiles
          )
        ) : (
          <p>Nenhuma feature no recorte.</p>
        )}
      </Modal>
      <Modal
        open={!!focused}
        onClose={() => setFocusId(null)}
        wide
        className="mg-feature-modal"
        title={`Panorama da feature · ${focused?.record.code || ""}`}
        description={focused?.record.name}
      >
        {focused && (
          <>
            <div className="mg-detail-summary">
              <ExecutionOrbit counts={focused} />
              <div>
                <h3>{focused.record.name}</h3>
                <p>
                  {focused.accepted}/{focused.total} aceitas · {focused.overdue}{" "}
                  com prazo vencido ·{" "}
                  {focused.baselineComparable
                    ? `${focused.slipped} com desvio da baseline`
                    : "sem comparação de baseline"}
                </p>
                <div className="mg-detail-actions">
                  <button
                    className="button primary"
                    onClick={() => {
                      setFocusId(null);
                      setLarge(false);
                      select("capabilities", focused.record);
                    }}
                  >
                    Detalhes da feature <ArrowUpRight size={14} />
                  </button>
                  {onExplore && (
                    <button
                      className="button"
                      onClick={() => {
                        setFocusId(null);
                        setLarge(false);
                        onExplore(focused.record.id);
                      }}
                    >
                      Focar nesta feature <Layers3 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <h3>Entregas vinculadas · {focused.total}</h3>
            <div className="mg-deliverable-grid">
              {focused.items.map((d) => (
                <button
                  key={d.id}
                  className={`mg-deliverable ${isOverdue(d, model.today) ? "mg-overdue" : ""}`}
                  onClick={() => {
                    setFocusId(null);
                    setLarge(false);
                    select("deliverables", d);
                  }}
                >
                  <small>
                    {d.code} · {label(d.layer)}
                  </small>
                  <strong>{d.name}</strong>
                  <span>
                    {label(d.execution_status)} ·{" "}
                    {d.accepted ? "Aceito" : "Sem aceite"}
                  </span>
                  <span>
                    <Clock3 size={13} />{" "}
                    {d.forecast_date
                      ? `${isOverdue(d, model.today) ? "Prazo vencido · " : "Forecast · "}${fmt(d.forecast_date)}`
                      : "Sem previsão"}
                  </span>
                </button>
              ))}
            </div>
            {!focused.total && (
              <p className="mg-empty">
                Nenhuma entrega vinculada neste recorte. Cadastre ou ajuste os
                filtros.
              </p>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={orphans}
        onClose={() => setOrphans(false)}
        title="Entregas fora do mapa"
        description="Entregas do recorte sem vínculo com as features exibidas. Não são contadas como features."
      >
        <div className="mg-deliverable-grid">
          {model.unlinked.map((d) => (
            <button
              key={d.id}
              className="mg-deliverable"
              onClick={() => {
                setOrphans(false);
                select("deliverables", d);
              }}
            >
              <small>{d.code}</small>
              <strong>{d.name}</strong>
              <span>{label(d.execution_status)}</span>
            </button>
          ))}
        </div>
        {!model.unlinked.length && (
          <p>Todas as entregas do recorte estão representadas no mapa.</p>
        )}
      </Modal>
      <Modal
        open={linkIds !== null}
        onClose={() => setLinkIds(null)}
        title="Vínculos entre features"
        description="Dependências reais agrupadas entre as features deste mapa. Uma mesma dependência pode aparecer em mais de uma conexão quando há entregas compartilhadas."
      >
        <div className="mg-deliverable-grid">
          {s.dependencies
            .filter((d: Row) => linkIds?.includes(d.id))
            .map((d: Row) => (
              <button
                key={d.id}
                className="mg-deliverable"
                onClick={() => {
                  setLinkIds(null);
                  setLarge(false);
                  select("dependencies", d);
                }}
              >
                <strong>{d.description || label(d.dependency_type)}</strong>
                <span>
                  {label(d.status)} · {label(d.dependency_type)}
                </span>
              </button>
            ))}
        </div>
      </Modal>
    </section>
  );
}

export function ExecutionOrbit({ counts }: { counts: Row }) {
  const total = counts.total,
    percent = total ? Math.round((counts.done / total) * 100) : null;
  const done = total ? (counts.done / total) * 100 : 0,
    active = total ? (counts.active / total) * 100 : 0,
    blocked = total ? (counts.blocked / total) * 100 : 0;
  return (
    <div className="mg-orbit-wrap">
      <div
        className="mg-orbit"
        style={{
          background: `conic-gradient(var(--mg-done) 0% ${done}%, var(--mg-active) ${done}% ${done + active}%, var(--mg-blocked) ${done + active}% ${done + active + blocked}%, var(--mg-waiting) ${done + active + blocked}% 100%)`,
        }}
        role="img"
        aria-label={`Execução concluída: ${counts.done} de ${total}; ${counts.active} em andamento; ${counts.blocked} bloqueadas`}
      >
        <div>
          <strong>{percent == null ? "—" : `${percent}%`}</strong>
          <span>execução</span>
        </div>
      </div>
      <div className="mg-orbit-legend">
        {[
          ["done", "Concluídas", counts.done],
          ["active", "Em andamento", counts.active],
          ["blocked", "Bloqueadas", counts.blocked],
          [
            "waiting",
            "Outros estados",
            Math.max(0, total - counts.done - counts.active - counts.blocked),
          ],
        ].map(([key, name, count]) => (
          <span key={key}>
            <i className={`mg-${key}`} />
            {name}
            <b>{count}</b>
          </span>
        ))}
        <small>
          <CheckCircle2 size={12} /> Execução e aceite são distintos.
        </small>
      </div>
    </div>
  );
}
