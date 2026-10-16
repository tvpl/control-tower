"use client";
import { useState } from "react";
import { CalendarDays, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { api } from "../client";
import { FIELDS, label } from "../metadata";
import { BatchReview } from "./batch-review";
import type { Row } from "../cockpit/model";
const keys = [
  "owner_id",
  "workstream_id",
  "area_id",
  "squad_id",
  "forecast_date",
  "planning_status",
  "execution_status",
  "criticality",
];
const nullable = ["owner_id", "area_id", "squad_id", "forecast_date"];
export function BulkEditDialog({
  s,
  pid,
  records,
  planning = false,
  onClose,
  onSaved,
}: {
  s: Row;
  pid: string;
  records: Row[];
  planning?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState(planning ? "SHIFT_FORECAST" : "SET"),
    [fields, setFields] = useState([
      { key: "forecast_date", value: "", clear: false },
    ]),
    [days, setDays] = useState("7"),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [batch, setBatch] = useState<Row | null>(null),
    [commitKey, setCommitKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function invalidate() {
    setPreview(null);
    setBatch(null);
    setError("");
  }
  async function validate() {
    setBusy(true);
    invalidate();
    try {
      if (mode === "SET" && fields.some((f) => !f.clear && !f.value))
        throw new Error(
          "Preencha os campos selecionados ou marque Limpar valor.",
        );
      const b = {
        items: records.map((r) => ({
          id: r.id,
          expectedVersion: Number(r.version),
        })),
        change:
          mode === "SHIFT_FORECAST"
            ? { action: mode, days: Number(days) }
            : {
                action: mode,
                values: Object.fromEntries(
                  fields.map((f) => [f.key, f.clear ? null : f.value]),
                ),
              },
        reason,
      };
      const p = await api("deliverables/bulk/preview", pid, "POST", {
        batch: b,
      });
      setBatch(b);
      setPreview(p);
      setCommitKey(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      await api(
        "deliverables/bulk/commit",
        pid,
        "POST",
        { batch, expectedHash: preview!.hash },
        undefined,
        commitKey,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      wide
      className="operation-dialog"
      title={planning ? "Planejar datas em lote" : "Editar entregáveis em lote"}
      description="Revise a prévia antes de aplicar. Qualquer erro preserva o lote inteiro."
      onClose={() => !busy && onClose()}
    >
      <div className="batch-context">
        <CalendarDays size={22} />
        <div>
          <strong>{records.length} entregáveis selecionados</strong>
          <p>
            {records
              .slice(0, 5)
              .map((r) => r.code)
              .join(" · ")}
            {records.length > 5 ? ` · +${records.length - 5}` : ""}
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          validate();
        }}
        className="batch-form"
      >
        <fieldset disabled={busy}>
          <label>
            Operação
            <select
              aria-label="Operação em lote"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                invalidate();
              }}
            >
              <option value="SET">Definir campos</option>
              <option value="SHIFT_FORECAST">
                Deslocar forecasts existentes
              </option>
            </select>
          </label>
          {mode === "SHIFT_FORECAST" ? (
            <div className="batch-shift">
              <label>
                Deslocamento em dias
                <input
                  type="number"
                  required
                  min={-3650}
                  max={3650}
                  step={1}
                  value={days}
                  onChange={(e) => {
                    setDays(e.target.value);
                    invalidate();
                  }}
                />
              </label>
              <p>
                Positivo adia; negativo antecipa. Datas desconhecidas serão
                apontadas na prévia. Baseline e datas reais permanecem
                preservadas.
              </p>
            </div>
          ) : (
            <>
              {fields.map((f, index) => {
                const def = FIELDS.deliverables.find((d) => d.key === f.key)!;
                const options: Row[] = def.ref ? s[def.ref] || [] : [];
                function update(patch: Partial<typeof f>) {
                  setFields(
                    fields.map((v, i) =>
                      i === index ? { ...v, ...patch } : v,
                    ),
                  );
                  invalidate();
                }
                return (
                  <div className="batch-field-row" key={index}>
                    <label>
                      Campo {index + 1}
                      <select
                        aria-label={`Campo ${index + 1}`}
                        value={f.key}
                        onChange={(e) =>
                          update({
                            key: e.target.value,
                            value: "",
                            clear: false,
                          })
                        }
                      >
                        {keys
                          .filter(
                            (k) =>
                              k === f.key || !fields.some((v) => v.key === k),
                          )
                          .map((k) => (
                            <option key={k} value={k}>
                              {FIELDS.deliverables.find((d) => d.key === k)
                                ?.label || k}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Novo valor {index + 1}
                      {def.ref || def.options ? (
                        <select
                          aria-label={`Novo valor ${index + 1}`}
                          required={!f.clear}
                          disabled={f.clear}
                          value={f.value}
                          onChange={(e) => update({ value: e.target.value })}
                        >
                          <option value="">Selecionar</option>
                          {def.ref
                            ? options.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {[o.code, o.name || o.display_name]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </option>
                              ))
                            : def.options!.map((o) => (
                                <option key={o} value={o}>
                                  {label(o)}
                                </option>
                              ))}
                        </select>
                      ) : (
                        <input
                          aria-label={`Novo valor ${index + 1}`}
                          type="date"
                          required={!f.clear}
                          disabled={f.clear}
                          value={f.value}
                          onChange={(e) => update({ value: e.target.value })}
                        />
                      )}
                    </label>
                    {nullable.includes(f.key) && (
                      <label className="batch-clear">
                        <input
                          type="checkbox"
                          checked={f.clear}
                          onChange={(e) => update({ clear: e.target.checked })}
                        />
                        Limpar valor
                      </label>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remover campo ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => {
                        setFields(fields.filter((_, i) => i !== index));
                        invalidate();
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="button small"
                disabled={fields.length >= keys.length}
                onClick={() => {
                  setFields([
                    ...fields,
                    {
                      key: keys.find((k) => !fields.some((f) => f.key === k))!,
                      value: "",
                      clear: false,
                    },
                  ]);
                  invalidate();
                }}
              >
                <Plus size={14} />
                Adicionar campo
              </button>
            </>
          )}
          <label>
            Justificativa do lote
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                invalidate();
              }}
            />
          </label>
        </fieldset>
        <div className="batch-actions">
          <button className="button" disabled={busy}>
            <ClipboardCheck size={15} />
            {busy ? "Verificando…" : "Validar lote"}
          </button>
          <span>Execução, aceite e prontidão são dimensões distintas.</span>
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <>
          <BatchReview preview={preview} s={s} />
          <div className="batch-commit">
            <p>
              {preview.valid
                ? "A confirmação verifica as versões novamente e registra autoria e justificativa."
                : "Nenhuma alteração foi gravada."}
            </p>
            <button
              className="button primary"
              disabled={busy || !preview.valid}
              onClick={commit}
            >
              {busy ? "Aplicando…" : `Aplicar ${records.length} alterações`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
