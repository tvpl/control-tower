"use client";
import { useState } from "react";
import {
  ArrowDownUp,
  Layers3,
  Package,
  RotateCcw,
  Save,
  Undo2,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PriorityKind } from "@/server/domain/priorities";
export function PriorityIntro({
  total,
  blocked,
  prioritized,
}: {
  total: number;
  blocked: number;
  prioritized: number;
}) {
  return (
    <section className="priority-intro" aria-label="Resumo da priorização">
      <div className="priority-intro-copy">
        <span className="priority-intro-mark">
          <ArrowDownUp size={21} />
        </span>
        <div>
          <span className="eyebrow">DECISÕES QUE MOVEM O PROGRAMA</span>
          <h2>A próxima entrega começa aqui.</h2>
          <p>Organize a sequência. Entenda o impacto. Dê clareza ao time.</p>
        </div>
      </div>
      <div className="priority-intro-stats">
        {[
          [total, "no inventário"],
          [blocked, "com bloqueios"],
          [prioritized, "priorizados"],
        ].map(([value, text]) => (
          <div key={text}>
            <strong>{String(value).padStart(2, "0")}</strong>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
export function PriorityTabs({
  kind,
  locked,
  onChange,
}: {
  kind: PriorityKind;
  locked: boolean;
  onChange: (kind: PriorityKind) => void;
}) {
  return (
    <div
      className="priority-kind-tabs"
      role="tablist"
      aria-label="Tipo de prioridade"
    >
      {(["deliverables", "capabilities"] as const).map((value) => (
        <button
          key={value}
          role="tab"
          id={`priority-tab-${value}`}
          aria-controls="priority-board-content"
          aria-selected={kind === value}
          tabIndex={kind === value ? 0 : -1}
          disabled={locked && kind !== value}
          onClick={() => onChange(value)}
          onKeyDown={(e) => {
            if (
              !locked &&
              ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)
            ) {
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? "deliverables"
                  : e.key === "End"
                    ? "capabilities"
                    : kind === "deliverables"
                      ? "capabilities"
                      : "deliverables";
              onChange(next);
              requestAnimationFrame(() =>
                document.getElementById(`priority-tab-${next}`)?.focus(),
              );
            }
          }}
        >
          {value === "deliverables" ? (
            <Package size={15} />
          ) : (
            <Layers3 size={15} />
          )}{" "}
          {value === "deliverables" ? "Entregáveis" : "Capacidades"}
        </button>
      ))}
    </div>
  );
}
export function PrioritySaveBar({
  note,
  onNoteChange,
  saving,
  canUndo,
  dirty,
  pending,
  canSave,
  onUndo,
  onReset,
  onSave,
}: {
  note: string;
  onNoteChange: (v: string) => void;
  saving: boolean;
  canUndo: boolean;
  dirty: boolean;
  pending: boolean;
  canSave: boolean;
  onUndo: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <div className={`priority-save-bar ${pending ? "has-changes" : ""}`}>
      <div
        className={`priority-save-note ${noteOpen ? "note-open" : ""}`}
        id="priority-note-region"
      >
        <label htmlFor="priority-note">
          Nota da priorização <span>opcional</span>
        </label>
        <input
          id="priority-note"
          value={note}
          maxLength={2000}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="O que motivou esta sequência?"
          disabled={saving}
        />
      </div>
      <div className="priority-save-actions">
        <Button
          size="small"
          className="priority-note-toggle"
          onClick={() => setNoteOpen(!noteOpen)}
          aria-expanded={noteOpen}
          aria-controls="priority-note-region"
        >
          <MessageSquare size={14} />
          Nota
        </Button>
        <Button
          size="small"
          disabled={!canUndo || saving}
          onClick={onUndo}
          aria-label="Desfazer"
        >
          <Undo2 size={15} />
          <span className="priority-action-label">Desfazer</span>
        </Button>
        <Button
          size="small"
          disabled={!dirty || saving}
          onClick={onReset}
          aria-label="Restaurar"
        >
          <RotateCcw size={14} />
          <span className="priority-action-label">Restaurar</span>
        </Button>
        <Button
          variant="primary"
          disabled={saving || !canSave}
          onClick={onSave}
        >
          <Save size={15} />
          {saving ? "Salvando…" : "Salvar prioridades"}
        </Button>
      </div>
    </div>
  );
}
