"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Layers3 } from "lucide-react";
import { api } from "../client";
import { ExecutionBand } from "./feature-landscape";
import type { Row } from "../cockpit/model";
export function ProjectPulse({
  activeId,
  onOpen,
  onPortfolio,
}: {
  activeId: string;
  onOpen: (id: string) => void;
  onPortfolio: () => void;
}) {
  const query = useQuery({
    queryKey: ["projects"],
    queryFn: () => api("projects"),
  });
  return (
    <section className="mg-project-pulse" aria-label="Panorama dos projetos">
      <header>
        <span>
          <Layers3 size={12} /> PROJETOS · {query.data?.items?.length ?? "—"}{" "}
          acessíveis
        </span>
        <button onClick={onPortfolio}>
          Explorar portfólio <ArrowUpRight size={13} />
        </button>
      </header>
      {query.isLoading && (
        <p className="muted">Carregando panorama dos projetos…</p>
      )}
      {query.error && (
        <button className="button small" onClick={() => query.refetch()}>
          Panorama indisponível · tentar novamente
        </button>
      )}
      {(query.data?.items?.length || 0) > 1 && (
        <div
          className="mg-project-strip"
          tabIndex={0}
          role="region"
          aria-label="Projetos acessíveis"
        >
          {query.data?.items?.map((p: Row) => (
            <button
              key={p.id}
              className="mg-project-mini"
              aria-current={p.id === activeId ? "true" : undefined}
              onClick={() => onOpen(p.id)}
            >
              <strong>{p.name}</strong>
              <span>
                <span>
                  {p.featureCount} features · {p.total} entregas
                </span>
                <ArrowUpRight size={12} />
              </span>
              <ExecutionBand counts={p} />
              <span>
                <span>{p.active} em andamento</span>
                <span>
                  {p.overdue} vencidas · {p.blocked} bloqueadas
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
