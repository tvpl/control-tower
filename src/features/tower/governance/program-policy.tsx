"use client";
import { useState } from "react";
import { Settings2 } from "lucide-react";
import { api } from "../client";
import type { Row } from "../cockpit/model";
export function ProgramPolicy({
  s,
  pid,
  onSaved,
}: {
  s: Row;
  pid: string;
  onSaved: () => void;
}) {
  const p = s.programs[0],
    policy = p.health_policy || {
      stale_days: 7,
      delay_tolerance_days: 0,
      dependency_minimum: "HIGH",
    },
    [estimate, setEstimate] = useState(String(p.inventory_estimate ?? "")),
    [estimateDate, setEstimateDate] = useState(
      p.inventory_estimate_as_of || s.asOf.slice(0, 10),
    ),
    [estimateNotes, setEstimateNotes] = useState(
      p.inventory_estimate_notes || "",
    ),
    [days, setDays] = useState(policy.stale_days),
    [tolerance, setTolerance] = useState(policy.delay_tolerance_days),
    [minimum, setMinimum] = useState(policy.dependency_minimum),
    [ai, setAI] = useState(p.ai_enabled),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const admin = s.roles.some((r: Row) => r.role === "PROGRAM_ADMIN");
  return (
    <section className="ct-panel analysis-panel">
      <header>
        <h2>
          <Settings2 size={18} /> Política do programa
        </h2>
        <small>Versão {p.version} · regras congeladas em snapshots</small>
      </header>
      <form
        className="catalog-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              `programs/${pid}`,
              pid,
              "PATCH",
              {
                inventory_estimate: estimate ? Number(estimate) : null,
                inventory_estimate_as_of: estimate ? estimateDate : null,
                inventory_estimate_notes: estimate ? estimateNotes : null,
                health_policy: {
                  stale_days: days,
                  delay_tolerance_days: tolerance,
                  dependency_minimum: minimum,
                },
                ai_enabled: ai,
                changeReason: reason,
              },
              Number(p.version),
            );
            onSaved();
            setReason("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Universo estimado de capacidades
          <input
            aria-label="Universo estimado de capacidades"
            disabled={!admin}
            type="number"
            min={1}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="Desconhecido"
          />
        </label>
        <label>
          Data da estimativa
          <input
            aria-label="Data da estimativa de inventário"
            disabled={!admin || !estimate}
            required={!!estimate}
            type="date"
            value={estimateDate}
            onChange={(e) => setEstimateDate(e.target.value)}
          />
        </label>
        <label className="full">
          Fonte e premissas da estimativa
          <textarea
            aria-label="Fonte da estimativa de inventário"
            disabled={!admin || !estimate}
            required={!!estimate}
            minLength={3}
            maxLength={2000}
            value={estimateNotes}
            onChange={(e) => setEstimateNotes(e.target.value)}
          />
        </label>
        <label>
          Cadência máxima de atualização (dias)
          <input
            aria-label="Cadência máxima em dias"
            type="number"
            min={1}
            max={90}
            required
            disabled={!admin}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <label>
          Tolerância de desvio para saúde (dias)
          <input
            aria-label="Tolerância de desvio em dias"
            type="number"
            min={0}
            max={30}
            required
            disabled={!admin}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
          />
        </label>
        <label>
          Dependências impeditivas na saúde
          <select
            aria-label="Severidade mínima da dependência"
            disabled={!admin}
            value={minimum}
            onChange={(e) => setMinimum(e.target.value)}
          >
            <option value="HIGH">Alta e crítica</option>
            <option value="CRITICAL">Somente crítica</option>
          </select>
        </label>
        <label className="catalog-check">
          <input
            type="checkbox"
            disabled={!admin}
            checked={ai || false}
            onChange={(e) => setAI(e.target.checked)}
          />
          Permitir consulta ao provedor externo de assistência configurado
        </label>
        <p className="ct-footnote full">
          A tolerância classifica saúde; datas, bloqueios, aceite e prontidão
          continuam verificáveis. O provedor externo requer configuração do
          operador e um comando explícito para cada consulta.
        </p>
        <label className="full">
          Motivo da alteração
          <textarea
            aria-label="Motivo da política do programa"
            required
            minLength={3}
            maxLength={2000}
            disabled={!admin}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p className="error full" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={!admin || busy || reason.trim().length < 3}
        >
          Salvar política do programa
        </button>
      </form>
    </section>
  );
}
