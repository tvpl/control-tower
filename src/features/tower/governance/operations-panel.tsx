"use client";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { api } from "../client";
import { fullDate } from "../presentation";
import type { Row } from "../cockpit/model";
export function OperationsPanel({ s, pid }: { s: Row; pid: string }) {
  const admin = s.roles.some((r: Row) => r.role === "PROGRAM_ADMIN");
  const q = useQuery({
    queryKey: ["operations", pid],
    queryFn: () => api("operations/metrics", pid),
    enabled: admin,
    refetchInterval: 15000,
  });
  if (!admin) return null;
  return (
    <section className="ct-panel analysis-panel">
      <header>
        <h2>
          <Activity size={18} /> Saúde técnica e processamento
        </h2>
      </header>
      {q.error && (
        <p className="error" role="alert">
          {q.error.message}
        </p>
      )}
      {q.data && (
        <>
          <div className="ct-metric-grid">
            <article>
              <strong>{q.data.outbox.pending}</strong>
              <span>Eventos na outbox</span>
            </article>
            <article>
              <strong>
                {q.data.jobs
                  .filter((j: Row) => ["QUEUED", "RUNNING"].includes(j.status))
                  .reduce((sum: number, j: Row) => sum + j.total, 0)}
              </strong>
              <span>Jobs pendentes</span>
            </article>
            <article>
              <strong>
                {q.data.jobs
                  .filter((j: Row) => ["FAILED", "CONFLICT"].includes(j.status))
                  .reduce((sum: number, j: Row) => sum + j.total, 0)}
              </strong>
              <span>Jobs com atenção</span>
            </article>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Estado</th>
                  <th>Último sinal</th>
                </tr>
              </thead>
              <tbody>
                {q.data.workers.map((w: Row) => (
                  <tr key={w.id}>
                    <td>{w.id}</td>
                    <td>
                      {w.status}{" "}
                      {new Date(q.data.asOf).getTime() -
                        new Date(w.last_seen_at).getTime() >
                      45000
                        ? "· Sinal vencido"
                        : ""}
                    </td>
                    <td>{fullDate(w.last_seen_at, s.programs[0]?.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!q.data.workers.length && (
            <p>Worker ainda sem heartbeat registrado.</p>
          )}
          <p className="ct-footnote">
            Consulta em {fullDate(q.data.asOf, s.programs[0]?.timezone)}.
            Telemetria técnica é independente da saúde e do aceite do programa.
            Logs da API incluem correlação, método, rota e duração.
          </p>
        </>
      )}
    </section>
  );
}
