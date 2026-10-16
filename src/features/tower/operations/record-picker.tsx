"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { nodeName } from "../forms";
import { TITLES } from "../metadata";
import type { Row } from "../cockpit/model";
export function RecordPicker({
  s,
  execution,
  onPick,
  onClose,
}: {
  s: Row;
  execution: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    [limit, setLimit] = useState(24);
  const nodes = s.nodes.filter(
    (n: Row) =>
      (!execution || n.entity_type === "deliverables") &&
      nodeName(n, s).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Modal
      open
      className="operation-dialog record-picker"
      title="Escolher registro da torre"
      description={
        execution
          ? "Atualização operacional exige um entregável."
          : "Busque pelo código ou nome do registro."
      }
      onClose={onClose}
    >
      <label className="record-picker-search">
        <Search size={16} />
        <input
          autoFocus
          aria-label="Buscar registro da torre"
          value={search}
          placeholder="Código ou nome…"
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(24);
          }}
        />
      </label>
      <p className="muted">{nodes.length} registros correspondentes</p>
      <div className="record-picker-list">
        {nodes.slice(0, limit).map((n: Row) => (
          <button
            className="record-picker-result"
            key={n.id}
            onClick={() => {
              onPick(n.id);
              onClose();
            }}
          >
            <span>{TITLES[n.entity_type] || n.entity_type}</span>
            <strong>{nodeName(n, s)}</strong>
          </button>
        ))}
      </div>
      {!nodes.length && (
        <p role="status">Nenhum registro corresponde à busca.</p>
      )}
      {limit < nodes.length && (
        <button className="button" onClick={() => setLimit((v) => v + 24)}>
          Mostrar mais registros
        </button>
      )}
    </Modal>
  );
}
