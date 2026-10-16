"use client";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Activity,
  CalendarDays,
  ChevronRight,
  Radar,
  Sparkles,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { fmt, fullDate } from "../presentation";
import { label } from "../metadata";
import {
  deliveryAnomalies,
  governanceAnomalies,
  scopeMetrics,
  snapshotTrend,
} from "./insight-model";
import type { Row, Select } from "./model";

export function ExecutiveSignal({
  s,
  ds,
  select,
}: {
  s: Row;
  ds: Row[];
  select: Select;
}) {
  const m = scopeMetrics(s, ds);
  const decisions = (s.decisions || []).filter(
    (d: Row) => d.status === "PROPOSED",
  );
  const blocked = ds.filter((d) => d.execution_status === "BLOCKED");
  const principal =
    blocked.find((d) => d.criticality === "CRITICAL") || blocked[0];
  return (
    <section className="ct-signal" aria-label="Síntese do projeto">
      <div className="ct-signal-copy">
        <span className="ct-overline">
          <Activity size={14} /> PULSO DO PROJETO
        </span>
        <h2>
          {principal
            ? `${blocked.length} ${blocked.length === 1 ? "entrega precisa" : "entregas precisam"} de atenção`
            : ds.length
              ? "Avanço visível. Próxima decisão em foco."
              : "Um projeto pronto para ganhar forma."}
        </h2>
        <p>
          {principal
            ? `${principal.code} · ${principal.name}`
            : "Explore as features, acompanhe as frentes e conecte as dependências."}
        </p>
        {principal && (
          <button onClick={() => select("deliverables", principal)}>
            Investigar bloqueio <ArrowUpRight size={15} />
          </button>
        )}
        {decisions.length > 0 && (
          <button onClick={() => select("decisions", decisions[0])}>
            {decisions.length}{" "}
            {decisions.length === 1 ? "decisão pendente" : "decisões pendentes"}{" "}
            no programa <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      <div className="ct-signal-progress">
        <span>
          {m.provisional
            ? "Avanço provisório · por contagem"
            : "Avanço ponderado · baseline aprovada"}
        </span>
        <strong>{m.progress == null ? "—" : `${m.progress}%`}</strong>
        <div
          role="progressbar"
          aria-label="Avanço do recorte"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={m.progress ?? undefined}
          aria-valuetext={
            m.progress == null
              ? "Sem denominador"
              : `${m.numerator} de ${m.denominator}`
          }
        >
          <i style={{ width: `${m.progress || 0}%` }} />
        </div>
        <small>
          {m.numerator} / {m.denominator}{" "}
          {m.provisional ? "entregas aceitas" : "unidades de peso aceitas"} ·
          fonte PostgreSQL
        </small>
      </div>
    </section>
  );
}
export function ProjectIntelligence({
  s,
  ds,
  select,
}: {
  s: Row;
  ds: Row[];
  select: Select;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [radarOpen, setRadarOpen] = useState(false);
  const anomalies = [
      ...deliveryAnomalies(s, ds),
      ...governanceAnomalies(s, ds),
    ],
    metrics = scopeMetrics(s, ds),
    trend = snapshotTrend(s, ds);
  const finding = anomalies.find((a) => a.key === active);
  const impacted = new Set(
    anomalies.flatMap((a) =>
      a.items.map((d) => `${a.kind || "deliverables"}:${d.id}`),
    ),
  );
  const decisions = (s.decisions || []).filter(
    (d: Row) => d.status === "PROPOSED",
  );
  const risks = (s.raid || []).filter(
    (r: Row) =>
      r.kind === "RISK" &&
      r.status !== "RESOLVED" &&
      ["HIGH", "CRITICAL"].includes(r.severity),
  );
  const milestones = [...(s.milestones || [])]
    .filter((m: Row) => !m.actual_date && (m.forecast_date || m.baseline_date))
    .sort((a: Row, b: Row) =>
      String(a.forecast_date || a.baseline_date).localeCompare(
        String(b.forecast_date || b.baseline_date),
      ),
    )
    .slice(0, 4);
  return (
    <>
      <div className="ct-intelligence-grid">
        <section className="ct-panel ct-trend">
          <header>
            <h2>
              <Activity size={16} /> Evolução dos aceites
            </h2>
            <span>{trend.length} snapshots</span>
          </header>
          {trend.length ? (
            <>
              <div className="ct-trend-chart" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trend}
                    accessibilityLayer={false}
                    margin={{ top: 14, right: 18, bottom: 0, left: -24 }}
                  >
                    <defs>
                      <linearGradient
                        id="acceptance-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--accent-strong)"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--accent-strong)"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(n) => `${n}%`}
                      tick={{ fill: "var(--secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        color: "var(--text)",
                      }}
                      formatter={(v) => [`${v}%`, "Aceitos"]}
                    />
                    <Area
                      type="linear"
                      dataKey="accepted"
                      stroke="var(--accent-strong)"
                      fill="url(#acceptance-fill)"
                      strokeWidth={3}
                      isAnimationActive={false}
                      connectNulls={false}
                      dot={{
                        r: 4,
                        fill: "var(--accent-strong)",
                        strokeWidth: 0,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <details className="ct-trend-table">
                <summary>Consultar valores e snapshots</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Aceite</th>
                      <th>Bloqueados</th>
                      <th>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((t) => (
                      <tr key={t.id}>
                        <td>{fullDate(t.asOf, s.programs?.[0]?.timezone)}</td>
                        <td>
                          {t.accepted == null
                            ? "Não comparável"
                            : `${t.accepted}%`}
                        </td>
                        <td>{t.blocked ?? "—"}</td>
                        <td>
                          <button
                            className="row-link"
                            onClick={() =>
                              select(
                                "snapshots",
                                s.snapshots.find((v: Row) => v.id === t.id),
                              )
                            }
                          >
                            Abrir snapshot
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <div className="ct-trend-empty">
              <Activity size={36} />
              <strong>O histórico começa no primeiro snapshot</strong>
              <p>
                Preserve o estado do projeto para acompanhar a evolução com
                dados verificáveis.
              </p>
            </div>
          )}
          <footer>
            Coorte dos IDs atuais no recorte · fórmulas diferentes ou itens
            ausentes ficam sem comparação. Snapshot não é dado ao vivo.
          </footer>
        </section>
        <section className="ct-panel ct-radar">
          <header>
            <h2>
              <Radar size={16} /> Radar de atenção
            </h2>
            <button
              className="ct-small-button"
              onClick={() => setRadarOpen(true)}
            >
              Ver tudo <ArrowUpRight size={14} />
            </button>
          </header>
          <div className="ct-quality">
            <span>
              <Sparkles size={15} /> Qualidade do inventário
            </span>
            <strong>
              {metrics.quality == null ? "—" : `${metrics.quality}%`}
            </strong>
            <div>
              <i style={{ width: `${metrics.quality || 0}%` }} />
            </div>
            <small>
              7 critérios por item · {metrics.stale}/{ds.length} desatualizados
            </small>
          </div>
          <div className="ct-radar-list">
            {anomalies
              .filter((a) => a.items.length)
              .slice(0, 4)
              .map((a) => (
                <button key={a.key} onClick={() => setActive(a.key)}>
                  <i className={a.severe ? "severe" : ""} />
                  <span>{a.title}</span>
                  <b>{a.items.length}</b>
                  <ChevronRight size={15} />
                </button>
              ))}
            {!impacted.size && (
              <p className="ct-empty">
                Nenhuma anomalia nas regras examinadas.
              </p>
            )}
          </div>
          <footer>
            {impacted.size} registros com atenção · itens podem aparecer em mais
            de uma regra.
          </footer>
        </section>
      </div>
      <section className="ct-panel ct-agenda">
        <header>
          <h2>
            <CalendarDays size={16} /> Agenda de governança
          </h2>
          <span>
            Programa completo · independente dos filtros de entregáveis
          </span>
        </header>
        <div className="ct-agenda-grid">
          <div>
            <h3>
              <ShieldCheck size={16} /> Decisões requeridas{" "}
              <b>{decisions.length}</b>
            </h3>
            {decisions.slice(0, 3).map((d: Row) => (
              <button key={d.id} onClick={() => select("decisions", d)}>
                <span>
                  {d.title || d.name}
                  <small>
                    {fmt(d.due_date)} ·{" "}
                    {s.users.find((u: Row) => u.id === d.owner_id)
                      ?.display_name || "Sem responsável"}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
            {!decisions.length && <p>Nenhuma decisão proposta.</p>}
          </div>
          <div>
            <h3>
              <Clock3 size={16} /> Próximos marcos <b>{milestones.length}</b>
            </h3>
            {milestones.map((m: Row) => (
              <button key={m.id} onClick={() => select("milestones", m)}>
                <span>
                  {m.name}
                  <small>
                    {fmt(m.forecast_date || m.baseline_date)} ·{" "}
                    {new Date(m.forecast_date || m.baseline_date).getTime() <
                    new Date(s.asOf).getTime()
                      ? "Vencido"
                      : "Previsto"}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
            {!milestones.length && (
              <p>Nenhum marco pendente com data definida.</p>
            )}
          </div>
          <div>
            <h3>
              <Radar size={16} /> Riscos relevantes <b>{risks.length}</b>
            </h3>
            {risks.slice(0, 3).map((r: Row) => (
              <button key={r.id} onClick={() => select("raid", r)}>
                <span>
                  {r.title}
                  <small>
                    {label(r.severity)} · {label(r.status)}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
            {!risks.length && <p>Nenhum risco alto ou crítico aberto.</p>}
          </div>
        </div>
      </section>
      <Modal
        open={radarOpen || !!finding}
        onClose={() => {
          setActive(null);
          setRadarOpen(false);
        }}
        wide
        title={finding?.title || "Radar de atenção"}
        description={
          finding?.detail ||
          `${ds.length} entregáveis após filtros. Qualidade: owner, aceite, forecast, camada, escopo, evidência e atualização em até ${s.programs?.[0]?.health_policy?.stale_days || 7} dias.`
        }
      >
        {!finding ? (
          <div className="ct-radar-all">
            {anomalies.map((a) => (
              <button key={a.key} onClick={() => setActive(a.key)}>
                <strong>{a.items.length}</strong>
                <span>
                  {a.title}
                  <small>{a.detail}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="ct-expanded-records">
            {finding.items.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setActive(null);
                  setRadarOpen(false);
                  select(finding.kind || "deliverables", d);
                }}
              >
                <span>
                  <small>{d.code}</small>
                  <strong>{d.name || d.title}</strong>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
            {!finding.items.length && <p>Nenhum registro nesta regra.</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
