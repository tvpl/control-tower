"use client";
import { useState, useId } from "react";
import {
  Download,
  FileJson,
  ClipboardCheck,
  Sparkles,
  Upload,
  CheckCircle2,
  ArrowRight,
  FileText,
} from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { api, download } from "../client";
import { FIELDS, TITLES } from "../metadata";
import type { Kind } from "@/server/domain/schemas";
import type { Row } from "../cockpit/model";
export function AgentWorkspace({
  s,
  pid,
  onSaved,
  importOnly = false,
}: {
  s: Row;
  pid: string;
  onSaved: () => void;
  importOnly?: boolean;
}) {
  const [bundle, setBundle] = useState<Row | null>(null),
    [text, setText] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [template, setTemplate] = useState<unknown>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [reportOpen, setReportOpen] = useState(false);
  const [commitKey, setCommitKey] = useState("");
  const instance = useId(),
    importId = `agent-import-${instance}`,
    templateId = `agent-template-${instance}`;
  function valueLabel(kind: string, key: string, value: unknown): string {
    if (value == null || value === "") return "Sem valor";
    if (Array.isArray(value))
      return value.map((v) => valueLabel(kind, key, v)).join(" · ") || "Nenhum";
    const field = FIELDS[kind as Kind]?.find((f) => f.key === key);
    if (field?.ref) {
      const row = s[field.ref]?.find((r: Row) => r.id === value);
      if (row)
        return [row.code, row.name || row.display_name]
          .filter(Boolean)
          .join(" · ");
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  const writer = s.roles.some((r: Row) => r.role !== "VIEWER");
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    const b = await api("agents/package", pid);
    setBundle(b);
    return b;
  }
  async function validate() {
    const parsed = JSON.parse(text);
    const t = parsed.template || parsed;
    setPreview(null);
    setDone(false);
    const p = await api("agents/preview", pid, "POST", { template: t });
    setTemplate(t);
    setPreview(p);
    setCommitKey(crypto.randomUUID());
  }
  function change(value: string) {
    setText(value);
    setPreview(null);
    setDone(false);
  }
  return (
    <section className="agent-workspace">
      <div hidden={importOnly}>
        <div className="agent-hero ct-panel">
          <div>
            <span className="eyebrow">
              <Sparkles size={15} /> SEU PROJETO PRONTO PARA IA
            </span>
            <h2>Do contexto ao preenchimento, com revisão.</h2>
            <p>
              Use Cursor ou outra IA para explicar o projeto e completar o
              inventário. Traga as sugestões de volta para revisar aqui.
            </p>
          </div>
          <div className="agent-count">
            <strong>{s.capabilities.length + s.deliverables.length}</strong>
            <span>features e entregáveis no contexto</span>
          </div>
        </div>
        <div className="agent-steps">
          <article className="ct-panel">
            <span className="agent-step-number">1</span>
            <h3>Levar o projeto</h3>
            <p>
              Pacote JSON com contexto, relatório, prompt e template. Somente
              dados visíveis para sua identidade.
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const b = await prepare();
                  download("pacote-ia.json", JSON.stringify(b, null, 2));
                })
              }
            >
              <Download size={15} /> Baixar pacote para IA
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  if (!bundle) await prepare();
                  setReportOpen(true);
                })
              }
            >
              <FileText size={15} /> Ler relatório do projeto
            </button>
          </article>
          <article className="ct-panel">
            <span className="agent-step-number">2</span>
            <h3>Pedir o preenchimento</h3>
            <p>
              Abra o pacote no seu editor, siga o prompt e peça o retorno do
              objeto <code>template</code>. KEEP preserva; UPDATE altera; CREATE
              cadastra.
            </p>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const b = await prepare();
                  download(
                    "template-projeto.json",
                    JSON.stringify(b.template, null, 2),
                  );
                })
              }
            >
              <FileJson size={15} /> Baixar só o template
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const b = await prepare();
                  download(
                    "instrucoes-ia.md",
                    b.prompt +
                      "\n\n" +
                      b.checklist.map((v: string) => `- [ ] ${v}`).join("\n"),
                    "text/markdown;charset=utf-8",
                  );
                })
              }
            >
              <ClipboardCheck size={15} /> Baixar prompt e checklist
            </button>
          </article>
          <article className="ct-panel">
            <span className="agent-step-number">3</span>
            <h3>Revisar e aplicar</h3>
            <p>
              Importe o retorno e confira cada campo. Versões antigas e
              alterações sem permissão precisam de correção. Nada é excluído por
              ausência.
            </p>
            <a className="button" href={`#${importId}`}>
              <ArrowRight size={15} /> Ir para importação
            </a>
            <small>
              Aprovações, aceite, gates e baseline seguem os fluxos de
              governança.
            </small>
          </article>
        </div>
      </div>
      <section className="ct-panel agent-import" id={importId}>
        <div>
          <h2>
            <Upload size={19} /> Trazer preenchimento da IA
          </h2>
          <p>
            Arquivo JSON ou cole o objeto template. Até 100 alterações por lote;
            o lote só é aplicado se todas passarem.
          </p>
        </div>
        <label className="button">
          Selecionar JSON
          <input
            className="agent-file-input"
            type="file"
            accept=".json,application/json"
            disabled={busy || !writer}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                action(async () => {
                  if (file.size > 900000)
                    throw new Error(
                      "Envie um template de até 900 KB, sem o contexto completo.",
                    );
                  change(await file.text());
                });
            }}
          />
        </label>
        <label htmlFor={templateId}>Template preenchido</label>
        <textarea
          id={templateId}
          rows={7}
          spellCheck={false}
          placeholder='{"format":"mct-agent/1", ...}'
          value={text}
          disabled={!writer}
          onChange={(e) => change(e.target.value)}
        />
        <div className="report-controls">
          <button
            className="button primary"
            disabled={busy || !text.trim() || !writer}
            onClick={() => action(validate)}
          >
            <ClipboardCheck size={15} /> Validar e ver alterações
          </button>
          <span className="muted">
            {writer
              ? "A validação não grava mudanças."
              : "Seu acesso permite exportar e consultar; preenchimento exige permissão de edição."}
          </span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p role="status">
            <CheckCircle2 size={16} /> Preenchimento aplicado e auditado.
          </p>
        )}
        {preview && !done && (
          <>
            <div className="section-toolbar">
              <h3>
                {preview.valid
                  ? "Pronto para revisão"
                  : "Corrija os itens indicados"}
              </h3>
              <span>
                {preview.count}{" "}
                {preview.count === 1 ? "alteração" : "alterações"} ·{" "}
                {preview.lines.filter((l: Row) => l.errors.length).length} com
                erro
              </span>
            </div>
            <div className="agent-diff-grid">
              {preview.lines.map((line: Row) => (
                <article className="agent-diff" key={line.line}>
                  <strong>
                    Linha {line.line} · {TITLES[line.kind] || line.kind} ·{" "}
                    {line.code || line.action}
                  </strong>
                  {line.errors.map((v: string) => (
                    <p className="error" key={v}>
                      {v}
                    </p>
                  ))}
                  {line.diff?.map((d: Row) => (
                    <div className="agent-field-diff" key={d.field}>
                      <span>
                        {FIELDS[line.kind as Kind]?.find(
                          (f) => f.key === d.field,
                        )?.label || d.field}
                      </span>
                      <del>{valueLabel(line.kind, d.field, d.from)}</del>
                      <ArrowRight size={12} />
                      <ins>{valueLabel(line.kind, d.field, d.to)}</ins>
                    </div>
                  ))}
                </article>
              ))}
            </div>
            <button
              className="button primary"
              disabled={busy || !preview.valid}
              onClick={() =>
                action(async () => {
                  await api(
                    "agents/commit",
                    pid,
                    "POST",
                    {
                      template,
                      expectedHash: preview.hash,
                    },
                    undefined,
                    commitKey,
                  );
                  setDone(true);
                  setPreview(null);
                  setBundle(null);
                  onSaved();
                })
              }
            >
              Aplicar {preview.count}{" "}
              {preview.count === 1
                ? "alteração revisada"
                : "alterações revisadas"}
            </button>
          </>
        )}
      </section>
      {reportOpen && bundle && (
        <Modal
          open
          wide
          title="Relatório para IA"
          description="Contexto atual do projeto. Você pode baixar o relatório e os detalhes em JSON."
          onClose={() => setReportOpen(false)}
        >
          <div className="report-controls">
            <button
              className="button"
              onClick={() =>
                download(
                  "relatorio-projeto.md",
                  bundle.report,
                  "text/markdown;charset=utf-8",
                )
              }
            >
              <Download size={14} /> Baixar relatório
            </button>
            <button
              className="button"
              onClick={() =>
                download(
                  "contexto-projeto.json",
                  JSON.stringify(bundle.context, null, 2),
                )
              }
            >
              Baixar contexto detalhado
            </button>
          </div>
          <pre className="agent-report">{bundle.report}</pre>
        </Modal>
      )}
    </section>
  );
}
