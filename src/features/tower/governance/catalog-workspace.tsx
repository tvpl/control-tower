"use client";
import { useState } from "react";
import { Plus, ShieldCheck, Layers, ListChecks } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { api } from "../client";
import { label } from "../metadata";
import type { Row } from "../cockpit/model";
const CATEGORIES = [
  "PRODUCT",
  "ARCHITECTURE",
  "ENGINEERING",
  "PERFORMANCE",
  "SECURITY",
  "RESILIENCE",
  "DATA",
  "OBSERVABILITY",
  "INFRASTRUCTURE",
  "OPERATIONS",
  "INTEGRATIONS",
];
const TYPES = [
  "API",
  "UI",
  "CONTRACT",
  "INFRA",
  "EVENT",
  "TEST",
  "DOCUMENTATION",
  "OPERATION",
];
const emptyRule = {
  layers: [],
  types: [],
  criticalities: [],
  workstream_ids: [],
};
export function CatalogWorkspace({
  s,
  pid,
  onSaved,
}: {
  s: Row;
  pid: string;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"layers" | "gates" | "profiles">("profiles"),
    [edit, setEdit] = useState<Row | null>(null);
  const rows = tab === "profiles" ? s.dodProfiles : s[tab];
  const canManage = s.roles.some((r: Row) =>
    ["PROGRAM_ADMIN", "CHIEF_ARCHITECT"].includes(r.role),
  );
  return (
    <section className="catalog-workspace ct-panel">
      <header>
        <h2>
          <ShieldCheck size={16} /> Catálogos e perfis de DoD
        </h2>
        <button
          className="button primary small"
          disabled={!canManage}
          onClick={() => setEdit({})}
        >
          <Plus size={14} />
          Nova definição
        </button>
      </header>
      <div className="view-tabs">
        {(
          [
            ["profiles", "Perfis", ListChecks],
            ["gates", "Critérios de gate", ShieldCheck],
            ["layers", "Camadas", Layers],
          ] as const
        ).map(([id, name, Icon]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            {name}
            <span>{(id === "profiles" ? s.dodProfiles : s[id]).length}</span>
          </button>
        ))}
      </div>
      <div className="catalog-grid">
        {rows.map((r: Row) => (
          <button
            className="catalog-card"
            key={r.id || r.code}
            onClick={() => setEdit(r)}
          >
            <small>
              {r.code} · v{r.version}
            </small>
            <strong>{r.name}</strong>
            <span>
              {tab === "profiles"
                ? `${r.gate_ids.length} critérios · ${r.active ? "Ativo" : "Inativo"}`
                : tab === "gates"
                  ? `${label(r.category)} · ${r.blocking ? "Impeditivo" : "Informativo"}${r.program_id ? "" : " · Global, somente leitura"}`
                  : r.active
                    ? "Ativa"
                    : "Inativa"}
            </span>
          </button>
        ))}
        {!rows.length && (
          <p className="ct-empty">
            Nenhuma definição neste catálogo. O catálogo geral de gates
            permanece aplicável até configurar perfis.
          </p>
        )}
      </div>
      <footer>
        Alterações são versionadas e auditadas. Perfil ou critério alterado
        exige reavaliação. Fora do perfil não equivale a N/A aprovado.
      </footer>
      {edit && (
        <CatalogEditor
          key={`${tab}-${edit.id || edit.code || "new"}`}
          kind={tab}
          initial={edit}
          s={s}
          pid={pid}
          canManage={canManage}
          onClose={() => setEdit(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
function CatalogEditor({
  kind,
  initial,
  s,
  pid,
  canManage,
  onClose,
  onSaved,
}: {
  kind: "layers" | "gates" | "profiles";
  initial: Row;
  s: Row;
  pid: string;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const exists = !!(initial.id || initial.code),
    readOnly =
      !canManage || (kind === "gates" && exists && !initial.program_id);
  const [code, setCode] = useState(initial.code || ""),
    [name, setName] = useState(initial.name || ""),
    [category, setCategory] = useState(initial.category || "ENGINEERING"),
    [active, setActive] = useState(initial.active ?? true),
    [blocking, setBlocking] = useState(initial.blocking ?? true),
    [criteria, setCriteria] = useState(initial.criteria || ""),
    [rule, setRule] = useState<Row>(
      initial.rule || initial.applicability_rule || emptyRule,
    ),
    [gates, setGates] = useState<string[]>(initial.gate_ids || []),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selections = [
    {
      key: "layers",
      name: "Camadas aplicáveis",
      options: s.layers.map((l: Row) => ({ id: l.code, name: l.name })),
    },
    {
      key: "types",
      name: "Tipos de entrega",
      options: TYPES.map((id) => ({ id, name: label(id) })),
    },
    {
      key: "criticalities",
      name: "Criticidades",
      options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((id) => ({
        id,
        name: label(id),
      })),
    },
    {
      key: "workstream_ids",
      name: "Frentes aplicáveis",
      options: s.workstreams.map((w: Row) => ({ id: w.id, name: w.name })),
    },
  ];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Row = {
        code,
        name,
        reason,
        expectedVersion: Number(initial.version || 0),
      };
      if (kind === "layers") body.active = active;
      if (kind === "gates")
        Object.assign(body, {
          category,
          blocking,
          criteria,
          applicability_rule: rule,
        });
      if (kind === "profiles")
        Object.assign(body, { active, rule, gate_ids: gates });
      await api(
        `catalogs/${kind}${exists ? `/${initial.id || initial.code}` : ""}`,
        pid,
        "POST",
        body,
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
      title={`${exists ? "Definição" : "Nova definição"} · ${kind === "profiles" ? "Perfil de DoD" : kind === "gates" ? "Gate" : "Camada"}`}
      onClose={onClose}
      description="Regras vazias abrangem todos os valores; dimensões preenchidas combinam por interseção. Perfis aplicáveis compõem seus gates."
    >
      <form onSubmit={submit} className="catalog-form">
        <label>
          Código
          <input
            aria-label="Código da definição"
            disabled={exists || readOnly}
            required
            pattern="[A-Z0-9_-]+"
            maxLength={40}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Nome
          <input
            aria-label="Nome da definição"
            disabled={readOnly}
            required
            minLength={3}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {kind !== "gates" && (
          <label className="catalog-check">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Definição ativa
          </label>
        )}
        {kind === "gates" && (
          <>
            <label>
              Categoria
              <select
                aria-label="Categoria do gate"
                disabled={readOnly}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="catalog-check">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={blocking}
                onChange={(e) => setBlocking(e.target.checked)}
              />
              Gate impeditivo
            </label>
            <label className="full">
              Critério verificável
              <textarea
                aria-label="Critério verificável"
                disabled={readOnly}
                required
                minLength={3}
                maxLength={5000}
                rows={5}
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
              />
            </label>
          </>
        )}
        {kind !== "layers" &&
          selections.map((v) => (
            <label key={v.key}>
              {v.name}
              <select
                multiple
                aria-label={v.name}
                disabled={readOnly}
                value={rule[v.key] || []}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    [v.key]: [...e.target.selectedOptions].map((o) => o.value),
                  })
                }
              >
                {v.options.map((o: Row) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <small>Sem seleção: todos.</small>
            </label>
          ))}
        {kind === "profiles" && (
          <fieldset className="full catalog-gates">
            <legend>Critérios que compõem o perfil</legend>
            {s.gates.map((g: Row) => (
              <label className="catalog-check" key={g.id}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={gates.includes(g.id)}
                  onChange={(e) =>
                    setGates(
                      e.target.checked
                        ? [...gates, g.id]
                        : gates.filter((id) => id !== g.id),
                    )
                  }
                />
                {g.name} · {g.code} · v{g.version}
              </label>
            ))}
          </fieldset>
        )}
        {!readOnly && (
          <label className="full">
            Motivo da configuração
            <textarea
              aria-label="Motivo da configuração"
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {readOnly && (
          <p className="policy-note full">
            Consulta somente. Definições globais são preservadas; crie um
            critério do programa para personalizar.
          </p>
        )}
        {error && (
          <p className="error full" role="alert">
            {error}
          </p>
        )}
        {!readOnly && (
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar configuração"}
          </button>
        )}
      </form>
    </Modal>
  );
}
