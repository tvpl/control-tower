"use client";
import { useState, useId } from "react";
import {
  MessageSquare,
  Plus,
  Star,
  ArrowUpRight,
  Pencil,
  Share2,
  Copy,
  Download,
} from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, download } from "../client";
import { statusBrief, type Row } from "./model";
const stamp = (date: string) =>
  new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function ObservationFeed({
  notes,
  onOpen,
}: {
  notes: Row[];
  onOpen: (note?: Row) => void;
}) {
  return (
    <section className="ct-panel ct-note-feed">
      <header>
        <div>
          <MessageSquare size={15} />
          <h2>Observações & pontos importantes</h2>
        </div>
        <button className="ct-small-button" onClick={() => onOpen()}>
          <Plus size={13} />
          Abrir observações <span>{notes.length}</span>
        </button>
      </header>
      <div>
        {notes.length ? (
          notes.slice(0, 3).map((n) => (
            <button
              className="ct-note-chip"
              key={n.id}
              onClick={() => onOpen(n)}
            >
              {n.important ? <Star size={14} /> : <MessageSquare size={14} />}
              <span>
                <strong>{n.title}</strong>
                <small>{n.body}</small>
              </span>
              <ArrowUpRight size={13} />
            </button>
          ))
        ) : (
          <p className="ct-empty">
            Registre contexto, próximos passos ou uma atualização de status.
          </p>
        )}
      </div>
    </section>
  );
}
export function ObservationDialog({
  s,
  userId,
  subject,
  initial,
  onClose,
  onSaved,
  onShare,
}: {
  s: Row;
  userId: string;
  subject: string | null;
  initial?: Row;
  onClose: () => void;
  onSaved: () => void;
  onShare: (id: string) => void;
}) {
  const bodyId = useId();
  const [reading, setReading] = useState<Row | null>(initial || null),
    [editing, setEditing] = useState<Row | null | false>(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const contributor = s.roles.some((r: Row) => r.role !== "VIEWER"),
    manager = s.roles.some((r: Row) =>
      ["PROGRAM_ADMIN", "CHIEF_ARCHITECT", "PMO", "EXECUTIVE"].includes(r.role),
    );
  const notes = s.observations.filter(
    (n: Row) => !subject || n.subject_node_id === subject,
  );
  const nodeLabel = (id: string | null) => {
    const n = s.nodes.find((n: Row) => n.id === id);
    return n
      ? `${s[n.entity_type]?.find((r: Row) => r.id === n.entity_id)?.name || n.entity_type}`
      : "Projeto";
  };
  const read = (n: Row) => {
    setReading(n);
    setEditing(false);
    setError("");
  };
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const data = {
        title: String(form.get("title")),
        body: String(form.get("body")),
        important: form.get("important") === "on",
        ...(editing
          ? { expectedVersion: Number(editing.version) }
          : { subject_node_id: form.get("subject") || null }),
      };
      const record = await api(
        editing ? `observations/${editing.id}` : "observations",
        s.programs[0].id,
        editing ? "PATCH" : "POST",
        data,
      );
      onSaved();
      setReading(record);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={
        editing !== false
          ? editing
            ? "Editar observação"
            : "Nova observação"
          : reading
            ? reading.title
            : "Observações do projeto"
      }
      description="Contexto persistido no programa. Pontos importantes podem compor o resumo de status."
    >
      {editing !== false ? (
        <form
          className="ct-note-form"
          onSubmit={save}
          key={editing?.id || "new"}
        >
          {!editing && (
            <label>
              Vincular a
              <select name="subject" defaultValue={subject || ""}>
                <option value="">Projeto inteiro</option>
                {s.nodes
                  .filter((n: Row) =>
                    ["capabilities", "deliverables"].includes(n.entity_type),
                  )
                  .map((n: Row) => {
                    const r = s[n.entity_type].find(
                      (r: Row) => r.id === n.entity_id,
                    );
                    return (
                      <option key={n.id} value={n.id}>
                        {r?.code} · {r?.name}
                      </option>
                    );
                  })}
              </select>
            </label>
          )}
          <label>
            Título da observação
            <input
              name="title"
              minLength={3}
              maxLength={160}
              required
              defaultValue={editing?.title || ""}
            />
          </label>
          <div className="ct-note-field">
            <label htmlFor={bodyId}>Observação</label>
            <textarea
              id={bodyId}
              name="body"
              rows={8}
              minLength={3}
              maxLength={8000}
              required
              defaultValue={editing?.body || ""}
              placeholder="Contexto, atualização de status e próximos passos…"
            />
          </div>
          <label className="ct-checkbox">
            <input
              type="checkbox"
              name="important"
              defaultChecked={editing?.important || false}
            />
            <Star size={14} />
            Marcar como ponto importante
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="ct-modal-actions">
            <Button
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando…" : "Salvar observação"}
            </Button>
          </div>
        </form>
      ) : reading ? (
        <article className="ct-reading">
          <div className="ct-note-meta">
            <span>{nodeLabel(reading.subject_node_id)}</span>
            {reading.important && (
              <span>
                <Star size={13} />
                Ponto importante
              </span>
            )}
            <span>v{reading.version}</span>
          </div>
          <p className="ct-note-body">{reading.body}</p>
          <p className="muted">
            {s.users.find((u: Row) => u.id === reading.author_id)
              ?.display_name || "Membro"}{" "}
            · {stamp(reading.updated_at)}
          </p>
          <div className="ct-modal-actions">
            <Button onClick={() => setReading(null)}>
              Todas as observações
            </Button>
            {contributor && (manager || reading.author_id === userId) && (
              <Button onClick={() => setEditing(reading)}>
                <Pencil size={14} />
                Editar
              </Button>
            )}
            <Button variant="primary" onClick={() => onShare(reading.id)}>
              <Share2 size={14} />
              Compartilhar ponto
            </Button>
          </div>
        </article>
      ) : (
        <>
          <div className="ct-note-toolbar">
            <span>
              {subject ? nodeLabel(subject) : "Todos os contextos"} ·{" "}
              {notes.length} observações
            </span>
            {contributor && (
              <Button
                size="small"
                variant="primary"
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                <Plus size={14} />
                Nova observação
              </Button>
            )}
          </div>
          <div className="ct-notes-list">
            {notes.map((n: Row) => (
              <button key={n.id} onClick={() => read(n)}>
                <div>
                  {n.important && <Star size={14} />}
                  <strong>{n.title}</strong>
                  <ArrowUpRight size={13} />
                </div>
                <p>{n.body}</p>
                <small>
                  {nodeLabel(n.subject_node_id)} ·{" "}
                  {s.users.find((u: Row) => u.id === n.author_id)
                    ?.display_name || "Membro"}{" "}
                  · {stamp(n.updated_at)}
                </small>
              </button>
            ))}
            {!notes.length && (
              <p className="ct-empty">Nenhuma observação neste contexto.</p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
export function ShareDialog({
  s,
  ds,
  feature,
  notes,
  initialIds,
  onClose,
}: {
  s: Row;
  ds: Row[];
  feature?: Row;
  notes: Row[];
  initialIds: string[];
  onClose: () => void;
}) {
  const previewId = useId();
  const [ids, setIds] = useState(new Set(initialIds)),
    [message, setMessage] = useState("");
  const text = statusBrief(
    s,
    ds,
    feature,
    notes.filter((n) => ids.has(n.id)),
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Resumo copiado. Pronto para colar onde você preferir.");
    } catch {
      setMessage("Selecione o texto abaixo para copiar ou baixe o arquivo.");
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Compartilhar status"
      description="Revise o recorte e escolha os pontos que deseja incluir. O resumo identifica a data da consulta e seus denominadores."
    >
      <div className="ct-share-context">
        <strong>{feature?.name || s.programs[0]?.name}</strong>
        <span>
          {ds.length} entregáveis · {new Date(s.asOf).toLocaleString("pt-BR")}
        </span>
      </div>
      {notes.length > 0 && (
        <fieldset className="ct-share-points">
          <legend>Pontos para incluir</legend>
          {notes.map((n: Row) => (
            <label key={n.id} className="ct-checkbox">
              <input
                type="checkbox"
                checked={ids.has(n.id)}
                onChange={() =>
                  setIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  })
                }
              />
              {n.important && <Star size={12} />}
              <span>{n.title}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="ct-share-preview">
        <label htmlFor={previewId}>Prévia do resumo</label>
        <textarea id={previewId} readOnly value={text} rows={12} />
      </div>
      <div className="ct-modal-actions">
        <Button
          onClick={() =>
            download(
              "status-modernizacao.md",
              text,
              "text/markdown;charset=utf-8",
            )
          }
        >
          <Download size={14} />
          Baixar resumo
        </Button>
        <Button variant="primary" onClick={copy}>
          <Copy size={14} />
          Copiar resumo
        </Button>
      </div>
      <p className="ct-share-message" role="status">
        {message}
      </p>
    </Modal>
  );
}
