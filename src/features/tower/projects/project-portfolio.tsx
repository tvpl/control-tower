"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers3, ArrowUpRight, Expand, Search, Plus } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "../client";
import { label } from "../metadata";
import type { Row } from "../cockpit/model";
import { ExecutionOrbit } from "../management/feature-landscape";
const KINDS = [
  "DEVELOPMENT",
  "BUSINESS",
  "INFRASTRUCTURE",
  "PROVISIONING",
  "SPIKE",
  "OTHER",
];
function StreamBars({
  project,
  onOpen,
}: {
  project: Row;
  onOpen: (id: string, stream?: string) => void;
}) {
  return (
    <div className="project-fronts">
      {project.workstreams.map((w: Row) => (
        <button key={w.id} onClick={() => onOpen(project.id, w.id)}>
          <span>
            <strong>{w.name}</strong>
            <small>
              {label(w.kind)} · {w.total} entregáveis
            </small>
          </span>
          <span className="project-front-track" aria-hidden="true">
            <i style={{ width: `${w.percentage || 0}%` }} />
          </span>
          <b>{w.percentage === null ? "—" : `${w.percentage}%`}</b>
          <small>
            {w.accepted}/{w.total}
          </small>
          <ArrowUpRight size={12} />
        </button>
      ))}
      {!project.workstreams.length && (
        <p className="ct-empty">
          Cadastre frentes em Administração para estruturar o projeto.
        </p>
      )}
    </div>
  );
}
export function ProjectPortfolio({
  canCreate,
  onCreate,
  onOpen,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onOpen: (id: string, stream?: string) => void;
}) {
  const query = useQuery({
    queryKey: ["projects"],
    queryFn: () => api("projects"),
  });
  const [search, setSearch] = useState(""),
    [projectId, setProjectId] = useState(""),
    [kind, setKind] = useState(""),
    [expanded, setExpanded] = useState<Row | null>(null);
  const projects: Row[] = query.data?.items || [];
  const visible = projects.filter(
    (p) =>
      (!projectId || p.id === projectId) &&
      (!kind || p.workstreams.some((w: Row) => w.kind === kind)) &&
      `${p.code} ${p.name} ${p.workstreams.map((w: Row) => w.name).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const content = (p: Row) => (
    <>
      <div className="project-stats">
        <div>
          <strong>{p.percentage === null ? "—" : `${p.percentage}%`}</strong>
          <small>
            Aceite · {p.accepted}/{p.total}
          </small>
        </div>
        <div>
          <strong>{p.workstreams.length}</strong>
          <small>Frentes</small>
        </div>
        <div>
          <strong>{p.blocked}</strong>
          <small>Bloqueados</small>
        </div>
        <div>
          <strong>{p.squads.length}</strong>
          <small>Squads</small>
        </div>
      </div>
      <div className="mg-portfolio-execution">
        <ExecutionOrbit counts={p} />
        <span>
          {p.active} em andamento · {p.overdue} com prazo vencido ·{" "}
          {p.withoutForecast} sem previsão
        </span>
      </div>
      <StreamBars
        project={p}
        onOpen={(id, stream) => {
          setExpanded(null);
          onOpen(id, stream);
        }}
      />
    </>
  );
  return (
    <div className="project-portfolio">
      <section
        className="mg-portfolio-dashboard"
        aria-label="Indicadores do portfólio"
      >
        <div className="mg-heading">
          <div>
            <span className="mg-eyebrow">PANORAMA DO PORTFÓLIO</span>
            <h2>Projetos em movimento</h2>
            <p>Selecione um projeto ou uma frente para explorar o trabalho.</p>
          </div>
        </div>
        <div className="mg-signal-grid">
          {[
            ["Projetos no recorte", visible.length],
            ["Features", visible.reduce((n, p) => n + p.featureCount, 0)],
            ["Em andamento", visible.reduce((n, p) => n + p.active, 0)],
            ["Prazo vencido", visible.reduce((n, p) => n + p.overdue, 0)],
          ].map(([name, value]) => (
            <div className="mg-signal" key={name}>
              <span>{name}</span>
              <strong>{query.isLoading ? "—" : value}</strong>
              <span className="mg-signal-caption">
                Projetos acessíveis após filtros
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="project-filters">
        <label className="project-search">
          <Search size={14} />
          <input
            aria-label="Buscar projetos ou frentes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto ou frente…"
          />
        </label>
        <select
          aria-label="Filtrar projetos"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Tipo de frente no portfólio"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">Todos os tipos de frente</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <Button disabled={!canCreate} onClick={onCreate} variant="primary">
          <Plus size={14} />
          Novo projeto
        </Button>
      </div>
      {query.isLoading && (
        <p className="ct-empty">Consultando projetos autorizados…</p>
      )}
      {query.error && (
        <p role="alert" className="form-error">
          {query.error.message}
          <Button size="small" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      <div className="project-cards">
        {visible.map((p) => (
          <section key={p.id} className="ct-panel project-card">
            <header>
              <div>
                <span className="project-symbol">
                  <Layers3 size={18} />
                </span>
                <div>
                  <small>{p.code}</small>
                  <h2>{p.name}</h2>
                </div>
              </div>
              <button
                className="ct-small-button"
                aria-label={`Ampliar projeto ${p.name}`}
                onClick={() => setExpanded(p)}
              >
                <Expand size={14} />
              </button>
            </header>
            {content(p)}
            <footer>
              <span>
                {p.domains.length} domínios · {p.areas.length} áreas · contagem
                sem pesos
              </span>
              <Button size="small" onClick={() => onOpen(p.id)}>
                Acompanhar projeto <ArrowUpRight size={12} />
              </Button>
            </footer>
          </section>
        ))}
      </div>
      {!query.isLoading && !query.error && !visible.length && (
        <p className="ct-empty">
          Nenhum projeto atende aos filtros. Ajuste o recorte ou crie um novo
          projeto.
        </p>
      )}
      <p className="ct-footnote">
        Projetos correspondem aos programas do modelo atual. O filtro de tipo
        seleciona projetos com essa frente; as contagens dos cards representam
        cada projeto completo. — significa ausência de denominador.
      </p>
      <Modal
        open={expanded !== null}
        onClose={() => setExpanded(null)}
        wide
        title={expanded?.name || "Projeto"}
        description="Frentes e indicadores do projeto, consultados no PostgreSQL. Selecione uma frente para abrir seu cockpit filtrado."
      >
        {expanded && (
          <div className="project-expanded">
            {content(expanded)}
            <div className="project-taxonomy">
              <div>
                <h3>Domínios</h3>
                {expanded.domains.map((d: Row) => (
                  <span key={d.id}>{d.name}</span>
                ))}
              </div>
              <div>
                <h3>Áreas</h3>
                {expanded.areas.map((d: Row) => (
                  <span key={d.id}>{d.name}</span>
                ))}
              </div>
              <div>
                <h3>Squads</h3>
                {expanded.squads.map((d: Row) => (
                  <span key={d.id}>{d.name}</span>
                ))}
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                const id = expanded.id;
                setExpanded(null);
                onOpen(id);
              }}
            >
              Abrir cockpit <ArrowUpRight size={14} />
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
