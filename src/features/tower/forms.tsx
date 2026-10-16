"use client";
import { applicability } from "@/server/domain/applicability";
import { Modal } from "@/components/ui/dialog";
import { type Kind } from "@/server/domain/schemas";
import { useState } from "react";
import { api } from "./client";
import { FIELDS, TITLES, label } from "./metadata";
type Data = Record<string, any>;
export function EntityForm({
  kind,
  record,
  state,
  pid,
  onClose,
  onSaved,
}: {
  kind: Kind;
  record?: Data;
  state: Data;
  pid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fields = FIELDS[kind].map((f) =>
    f.key === "layer"
      ? {
          ...f,
          options: (state.layers || [])
            .filter((l: Data) => l.active || l.code === record?.layer)
            .map((l: Data) => l.code),
        }
      : f,
  );
  const initial = { ...record };
  if (record && kind === "deliverables")
    initial.capability_ids = state.links
      .filter((l: Data) => l.deliverable_id === record.id)
      .map((l: Data) => l.capability_id);
  if (record && kind === "components")
    initial.capability_ids = state.componentLinks
      .filter((l: Data) => l.component_id === record.id)
      .map((l: Data) => l.capability_id);
  if (record && kind === "releases")
    initial.deliverable_ids = state.releaseLinks
      .filter((l: Data) => l.release_id === record.id)
      .map((l: Data) => l.deliverable_id);
  const [values, setValues] = useState<Data>(
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          (f.type === "json"
            ? JSON.stringify(
                initial[f.key] ||
                  (f.key === "health_policy"
                    ? {
                        stale_days: 7,
                        delay_tolerance_days: 0,
                        dependency_minimum: "HIGH",
                      }
                    : f.key === "field_mapping"
                      ? { execution_status: "operationalState" }
                      : {}),
                null,
                2,
              )
            : initial[f.key]) ??
            (f.type === "checkbox"
              ? false
              : f.key === "criticality"
                ? "MEDIUM"
                : f.options
                  ? f.options[0]
                  : f.multiple
                    ? []
                    : f.key === "poll_interval_seconds"
                      ? 900
                      : ""),
        ]),
      ),
    ),
    [reason, setReason] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const relationshipKey =
    kind === "deliverables"
      ? "capability_roles"
      : kind === "components"
        ? "relation_types"
        : kind === "releases"
          ? "deliverable_required"
          : null;
  const selectedIds =
    kind === "releases" ? values.deliverable_ids : values.capability_ids;
  const initialLinks =
    kind === "deliverables"
      ? state.links.filter((l: Data) => l.deliverable_id === record?.id)
      : kind === "components"
        ? state.componentLinks.filter(
            (l: Data) => l.component_id === record?.id,
          )
        : kind === "releases"
          ? state.releaseLinks.filter((l: Data) => l.release_id === record?.id)
          : [];
  const [relationshipValues, setRelationshipValues] = useState<Data>(
    Object.fromEntries(
      initialLinks.map((l: Data) => [
        l.capability_id || l.deliverable_id,
        kind === "deliverables"
          ? l.contribution_type
          : kind === "components"
            ? l.relation_type
            : l.required,
      ]),
    ),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const data: Data = {};
      for (const f of fields) {
        let v = values[f.key];
        if (f.type === "lines")
          v = Array.isArray(v)
            ? v
            : String(v)
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
        if (f.type === "json") {
          try {
            v = JSON.parse(v || "{}");
          } catch {
            throw new Error(`${f.label}: JSON inválido.`);
          }
        }
        if (f.type === "number") v = v === "" ? null : Number(v);
        if (
          (f.type === "date" ||
            (f.ref && !f.multiple) ||
            f.key === "transverse_obligation" ||
            f.type === "url" ||
            f.key === "sla_notes" ||
            f.type === "email" ||
            f.key === "webhook_secret_env") &&
          v === ""
        )
          v = null;
        data[f.key] = v;
      }
      if (kind === "capabilities")
        data.scope_status = record?.scope_status || "PROPOSED";
      if (relationshipKey)
        data[relationshipKey] = Object.fromEntries(
          (selectedIds || []).map((id: string) => [
            id,
            relationshipValues[id] ??
              (kind === "releases"
                ? true
                : kind === "components"
                  ? "USES"
                  : "REQUIRED"),
          ]),
        );
      await api(
        `${kind}${record ? `/${record.id}` : ""}`,
        pid,
        record ? "PATCH" : "POST",
        { ...data, changeReason: reason || "Cadastro pelo usuário" },
        Number(record?.version),
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`${record ? "Editar" : "Novo registro"} · ${TITLES[kind]}`}
      description="Alterações são validadas no servidor, persistidas e auditadas."
    >
      <form onSubmit={submit} className="entity-form">
        {fields.map((f) => {
          const refRows = f.ref
            ? (state[f.ref] || []).filter(
                (r: Data) =>
                  f.key !== "squad_id" ||
                  !values.area_id ||
                  !r.area_id ||
                  r.area_id === values.area_id,
              )
            : [];
          const options = f.ref
            ? refRows.map((r: Data) => ({
                id: r.id,
                name: r.display_name || r.name || nodeName(r, state),
              }))
            : f.options?.map((o: string) => ({ id: o, name: label(o) }));
          return (
            <label
              key={f.key}
              className={
                f.type === "textarea" ||
                f.type === "lines" ||
                f.type === "json" ||
                f.multiple
                  ? "full"
                  : ""
              }
            >
              {f.label}
              {f.required && <span className="required"> *</span>}
              {f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={!!values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.checked })
                  }
                />
              ) : options ? (
                <select
                  required={f.required}
                  multiple={f.multiple}
                  value={values[f.key] ?? ""}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f.key]: f.multiple
                        ? Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                          )
                        : e.target.value,
                      ...(f.key === "area_id" &&
                      e.target.value &&
                      values.squad_id &&
                      state.squads.find((q: Data) => q.id === values.squad_id)
                        ?.area_id &&
                      state.squads.find((q: Data) => q.id === values.squad_id)
                        ?.area_id !== e.target.value
                        ? { squad_id: "" }
                        : {}),
                    })
                  }
                >
                  {!f.multiple && !f.options && (
                    <option value="">Selecione…</option>
                  )}
                  {options.map((o: { id: string; name: string }) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ||
                f.type === "lines" ||
                f.type === "json" ? (
                <textarea
                  rows={3}
                  required={f.required}
                  value={
                    Array.isArray(values[f.key])
                      ? values[f.key].join("\n")
                      : values[f.key]
                  }
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  type={f.type || "text"}
                  required={f.required}
                  step={f.type === "number" ? "any" : undefined}
                  min={f.type === "number" ? "0.001" : undefined}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              )}
            </label>
          );
        })}
        {relationshipKey && !!selectedIds?.length && (
          <fieldset className="full relationship-fields">
            <legend>Tipos de relação</legend>
            {selectedIds.map((id: string) => {
              const r = (
                kind === "releases" ? state.deliverables : state.capabilities
              ).find((r: Data) => r.id === id);
              const options =
                kind === "releases"
                  ? ["REQUIRED", "OPTIONAL"]
                  : kind === "components"
                    ? ["USES", "IMPLEMENTS", "SUPPORTS", "DEPENDS_ON"]
                    : ["REQUIRED", "OPTIONAL", "SUPPORTING"];
              const value =
                relationshipValues[id] ??
                (kind === "releases"
                  ? true
                  : kind === "components"
                    ? "USES"
                    : "REQUIRED");
              return (
                <label key={id}>
                  {r?.code} · {r?.name}
                  <select
                    value={
                      kind === "releases"
                        ? value
                          ? "REQUIRED"
                          : "OPTIONAL"
                        : value
                    }
                    onChange={(e) =>
                      setRelationshipValues({
                        ...relationshipValues,
                        [id]:
                          kind === "releases"
                            ? e.target.value === "REQUIRED"
                            : e.target.value,
                      })
                    }
                  >
                    {options.map((v) => (
                      <option key={v} value={v}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </fieldset>
        )}
        {record && (
          <label className="full">
            Motivo da alteração *
            <textarea
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {error && (
          <div className="error full" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions full">
          <button className="button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar registro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function nodeName(node: Data, state: Data) {
  const r = (state[node.entity_type] || []).find(
    (r: Data) => r.id === node.entity_id,
  );
  return r ? `${r.code || ""} · ${r.name || r.title}` : node.entity_type;
}
export function GateForm({
  subject,
  gate,
  assessment,
  state,
  pid,
  onClose,
  onSaved,
}: {
  subject: Data;
  gate: Data;
  assessment?: Data;
  state: Data;
  pid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [result, setResult] = useState("PASSED"),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState<string[]>([]),
    [expires, setExpires] = useState(""),
    [risk, setRisk] = useState(""),
    [mitigation, setMitigation] = useState(assessment?.mitigation_plan || ""),
    [decisionReference, setDecisionReference] = useState(
      assessment?.decision_reference || "",
    ),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function revoke() {
    setPending(true);
    setError("");
    try {
      await api(`gate-assessments/${assessment!.id}/revoke`, pid, "POST", {
        expectedVersion: Number(assessment!.version),
        reason,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await api("gate-assessments", pid, "POST", {
        subject_node_id: subject.id,
        gate_id: gate.id,
        expectedGateVersion: Number(gate.version),
        expectedContextKey: applicability(
          state.deliverables.find((d: Data) => d.id === subject.entity_id) ||
            {},
          state.gates,
          state.dodProfiles || [],
        ).contextKey,
        result,
        justification: reason,
        evidence_ids: evidence,
        expectedVersion: Number(assessment?.version || 0),
        expires_at: expires ? new Date(expires).toISOString() : null,
        accepted_risk: risk,
        mitigation_plan: mitigation,
        decision_reference: decisionReference,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Avaliar · ${gate.name}`}
      description={`Critério v${gate.version}. Categoria ${gate.category}. Aprovação exige alçada.`}
    >
      <form className="entity-form" onSubmit={submit}>
        <label className="full">
          Resultado
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            {[
              "PASSED",
              "FAILED",
              "PENDING",
              "NOT_APPLICABLE",
              "EXCEPTION_APPROVED",
            ].map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Evidências da entidade
          <select
            multiple
            value={evidence}
            onChange={(e) =>
              setEvidence(
                Array.from(e.target.selectedOptions).map((o) => o.value),
              )
            }
          >
            {state.evidence
              .filter((ev: Data) => ev.subject_node_id === subject.id)
              .map((ev: Data) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} · v{ev.artifact_version}
                </option>
              ))}
          </select>
        </label>
        <label className="full">
          Justificativa *
          <textarea
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {result === "EXCEPTION_APPROVED" && (
          <>
            <label>
              Validade *
              <input
                type="datetime-local"
                required
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </label>
            <label>
              Risco aceito *
              <textarea
                required
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
              />
            </label>
          </>
        )}
        {result === "EXCEPTION_APPROVED" && (
          <>
            <label className="full">
              Plano de mitigação
              <textarea
                aria-label="Plano de mitigação da exceção"
                required
                minLength={3}
                maxLength={2000}
                value={mitigation}
                onChange={(e) => setMitigation(e.target.value)}
              />
            </label>
            <label className="full">
              Referência da decisão
              <input
                aria-label="Referência da decisão de exceção"
                required
                minLength={3}
                maxLength={500}
                placeholder="Código da decisão, ADR ou URL do registro aprovado"
                value={decisionReference}
                onChange={(e) => setDecisionReference(e.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <div role="alert" className="error full">
            {error}
          </div>
        )}
        <div className="form-actions full">
          <button className="button" type="button" onClick={onClose}>
            Cancelar
          </button>
          {assessment?.result === "EXCEPTION_APPROVED" && (
            <button
              type="button"
              className="button"
              disabled={pending || reason.trim().length < 3}
              onClick={revoke}
            >
              Revogar exceção
            </button>
          )}
          <button className="button primary" disabled={pending}>
            {pending ? "Registrando…" : "Registrar avaliação"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
