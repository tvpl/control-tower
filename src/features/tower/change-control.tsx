"use client";
import { useState } from "react";
import { GitPullRequest, Plus, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { canEdit } from "@/server/domain/rules";
import { SCOPE_FIELDS, type ScopeKind } from "@/server/domain/scope";
import { api } from "./client";
import { DataTable } from "./data-table";
import { Badge, fullDate } from "./presentation";
import { label } from "./metadata";
type Row = Record<string, any>;
const fieldLabels: Record<string, string> = {
  scope_status: "Situação de escopo",
  name: "Nome",
  description: "Descrição",
  domain_id: "Domínio",
  parent_id: "Capacidade pai",
  acceptance_criteria: "Critérios de aceite",
  criticality: "Criticidade",
  layer: "Camada",
  deliverable_type: "Tipo de entregável",
  capability_ids: "Capacidades vinculadas",
  capability_roles: "Tipos de contribuição",
  weight: "Peso",
  transverse_obligation: "Obrigação transversal",
};
const statusLabels: Record<string, string> = {
  SUBMITTED: "Em revisão",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
  APPLIED: "Aplicada",
  CANCELLED: "Cancelada",
};
function actor(s: Row, id: string) {
  return (
    s.users.find((u: Row) => u.id === id)?.display_name || "Usuário do programa"
  );
}
function valueText(field: string, value: unknown, s: Row): string {
  if (value === null || value === undefined) return "Não informado";
  if (Array.isArray(value))
    return (
      value
        .map((v) =>
          valueText(field === "capability_ids" ? "parent_id" : field, v, s),
        )
        .join(" · ") || "Nenhum"
    );
  if (["domain_id", "parent_id"].includes(field))
    return (
      [...s.domains, ...s.capabilities].find((r: Row) => r.id === value)
        ?.name || String(value)
    );
  if (typeof value === "object")
    return (
      Object.entries(value as Row)
        .map(
          ([id, role]) =>
            `${s.capabilities.find((c: Row) => c.id === id)?.name || id}: ${label(String(role))}`,
        )
        .join(" · ") || "Nenhum"
    );
  return typeof value === "string" ? label(value) : String(value);
}
function Impact({ impact, s }: { impact: Row; s: Row }) {
  const counts = [
    ["Entregáveis diretos", impact.direct_deliverables.length],
    ["Nós afetados", impact.affected_nodes.length],
    ["Releases", new Set(impact.releases.map((r: Row) => r.id)).size],
    [
      "Baselines preservadas",
      new Set(impact.baselines.map((r: Row) => r.id)).size,
    ],
  ];
  return (
    <div className="change-impact">
      <div className="dimension-grid">
        {counts.map(([name, count]) => (
          <div className="dimension" key={name}>
            <span>{name}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      <p className="muted small-text">
        Impacto observado em {fullDate(impact.as_of)} · {impact.rule_version}
      </p>
      {!!impact.direct_deliverables.length && (
        <div className="detail-section">
          <h3>Revalidação após mudança material</h3>
          {impact.direct_deliverables.map((d: Row) => (
            <p key={d.id}>
              {d.code} · {d.name} <Badge value={d.execution_status} />
            </p>
          ))}
        </div>
      )}
      {!!impact.releases.length && (
        <div className="detail-section">
          <h3>Releases afetadas</h3>
          {[
            ...new Map<string, Row>(
              impact.releases.map((r: Row) => [r.id, r] as [string, Row]),
            ).values(),
          ].map((r) => (
            <p key={r.id}>
              {r.code} · {r.name}
            </p>
          ))}
        </div>
      )}
      {!!impact.baselines.length && (
        <p className="policy-note">
          <ShieldCheck size={18} />A baseline original será preservada. O novo
          compromisso deve ser aprovado em outra versão.
        </p>
      )}
      <div className="detail-section">
        <h3>Dependências e gates</h3>
        <p>
          {impact.dependencies.length} dependências abertas ·{" "}
          {impact.gates.length} avaliações no caminho afetado
        </p>
        {impact.affected_nodes
          .filter((n: Row) => n.entity_id !== impact.target.id)
          .map((n: Row) => (
            <p key={n.id}>
              {(s[n.entity_type] || []).find((r: Row) => r.id === n.entity_id)
                ?.name || n.entity_id}
            </p>
          ))}
      </div>
      {impact.effects.map((effect: string) => (
        <p className="muted small-text" key={effect}>
          {effect}
        </p>
      ))}
    </div>
  );
}
export function ChangeControl({
  s,
  pid,
  userId,
  onNew,
  onSaved,
}: {
  s: Row;
  pid: string;
  userId: string;
  onNew: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Row | null>(null);
  const [filter, setFilter] = useState("");
  const canCreate = s.roles.some((r: Row) =>
    ["PROGRAM_ADMIN", "CHIEF_ARCHITECT", "WORKSTREAM_LEAD"].includes(r.role),
  );
  const record =
    selected && s.change_requests.find((r: Row) => r.id === selected.id);
  return (
    <>
      <div className="section-toolbar">
        <div className="view-tabs">
          <button className="selected">
            <GitPullRequest size={14} /> Solicitações{" "}
            <span>{s.change_requests.length}</span>
          </button>
        </div>
        <label className="change-filter">
          Situação
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(statusLabels).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary small"
          onClick={onNew}
          disabled={!canCreate}
        >
          <Plus size={14} />
          Nova solicitação
        </button>
      </div>
      <div className="policy-note">
        <ShieldCheck size={20} />
        <div>
          Solicitar → revisar por outra pessoa → aplicar.
          <p className="muted small-text">
            A aprovação verifica o impacto. A aplicação confere novamente
            versões e vínculos.
          </p>
        </div>
      </div>
      <DataTable
        items={s.change_requests.filter(
          (r: Row) => !filter || r.status === filter,
        )}
        columns={[
          {
            accessorKey: "title",
            header: "Solicitação",
            cell: (c) => (
              <>
                <strong>{c.row.original.title}</strong>
                <span className="muted code">
                  {c.row.original.impact.target.code}
                </span>
              </>
            ),
          },
          {
            accessorKey: "status",
            header: "Situação",
            cell: (c) => (
              <Badge
                value={c.row.original.status}
                text={statusLabels[c.row.original.status]}
              />
            ),
          },
          {
            accessorKey: "requested_by",
            header: "Solicitante",
            cell: (c) => actor(s, c.row.original.requested_by),
          },
          {
            accessorKey: "requested_at",
            header: "Solicitada em",
            cell: (c) => fullDate(c.row.original.requested_at),
          },
        ]}
        onSelect={setSelected}
      />
      {record && (
        <ChangeDetail
          key={record.id}
          r={record}
          s={s}
          pid={pid}
          userId={userId}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
function ChangeDetail({
  r,
  s,
  pid,
  userId,
  onClose,
  onSaved,
}: {
  r: Row;
  s: Row;
  pid: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reviewer = s.roles.some((m: Row) =>
    ["PMO", "EXECUTIVE"].includes(m.role),
  );
  const t = r.impact.target;
  const entity = s[t.kind]?.find((e: Row) => e.id === t.id);
  const editor = entity && canEdit(s.roles, t.kind, entity.workstream_id);
  async function command(action: string, decision?: string) {
    setBusy(true);
    setError("");
    try {
      await api(`change-requests/${r.id}/${action}`, pid, "POST", {
        expectedVersion: Number(r.version),
        ...(action === "review"
          ? { decision, reason }
          : action === "cancel"
            ? { reason }
            : {}),
      });
      setReason("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      drawer
      title={r.title}
      description={`${statusLabels[r.status]} · ${t.code} · v${r.version}`}
      onClose={onClose}
    >
      <div className="detail-section">
        <h3>Proposta de {actor(s, r.requested_by)}</h3>
        <p>{r.reason}</p>
        <h3>Alternativas</h3>
        <p>{r.alternatives}</p>
        <h3>Riscos e mitigação</h3>
        <p>{r.risk_and_mitigation}</p>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Comparação de escopo"
      >
        <table className="change-diff">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Antes</th>
              <th>Proposto</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(r.changes).map(([field, value]) => (
              <tr key={field}>
                <td>{fieldLabels[field]}</td>
                <td>{valueText(field, r.before_data[field], s)}</td>
                <td>{valueText(field, value, s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Impact impact={r.impact} s={s} />
      {r.reviewed_by && (
        <div className="detail-section">
          <h3>Decisão de {actor(s, r.reviewed_by)}</h3>
          <p>{r.review_reason}</p>
          <p className="muted small-text">
            {fullDate(r.reviewed_at)} · decisão vinculada {r.decision_id}
          </p>
        </div>
      )}
      {r.applied_at && (
        <p className="policy-note">
          Aplicada por {actor(s, r.applied_by)} em {fullDate(r.applied_at)}.
        </p>
      )}
      {r.cancelled_at && (
        <div className="detail-section">
          <h3>Cancelamento de {actor(s, r.cancelled_by)}</h3>
          <p>{r.cancellation_reason}</p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {["SUBMITTED", "APPROVED"].includes(r.status) && (
        <>
          {(reviewer || editor) && (
            <label>
              Justificativa da decisão ou cancelamento
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
              />
            </label>
          )}
          {r.requested_by === userId && reviewer && (
            <p className="muted small-text">
              Outra pessoa deve decidir esta solicitação.
            </p>
          )}
          <div className="form-actions">
            {(editor || reviewer) && (
              <button
                className="button"
                disabled={busy || reason.trim().length < 3}
                onClick={() => command("cancel")}
              >
                Cancelar solicitação
              </button>
            )}
            {r.status === "SUBMITTED" &&
              reviewer &&
              r.requested_by !== userId && (
                <>
                  <button
                    className="button"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => command("review", "REJECTED")}
                  >
                    Rejeitar mudança
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => command("review", "APPROVED")}
                  >
                    Aprovar mudança
                  </button>
                </>
              )}
            {r.status === "APPROVED" && editor && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => command("apply")}
              >
                Aplicar mudança
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

export function ChangeForm({
  s,
  pid,
  initial,
  onClose,
  onSaved,
}: {
  s: Row;
  pid: string;
  initial?: { kind: ScopeKind; record: Row };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nodeId, setNodeId] = useState(
    initial
      ? s.nodes.find(
          (n: Row) =>
            n.entity_type === initial.kind && n.entity_id === initial.record.id,
        )?.id || ""
      : "",
  );
  const [field, setField] = useState("scope_status"),
    [value, setValue] = useState<any>(
      initial?.record.scope_status === "PROPOSED" ? "APPROVED" : "CHANGED",
    );
  const [title, setTitle] = useState(""),
    [reason, setReason] = useState(""),
    [alternatives, setAlternatives] = useState(""),
    [risk, setRisk] = useState("");
  const [preview, setPreview] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const node = s.nodes.find((n: Row) => n.id === nodeId);
  const kind = node?.entity_type as ScopeKind | undefined;
  const record = kind
    ? s[kind].find((r: Row) => r.id === node.entity_id)
    : null;
  const options = s.nodes
    .filter((n: Row) =>
      ["capabilities", "deliverables"].includes(n.entity_type),
    )
    .filter((n: Row) => {
      const r = s[n.entity_type].find((e: Row) => e.id === n.entity_id);
      return r && canEdit(s.roles, n.entity_type, r.workstream_id);
    });
  function chooseField(next: string, current = record) {
    setField(next);
    setPreview(null);
    if (next === "capability_roles") {
      setValue(
        Object.fromEntries(
          s.links
            .filter((l: Row) => l.deliverable_id === current?.id)
            .map((l: Row) => [l.capability_id, l.contribution_type]),
        ),
      );
      return;
    }
    setValue(
      next === "scope_status"
        ? current?.scope_status === "PROPOSED"
          ? "APPROVED"
          : "CHANGED"
        : next === "capability_ids"
          ? s.links
              .filter((l: Row) => l.deliverable_id === current?.id)
              .map((l: Row) => l.capability_id)
          : Array.isArray(current?.[next])
            ? current[next].join("\n")
            : (current?.[next] ?? ""),
    );
  }
  function change(v: any) {
    setValue(v);
    setPreview(null);
  }
  const selects: Record<string, [string, string][]> = {
    scope_status: ["APPROVED", "CHANGED", "EXCLUDED"].map((v) => [v, label(v)]),
    criticality: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((v) => [
      v,
      label(v),
    ]),
    layer: [
      "CLIENT",
      "CAAL",
      "BACKEND",
      "PARTNER",
      "DATA",
      "INFRA",
      "SECURITY",
      "OPERATIONS",
      "QUALITY",
    ].map((v) => [v, label(v)]),
    deliverable_type: [
      "API",
      "UI",
      "CONTRACT",
      "INFRA",
      "EVENT",
      "TEST",
      "DOCUMENTATION",
      "OPERATION",
    ].map((v) => [v, label(v)]),
    domain_id: s.domains.map((r: Row) => [r.id, r.name]),
    parent_id: [
      ["", "Sem pai"],
      ...s.capabilities
        .filter((r: Row) => r.id !== record?.id)
        .map((r: Row) => [r.id, r.name]),
    ],
    capability_ids: s.capabilities.map((r: Row) => [
      r.id,
      `${r.code} · ${r.name}`,
    ]),
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (preview) {
        await api("change-requests", pid, "POST", preview.input);
        onSaved();
        onClose();
      } else {
        const parsedValue =
          field === "weight"
            ? value === ""
              ? null
              : Number(value)
            : field === "parent_id"
              ? value || null
              : field === "acceptance_criteria" && kind === "capabilities"
                ? String(value)
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean)
                : field === "transverse_obligation"
                  ? value || null
                  : value;
        const input = {
          subject_node_id: nodeId,
          expectedVersion: Number(record.version),
          title,
          reason,
          alternatives,
          risk_and_mitigation: risk,
          changes: { [field]: parsedValue },
        };
        const result = await api("change-requests/preview", pid, "POST", input);
        setPreview({ ...result, input });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title="Propor mudança de escopo"
      description="Registre alternativas e riscos; confira o impacto antes de enviar para outra pessoa decidir."
      onClose={onClose}
    >
      <form onSubmit={submit} className="entity-form">
        <label className="full">
          Alvo de escopo
          <select
            required
            value={nodeId}
            onChange={(e) => {
              setNodeId(e.target.value);
              const n = s.nodes.find((n: Row) => n.id === e.target.value);
              chooseField(
                "scope_status",
                s[n.entity_type].find((r: Row) => r.id === n.entity_id),
              );
            }}
          >
            <option value="" disabled>
              Selecione capacidade ou entregável
            </option>
            {options.map((n: Row) => {
              const r = s[n.entity_type].find((r: Row) => r.id === n.entity_id);
              return (
                <option key={n.id} value={n.id}>
                  {r.code} · {r.name}
                </option>
              );
            })}
          </select>
        </label>
        {kind && record && (
          <>
            <label>
              Campo a alterar
              <select
                value={field}
                onChange={(e) => chooseField(e.target.value)}
              >
                {SCOPE_FIELDS[kind].map((k) => (
                  <option value={k} key={k}>
                    {fieldLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            {field === "capability_roles" ? (
              <fieldset className="relationship-fields">
                <legend>Tipos de contribuição propostos</legend>
                {Object.entries(value as Row).map(([id, role]) => (
                  <label key={id}>
                    {s.capabilities.find((c: Row) => c.id === id)?.name}
                    <select
                      value={String(role)}
                      onChange={(e) =>
                        change({ ...value, [id]: e.target.value })
                      }
                    >
                      {["REQUIRED", "OPTIONAL", "SUPPORTING"].map((v) => (
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
            ) : (
              <label>
                {fieldLabels[field]} proposto
                {selects[field] ? (
                  <select
                    multiple={field === "capability_ids"}
                    value={value}
                    onChange={(e) =>
                      change(
                        field === "capability_ids"
                          ? Array.from(e.target.selectedOptions).map(
                              (o) => o.value,
                            )
                          : e.target.value,
                      )
                    }
                  >
                    {selects[field].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : [
                    "description",
                    "acceptance_criteria",
                    "transverse_obligation",
                  ].includes(field) ? (
                  <textarea
                    value={value}
                    onChange={(e) => change(e.target.value)}
                    maxLength={2000}
                  />
                ) : (
                  <input
                    value={value}
                    type={field === "weight" ? "number" : "text"}
                    step={field === "weight" ? "0.001" : undefined}
                    min={field === "weight" ? "0.001" : undefined}
                    onChange={(e) => change(e.target.value)}
                  />
                )}
              </label>
            )}
          </>
        )}
        <label className="full">
          Título da solicitação
          <input
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        {[
          [reason, setReason, "Motivo da mudança"],
          [alternatives, setAlternatives, "Alternativas consideradas"],
          [risk, setRisk, "Riscos e mitigação"],
        ].map(([v, setter, name]) => (
          <label className="full" key={name as string}>
            {name as string}
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={v as string}
              onChange={(e) => {
                (setter as (v: string) => void)(e.target.value);
                setPreview(null);
              }}
            />
          </label>
        ))}
        {error && (
          <p className="error full" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <div className="full">
            <h3>Antes de enviar</h3>
            <p className="muted small-text">
              {fieldLabels[field]}: {valueText(field, preview.before[field], s)}{" "}
              → {valueText(field, preview.changes[field], s)}
            </p>
            <Impact impact={preview.impact} s={s} />
          </div>
        )}
        <div className="form-actions full">
          <button type="button" className="button" onClick={onClose}>
            Fechar
          </button>
          <button className="button primary" disabled={busy || !record}>
            {busy
              ? "Processando…"
              : preview
                ? "Enviar para revisão"
                : "Analisar impacto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
