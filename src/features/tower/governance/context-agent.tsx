"use client";
import { useState } from "react";
import { Download, Sparkles, Clipboard, FileJson, Upload } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import type { AgentContext } from "@/server/domain/agent-context";
import { api, download } from "../client";
import { AgentWorkspace } from "./agent-workspace";
import type { Row } from "../cockpit/model";
export function ContextAgent({
  s,
  pid,
  context,
  title,
  onClose,
  onSaved,
}: {
  s: Row;
  pid: string;
  context: AgentContext;
  title: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [intent, setIntent] = useState(context.intent || "FILL"),
    [bundle, setBundle] = useState<Row | null>(null),
    [tab, setTab] = useState("EXPORT"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  async function prepare() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const b = await api(
        `agents/package?context=${encodeURIComponent(JSON.stringify({ ...context, intent }))}`,
        pid,
      );
      setBundle(b);
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
      className="operation-dialog context-agent-dialog"
      title={`IA contextual · ${title}`}
      description="Prepare o contexto desta tela ou traga as sugestões de volta para revisar."
      onClose={onClose}
    >
      <div className="view-tabs">
        <button
          className={tab === "EXPORT" ? "selected" : ""}
          onClick={() => setTab("EXPORT")}
        >
          <Sparkles size={14} />
          Preparar contexto
        </button>
        <button
          className={tab === "IMPORT" ? "selected" : ""}
          onClick={() => setTab("IMPORT")}
        >
          <Upload size={14} />
          Trazer preenchimento
        </button>
      </div>
      {tab === "IMPORT" ? (
        <AgentWorkspace
          s={s}
          pid={pid}
          onSaved={() => {
            setBundle(null);
            onSaved();
          }}
          importOnly
        />
      ) : (
        <>
          <div className="context-agent-intro">
            <Sparkles size={26} />
            <div>
              <h3>
                {context.subject
                  ? "O registro aberto, com suas referências"
                  : context.selection
                    ? `${context.selection.length} entregáveis selecionados`
                    : "A visão e os filtros atuais"}
              </h3>
              <p>
                Use no Cursor ou em outra IA. O pacote inclui o catálogo
                autorizado do projeto; o template e as contagens destacam o foco
                escolhido.
              </p>
            </div>
          </div>
          <div className="context-agent-controls">
            <label>
              O que você precisa?
              <select
                aria-label="Objetivo da IA contextual"
                value={intent}
                onChange={(e) => {
                  setIntent(e.target.value as typeof intent);
                  setBundle(null);
                  setCopied(false);
                }}
              >
                <option value="FILL">Completar informações e critérios</option>
                <option value="EXPLAIN">
                  Explicar o contexto e as dependências
                </option>
                <option value="PLAN">Revisar planejamento e lacunas</option>
              </select>
            </label>
            <button
              className="button primary"
              disabled={busy}
              onClick={prepare}
            >
              {busy ? "Preparando…" : "Preparar recorte para IA"}
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {bundle && (
            <>
              <div
                className="context-agent-metrics"
                aria-label="Contagens do contexto de IA"
              >
                {[
                  { key: "total", name: "Entregas no foco" },
                  { key: "blocked", name: "Bloqueadas" },
                  { key: "withoutForecast", name: "Sem forecast" },
                  { key: "withoutOwner", name: "Sem responsável" },
                ].map((m) => (
                  <article key={m.key}>
                    <strong>{bundle.focus.metrics[m.key]}</strong>
                    <span>{m.name}</span>
                  </article>
                ))}
              </div>
              <p className="policy-note">{bundle.focus.indicatorScope}</p>
              <div className="context-agent-downloads">
                <button
                  className="button primary"
                  onClick={() =>
                    download(
                      "contexto-ia.json",
                      JSON.stringify(bundle, null, 2),
                    )
                  }
                >
                  <Download size={15} />
                  Baixar pacote do recorte
                </button>
                <button
                  className="button"
                  onClick={() =>
                    download(
                      "template-recorte.json",
                      JSON.stringify(bundle.template, null, 2),
                    )
                  }
                >
                  <FileJson size={15} />
                  Baixar template do recorte
                </button>
                <button
                  className="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(bundle.prompt);
                      setCopied(true);
                    } catch {
                      setError(
                        "Clipboard indisponível. Use Baixar instruções.",
                      );
                    }
                  }}
                >
                  <Clipboard size={15} />
                  Copiar pedido
                </button>
                <button
                  className="button"
                  onClick={() =>
                    download(
                      "instrucoes-ia.md",
                      `${bundle.prompt}\n\n${bundle.checklist.map((v: string) => `- [ ] ${v}`).join("\n")}`,
                      "text/markdown;charset=utf-8",
                    )
                  }
                >
                  Baixar instruções
                </button>
              </div>
              {copied && (
                <p role="status">
                  Pedido copiado. Anexe o pacote na sua ferramenta de IA.
                </p>
              )}
              <details className="context-agent-report" open>
                <summary>
                  Relatório do recorte · {bundle.template.changes.length}{" "}
                  registros no template
                </summary>
                <pre
                  tabIndex={0}
                  role="region"
                  aria-label="Relatório do recorte"
                >
                  {bundle.report}
                </pre>
              </details>
              <p className="muted">
                Dados não são enviados automaticamente a um modelo.
                Preenchimentos voltam pela aba Trazer preenchimento, com prévia
                e confirmação.
              </p>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
