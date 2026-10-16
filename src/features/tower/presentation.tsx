import { Layers3 } from "lucide-react";
import { label, TITLES } from "./metadata";
export type Row = Record<string, any>;
export const fmt = (v?: string) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(v))
    : "Não definido";
export const fullDate = (v?: string, timezone = "America/Sao_Paulo") =>
  v
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(v))
    : "Não avaliado";
export function Badge({ value, text }: { value: string; text?: string }) {
  return (
    <span
      className={`badge ${["BLOCKED", "CRITICAL", "FAILED", "NOT_READY"].includes(value) ? "danger" : ["DONE", "PASSED", "READY", "APPROVED", "ON_TRACK", "RESOLVED"].includes(value) ? "success" : ["IN_PROGRESS", "UAT", "AT_RISK", "PENDING", "HIGH", "EXCEPTION_APPROVED"].includes(value) ? "warning" : "neutral"}`}
    >
      <i />
      {text || label(value)}
    </span>
  );
}
export function Empty({
  text = "Ainda não há registros para esta visão.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Layers3 size={26} />
      <strong>Um novo ponto de partida</strong>
      <p>{text}</p>
    </div>
  );
}
export function toCSV(rows: Row[]) {
  const keys = [
    "code",
    "name",
    "layer",
    "execution_status",
    "delivery_stage",
    "forecast_date",
    "accepted",
  ];
  return (
    "\uFEFF" +
    [
      keys.join(","),
      ...rows.map((r) =>
        keys
          .map(
            (k) =>
              `"${String(r[k] ?? "")
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(","),
      ),
    ].join("\n")
  );
}
export function deliveryColumns(s: Row) {
  return [
    {
      accessorKey: "name",
      header: "Entregável",
      cell: ({ row }: any) => (
        <div className="record-title">
          <span className="mono muted">{row.original.code}</span>
          <strong>{row.original.name}</strong>
        </div>
      ),
    },
    {
      accessorKey: "layer",
      header: "Camada",
      cell: ({ getValue }: any) => (
        <span className="layer-label">{label(getValue())}</span>
      ),
    },
    {
      accessorKey: "execution_status",
      header: "Execução",
      cell: ({ getValue }: any) => <Badge value={getValue()} />,
    },
    {
      accessorKey: "delivery_stage",
      header: "Estágio",
      cell: ({ getValue }: any) => (
        <span className="mono small-text">{label(getValue())}</span>
      ),
    },
    {
      accessorKey: "owner_id",
      header: "Responsável",
      cell: ({ getValue }: any) => (
        <span>
          {s.users.find((u: Row) => u.id === getValue())?.display_name ||
            "Não definido"}
        </span>
      ),
    },
    {
      accessorKey: "forecast_date",
      header: "Forecast",
      cell: ({ getValue }: any) => (
        <span className="mono small-text">{fmt(getValue())}</span>
      ),
    },
  ];
}
export function genericColumns(kind: string, s: Row) {
  if (kind === "deliverables") return deliveryColumns(s);
  return [
    {
      accessorKey:
        kind === "dependencies"
          ? "description"
          : kind === "raid" || kind === "evidence"
            ? "title"
            : "name",
      header: TITLES[kind] || "Registro",
      cell: ({ row }: any) => (
        <div className="record-title">
          <span className="mono muted">
            {row.original.code ||
              row.original.kind ||
              row.original.connector_type ||
              "REGISTRO"}
          </span>
          <strong>
            {row.original.name ||
              row.original.title ||
              row.original.description}
          </strong>
        </div>
      ),
    },
    {
      id: "state",
      header: "Estado",
      accessorFn: (r: Row) =>
        r.execution_status ||
        r.status ||
        r.inventory_maturity ||
        r.classification ||
        r.criticality ||
        "UNKNOWN",
      cell: ({ getValue }: any) => <Badge value={getValue()} />,
    },
    {
      id: "owner",
      header: "Responsável",
      accessorFn: (r: Row) =>
        s.users.find(
          (u: Row) => u.id === (r.owner_id || r.lead_id || r.author_id),
        )?.display_name || "Não definido",
    },
    {
      id: "date",
      header: "Prazo / atualização",
      accessorFn: (r: Row) =>
        r.due_date || r.needed_by || r.forecast_date || r.created_at || "",
      cell: ({ getValue }: any) => fmt(getValue()),
    },
  ];
}
