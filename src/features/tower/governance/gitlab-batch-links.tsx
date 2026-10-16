"use client";
import { useState } from "react";
import Papa from "papaparse";
import { Download, Link2, Search, WandSparkles } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { api, download } from "../client";
import { nodeName } from "../forms";
import { BatchReview } from "../operations/batch-review";
import { RecordPicker } from "../operations/record-picker";
import { gitLabCandidates } from "@/shared/gitlab-matching";
import type { Row } from "../cockpit/model";
type LinkRow = {
  externalId: string;
  title: string;
  payload?: Row;
  subjectNodeId: string;
  mode: string;
  selected: boolean;
  expectedReferenceVersion: number | null;
};
export function GitLabBatchLinks({
  s,
  pid,
  connection,
  data,
  onClose,
  onSaved,
}: {
  s: Row;
  pid: string;
  connection: Row;
  data: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [connectionVersion] = useState(Number(connection.version));
  function existing(externalId: string) {
    return data.references.find(
      (r: Row) =>
        r.connection_id === connection.id && r.external_id === externalId,
    );
  }
  const [rows, setRows] = useState<LinkRow[]>(() => {
    const latest = [
      ...new Map<string, Row>(
        [...data.inbox]
          .reverse()
          .filter((i: Row) => i.connection_id === connection.id)
          .map((i: Row) => [i.external_id, i]),
      ).values(),
    ];
    return latest.map((i) => {
      const ref = existing(i.external_id);
      return {
        externalId: i.external_id,
        title: i.payload.title,
        payload: i.payload,
        subjectNodeId: ref?.subject_node_id || "",
        mode: ref?.sync_mode || "REFERENCE",
        selected: false,
        expectedReferenceVersion: ref ? Number(ref.version) : null,
      };
    });
  });
  const [csv, setCSV] = useState(""),
    [csvOpen, setCSVOpen] = useState(false),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [batch, setBatch] = useState<Row | null>(null),
    [commitKey, setCommitKey] = useState(""),
    [picker, setPicker] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const chosen = rows.filter((r) => r.selected);
  function invalidate() {
    setPreview(null);
    setBatch(null);
    setError("");
    setNotice("");
  }
  function update(externalId: string, patch: Partial<LinkRow>) {
    setRows(
      rows.map((r) => (r.externalId === externalId ? { ...r, ...patch } : r)),
    );
    invalidate();
  }
  function fromCSV() {
    invalidate();
    setNotice("");
    try {
      if (csv.length > 200000)
        throw new Error("Use uma lista de até 200 KB e 100 vínculos.");
      const result = Papa.parse<Record<string, string>>(csv, {
        header: true,
        delimiter: ";",
        skipEmptyLines: "greedy",
        transformHeader: (v) => v.trim().toLowerCase(),
      });
      if (
        result.errors.length ||
        !["external_id", "codigo", "modo"].every((k) =>
          result.meta.fields?.includes(k),
        ) ||
        result.meta.fields?.some(
          (k) => !["external_id", "codigo", "modo"].includes(k),
        )
      )
        throw new Error(
          "Use as colunas external_id;codigo;modo, separadas por ponto e vírgula.",
        );
      if (!result.data.length || result.data.length > 100)
        throw new Error("Informe entre 1 e 100 vínculos.");
      const seen = new Set<string>();
      const next = result.data.map((v, i) => {
        const externalId = v.external_id?.trim(),
          code = v.codigo?.trim().toUpperCase(),
          mode = v.modo?.trim().toUpperCase();
        if (!externalId || externalId.length > 200 || seen.has(externalId))
          throw new Error(
            `Linha ${i + 2}: ID externo ausente, repetido ou longo demais.`,
          );
        seen.add(externalId);
        if (!["REFERENCE", "EXECUTION"].includes(mode))
          throw new Error(
            `Linha ${i + 2}: modo deve ser REFERENCE ou EXECUTION.`,
          );
        const matches = s.nodes.filter(
          (n: Row) =>
            (mode !== "EXECUTION" || n.entity_type === "deliverables") &&
            s[n.entity_type]?.some(
              (r: Row) => r.id === n.entity_id && r.code === code,
            ),
        );
        const ref = existing(externalId);
        return {
          externalId,
          title: code,
          subjectNodeId: matches.length === 1 ? matches[0].id : "",
          mode,
          selected: true,
          expectedReferenceVersion: ref ? Number(ref.version) : null,
        };
      });
      setRows(next);
      setCSVOpen(false);
      setNotice(
        `${next.length} vínculos preparados; ${next.filter((r) => !r.subjectNodeId).length} exigem escolha manual do destino. Revise a lista e valide antes de aplicar.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function suggest() {
    let found = 0,
      ambiguous = 0;
    setRows(
      rows.map((r) => {
        if (r.subjectNodeId || !r.payload) return r;
        const candidates = gitLabCandidates(
          r.payload,
          s.nodes.filter(
            (n: Row) =>
              r.mode !== "EXECUTION" || n.entity_type === "deliverables",
          ),
          s,
        );
        if (candidates.length === 1) {
          found++;
          return { ...r, subjectNodeId: candidates[0], selected: true };
        }
        if (candidates.length > 1) ambiguous++;
        return r;
      }),
    );
    invalidate();
    setNotice(
      `${found} correspondências por marcador; ${ambiguous} ambíguas. As demais exigem escolha manual.`,
    );
  }
  async function validate() {
    setBusy(true);
    invalidate();
    try {
      if (!chosen.length || chosen.some((r) => !r.subjectNodeId))
        throw new Error(
          "Selecione ao menos um vínculo e escolha um registro para cada linha selecionada.",
        );
      const b = {
        expectedConnectionVersion: connectionVersion,
        reason,
        items: chosen.map(
          ({ externalId, subjectNodeId, mode, expectedReferenceVersion }) => ({
            externalId,
            subjectNodeId,
            mode,
            expectedReferenceVersion,
          }),
        ),
      };
      const p = await api(
        `connections/${connection.id}/links/preview`,
        pid,
        "POST",
        { batch: b },
      );
      setBatch(b);
      setPreview(p);
      setCommitKey(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      await api(
        `connections/${connection.id}/links/commit`,
        pid,
        "POST",
        { batch, expectedHash: preview!.hash },
        undefined,
        commitKey,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const picking = rows.find((r) => r.externalId === picker);
  return (
    <Modal
      open
      wide
      className="operation-dialog gitlab-batch-dialog"
      title="Vincular GitLab em lote"
      description={`${connection.name} · Revise os destinos e o uso de cada origem antes de confirmar.`}
      onClose={() => !busy && onClose()}
    >
      <div className="batch-context">
        <Link2 size={22} />
        <div>
          <strong>
            {chosen.length} de {rows.length} vínculos selecionados
          </strong>
          <p>
            Épicos podem referenciar features; atualização operacional exige
            entregáveis. Aceite e gates permanecem na torre.
          </p>
        </div>
      </div>
      <details
        className="gitlab-csv-panel"
        open={csvOpen}
        onToggle={(e) => setCSVOpen(e.currentTarget.open)}
      >
        <summary>Colar uma lista de vínculos por código</summary>
        <p>
          Copie os IDs imutáveis retornados pelo GitLab. Use códigos existentes
          e únicos na torre. REFERENCE apenas relaciona; EXECUTION permite
          receber o andamento quando a conexão delega execução.
        </p>
        <button
          className="button small"
          onClick={() =>
            download(
              "vinculos-gitlab.csv",
              "external_id;codigo;modo\n",
              "text/csv;charset=utf-8",
            )
          }
        >
          <Download size={14} />
          Baixar cabeçalho CSV
        </button>
        <label>
          Lista de vínculos CSV
          <textarea
            aria-label="Lista de vínculos CSV"
            rows={4}
            value={csv}
            onChange={(e) => {
              setCSV(e.target.value);
              invalidate();
            }}
            placeholder="external_id;codigo;modo"
          />
        </label>
        <button
          className="button"
          disabled={busy || !csv.trim()}
          onClick={fromCSV}
        >
          Montar lista do CSV
        </button>
      </details>
      <div className="section-toolbar">
        <div>
          <h3>Revise as correspondências</h3>
          <p className="muted">
            Recepções recentes ou lista colada. Sugestões usam label mct:CÓDIGO
            ou [mct:CÓDIGO] no título.
          </p>
        </div>
        <button
          className="button small"
          disabled={busy || !rows.some((r) => r.payload)}
          onClick={suggest}
        >
          <WandSparkles size={14} />
          Sugerir por marcador
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {!rows.length ? (
        <p className="ct-empty">
          Sincronize a fonte para listar itens recebidos ou cole uma lista de
          vínculos acima.
        </p>
      ) : (
        <div className="gitlab-link-list">
          <label className="batch-select-all">
            <input
              type="checkbox"
              checked={rows.length > 0 && chosen.length === rows.length}
              disabled={busy}
              onChange={(e) => {
                setRows(
                  rows.map((r) => ({ ...r, selected: e.target.checked })),
                );
                invalidate();
              }}
            />
            Selecionar todos os vínculos da lista
          </label>
          {rows.map((r, i) => (
            <article className="gitlab-link-row" key={r.externalId}>
              <label className="gitlab-link-source">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={r.selected}
                  aria-label={`Selecionar vínculo ${i + 1}`}
                  onChange={(e) =>
                    update(r.externalId, { selected: e.target.checked })
                  }
                />
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.externalId}</small>
                </span>
              </label>
              <button
                className="button gitlab-link-target"
                disabled={busy}
                aria-label={`Escolher destino do vínculo ${i + 1}`}
                onClick={() => setPicker(r.externalId)}
              >
                <Search size={14} />
                {r.subjectNodeId
                  ? nodeName(
                      s.nodes.find((n: Row) => n.id === r.subjectNodeId) || {},
                      s,
                    )
                  : "Escolher registro"}
              </button>
              <label>
                Uso da origem
                <select
                  aria-label={`Uso do vínculo ${i + 1}`}
                  disabled={busy}
                  value={r.mode}
                  onChange={(e) => {
                    const mode = e.target.value,
                      node = s.nodes.find((n: Row) => n.id === r.subjectNodeId);
                    update(r.externalId, {
                      mode,
                      ...(mode === "EXECUTION" &&
                      node?.entity_type !== "deliverables"
                        ? { subjectNodeId: "" }
                        : {}),
                    });
                  }}
                >
                  <option value="REFERENCE">Referência</option>
                  <option value="EXECUTION">Andamento operacional</option>
                </select>
              </label>
            </article>
          ))}
        </div>
      )}
      <label>
        Justificativa dos vínculos
        <textarea
          aria-label="Justificativa dos vínculos"
          disabled={busy}
          minLength={3}
          maxLength={2000}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            invalidate();
          }}
        />
      </label>
      <div className="batch-actions">
        <button
          className="button"
          disabled={busy || !chosen.length || reason.trim().length < 3}
          onClick={validate}
        >
          Validar vínculos
        </button>
        <span>
          Salvar vínculos não consulta nem altera o GitLab. A próxima
          sincronização processa o andamento.
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <BatchReview s={s} preview={preview} />
          <div className="batch-commit">
            <p>Conexão, destinos e versões serão verificados novamente.</p>
            <button
              className="button primary"
              disabled={busy || !preview.valid}
              onClick={commit}
            >
              Aplicar {chosen.length} vínculos
            </button>
          </div>
        </>
      )}
      {picking && (
        <RecordPicker
          s={s}
          execution={picking.mode === "EXECUTION"}
          onPick={(id) => update(picking.externalId, { subjectNodeId: id })}
          onClose={() => setPicker(null)}
        />
      )}
    </Modal>
  );
}
