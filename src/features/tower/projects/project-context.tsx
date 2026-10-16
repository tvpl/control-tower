"use client";
import type { MouseEvent } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Layers3,
  Package,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PROJECT_TABS, workspaceURL } from "../navigation";
import { label } from "../metadata";
import type { Row } from "../cockpit/model";
import { UNASSIGNED, type TowerFilters } from "../filtering";
export type Density = "compact" | "comfortable";
export function ProjectContext({
  s,
  page,
  density,
  onDensity,
  navigate,
}: {
  s: Row;
  page: string;
  density: Density;
  onDensity: (value: Density) => void;
  navigate: (id: string) => void;
}) {
  const p = s.programs[0],
    accepted = s.deliverables.filter((d: Row) => d.accepted).length;
  function click(e: MouseEvent<HTMLAnchorElement>, id: string) {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(id);
  }
  const link = (id: string) =>
    workspaceURL(
      typeof location !== "undefined" ? location.href : "http://localhost/",
      id,
      p.id,
    ).search;
  return (
    <section className="project-context" aria-label="Contexto do projeto">
      <div className="project-context-heading">
        <div className="project-context-identity">
          <span className="project-context-icon">
            <Layers3 size={19} />
          </span>
          <div>
            <span className="project-context-code">
              PROJETO ATIVO · {p.code}
            </span>
            <strong>{p.name}</strong>
          </div>
        </div>
        <div className="project-context-facts">
          <span>
            <Package size={14} />
            <b>{s.deliverables.length}</b> entregas
          </span>
          <span>
            <CheckCircle2 size={14} />
            <b>
              {s.deliverables.length
                ? Math.round((accepted / s.deliverables.length) * 100) + "%"
                : "—"}
            </b>{" "}
            aceitas
          </span>
          <span>
            <b>{s.workstreams.length}</b> frentes
          </span>
        </div>
        <label className="density-picker">
          Densidade
          <select
            aria-label="Densidade da visão"
            value={density}
            onChange={(e) => onDensity(e.target.value as Density)}
          >
            <option value="compact">Compacta</option>
            <option value="comfortable">Confortável</option>
          </select>
        </label>
      </div>
      <nav className="project-tabs" aria-label="Visões do projeto">
        {PROJECT_TABS.map((t) => (
          <a
            key={t.id}
            href={link(t.id)}
            aria-current={t.views.includes(page) ? "page" : undefined}
            onClick={(e) => click(e, t.id)}
          >
            {t.name}
          </a>
        ))}
      </nav>
    </section>
  );
}
const dimensions: {
  key: keyof TowerFilters;
  title: string;
  dataset?: string;
}[] = [
  { key: "domain", title: "Domínio", dataset: "domains" },
  { key: "stream", title: "Frente", dataset: "workstreams" },
  { key: "release", title: "Release", dataset: "releases" },
  { key: "area", title: "Área", dataset: "areas" },
  { key: "squad", title: "Squad", dataset: "squads" },
  { key: "layer", title: "Camada" },
  { key: "owner", title: "Responsável", dataset: "users" },
  { key: "search", title: "Busca" },
];
export function ActiveFilters({
  s,
  filters,
  visible,
  onRemove,
  onClear,
}: {
  s: Row;
  filters: TowerFilters;
  visible: number;
  onRemove: (key: keyof TowerFilters) => void;
  onClear: () => void;
}) {
  const active = dimensions.filter((d) => filters[d.key]);
  if (!active.length) return null;
  return (
    <div className="active-filter-bar" aria-label="Filtros ativos">
      <span className="filter-result">
        <SlidersHorizontal size={13} />
        <strong>{visible}</strong> de {s.deliverables.length} entregas
      </span>
      <div className="filter-chips">
        {active.map((d) => {
          const value = filters[d.key]!;
          const row = d.dataset
            ? s[d.dataset]?.find((r: Row) => r.id === value)
            : null;
          const name =
            value === UNASSIGNED
              ? "Não atribuído"
              : row?.name || row?.display_name || row?.code || label(value);
          return (
            <button
              className="filter-chip"
              key={d.key}
              onClick={() => onRemove(d.key)}
              aria-label={`Remover filtro ${d.title}: ${name}`}
            >
              <span>
                {d.title}: <b>{name}</b>
              </span>
              <X size={12} />
            </button>
          );
        })}
      </div>
      <button className="text-button" onClick={onClear}>
        Limpar tudo
      </button>
    </div>
  );
}
export function ViewBreadcrumb({
  code,
  title,
}: {
  code?: string;
  title: string;
}) {
  return (
    <div className="breadcrumbs">
      <span>Workspace</span>
      <ChevronRight size={12} />
      <span>{code || "Portfólio"}</span>
      <ChevronRight size={12} />
      <strong>{title}</strong>
    </div>
  );
}
