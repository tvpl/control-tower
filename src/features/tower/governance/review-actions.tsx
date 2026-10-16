"use client";
import { useState } from "react";
import { api } from "../client";
import { label } from "../metadata";
import { fullDate } from "../presentation";
import { canEdit } from "@/server/domain/rules";
import type { Row } from "../cockpit/model";
export function GovernanceActions({
  kind,
  record,
  s,
  userId,
  onSaved,
}: {
  kind: string;
  record: Row;
  s: Row;
  userId: string;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(""),
    [health, setHealth] = useState("AT_RISK"),
    [expiry, setExpiry] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const review = ["contracts", "decisions"].includes(kind),
    required = kind === "contracts" ? "CHIEF_ARCHITECT" : record.approval_role;
  const mayReview =
    review &&
    s.roles.some((r: Row) => r.role === required) &&
    record.created_by &&
    record.created_by !== userId &&
    ["DRAFT", "PROPOSED"].includes(record.status);
  const mayOverride =
    kind === "deliverables" &&
    (canEdit(s.roles, "deliverables", record.workstream_id) ||
      s.roles.some((r: Row) => r.role === "PMO"));
  const node = s.nodes.find(
      (n: Row) => n.entity_type === kind && n.entity_id === record.id,
    ),
    latest = s.healthOverrides?.find(
      (o: Row) => o.subject_node_id === node?.id,
    );
  async function command(path: string, body: Row) {
    setBusy(true);
    setError("");
    try {
      await api(path, s.programs[0].id, "POST", body);
      setReason("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!review && kind !== "deliverables") return null;
  return (
    <section className="detail-section governance-action">
      <h3>
        {review ? "Revisão por alçada" : "Saúde derivada e ajuste temporário"}
      </h3>
      {review ? (
        <>
          <p>
            {record.reviewed_by
              ? `Revisado por ${s.users.find((u: Row) => u.id === record.reviewed_by)?.display_name || "Membro"} · ${fullDate(record.reviewed_at, s.programs?.[0]?.timezone)}`
              : `Alçada: ${label(required)} · autor e revisor devem ser pessoas diferentes.`}
          </p>
          {record.review_reason && <p>{record.review_reason}</p>}
          {mayReview && (
            <>
              <label>
                Justificativa da revisão
                <textarea
                  aria-label="Justificativa da revisão do registro"
                  rows={3}
                  minLength={3}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="report-controls">
                {["APPROVED", "REJECTED"].map((decision) => (
                  <button
                    key={decision}
                    className={`button ${decision === "APPROVED" ? "primary" : ""}`}
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      command(`${kind}/${record.id}/review`, {
                        expectedVersion: Number(record.version),
                        decision,
                        reason,
                      })
                    }
                  >
                    {decision === "APPROVED"
                      ? "Aprovar registro"
                      : "Rejeitar registro"}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p>
            Saúde calculada:{" "}
            <b>{label(record.derived_health || record.health)}</b>. Ajustes não
            alteram bloqueios, aceite ou prontidão.
          </p>
          {record.health_override && (
            <div className="policy-note">
              <p>
                <b>Ajuste manual: {label(record.health_override.health)}</b> ·
                válido até{" "}
                {fullDate(
                  record.health_override.expires_at,
                  s.programs?.[0]?.timezone,
                )}
                <br />
                {record.health_override.reason}
              </p>
            </div>
          )}
          {mayOverride && (
            <details>
              <summary>Registrar ajuste de saúde</summary>
              <label>
                Classificação
                <select
                  aria-label="Saúde do ajuste"
                  value={health}
                  onChange={(e) => setHealth(e.target.value)}
                >
                  {["UNKNOWN", "ON_TRACK", "AT_RISK", "CRITICAL"].map((h) => (
                    <option key={h} value={h}>
                      {label(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Validade (até 90 dias)
                <input
                  aria-label="Validade do ajuste de saúde"
                  type="datetime-local"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </label>
              <label>
                Justificativa
                <textarea
                  aria-label="Motivo do ajuste de saúde"
                  rows={3}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="report-controls">
                <button
                  className="button primary"
                  disabled={busy || !expiry || reason.trim().length < 3}
                  onClick={() =>
                    command(`deliverables/${record.id}/health-override`, {
                      action: "SET",
                      health,
                      expires_at: new Date(expiry).toISOString(),
                      reason,
                      expectedOverrideId: latest?.id || null,
                    })
                  }
                >
                  Aplicar ajuste temporário
                </button>
                <button
                  className="button"
                  disabled={
                    busy || !record.health_override || reason.trim().length < 3
                  }
                  onClick={() =>
                    command(`deliverables/${record.id}/health-override`, {
                      action: "CLEAR",
                      reason,
                      expectedOverrideId: latest?.id || null,
                    })
                  }
                >
                  Retomar saúde calculada
                </button>
              </div>
            </details>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
