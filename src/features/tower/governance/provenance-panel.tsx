"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../client";
import { fullDate } from "../presentation";
import { label } from "../metadata";
import type { Row } from "../cockpit/model";
export function ProvenancePanel({
  kind,
  id,
  pid,
  timezone,
}: {
  kind: string;
  id: string;
  pid: string;
  timezone?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["provenance", pid, kind, id],
    queryFn: () => api(`provenance/${kind}/${id}`, pid),
    enabled: open && !!id,
  });
  return (
    <details
      className="detail-section"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Origem dos campos e rastreabilidade</summary>
      {q.isLoading && <p>Consultando origens…</p>}
      {q.error && (
        <p role="alert" className="error">
          {q.error.message}
        </p>
      )}
      {q.data && !q.data.items.length && (
        <p>
          Sem proveniência por campo para esta versão histórica. Consulte a
          auditoria.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campo</th>
              <th>Origem</th>
              <th>Atualização</th>
              <th>Identificador</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.items.map((f: Row) => (
              <tr key={f.id}>
                <td>{label(f.field_name)}</td>
                <td>
                  {f.source_type}
                  {f.source_url && (
                    <>
                      {" "}
                      ·{" "}
                      <a
                        href={f.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir fonte
                      </a>
                    </>
                  )}
                </td>
                <td>
                  {fullDate(f.upstream_updated_at || f.occurred_at, timezone)}
                </td>
                <td>
                  {f.external_id || f.actor_id}
                  <small className="muted"> · checkpoint {f.sequence}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
