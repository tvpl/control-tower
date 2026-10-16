"use client";
import { ArrowUpRight, CircleAlert, Layers3, UserRound } from "lucide-react";
import { label } from "../metadata";
import { Badge } from "../presentation";
import type { Row, Select } from "../cockpit/model";
import { managementCounts, programDay } from "@/shared/management-signals";
import { ExecutionBand } from "../management/feature-landscape";
export function FrontWorkspace({
  s,
  deliverables,
  stream,
  onOpen,
  select,
}: {
  s: Row;
  deliverables: Row[];
  stream: string;
  onOpen: (id: string) => void;
  select: Select;
}) {
  const fronts = s.workstreams.filter((w: Row) => !stream || w.id === stream);
  return (
    <section className="front-workspace" aria-label="Frentes do projeto">
      <div className="front-workspace-intro">
        <div>
          <h2>O trabalho distribuído por frente</h2>
          <p>
            Execução e aceite lado a lado. Abra uma frente para acompanhar suas
            entregas.
          </p>
        </div>
        <span>
          {fronts.length} frentes · {deliverables.length} entregas no recorte
        </span>
      </div>
      <div className="front-card-grid">
        {fronts.map((w: Row) => {
          const ds = deliverables.filter((d) => d.workstream_id === w.id),
            done = ds.filter((d) => d.execution_status === "DONE").length,
            accepted = ds.filter((d) => d.accepted).length,
            blocked = ds.filter((d) => d.execution_status === "BLOCKED").length;
          const execution = ds.length
              ? Math.round((done / ds.length) * 100)
              : null,
            acceptance = ds.length
              ? Math.round((accepted / ds.length) * 100)
              : null;
          const lead = s.users.find((u: Row) => u.id === w.lead_id);
          const counts = managementCounts(
            ds,
            programDay(s.asOf, s.programs[0]?.timezone),
          );
          return (
            <article className="front-card" key={w.id}>
              <header>
                <span className="front-type">
                  <Layers3 size={14} />
                  {label(w.kind)}
                </span>
                <span className="mono muted">{w.code}</span>
              </header>
              <button
                className="front-card-title"
                onClick={() => select("workstreams", w)}
              >
                {w.name}
              </button>
              <span className="front-lead">
                <UserRound size={13} />
                {lead?.display_name || "Liderança não atribuída"}
              </span>
              <ExecutionBand counts={counts} />
              <div className="mg-front-signal">
                <span>{counts.active} em andamento</span>
                <span className={counts.overdue ? "late" : ""}>
                  {counts.overdue} com prazo vencido
                </span>
              </div>
              <div className="front-progress">
                <div>
                  <span>Execução concluída</span>
                  <strong>{execution == null ? "—" : `${execution}%`}</strong>
                </div>
                <progress
                  max={100}
                  value={execution ?? 0}
                  aria-label={`Execução da frente ${w.name}`}
                  aria-valuetext={
                    execution == null
                      ? "Sem entregas"
                      : `${done} de ${ds.length} concluídas`
                  }
                />
                <small>
                  {done}/{ds.length} entregas concluídas
                </small>
              </div>
              <div className="front-progress front-acceptance">
                <div>
                  <span>Aceite confirmado</span>
                  <strong>{acceptance == null ? "—" : `${acceptance}%`}</strong>
                </div>
                <progress
                  max={100}
                  value={acceptance ?? 0}
                  aria-label={`Aceite da frente ${w.name}`}
                  aria-valuetext={
                    acceptance == null
                      ? "Sem entregas"
                      : `${accepted} de ${ds.length} aceitas`
                  }
                />
                <small>
                  {accepted}/{ds.length} entregas aceitas
                </small>
              </div>
              <footer>
                {blocked ? (
                  <span className="front-blocked">
                    <CircleAlert size={14} />
                    {blocked} {blocked === 1 ? "bloqueada" : "bloqueadas"}
                  </span>
                ) : (
                  <Badge
                    value={ds.length ? "NO_BLOCKS" : "NO_ITEMS"}
                    text={
                      ds.length
                        ? "Sem execução bloqueada"
                        : "Sem entregas no recorte"
                    }
                  />
                )}
                <button className="button small" onClick={() => onOpen(w.id)}>
                  Ver entregas <ArrowUpRight size={13} />
                </button>
              </footer>
            </article>
          );
        })}
      </div>
      {!fronts.length && (
        <div className="empty">
          <Layers3 size={28} />
          <strong>Estruture as frentes do projeto</strong>
          <p>
            Cadastre desenvolvimento, negócio, infraestrutura ou spike em
            Administração → Estrutura → Frentes.
          </p>
        </div>
      )}
    </section>
  );
}
