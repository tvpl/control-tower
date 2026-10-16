"use client";
import { GitLabSetup, GitLabGuide, GitLabGuideButton } from "./gitlab-setup";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Link2, Plug, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { canEdit } from "@/server/domain/rules";
import { api } from "../client";
import { Badge, fullDate } from "../presentation";
import { nodeName } from "../forms";
import { JobStatus } from "./job-status";
import type { Row } from "../cockpit/model";
import { GitLabBatchLinks } from "./gitlab-batch-links";
const names: Record<string, string> = {
  JIRA: "Jira",
  AZURE_DEVOPS: "Azure DevOps",
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  CONFLUENCE: "Confluence",
  CATALOGUE: "Catálogo externo",
};
export function IntegrationWorkspace({
  s,
  pid,
  select,
  onSaved,
}: {
  s: Row;
  pid: string;
  select: (kind: string, r: Row) => void;
  onSaved: () => void;
}) {
  const admin = canEdit(s.roles, "connections"),
    [job, setJob] = useState(""),
    [guide, setGuide] = useState(false),
    [setup, setSetup] = useState<Row | true | null>(null),
    [probe, setProbe] = useState<Row | null>(null),
    [connection, setConnection] = useState<Row | null>(null),
    [subject, setSubject] = useState(""),
    [external, setExternal] = useState(""),
    [mode, setMode] = useState("REFERENCE"),
    [reason, setReason] = useState(""),
    [conflict, setConflict] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [batchConnection, setBatchConnection] = useState<Row | null>(null);
  const query = useQuery({
    queryKey: ["integrations", pid],
    queryFn: () => api("integrations/status", pid),
    enabled: admin,
    refetchInterval: 10000,
  });
  async function command(path: string, body: Row, done?: () => void) {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, pid, "POST", body);
      if (path.endsWith("/sync")) setJob(result.id);
      if (path.endsWith("/test"))
        setProbe({ ...result, connectionId: path.split("/")[1] });
      await query.refetch();
      onSaved();
      done?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const data = query.data;
  return (
    <section className="integration-workspace">
      <div className="section-toolbar">
        <div>
          <h2>Conecte o trabalho ao projeto</h2>
          <p className="muted">
            Receba o andamento da fonte e vincule aos registros da torre.
          </p>
        </div>
        <div className="report-controls">
          <GitLabGuideButton onClick={() => setGuide(true)} />
          <button
            className="button primary"
            disabled={!admin}
            onClick={() => setSetup(true)}
          >
            Configurar GitLab
          </button>
        </div>
      </div>
      <div className="adapter-grid">
        {Object.entries(names).map(([type, name]) => {
          const records = s.connections.filter(
            (c: Row) => c.connector_type === type,
          );
          return (
            <article className="ct-panel adapter" key={type}>
              <div className="adapter-logo">
                <Plug size={24} />
              </div>
              <h2>{name}</h2>
              <strong>{records.length} conexões</strong>
              <span>
                {records.length ? (
                  records.map((c: Row) => <Badge key={c.id} value={c.status} />)
                ) : (
                  <Badge value="NOT_CONFIGURED" />
                )}
              </span>
              <small>
                {records.length
                  ? "Estado da última consulta registrada."
                  : "Cadastre uma conexão para consultar esta fonte."}
              </small>
            </article>
          );
        })}
      </div>
      <div className="section-toolbar">
        <h2>Fontes e sincronizações</h2>
        <span className="muted small-text">
          Consulta paginada · conflitos preservados · credenciais no ambiente
        </span>
      </div>
      <div className="contract-grid">
        {s.connections.map((c: Row) => (
          <article className="ct-panel contract-card" key={c.id}>
            <button
              className="row-link"
              onClick={() => select("connections", c)}
            >
              <strong>{c.name}</strong>
            </button>
            <span>
              {names[c.connector_type]} · {c.deployment} ·{" "}
              {c.project || "Sem projeto"}
            </span>
            <Badge value={c.status} />
            <span>
              Última consulta:{" "}
              {fullDate(c.last_synced_at, s.programs?.[0]?.timezone)}
            </span>
            <span>
              {c.enabled ? "Consulta periódica habilitada" : "Consulta manual"}{" "}
              · execução:{" "}
              {c.execution_owner === "EXTERNAL"
                ? "fonte externa"
                : "Control Tower"}
            </span>
            {c.last_error && (
              <p role="status" className="error">
                {c.last_error}
              </p>
            )}
            {c.circuit_open_until && (
              <p>
                Circuit breaker até{" "}
                {fullDate(c.circuit_open_until, s.programs?.[0]?.timezone)}
              </p>
            )}
            {c.connector_type === "GITLAB" && (
              <small>
                {c.gitlab_options?.scope === "GROUP"
                  ? "Grupo com épicos"
                  : "Projeto"}{" "}
                · {c.gitlab_options?.labels?.join(" + ") || "Todas as labels"} ·{" "}
                {c.gitlab_options?.api === "WORK_ITEMS"
                  ? "Work Items"
                  : "Issues REST"}
              </small>
            )}
            {probe && probe.connectionId === c.id && (
              <p role="status">
                Acesso confirmado · {probe.sampled} itens consultados
                {probe.hasMore ? " nesta primeira página" : ""}.
              </p>
            )}
            <div className="report-controls">
              {c.connector_type === "GITLAB" && (
                <button
                  className="button"
                  disabled={!admin || !data}
                  onClick={() => setBatchConnection(c)}
                >
                  <Link2 size={14} />
                  Vincular em lote
                </button>
              )}
              <button
                className="button"
                disabled={!admin || busy}
                onClick={() => command(`connections/${c.id}/test`, {})}
              >
                Testar acesso
              </button>
              {c.connector_type === "GITLAB" && (
                <button
                  className="button"
                  disabled={!admin}
                  onClick={() => setSetup(c)}
                >
                  Configurar
                </button>
              )}
              <button
                className="button"
                disabled={!admin || busy}
                onClick={() => command(`connections/${c.id}/sync`, {})}
              >
                <RefreshCw size={14} />
                Sincronizar
              </button>
              <button
                className="button"
                disabled={!admin}
                onClick={() => {
                  setConnection(c);
                  setMode("REFERENCE");
                  setExternal("");
                  setSubject("");
                  setReason("");
                  setError("");
                }}
              >
                <Link2 size={14} />
                Vincular ID externo
              </button>
            </div>
          </article>
        ))}
      </div>
      {!s.connections.length && (
        <p className="ct-empty">
          Use “Configurar GitLab” ou “Nova conexão” para configurar uma fonte.
          Nenhuma conta externa foi consultada.
        </p>
      )}
      {job && (
        <JobStatus
          id={job}
          pid={pid}
          onComplete={() => {
            query.refetch();
            onSaved();
          }}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {query.error && (
        <p role="alert" className="error">
          {query.error.message}
        </p>
      )}
      {admin && data && (
        <>
          <div className="ct-metric-grid">
            <article className="ct-panel">
              <strong>{data.references.length}</strong>
              <span>Vínculos cadastrados no projeto</span>
            </article>
            <article className="ct-panel">
              <strong>
                {data.inbox.filter((i: Row) => i.status === "UNMAPPED").length}
              </strong>
              <span>Sem vínculo na página recebida</span>
            </article>
            <article className="ct-panel">
              <strong>
                {data.conflicts.filter((i: Row) => i.status === "OPEN").length}
              </strong>
              <span>Conflitos abertos na página recebida</span>
            </article>
            <article className="ct-panel">
              <strong>{data.runs.length}</strong>
              <span>Execuções recentes</span>
            </article>
          </div>
          {data.inbox.some((i: Row) => i.payload.source === "GITLAB") &&
            (() => {
              const latest = [
                ...new Map<string, Row>(
                  [...data.inbox]
                    .reverse()
                    .filter((i: Row) => i.payload.source === "GITLAB")
                    .map((i: Row) => [
                      `${i.connection_id}:${i.external_id}`,
                      i,
                    ]),
                ).values(),
              ];
              const closed = latest.filter(
                (i) => i.payload.operationalState === "DONE",
              ).length;
              return (
                <section className="ct-panel gitlab-received">
                  <div className="section-toolbar">
                    <h2>Trabalho recebido do GitLab</h2>
                    <strong>
                      {closed}/{latest.length} concluídos operacionalmente ·{" "}
                      {Math.round((closed / latest.length) * 100)}%
                    </strong>
                  </div>
                  <p className="muted">
                    Recorte das últimas {data.inbox.length} recepções; não
                    representa todo o GitLab. Aceite e prontidão são calculados
                    pela torre.
                  </p>
                  <div className="contract-grid">
                    {latest.map((i) => (
                      <article key={i.id} className="agent-diff">
                        <span className="eyebrow">
                          {i.payload.itemType || "ISSUE"} ·{" "}
                          {i.payload.reference || i.external_id}
                        </span>
                        <h3>{i.payload.title}</h3>
                        <Badge value={i.payload.operationalState} />
                        {i.payload.parent && <p>↳ {i.payload.parent.title}</p>}
                        <p className="muted">
                          {i.payload.labels?.join(" · ") || "Sem labels"}
                        </p>
                        <div className="report-controls">
                          <a
                            className="button small"
                            href={i.payload.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir no GitLab
                          </a>
                          <button
                            className="button small"
                            onClick={() => {
                              setConnection(
                                s.connections.find(
                                  (c: Row) => c.id === i.connection_id,
                                ),
                              );
                              setExternal(i.external_id);
                              setSubject("");
                              setMode("REFERENCE");
                              setReason("");
                              setError("");
                            }}
                          >
                            Vincular
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })()}
          <h2>
            <AlertTriangle size={18} /> Conflitos para revisão
          </h2>
          <div className="contract-grid">
            {data.conflicts
              .filter((c: Row) => c.status === "OPEN")
              .map((c: Row) => (
                <article className="ct-panel contract-card" key={c.id}>
                  <strong>
                    {nodeName(
                      s.nodes.find((n: Row) => n.id === c.subject_node_id) ||
                        {},
                      s,
                    )}
                  </strong>
                  <span>
                    Campo: {c.field_name} · versão {c.expected_entity_version}
                  </span>
                  <span>Atual: {JSON.stringify(c.current_value)}</span>
                  <span>Fonte: {JSON.stringify(c.incoming_value)}</span>
                  <button
                    className="button"
                    onClick={() => {
                      setConflict(c);
                      setReason("");
                      setError("");
                    }}
                  >
                    Reconciliar conflito
                  </button>
                </article>
              ))}
          </div>
          <details className="ct-panel">
            <summary>Inbox — últimos {data.inbox.length} registros</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID externo</th>
                    <th>Título</th>
                    <th>Estado original</th>
                    <th>Resultado</th>
                    <th>Atualização na fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inbox.map((i: Row) => (
                    <tr key={i.id}>
                      <td>{i.external_id}</td>
                      <td>{i.payload.title}</td>
                      <td>{i.payload.sourceState || "Não preservado"}</td>
                      <td>
                        <Badge value={i.status} />
                      </td>
                      <td>
                        {fullDate(
                          i.source_updated_at,
                          s.programs?.[0]?.timezone,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="ct-panel">
            <summary>Histórico — últimas {data.runs.length} execuções</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Estado</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r: Row) => (
                    <tr key={r.id}>
                      <td>
                        {fullDate(r.created_at, s.programs?.[0]?.timezone)}
                      </td>
                      <td>
                        <Badge value={r.status} />
                      </td>
                      <td>{r.detail || "Processando"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <div className="policy-note">
        <Plug size={20} />
        <p>
          Escopo, baseline, aceite e decisões exigem os comandos e as alçadas da
          torre. O webhook autenticado agenda uma consulta à fonte; o corpo
          recebido não altera registros diretamente.
        </p>
      </div>
      {guide && <GitLabGuide onClose={() => setGuide(false)} />}
      {batchConnection && data && (
        <GitLabBatchLinks
          s={s}
          pid={pid}
          connection={batchConnection}
          data={data}
          onClose={() => setBatchConnection(null)}
          onSaved={() => {
            query.refetch();
            onSaved();
          }}
        />
      )}
      {setup && (
        <GitLabSetup
          key={setup === true ? "new" : setup.id}
          record={setup === true ? undefined : setup}
          pid={pid}
          onClose={() => setSetup(null)}
          onSaved={onSaved}
        />
      )}
      {connection && (
        <Modal
          open
          wide
          title={`Vincular origem · ${connection.name}`}
          onClose={() => setConnection(null)}
        >
          <form
            className="entity-form"
            onSubmit={(e) => {
              e.preventDefault();
              command(
                `connections/${connection.id}/links`,
                { externalId: external, subjectNodeId: subject, mode, reason },
                () => setConnection(null),
              );
            }}
          >
            <label>
              ID externo
              <input
                required
                value={external}
                maxLength={200}
                onChange={(e) => setExternal(e.target.value)}
              />
            </label>
            <label>
              Registro da torre
              <select
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">Selecionar</option>
                {s.nodes
                  .filter(
                    (n: Row) =>
                      mode !== "EXECUTION" || n.entity_type === "deliverables",
                  )
                  .map((n: Row) => (
                    <option key={n.id} value={n.id}>
                      {nodeName(n, s)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Uso da origem
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setSubject("");
                }}
              >
                <option value="REFERENCE">Referência apenas</option>
                <option value="EXECUTION">
                  Atualização operacional de entregável
                </option>
              </select>
            </label>
            <label>
              Justificativa
              <textarea
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p className="muted">
              Use o identificador imutável retornado pela API da fonte. A
              delegação da execução e os estados são configurados na conexão.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              Salvar vínculo
            </button>
          </form>
        </Modal>
      )}
      {conflict && (
        <Modal
          open
          wide
          title="Reconciliar alteração externa"
          onClose={() => setConflict(null)}
        >
          <p>
            {nodeName(
              s.nodes.find((n: Row) => n.id === conflict.subject_node_id) || {},
              s,
            )}{" "}
            · {conflict.field_name}
          </p>
          <div className="report-preview">
            <p>Atual: {JSON.stringify(conflict.current_value)}</p>
            <p>Fonte: {JSON.stringify(conflict.incoming_value)}</p>
          </div>
          <label>
            Justificativa da decisão
            <textarea
              aria-label="Justificativa da reconciliação"
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="report-controls">
            {["KEEP", "APPLY"].map((decision) => (
              <button
                key={decision}
                className={`button ${decision === "KEEP" ? "primary" : ""}`}
                disabled={
                  busy ||
                  reason.trim().length < 3 ||
                  (decision === "APPLY" &&
                    conflict.incoming_value === "UNKNOWN")
                }
                onClick={() =>
                  command(
                    `sync-conflicts/${conflict.id}/resolve`,
                    {
                      decision,
                      reason,
                      expectedVersion: Number(conflict.version),
                      expectedEntityVersion: Number(
                        conflict.expected_entity_version,
                      ),
                    },
                    () => setConflict(null),
                  )
                }
              >
                {decision === "KEEP"
                  ? "Preservar valor atual"
                  : "Aplicar valor da fonte"}
              </button>
            ))}
          </div>
          <p className="ct-footnote">
            Versão obsoleta, estado sem mapping ou alteração de escopo aprovado
            exigem nova sincronização ou change control.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
