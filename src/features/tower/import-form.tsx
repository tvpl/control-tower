"use client";
import { Modal } from "@/components/ui/dialog";
import { useState } from "react";
import { api, download } from "./client";
import { JobStatus } from "./governance/job-status";
import type { Row } from "./cockpit/model";
const HEADER =
  "program_code,domain_code,workstream_code,capability_code,deliverable_code,name,layer,owner_email,stage,execution_status,forecast_date,source_url,acceptance_criteria";
const encode = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
};
export function ImportForm({
  pid,
  onClose,
  onSaved,
}: {
  pid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [csv, setCsv] = useState(""),
    [file, setFile] = useState<{ name: string; base64: string } | null>(null),
    [sheet, setSheet] = useState(""),
    [source, setSource] = useState(""),
    [namespace, setNamespace] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [previewJob, setPreviewJob] = useState(""),
    [commitJob, setCommitJob] = useState(""),
    [error, setError] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [onlyErrors, setOnlyErrors] = useState(false),
    [count, setCount] = useState(100);
  function reset() {
    setFailed(false);
    setPreview(null);
    setPreviewJob("");
    setCommitJob("");
    setCount(100);
    setError("");
  }
  async function run(commit = false) {
    setBusy(true);
    setError("");
    try {
      if (commit) {
        const job = await api(`import-jobs/${previewJob}/commit`, pid, "POST", {
          expectedHash: preview?.hash,
        });
        setCommitJob(job.id);
      } else {
        setPreview(null);
        const selected = file || { name: "conteudo.csv", base64: encode(csv) },
          job = await api("import-jobs", pid, "POST", {
            filename: selected.name,
            contentBase64: selected.base64,
            ...(sheet ? { sheet } : {}),
            ...(source ? { sourceUrl: source } : {}),
            ...(namespace ? { namespace } : {}),
          });
        setPreviewJob(job.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const lines = (preview?.lines || []).filter(
    (l: Row) => !onlyErrors || l.errors.length,
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Importar inventário CSV / XLSX"
      description="Até 5 MB e 10.000 linhas. Prévia assíncrona e confirmação explícita. O commit revalida todo o conteúdo e grava atomicamente."
    >
      <div className="catalog-form">
        <label className="full">
          Arquivo
          <input
            aria-label="Arquivo de inventário"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!!commitJob}
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              reset();
              setFile(null);
              if (!selected) return;
              if (selected.size > 5000000) {
                setError("Arquivo excede 5 MB.");
                return;
              }
              try {
                const base64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]);
                  reader.onerror = () =>
                    reject(new Error("Não foi possível ler o arquivo."));
                  reader.readAsDataURL(selected);
                });
                setFile({ name: selected.name, base64 });
                setCsv("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
        <label>
          Nome da fonte (para IDs externos)
          <input
            aria-label="Nome da fonte de importação"
            disabled={!!commitJob}
            value={namespace}
            maxLength={100}
            placeholder="Ex.: Inventário de arquitetura"
            onChange={(e) => {
              reset();
              setNamespace(e.target.value);
            }}
          />
        </label>
        <label>
          URL de origem HTTPS
          <input
            aria-label="Origem da importação"
            type="url"
            disabled={!!commitJob}
            value={source}
            placeholder="https://..."
            onChange={(e) => {
              reset();
              setSource(e.target.value);
            }}
          />
        </label>
        {file?.name.endsWith(".xlsx") && (
          <label>
            Planilha (opcional)
            <input
              aria-label="Planilha do XLSX"
              disabled={!!commitJob}
              value={sheet}
              maxLength={100}
              placeholder="Padrão: primeira planilha"
              onChange={(e) => {
                reset();
                setSheet(e.target.value);
              }}
            />
          </label>
        )}
        <details className="full">
          <summary>Colar conteúdo CSV</summary>
          <textarea
            aria-label="Conteúdo CSV para importar"
            rows={7}
            disabled={!!commitJob}
            value={csv}
            onChange={(e) => {
              reset();
              setCsv(e.target.value);
              setFile(null);
            }}
          />
        </details>
      </div>
      <div className="report-controls" style={{ marginTop: 16 }}>
        <button
          className="button small"
          onClick={() =>
            download(
              "modelo-entregaveis.csv",
              HEADER + "\n",
              "text/csv;charset=utf-8",
            )
          }
        >
          Baixar modelo CSV
        </button>
        <span className="muted">
          Fórmulas, macros e arquivos externos de planilhas não são executados.
        </span>
      </div>
      {previewJob && (
        <JobStatus
          key={previewJob}
          id={previewJob}
          pid={pid}
          onComplete={setPreview}
        />
      )}
      {preview && (
        <section className="import-preview">
          <div className="section-toolbar">
            <strong>
              {preview.count} linhas ·{" "}
              {preview.valid ? "Validação aprovada" : "Corrija os erros"}
            </strong>
            <label>
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => {
                  setOnlyErrors(e.target.checked);
                  setCount(100);
                }}
              />
              Somente erros
            </label>
            <a
              className="button small"
              href={`/api/v1/jobs/${previewJob}/errors.csv?programId=${pid}`}
            >
              Exportar erros
            </a>
          </div>
          <div
            className="import-lines"
            tabIndex={0}
            role="region"
            aria-label="Linhas da prévia de importação"
          >
            {lines.slice(0, count).map((l: Row) => (
              <div key={l.line}>
                <b>
                  Linha {l.line} · {l.input.code || "Sem código"}
                </b>
                <span>{l.input.name}</span>
                <p>{l.errors.length ? l.errors.join("; ") : "Válida"}</p>
              </div>
            ))}
            {!lines.length && <p>Nenhuma linha neste filtro.</p>}
          </div>
          {lines.length > count && (
            <button
              className="button small"
              onClick={() => setCount(count + 100)}
            >
              Mostrar mais 100 linhas
            </button>
          )}
          <p className="ct-footnote">
            Hash da prévia: {preview.hash}. As origens por campo serão
            registradas na confirmação.
          </p>
        </section>
      )}
      {commitJob && (
        <JobStatus
          id={commitJob}
          pid={pid}
          onFailure={() => setFailed(true)}
          onComplete={() => {
            onSaved();
            onClose();
          }}
        />
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {failed && (
        <button
          className="button"
          onClick={() => {
            reset();
            run();
          }}
        >
          Revalidar inventário após falha
        </button>
      )}
      <div className="form-actions">
        <button
          className="button"
          disabled={busy || (!file && !csv) || !!commitJob}
          onClick={() => run()}
        >
          Validar prévia
        </button>
        <button
          className="button primary"
          disabled={busy || !preview?.valid || !preview?.count || !!commitJob}
          onClick={() => run(true)}
        >
          Confirmar importação
        </button>
      </div>
    </Modal>
  );
}
