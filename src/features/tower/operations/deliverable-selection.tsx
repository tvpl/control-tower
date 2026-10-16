"use client";
import { useState } from "react";
import { CalendarDays, ListChecks, Pencil, Sparkles, X } from "lucide-react";
import { canEdit } from "@/server/domain/rules";
import { DataTable } from "../data-table";
import { deliveryColumns } from "../presentation";
import { BulkEditDialog } from "./bulk-edit-dialog";
import type { Row, Select } from "../cockpit/model";
export function DeliverableSelection({
  s,
  items,
  pid,
  select,
  onSaved,
  onAI,
  planning = false,
}: {
  s: Row;
  items: Row[];
  pid: string;
  select: (kind: string, r: Row, records?: Row[]) => void;
  onSaved: () => void;
  onAI: (ids: string[]) => void;
  planning?: boolean;
}) {
  const [ids, setIds] = useState<string[]>([]),
    [operation, setOperation] = useState<"EDIT" | "PLAN" | null>(null),
    [notice, setNotice] = useState("");
  const eligible = (r: Row) =>
    canEdit(s.roles, "deliverables", r.workstream_id);
  const candidates = items.filter(eligible),
    selected = items.filter((r) => ids.includes(r.id)),
    selectedIds = new Set(selected.map((r) => r.id));
  function toggle(values: string[], checked: boolean) {
    const next = checked
      ? [...new Set([...selectedIds, ...values])]
      : [...selectedIds].filter((id) => !values.includes(id));
    if (next.length > 100) {
      setNotice(
        "Selecione até 100 entregáveis por lote. A seleção anterior foi preservada.",
      );
      return;
    }
    setNotice("");
    setIds(next);
  }
  return (
    <section
      className="deliverable-selection"
      aria-label={
        planning ? "Seleção para planejamento" : "Seleção de entregáveis"
      }
    >
      {candidates.length > 0 && (
        <div className="selection-toolbar">
          <span>
            <ListChecks size={17} />
            <strong>{selected.length}</strong> selecionados de {items.length} no
            recorte
          </span>
          <div className="selection-actions">
            <button
              className="button small"
              onClick={() => {
                setIds(candidates.slice(0, 100).map((r) => r.id));
                setNotice("");
              }}
            >
              {candidates.length > 100
                ? "Selecionar primeiros 100"
                : "Selecionar recorte"}
            </button>
            <button
              className="button small"
              disabled={!selected.length}
              onClick={() => setOperation("EDIT")}
            >
              <Pencil size={14} />
              Editar em lote
            </button>
            <button
              className="button small"
              disabled={!selected.length}
              onClick={() => setOperation("PLAN")}
            >
              <CalendarDays size={14} />
              Planejar datas
            </button>
            <button
              className="button small"
              disabled={!selected.length}
              onClick={() => onAI(selected.map((r) => r.id))}
            >
              <Sparkles size={14} />
              IA da seleção
            </button>
            <button
              className="icon-button"
              disabled={!selected.length}
              aria-label="Limpar seleção de entregáveis"
              onClick={() => {
                setIds([]);
                setNotice("");
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="error">
          {notice}
        </p>
      )}
      <DataTable
        items={items}
        columns={deliveryColumns(s)}
        onSelect={(r, records) => select("deliverables", r, records)}
        selection={
          candidates.length ? { ids: selectedIds, eligible, toggle } : undefined
        }
      />
      {operation && selected.length > 0 && (
        <BulkEditDialog
          s={s}
          pid={pid}
          records={selected}
          planning={operation === "PLAN"}
          onClose={() => setOperation(null)}
          onSaved={() => {
            setIds([]);
            onSaved();
          }}
        />
      )}
    </section>
  );
}
export function PlanningWorkspace({
  s,
  pid,
  select,
  onSaved,
  onAI,
}: {
  s: Row;
  pid: string;
  select: Select;
  onSaved: () => void;
  onAI: (ids: string[]) => void;
}) {
  const [focus, setFocus] = useState("ALL");
  const filters = [
    { id: "ALL", name: "Todas", test: (_r: Row) => true },
    { id: "DATE", name: "Sem forecast", test: (r: Row) => !r.forecast_date },
    { id: "OWNER", name: "Sem responsável", test: (r: Row) => !r.owner_id },
    {
      id: "BLOCKED",
      name: "Bloqueadas",
      test: (r: Row) => r.execution_status === "BLOCKED",
    },
  ];
  const items = s.deliverables.filter(
    filters.find((f) => f.id === focus)!.test,
  );
  return (
    <section className="planning-workspace">
      <div className="section-toolbar">
        <div>
          <h2>Planejamento operacional</h2>
          <p className="muted">
            Trate lacunas e ajuste previsões com prévia. A baseline aprovada
            permanece preservada.
          </p>
        </div>
      </div>
      <div className="planning-focus" aria-label="Foco do planejamento">
        {filters.map((f) => (
          <button
            className={f.id === focus ? "selected" : ""}
            key={f.id}
            onClick={() => setFocus(f.id)}
            aria-pressed={f.id === focus}
          >
            <span>{f.name}</span>
            <strong>{s.deliverables.filter(f.test).length}</strong>
          </button>
        ))}
      </div>
      <DeliverableSelection
        key={focus}
        s={s}
        items={items}
        pid={pid}
        select={select}
        onSaved={onSaved}
        onAI={onAI}
        planning
      />
    </section>
  );
}
