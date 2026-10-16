"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ExpandablePanel } from "./expandable-panel";
import { acceptance, type Row, type Select } from "./model";
const STATES = [
  { key: "ON_HOLD", name: "Em espera", color: "var(--chart-hold, #bc9e73)" },
  {
    key: "REOPENED",
    name: "Reabertos",
    color: "var(--chart-reopened, #c29bd8)",
  },
  {
    key: "NOT_STARTED",
    name: "Não iniciados",
    color: "var(--chart-not-started, #83929f)",
  },
  {
    key: "IN_PROGRESS",
    name: "Em andamento",
    color: "var(--chart-active, #79aef2)",
  },
  {
    key: "BLOCKED",
    name: "Bloqueados",
    color: "var(--chart-blocked, #dc9e62)",
  },
  { key: "DONE", name: "Concluídos", color: "var(--chart-done, #65cbb0)" },
  {
    key: "CANCELLED",
    name: "Cancelados",
    color: "var(--chart-cancelled, #a89ccd)",
  },
];
export function CockpitCharts({
  s,
  ds,
  micro,
  select,
  expandable = true,
}: {
  s: Row;
  ds: Row[];
  micro: boolean;
  select?: Select;
  expandable?: boolean;
}) {
  const m = acceptance(ds),
    states = STATES.map((v) => ({
      ...v,
      value: ds.filter((d) => d.execution_status === v.key).length,
    })).filter((v) => v.value > 0);
  const groups = micro
    ? [...new Set(ds.map((d) => d.layer))].map((layer) => ({
        id: layer,
        name: layer,
      }))
    : s.workstreams.map((w: Row) => ({ id: w.id, name: w.name }));
  if (!micro && ds.some((d) => !d.workstream_id))
    groups.push({ id: null, name: "Sem frente" });
  const rows = groups
    .map((g: Row) => ({
      ...g,
      ...acceptance(
        ds.filter((d) => (micro ? d.layer === g.id : d.workstream_id === g.id)),
      ),
    }))
    .filter((g: Row) => g.total > 0);
  return (
    <div className="ct-charts">
      <ExpandablePanel
        title="Aceite das entregas"
        caption="Contagem"
        footer="Execução concluída exige aceite verificável."
        ds={ds}
        select={select}
        allowExpand={expandable}
      >
        <div className="ct-acceptance">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-label={`${m.accepted} de ${m.total} aceitos, ${m.percentage ?? "não avaliado"}${m.percentage == null ? "" : " por cento"}`}
          >
            <circle className="ct-ring-base" cx="60" cy="60" r="48" />
            <circle
              className="ct-ring-fill"
              opacity={m.percentage ? 1 : 0}
              cx="60"
              cy="60"
              r="48"
              strokeDasharray={`${(m.percentage || 0) * 3.016} 301.6`}
            />
            <text x="60" y="58">
              {m.percentage == null ? "—" : `${m.percentage}%`}
            </text>
            <text className="ct-ring-label" x="60" y="77">
              ACEITOS
            </text>
          </svg>
          <div>
            <b>
              {m.accepted}
              <span> / {m.total}</span>
            </b>
            <p>Entregáveis aceitos</p>
            <small>
              {
                ds.filter((d) => d.execution_status === "DONE" && !d.accepted)
                  .length
              }{" "}
              concluídos sem aceite
            </small>
          </div>
        </div>
      </ExpandablePanel>
      <ExpandablePanel
        title="Distribuição da execução"
        caption={`${ds.length} itens`}
        footer="Status de execução · independente do aceite."
        ds={ds}
        select={select}
        allowExpand={expandable}
      >
        <div className="ct-distribution">
          <div className="ct-donut" aria-hidden="true">
            {ds.length ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart accessibilityLayer={false} tabIndex={-1}>
                  <Pie
                    rootTabIndex={-1}
                    data={states}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={47}
                    outerRadius={66}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {states.map((v) => (
                      <Cell key={v.key} fill={v.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      color: "var(--text)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span>—</span>
            )}
          </div>
          <ul>
            {states.length ? (
              states.map((v) => (
                <li key={v.key}>
                  <i style={{ background: v.color }} />
                  <span>{v.name}</span>
                  <b>{v.value}</b>
                  <small>
                    {Math.round((v.value / Math.max(ds.length, 1)) * 100)}%
                  </small>
                </li>
              ))
            ) : (
              <li>Sem entregáveis neste recorte</li>
            )}
          </ul>
        </div>
      </ExpandablePanel>
      <ExpandablePanel
        title={micro ? "Aceite por camada" : "Aceite por frente"}
        caption="Real / total"
        footer="0% = nenhum aceite · — = sem denominador."
        ds={ds}
        select={select}
        allowExpand={expandable}
      >
        <div
          className="ct-bars"
          tabIndex={0}
          role="region"
          aria-label={
            micro
              ? "Gráfico de aceite por camada"
              : "Gráfico de aceite por frente"
          }
        >
          {rows.map((g: Row) => (
            <div key={g.id}>
              <span title={g.name}>{g.name}</span>
              <div className="ct-bar" aria-hidden="true">
                <i style={{ width: `${g.percentage || 0}%` }} />
              </div>
              <b>{g.percentage}%</b>
              <small>
                {g.accepted}/{g.total}
              </small>
            </div>
          ))}
          {!rows.length && (
            <p className="ct-empty">Sem entregáveis neste recorte.</p>
          )}
        </div>
      </ExpandablePanel>
    </div>
  );
}
