"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, KeyRound, Plus, Copy, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { api } from "../client";
import { label } from "../metadata";
import { fullDate } from "../presentation";
import type { Row } from "../cockpit/model";
const ROLES = [
  "VIEWER",
  "WORKSTREAM_LEAD",
  "CHIEF_ARCHITECT",
  "PMO",
  "EXECUTIVE",
  "GATE_APPROVER",
  "PROGRAM_ADMIN",
];
export function AccessWorkspace({
  s,
  pid,
  onSaved,
}: {
  s: Row;
  pid: string;
  onSaved: () => void;
}) {
  const cache = useQueryClient(),
    query = useQuery({
      queryKey: ["access", pid],
      queryFn: () => api("access/state", pid),
    });
  const [member, setMember] = useState<Row | null>(null),
    [identity, setIdentity] = useState(false),
    [token, setToken] = useState(false),
    [secret, setSecret] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  function refresh() {
    cache.invalidateQueries({ queryKey: ["access", pid] });
    onSaved();
  }
  const a = query.data;
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`access/tokens/${id}/revoke`, pid, "POST", {});
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="access-workspace ct-panel">
      <header>
        <h2>
          <Users size={16} /> Acessos e identidades
        </h2>
        <div className="report-controls">
          {a?.manages && (
            <>
              <button
                className="button small"
                onClick={() => setIdentity(true)}
              >
                Provisionar identidade
              </button>
              <button
                className="button primary small"
                onClick={() => setMember({})}
              >
                <Plus size={13} />
                Atribuir acesso
              </button>
            </>
          )}
        </div>
      </header>
      {query.isLoading && <p className="ct-empty">Carregando permissões…</p>}
      {query.error && (
        <p className="error" role="alert">
          {query.error.message}
        </p>
      )}
      {a && (
        <>
          <div className="access-members">
            {a.manages ? (
              a.members.map((m: Row) => (
                <button
                  key={m.id}
                  className="access-member"
                  onClick={() => setMember(m)}
                >
                  <span>
                    <strong>{m.display_name}</strong>
                    <small>{m.email}</small>
                  </span>
                  <span>
                    {label(m.role)}
                    <small>
                      {s.workstreams.find((w: Row) => w.id === m.workstream_id)
                        ?.name || "Programa"}{" "}
                      · {m.data_clearance}
                    </small>
                  </span>
                  <small>
                    {m.expires_at
                      ? `Até ${fullDate(m.expires_at)}`
                      : "Sem vencimento"}
                  </small>
                </button>
              ))
            ) : (
              <p className="policy-note">
                Somente administradores do programa gerenciam vínculos. Seus
                tokens abaixo usam suas permissões atuais.
              </p>
            )}
          </div>
          <div className="section-toolbar">
            <h3>
              <KeyRound size={16} /> Meus tokens de API
            </h3>
            <button className="button small" onClick={() => setToken(true)}>
              <Plus size={13} />
              Emitir token
            </button>
          </div>
          <div className="access-tokens">
            {a.tokens.map((t: Row) => (
              <div key={t.id}>
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    {t.access === "READ"
                      ? "Leitura"
                      : "Escrita conforme alçadas"}{" "}
                    · expira {fullDate(t.expires_at)} ·{" "}
                    {t.revoked_at
                      ? "Revogado"
                      : new Date(t.expires_at) < new Date()
                        ? "Expirado"
                        : "Ativo"}
                  </small>
                </span>
                <button
                  className="button small"
                  disabled={busy || !!t.revoked_at}
                  onClick={() => revoke(t.id)}
                >
                  Revogar token
                </button>
              </div>
            ))}
            {!a.tokens.length && (
              <p className="ct-empty">
                Nenhum token emitido para este programa.
              </p>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {member && (
        <MembershipEditor
          key={member.id || "new"}
          initial={member}
          s={s}
          pid={pid}
          onClose={() => setMember(null)}
          onSaved={refresh}
        />
      )}
      {identity && (
        <IdentityEditor
          pid={pid}
          local={a?.authMode === "local"}
          issuer={a?.oidcIssuer}
          onClose={() => setIdentity(false)}
          onSaved={refresh}
        />
      )}
      {token && (
        <TokenEditor
          pid={pid}
          onClose={() => setToken(false)}
          onIssued={(value) => {
            setSecret(value);
            setToken(false);
            refresh();
          }}
        />
      )}
      <Modal
        open={!!secret}
        wide
        title="Token emitido"
        description="Copie agora e armazene em um gerenciador de secrets. O sistema guarda somente o digest e não exibe este valor novamente."
        onClose={() => {
          setSecret("");
          setMessage("");
        }}
      >
        <label>
          Credencial Bearer
          <textarea
            aria-label="Token de API emitido"
            readOnly
            rows={6}
            value={secret}
          />
        </label>
        <button
          className="button primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setMessage("Token copiado.");
            } catch {
              setMessage(
                "Não foi possível copiar. Selecione o texto manualmente.",
              );
            }
          }}
        >
          <Copy size={14} />
          Copiar token
        </button>
        <p role="status">{message}</p>
      </Modal>
    </section>
  );
}
function MembershipEditor({
  initial,
  s,
  pid,
  onClose,
  onSaved,
}: {
  initial: Row;
  s: Row;
  pid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(initial.email || ""),
    [role, setRole] = useState(initial.role || "VIEWER"),
    [front, setFront] = useState(initial.workstream_id || ""),
    [categories, setCategories] = useState<string[]>(
      initial.gate_categories || [],
    ),
    [domains, setDomains] = useState<string[]>(initial.domain_ids || []),
    [clearance, setClearance] = useState(initial.data_clearance || "INTERNAL"),
    [expires, setExpires] = useState(
      initial.expires_at
        ? new Date(
            new Date(initial.expires_at).getTime() -
              new Date(initial.expires_at).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(revoke = false) {
    setError("");
    setBusy(true);
    try {
      const body: Row = {
        expectedVersion: Number(initial.version || 0),
        reason,
      };
      if (!revoke)
        Object.assign(body, {
          email,
          role,
          workstream_id: front || null,
          gate_categories: role === "GATE_APPROVER" ? categories : [],
          domain_ids: role === "GATE_APPROVER" ? domains : [],
          data_clearance: clearance,
          expires_at: expires ? new Date(expires).toISOString() : null,
        });
      await api(
        `access/members${initial.id ? `/${initial.id}` : ""}${revoke ? "/revoke" : ""}`,
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
      title={initial.id ? "Editar vínculo de acesso" : "Atribuir acesso"}
      onClose={onClose}
      description="Papel, classificação de leitura e alçada de gate são independentes. Nenhuma mensagem de convite é enviada."
    >
      <form
        className="catalog-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          E-mail da identidade
          <input
            aria-label="E-mail da identidade"
            type="email"
            required
            disabled={!!initial.id}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Papel
          <select
            aria-label="Papel do vínculo"
            disabled={!!initial.id}
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setFront("");
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        {["WORKSTREAM_LEAD", "GATE_APPROVER"].includes(role) && (
          <label>
            Escopo de frente
            <select
              aria-label="Frente do vínculo"
              required={role === "WORKSTREAM_LEAD"}
              value={front}
              onChange={(e) => setFront(e.target.value)}
            >
              <option value="">
                {role === "GATE_APPROVER"
                  ? "Todas as frentes"
                  : "Selecione a frente"}
              </option>
              {s.workstreams.map((w: Row) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Classificação máxima
          <select
            aria-label="Classificação de leitura"
            value={clearance}
            onChange={(e) => setClearance(e.target.value)}
          >
            {["INTERNAL", "CONFIDENTIAL", "RESTRICTED"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Validade opcional
          <input
            aria-label="Validade do vínculo"
            type="datetime-local"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </label>
        {role === "GATE_APPROVER" && (
          <>
            <fieldset className="catalog-gates full">
              <legend>Categorias de aprovação</legend>
              {[...new Set<string>(s.gates.map((g: Row) => g.category))].map(
                (c) => (
                  <label className="catalog-check" key={c}>
                    <input
                      type="checkbox"
                      checked={categories.includes(c)}
                      onChange={(e) =>
                        setCategories(
                          e.target.checked
                            ? [...categories, c]
                            : categories.filter((v) => v !== c),
                        )
                      }
                    />
                    {label(c)}
                  </label>
                ),
              )}
            </fieldset>
            <label>
              Domínios da alçada
              <select
                multiple
                aria-label="Domínios da alçada"
                value={domains}
                onChange={(e) =>
                  setDomains([...e.target.selectedOptions].map((o) => o.value))
                }
              >
                {s.domains.map((d: Row) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <small>
                Sem seleção: todos os domínios. Quando restrito, todos os
                domínios vinculados à entrega devem estar cobertos.
              </small>
            </label>
          </>
        )}
        <label className="full">
          Justificativa
          <textarea
            aria-label="Justificativa do vínculo"
            required
            minLength={3}
            maxLength={2000}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p className="error full" role="alert">
            {error}
          </p>
        )}
        <div className="report-controls full">
          <button className="button primary" disabled={busy}>
            Salvar acesso
          </button>
          {initial.id && (
            <button
              type="button"
              className="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => save(true)}
            >
              Revogar acesso
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function IdentityEditor({
  pid,
  local,
  issuer,
  onClose,
  onSaved,
}: {
  pid: string;
  local: boolean;
  issuer?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [credential, setCredential] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title="Provisionar identidade"
      onClose={onClose}
      description={
        local
          ? "Conta para desenvolvimento local. Em produção, o acesso usa o provedor corporativo."
          : `Issuer configurado: ${issuer || "Não configurado"}`
      }
    >
      <form
        className="report-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("access/identities", pid, "POST", {
              mode: local ? "LOCAL" : "OIDC",
              name,
              email,
              reason,
              ...(local ? { password: credential } : { subject: credential }),
            });
            onSaved();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome
          <input
            aria-label="Nome da identidade"
            required
            minLength={3}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          E-mail
          <input
            aria-label="E-mail para provisionar"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {local
            ? "Senha inicial (mínimo 12 caracteres)"
            : "Subject do provedor OIDC"}
          <input
            aria-label={local ? "Senha inicial da identidade" : "Subject OIDC"}
            type={local ? "password" : "text"}
            required
            minLength={local ? 12 : 1}
            maxLength={local ? 200 : 500}
            autoComplete="new-password"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
          />
        </label>
        <label>
          Justificativa
          <textarea
            aria-label="Justificativa do provisionamento"
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
        <p className="policy-note">
          Após criar a identidade, atribua os papéis explicitamente.
          Provisionamento não concede acesso.
        </p>
        <button
          className="button primary"
          disabled={busy || (!local && !issuer)}
        >
          Criar identidade
        </button>
      </form>
    </Modal>
  );
}
function TokenEditor({
  pid,
  onClose,
  onIssued,
}: {
  pid: string;
  onClose: () => void;
  onIssued: (token: string) => void;
}) {
  const [name, setName] = useState(""),
    [access, setAccess] = useState("READ"),
    [expires, setExpires] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title="Emitir token de API"
      onClose={onClose}
      description="Escopo limitado ao programa atual. O token não amplia seus papéis e pode ser revogado a qualquer momento."
    >
      <form
        className="report-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api("access/tokens", pid, "POST", {
              name,
              programIds: [pid],
              access,
              expiresAt: new Date(expires).toISOString(),
            });
            onIssued(result.token);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome
          <input
            aria-label="Nome do token"
            required
            minLength={3}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Permissão
          <select
            aria-label="Permissão do token"
            value={access}
            onChange={(e) => setAccess(e.target.value)}
          >
            <option value="READ">Somente leitura</option>
            <option value="WRITE">Escrita conforme minhas alçadas</option>
          </select>
        </label>
        <label>
          Expiração (até 90 dias)
          <input
            aria-label="Expiração do token"
            required
            type="datetime-local"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          <ShieldCheck size={14} />
          Emitir credencial
        </button>
      </form>
    </Modal>
  );
}
