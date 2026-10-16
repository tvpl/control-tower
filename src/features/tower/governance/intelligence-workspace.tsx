"use client";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/dialog";
import { useState } from "react";
import { Sparkles, GitBranch, FileSearch, Copy } from "lucide-react";
import { api } from "../client";
import { fullDate, fmt } from "../presentation";
import type { Row } from "../cockpit/model";
export function IntelligenceWorkspace({
  s,
  pid,
  select,
}: {
  s: Row;
  pid: string;
  select: (kind: string, r: Row) => void;
}) {
  const [snapshotId, setSnapshotId] = useState(s.snapshots[0]?.id || ""),
    [nodeId, setNodeId] = useState(""),
    [days, setDays] = useState(7),
    [result, setResult] = useState<Row | null>(null),
    [simulation, setSimulation] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [frozenSource, setFrozenSource] = useState<Row | null>(null);
  const fullSnapshot = useQuery({
    queryKey: ["snapshot", pid, snapshotId],
    queryFn: () => api(`snapshots/${snapshotId}`, pid),
    enabled: !!snapshotId,
  });
  const snap = fullSnapshot.data,
    context = snap?.payload.context || {},
    nodes = (context.nodes || []).filter(
      (n: Row) => n.entity_type === "deliverables",
    );
  async function run(action: string) {
    setBusy(true);
    setError("");
    try {
      const output = await api("intelligence", pid, "POST", {
        snapshotId,
        action,
        ...(action === "SIMULATE" ? { nodeId, days } : {}),
      });
      if (action === "SIMULATE") setSimulation(output);
      else setResult(output);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function source(id: string) {
    const frozen = snap?.payload.deliverables.find((d: Row) => d.id === id);
    if (frozen) setFrozenSource(frozen);
  }
  return (
    <section className="intelligence-workspace">
      <div className="policy-note">
        <FileSearch size={22} />
        <p>
          Escolha um snapshot autorizado para uma análise reproduzível. A
          síntese por regras funciona sem provedor externo. Simulações e
          sugestões exigem revisão humana e preservam os registros do projeto.
        </p>
      </div>
      <label>
        Snapshot de referência
        <select
          aria-label="Snapshot para análise"
          value={snapshotId}
          onChange={(e) => {
            setSnapshotId(e.target.value);
            setNodeId("");
            setResult(null);
            setSimulation(null);
          }}
        >
          <option value="">Selecionar snapshot</option>
          {s.snapshots.map((x: Row) => (
            <option key={x.id} value={x.id}>
              {fullDate(x.as_of, s.programs[0]?.timezone)} · {x.formula_version}{" "}
              · {x.payload_hash.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {fullSnapshot.error && (
        <p role="alert" className="error">
          {fullSnapshot.error.message}
        </p>
      )}
      {!s.snapshots.length && (
        <p className="ct-empty">
          Crie um snapshot no módulo de reports para iniciar a análise.
        </p>
      )}
      <div className="ct-intelligence-grid">
        <article className="ct-panel analysis-panel">
          <header>
            <h2>
              <Sparkles size={18} /> Síntese com fontes
            </h2>
          </header>
          <p>Contagem e sugestões vinculadas aos entregáveis congelados.</p>
          <div className="report-controls">
            <button
              className="button primary"
              disabled={!snap || busy}
              onClick={() => run("SUMMARY")}
            >
              Gerar síntese por regras
            </button>
            <button
              className="button"
              disabled={!snap || busy || !s.programs[0]?.ai_enabled}
              onClick={() => run("ASSIST")}
            >
              Consultar assistência externa
            </button>
          </div>
          <p className="ct-footnote">
            A assistência externa requer opt-in do programa, host autorizado e
            credencial no servidor. Envia apenas o resumo dos entregáveis deste
            snapshot (até 200), após este comando.
          </p>
          {result && (
            <>
              <span className="ct-overline">
                {result.mode === "RULES"
                  ? "SÍNTESE DETERMINÍSTICA"
                  : "ASSISTÊNCIA EXTERNA · REVISÃO OBRIGATÓRIA"}
              </span>
              <p className="analysis-summary">{result.summary}</p>
              <ul>
                {result.suggestions.map((r: Row, i: number) => (
                  <li key={i}>
                    <p>{r.text}</p>
                    <div className="report-controls">
                      {r.citations.map((id: string) => (
                        <button
                          className="button small"
                          key={id}
                          onClick={() => source(id)}
                        >
                          {result.sources.find((d: Row) => d.id === id)?.code ||
                            id}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {!result.suggestions.length && (
                <p>Nenhuma sugestão nas regras examinadas.</p>
              )}
              <small>
                Snapshot {result.snapshotId} · SHA-256 {result.snapshotHash}
              </small>
              <button
                className="button small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      [
                        result.summary,
                        ...result.suggestions.map(
                          (r: Row) => `${r.text} [${r.citations.join(", ")}]`,
                        ),
                        `Snapshot ${result.snapshotId} / ${result.snapshotHash}`,
                      ].join("\n"),
                    );
                    setCopied(true);
                  } catch {
                    setError(
                      "Não foi possível copiar. Permita o acesso à área de transferência.",
                    );
                  }
                }}
              >
                <Copy size={14} />
                {copied ? "Síntese copiada" : "Copiar síntese com fontes"}
              </button>
            </>
          )}
        </article>
        <article className="ct-panel analysis-panel">
          <header>
            <h2>
              <GitBranch size={18} /> Simulador de atraso
            </h2>
          </header>
          <label>
            Entregável de origem
            <select
              aria-label="Origem da simulação"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
            >
              <option value="">Selecionar</option>
              {nodes.map((n: Row) => {
                const d = snap.payload.deliverables.find(
                  (d: Row) => d.id === n.entity_id,
                );
                return (
                  <option key={n.id} value={n.id}>
                    {d?.code} · {d?.name}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            Atraso hipotético em dias
            <input
              aria-label="Dias de atraso hipotético"
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <button
            className="button primary"
            disabled={!snap || !nodeId || busy}
            onClick={() => run("SIMULATE")}
          >
            Simular propagação
          </button>
          {simulation && (
            <>
              <h3>{simulation.proposals.length} entregáveis no cenário</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entregável</th>
                      <th>Forecast congelado</th>
                      <th>Hipótese</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.proposals.map((d: Row) => (
                      <tr key={d.id}>
                        <td>
                          <button
                            className="row-link"
                            onClick={() => source(d.id)}
                          >
                            {d.code}
                          </button>
                        </td>
                        <td>{fmt(d.forecast)}</td>
                        <td>{fmt(d.simulatedForecast)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul>
                {simulation.limitations.map((l: string) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <small>Premissas SHA-256 {simulation.assumptionHash}</small>
            </>
          )}
        </article>
      </div>
      {busy && <p role="status">Analisando o snapshot…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {frozenSource && (
        <Modal
          open
          wide
          title={`Fonte congelada · ${frozenSource.code}`}
          description={`Snapshot ${snap.id} · ${fullDate(snap.as_of, s.programs[0]?.timezone)}`}
          onClose={() => setFrozenSource(null)}
        >
          <h3>{frozenSource.name}</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {[
                  "execution_status",
                  "accepted",
                  "delivery_stage",
                  "forecast_date",
                  "owner_id",
                  "version",
                  "acceptance_criteria",
                ].map((key) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>
                      {typeof frozenSource[key] === "object"
                        ? JSON.stringify(frozenSource[key])
                        : String(frozenSource[key] ?? "Não informado")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button"
            onClick={() => {
              const current = s.deliverables.find(
                (d: Row) => d.id === frozenSource.id,
              );
              if (current) {
                setFrozenSource(null);
                select("deliverables", current);
              }
            }}
            disabled={
              !s.deliverables.some((d: Row) => d.id === frozenSource.id)
            }
          >
            Abrir versão atual do entregável
          </button>
        </Modal>
      )}
    </section>
  );
}
