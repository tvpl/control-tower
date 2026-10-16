"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Download,
  FileCheck2,
  GitCompareArrows,
  Plus,
  Printer,
} from "lucide-react";
import { JobStatus } from "../governance/job-status";
import { Modal } from "@/components/ui/dialog";
import { compareSnapshots } from "@/server/domain/report-comparison";
import { api, download } from "../client";
import { fullDate, fmt, Badge } from "../presentation";
import { label, TITLES } from "../metadata";
import type { Row } from "../cockpit/model";
const fieldNames: Record<string, string> = {
  execution_status: "Execução",
  accepted: "Aceite",
  delivery_stage: "Estágio",
  scope_status: "Escopo",
  planning_status: "Planejamento",
  forecast_date: "Forecast",
  owner_id: "Responsável",
  name: "Nome",
  layer: "Camada",
  workstream_id: "Frente",
  area_id: "Área",
  squad_id: "Squad",
};
function Comparison({ current, previous }: { current: Row; previous: Row }) {
  const delta = compareSnapshots(current, previous);
  return (
    <div className="report-comparison">
      <div className="project-stats">
        <div>
          <strong>{delta.added.length}</strong>
          <small>Adicionados</small>
        </div>
        <div>
          <strong>{delta.removed.length}</strong>
          <small>Removidos</small>
        </div>
        <div>
          <strong>{delta.changed.length}</strong>
          <small>Alterados</small>
        </div>
        <div>
          <strong>
            {delta.comparable
              ? `${current.payload.metrics.accepted - previous.payload.metrics.accepted >= 0 ? "+" : ""}${current.payload.metrics.accepted - previous.payload.metrics.accepted}`
              : "—"}
          </strong>
          <small>Delta de aceites</small>
        </div>
      </div>
      {!delta.comparable && (
        <p className="policy-note">
          Fórmulas diferentes: delta de indicadores não comparável. Alterações
          de campos permanecem visíveis.
        </p>
      )}
      {delta.changed.map((d) => (
        <div key={d.id} className="report-diff">
          <h3>
            {d.code} · {d.name}
          </h3>
          {d.fields.map((f) => (
            <p key={f.field}>
              <b>{fieldNames[f.field] || f.field}</b>
              <span>{String(f.before ?? "Não definido")}</span>
              <ArrowRight size={14} />
              <strong>{String(f.after ?? "Não definido")}</strong>
            </p>
          ))}
        </div>
      ))}
      {[
        ["Adicionados", delta.added],
        ["Removidos", delta.removed],
      ].map(
        ([title, items]) =>
          (items as Row[]).length > 0 && (
            <div key={title as string} className="report-diff">
              <h3>{title as string}</h3>
              {(items as Row[]).map((d) => (
                <p key={d.id}>
                  {d.code} · {d.name}
                </p>
              ))}
            </div>
          ),
      )}
      {!delta.changed.length &&
        !delta.added.length &&
        !delta.removed.length && (
          <p className="ct-empty">
            Sem alterações nos campos de entregáveis examinados.
          </p>
        )}
      <div className="report-collection-diffs">
        <h3>Cadastros, critérios e relações</h3>
        {delta.collections.map((c) => (
          <details key={c.kind}>
            <summary>
              {TITLES[c.kind] || c.kind} ·{" "}
              {c.available
                ? `+${c.added.length} / -${c.removed.length} / ${c.changed.length} alterados`
                : "Dados não preservados nos dois snapshots"}
            </summary>
            {c.available && (
              <>
                {c.added.map((r: Row, i: number) => (
                  <p key={`added-${i}`}>
                    Adicionado: {r.code || r.id || "Relação"} ·{" "}
                    {r.name || r.title || ""}
                  </p>
                ))}
                {c.removed.map((r: Row, i: number) => (
                  <p key={`removed-${i}`}>
                    Removido: {r.code || r.id || "Relação"} ·{" "}
                    {r.name || r.title || ""}
                  </p>
                ))}
                {c.changed.map((r) => (
                  <div className="report-diff" key={r.id}>
                    <b>{r.code || r.name || r.id}</b>
                    {r.fields.map((f) => (
                      <p key={f.field}>
                        {f.field}: {JSON.stringify(f.before)} →{" "}
                        {JSON.stringify(f.after)}
                      </p>
                    ))}
                  </div>
                ))}
              </>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
export function ReportWorkspace({
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
  const [pdfJob, setPdfJob] = useState("");
  const [create, setCreate] = useState(false),
    [reportId, setReportId] = useState<string | null>(null),
    [compare, setCompare] = useState(false),
    [currentId, setCurrentId] = useState(""),
    [previousId, setPreviousId] = useState(""),
    [title, setTitle] = useState(""),
    [narrative, setNarrative] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const currentMeta =
    s.snapshots.find((v: Row) => v.id === currentId) || s.snapshots[0];
  const previousOptions = s.snapshots.filter(
    (v: Row) =>
      currentMeta &&
      new Date(v.as_of).getTime() < new Date(currentMeta.as_of).getTime(),
  );
  const previousMeta =
    previousOptions.find((v: Row) => v.id === previousId) || previousOptions[0];
  const report = s.reports.find((v: Row) => v.id === reportId);
  const currentFetchId = report?.snapshot_id || currentMeta?.id,
    previousFetchId =
      report?.previous_snapshot_id || (!report ? previousMeta?.id : null);
  const fullCurrent = useQuery({
    queryKey: ["snapshot", pid, currentFetchId],
    queryFn: () => api(`snapshots/${currentFetchId}`, pid),
    enabled: !!currentFetchId && !!(create || compare || report),
  });
  const fullPrevious = useQuery({
    queryKey: ["snapshot", pid, previousFetchId],
    queryFn: () => api(`snapshots/${previousFetchId}`, pid),
    enabled: !!previousFetchId && !!(compare || report),
  });
  const current = fullCurrent.data || currentMeta,
    previous = fullPrevious.data || previousMeta,
    frozen = report && fullCurrent.data,
    older = report && fullPrevious.data;
  const manages = s.roles.some((r: Row) =>
    ["PMO", "CHIEF_ARCHITECT", "PROGRAM_ADMIN", "EXECUTIVE"].includes(r.role),
  );
  async function submit(path: string, data: Row, after?: () => void) {
    setError("");
    setBusy(true);
    try {
      await api(path, pid, "POST", data);
      onSaved();
      after?.();
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const authorName = (id: string) =>
    s.users.find((u: Row) => u.id === id)?.display_name || "Membro do programa";
  return (
    <section className="report-workspace">
      <div className="section-toolbar">
        <h2>
          <FileCheck2 size={18} /> Reports executivos
        </h2>
        <div className="report-controls">
          <button
            className="button"
            disabled={s.snapshots.length < 2}
            onClick={() => setCompare(true)}
          >
            <GitCompareArrows size={15} />
            Comparar snapshots
          </button>
          <button
            className="button primary"
            disabled={!manages || !s.snapshots.length}
            onClick={() => {
              setError("");
              setCreate(true);
            }}
          >
            <Plus size={15} />
            Preparar report
          </button>
        </div>
      </div>
      {(fullCurrent.error || fullPrevious.error) && (
        <p className="error" role="alert">
          {fullCurrent.error?.message || fullPrevious.error?.message}
        </p>
      )}
      <div className="report-publications">
        {s.reports.map((r: Row) => (
          <button
            className="ct-panel report-card"
            key={r.id}
            onClick={() => {
              setError("");
              setReason("");
              setPdfJob("");
              setReportId(r.id);
            }}
          >
            <span className="ct-overline">REPORT EXECUTIVO · v{r.version}</span>
            <h3>{r.title}</h3>
            <Badge
              value={r.status}
              text={
                r.status === "SUBMITTED"
                  ? "Em revisão"
                  : r.status === "PUBLISHED"
                    ? "Publicado"
                    : label(r.status)
              }
            />
            <small>
              {authorName(r.author_id)} ·{" "}
              {fullDate(r.created_at, s.programs?.[0]?.timezone)}
            </small>
          </button>
        ))}
        {!s.reports.length && (
          <p className="policy-note">
            Prepare o texto a partir de um snapshot, solicite revisão de outra
            pessoa e publique o report aprovado no programa.
          </p>
        )}
      </div>
      <Modal
        open={create}
        onClose={() => setCreate(false)}
        wide
        title="Preparar report executivo"
        description="Os números vêm do snapshot escolhido. Ao enviar, o texto fica imutável e exige revisão de outra pessoa."
      >
        <form
          className="report-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(
              "reports",
              {
                title,
                narrative,
                snapshotId: current.id,
                previousSnapshotId: previous?.id || null,
              },
              () => {
                setCreate(false);
                setTitle("");
                setNarrative("");
              },
            );
          }}
        >
          <label>
            Snapshot de referência
            <select
              aria-label="Snapshot do report"
              value={current?.id || ""}
              onChange={(e) => {
                setCurrentId(e.target.value);
                setPreviousId("");
              }}
            >
              {s.snapshots.map((v: Row) => (
                <option key={v.id} value={v.id}>
                  {fullDate(v.as_of, s.programs?.[0]?.timezone)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Título do report
            <input
              aria-label="Título do report"
              required
              minLength={3}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Análise e recomendações
            <textarea
              aria-label="Análise e recomendações"
              required
              minLength={3}
              maxLength={12000}
              rows={8}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
            />
          </label>
          {current && (
            <p className="policy-note">
              {current.payload.metrics.accepted}/{current.payload.metrics.total}{" "}
              aceitos · {current.payload.metrics.blocked} execuções bloqueadas ·{" "}
              {previous
                ? `comparado a ${fullDate(previous.as_of, s.programs?.[0]?.timezone)}`
                : "sem snapshot anterior"}
              .
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy || !current}>
            {busy ? "Enviando…" : "Enviar para revisão"}
          </button>
        </form>
      </Modal>
      <Modal
        open={compare}
        onClose={() => setCompare(false)}
        wide
        title="Comparar snapshots"
        description="Diferenças observadas em registros congelados; nenhuma alteração é aplicada ao projeto."
      >
        <div className="report-controls">
          <label>
            Referência
            <select
              aria-label="Snapshot atual da comparação"
              value={current?.id || ""}
              onChange={(e) => {
                setCurrentId(e.target.value);
                setPreviousId("");
              }}
            >
              {s.snapshots.map((v: Row) => (
                <option key={v.id} value={v.id}>
                  {fullDate(v.as_of, s.programs?.[0]?.timezone)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comparar com
            <select
              aria-label="Snapshot anterior da comparação"
              value={previous?.id || ""}
              onChange={(e) => setPreviousId(e.target.value)}
            >
              {previousOptions.map((v: Row) => (
                <option key={v.id} value={v.id}>
                  {fullDate(v.as_of, s.programs?.[0]?.timezone)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {current && previous ? (
          fullCurrent.data && fullPrevious.data ? (
            <Comparison
              current={fullCurrent.data}
              previous={fullPrevious.data}
            />
          ) : (
            <p role="status">Carregando snapshots completos…</p>
          )
        ) : (
          <p>Selecione uma referência que tenha um snapshot anterior.</p>
        )}
      </Modal>
      <Modal
        open={!!report}
        onClose={() => {
          setPdfJob("");
          setReportId(null);
        }}
        wide
        title={report?.title || "Report executivo"}
        description="Relatório interno do programa. Publicação não envia mensagens ou cria um link público."
      >
        {report && !frozen && (
          <p role="status">Carregando snapshot completo…</p>
        )}
        {report && frozen && (
          <>
            <div className="report-document">
              <div className="ct-overline">
                MODERNIZATION CONTROL TOWER · REPORT EXECUTIVO
              </div>
              <h2>{report.title}</h2>
              <p>
                <b>
                  {report.status === "PUBLISHED"
                    ? "PUBLICADO"
                    : "NÃO PUBLICADO"}
                </b>{" "}
                · Snapshot {fullDate(frozen.as_of, s.programs?.[0]?.timezone)} ·{" "}
                {frozen.formula_version}
              </p>
              <div className="project-stats">
                <div>
                  <strong>
                    {frozen.payload.metrics.accepted}/
                    {frozen.payload.metrics.total}
                  </strong>
                  <small>Aceitos</small>
                </div>
                <div>
                  <strong>
                    {frozen.payload.metrics.progress == null
                      ? "—"
                      : `${frozen.payload.metrics.progress}%`}
                  </strong>
                  <small>
                    {frozen.payload.metrics.provisional
                      ? "Avanço provisório"
                      : "Avanço ponderado"}
                  </small>
                </div>
                <div>
                  <strong>{frozen.payload.metrics.blocked}</strong>
                  <small>Bloqueados</small>
                </div>
                <div>
                  <strong>
                    {frozen.payload.readiness?.percentage == null
                      ? "—"
                      : `${frozen.payload.readiness.percentage}%`}
                  </strong>
                  <small>Gates satisfeitos</small>
                </div>
              </div>
              <h3>Análise e recomendações</h3>
              <p className="report-narrative">{report.narrative}</p>
              <h3>Riscos e decisões congelados</h3>
              {frozen.payload.raid
                .filter((r: Row) => r.status !== "RESOLVED")
                .map((r: Row) => (
                  <p key={r.id}>
                    {r.title} · {label(r.severity)} ·{" "}
                    {r.action_plan || "Sem plano informado"}
                  </p>
                ))}
              {frozen.payload.decisions
                .filter((d: Row) => d.status === "PROPOSED")
                .map((d: Row) => (
                  <p key={d.id}>
                    Decisão: {d.name} · {fmt(d.due_date)}
                  </p>
                ))}
              {older && (
                <>
                  <h3>
                    Alterações desde{" "}
                    {fullDate(older.as_of, s.programs?.[0]?.timezone)}
                  </h3>
                  <Comparison current={frozen} previous={older} />
                </>
              )}
              <p className="report-signatures">
                Autor: {authorName(report.author_id)} · Revisor:{" "}
                {report.reviewer_id
                  ? authorName(report.reviewer_id)
                  : "Pendente"}
                <br />
                {report.review_reason && `Revisão: ${report.review_reason}`}
                <br />
                Publicação:{" "}
                {report.published_at
                  ? fullDate(report.published_at, s.programs?.[0]?.timezone)
                  : "Pendente"}
              </p>
              <p className="snapshot-hash mono">
                Snapshot SHA-256: {frozen.payload_hash}
                <br />
                Report SHA-256: {report.payload_hash}
              </p>
            </div>
            <div className="report-controls">
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const job = await api(
                      `reports/${report.id}/pdf`,
                      pid,
                      "POST",
                      {},
                    );
                    setPdfJob(job.id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Gerar PDF no servidor
              </button>
              <button className="button" onClick={() => window.print()}>
                <Printer size={15} />
                Imprimir / salvar PDF
              </button>
              <button
                className="button"
                onClick={() =>
                  download(
                    `report-${report.id}.json`,
                    JSON.stringify(
                      { report, snapshot: frozen, previous: older || null },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download size={15} />
                Exportar report
              </button>
            </div>
            {pdfJob && <JobStatus id={pdfJob} pid={pid} artifact />}
            {manages && ["SUBMITTED", "APPROVED"].includes(report.status) && (
              <div className="report-review report-controls">
                <label>
                  Justificativa da decisão
                  <textarea
                    aria-label="Justificativa da decisão do report"
                    rows={3}
                    minLength={3}
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {report.status === "SUBMITTED" ? (
                  <>
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        reason.trim().length < 3 ||
                        report.author_id === userId
                      }
                      onClick={() =>
                        submit(`reports/${report.id}/review`, {
                          expectedVersion: Number(report.version),
                          decision: "APPROVED",
                          reason,
                        })
                      }
                    >
                      Aprovar report
                    </button>
                    <button
                      className="button"
                      disabled={
                        busy ||
                        reason.trim().length < 3 ||
                        report.author_id === userId
                      }
                      onClick={() =>
                        submit(`reports/${report.id}/review`, {
                          expectedVersion: Number(report.version),
                          decision: "REJECTED",
                          reason,
                        })
                      }
                    >
                      Rejeitar report
                    </button>
                    {report.author_id === userId && (
                      <p>Outra pessoa deve revisar seu report.</p>
                    )}
                  </>
                ) : (
                  <button
                    className="button primary"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      submit(`reports/${report.id}/publish`, {
                        expectedVersion: Number(report.version),
                        reason,
                      })
                    }
                  >
                    Publicar no programa
                  </button>
                )}
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
