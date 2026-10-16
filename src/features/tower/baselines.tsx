"use client";
import { useState } from "react";
import { Bookmark, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { canEdit } from "@/server/domain/rules";
import { api, download } from "./client";
import { Badge, Empty, fmt, fullDate } from "./presentation";
type Row = Record<string, any>;
export function Baselines({
  s,
  pid,
  userId,
  onSaved,
}: {
  s: Row;
  pid: string;
  userId: string;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const b = s.baselines.find((b: Row) => b.id === selected);
  const items = b
    ? s.baselineArchive.filter((i: Row) => i.baseline_id === b.id)
    : [];
  const reviewer = s.roles.some((r: Row) =>
    ["PMO", "EXECUTIVE"].includes(r.role),
  );
  async function action(decision?: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        decision ? `baselines/${b.id}/review` : "baselines",
        pid,
        "POST",
        decision
          ? { reason, decision, expectedVersion: Number(b.version) }
          : { reason },
      );
      onSaved();
      setReason("");
      if (!decision) setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(id: string | null) {
    setSelected(id);
    setReason("");
    setError("");
  }
  return (
    <section className="panel baseline-panel">
      <div className="panel-heading">
        <div>
          <h2>Compromissos & baselines</h2>
          <p className="muted small-text">
            Proposta congelada → revisão independente → versão aprovada
          </p>
        </div>
        <button
          className="button small"
          disabled={!canEdit(s.roles, "baselines")}
          onClick={() => {
            setCreating(true);
            setReason("");
            setError("");
          }}
        >
          <Bookmark size={14} />
          Propor nova baseline
        </button>
      </div>
      {!s.baselines.length ? (
        <Empty text="Nenhuma baseline proposta. Indicadores de execução permanecem provisórios." />
      ) : (
        s.baselines.map((b: Row) => (
          <div className="baseline-row" key={b.id}>
            <Bookmark size={18} />
            <strong>Baseline v{b.version}</strong>
            <Badge value={b.status} />
            <span>
              {fullDate(
                b.approved_at || b.created_at,
                s.programs?.[0]?.timezone,
              )}
            </span>
            <button className="button small" onClick={() => open(b.id)}>
              Revisar compromisso v{b.version}
            </button>
            <button
              className="button small"
              onClick={() =>
                download(
                  `baseline-v${b.version}.json`,
                  JSON.stringify(
                    {
                      baseline: b,
                      items: s.baselineArchive.filter(
                        (i: Row) => i.baseline_id === b.id,
                      ),
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              Exportar
            </button>
          </div>
        ))
      )}
      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title="Propor nova baseline"
          description="Congele o inventário atual para revisão de outra pessoa com alçada. Indicadores usam a última versão aprovada."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action();
            }}
          >
            <p className="policy-note">
              <ShieldCheck size={18} />
              {s.deliverables.length} entregáveis com responsáveis, critérios e
              forecast serão submetidos à revisão.
            </p>
            <label>
              Motivo do compromisso
              <textarea
                required
                minLength={3}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                Enviar baseline para revisão
              </button>
            </div>
          </form>
        </Modal>
      )}
      {b && (
        <Modal
          open
          drawer
          onClose={() => open(null)}
          title={`Baseline v${b.version}`}
          description={`${b.status === "SUBMITTED" ? "Em revisão" : b.status === "APPROVED" ? "Aprovada" : "Rejeitada"} · ${items.length} entregáveis congelados`}
        >
          <div className="detail-section">
            <h3>Compromisso proposto</h3>
            <p>
              {b.proposal_reason ||
                "Baseline anterior ao workflow de revisão independente."}
            </p>
            <p className="muted small-text">
              Solicitante:{" "}
              {s.users.find((u: Row) => u.id === b.proposed_by)?.display_name ||
                "Histórico anterior"}{" "}
              · {fullDate(b.created_at, s.programs?.[0]?.timezone)}
            </p>
          </div>
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Itens do compromisso"
          >
            <table>
              <thead>
                <tr>
                  <th>Entregável</th>
                  <th>Forecast</th>
                  <th>Peso</th>
                  <th>Critério</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i: Row) => (
                  <tr key={i.id}>
                    <td>
                      {i.frozen_payload.code} · {i.frozen_payload.name}
                    </td>
                    <td>{fmt(i.frozen_payload.forecast_date)}</td>
                    <td>{i.frozen_payload.weight ?? "Não definido"}</td>
                    <td className="baseline-criterion">
                      {i.frozen_payload.acceptance_criteria}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.reviewed_by && (
            <div className="detail-section">
              <h3>
                Decisão de{" "}
                {s.users.find((u: Row) => u.id === b.reviewed_by)?.display_name}
              </h3>
              <p>{b.review_reason}</p>
              <p className="muted small-text">
                {fullDate(b.reviewed_at, s.programs?.[0]?.timezone)}
              </p>
            </div>
          )}
          {b.status === "SUBMITTED" && (
            <p className="policy-note">
              <ShieldCheck size={18} />A aprovação verifica se o inventário
              corresponde à proposta. Se mudou, rejeite e proponha outra versão.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {b.status === "SUBMITTED" && reviewer && b.proposed_by !== userId && (
            <>
              <label>
                Justificativa da revisão
                <textarea
                  minLength={3}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button
                  className="button"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => action("REJECTED")}
                >
                  Rejeitar baseline
                </button>
                <button
                  className="button primary"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => action("APPROVED")}
                >
                  Aprovar baseline
                </button>
              </div>
            </>
          )}
          {b.status === "SUBMITTED" && b.proposed_by === userId && (
            <p className="muted small-text">
              Outra pessoa com alçada PMO ou executiva deve revisar sua
              proposta.
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
