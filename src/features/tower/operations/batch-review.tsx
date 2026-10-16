"use client";
import { ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { FIELDS, label } from "../metadata";
import { nodeName } from "../forms";
import type { Kind } from "@/server/domain/schemas";
import type { Row } from "../cockpit/model";
export function fieldValue(
  s: Row,
  field: string,
  value: unknown,
  kind = "deliverables",
): string {
  if (value == null || value === "") return "Sem valor";
  if (field === "sync_mode")
    return value === "EXECUTION" ? "Andamento operacional" : "Referência";
  if (field === "subject_node_id")
    return nodeName(s.nodes.find((n: Row) => n.id === value) || {}, s);
  const def = FIELDS[kind as Kind]?.find((f) => f.key === field);
  const ref = def?.ref;
  const row = ref && s[ref]?.find((r: Row) => r.id === value);
  return row
    ? [row.code, row.name || row.display_name].filter(Boolean).join(" · ")
    : label(String(value));
}
export function BatchReview({ preview, s }: { preview: Row; s: Row }) {
  return (
    <section className="batch-review" aria-label="Prévia do lote">
      <div className="batch-review-heading">
        {preview.valid ? (
          <CheckCircle2 size={20} />
        ) : (
          <AlertTriangle size={20} />
        )}
        <div>
          <h3>
            {preview.valid
              ? "Confira antes de aplicar"
              : "Corrija o lote antes de aplicar"}
          </h3>
          <p>
            {preview.count} registros ·{" "}
            {preview.lines.filter((l: Row) => l.errors.length).length} com erro
          </p>
        </div>
      </div>
      <div
        className="batch-diff-list"
        tabIndex={0}
        role="region"
        aria-label="Alterações por registro"
      >
        {preview.lines.map((line: Row) => (
          <article className="batch-diff" key={line.line}>
            <strong>
              Linha {line.line} · {line.code || "Registro inválido"}
              {line.target ? ` → ${line.target}` : ""}
            </strong>
            {line.errors.map((error: string) => (
              <p role="status" className="error" key={error}>
                {error}
              </p>
            ))}
            {line.diff?.map((d: Row) => (
              <div className="batch-field-diff" key={d.field}>
                <span>
                  {FIELDS[(line.kind || "deliverables") as Kind]?.find(
                    (f) => f.key === d.field,
                  )?.label ||
                    (
                      {
                        subject_node_id: "Registro da torre",
                        sync_mode: "Uso da origem",
                      } as Record<string, string>
                    )[d.field] ||
                    d.field}
                </span>
                <del>{fieldValue(s, d.field, d.from, line.kind)}</del>
                <ArrowRight size={14} />
                <ins>{fieldValue(s, d.field, d.to, line.kind)}</ins>
              </div>
            ))}
            {line.diff?.length === 0 && (
              <p className="muted">Valores já correspondem à proposta.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
