"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LoaderCircle,
  CheckCircle2,
  AlertTriangle,
  Download,
} from "lucide-react";
import { api } from "../client";
import type { Row } from "../cockpit/model";
const names: Record<string, string> = {
  QUEUED: "Na fila de processamento",
  RUNNING: "Processando",
  SUCCEEDED: "Concluído",
  FAILED: "Falha no processamento",
  CONFLICT: "Dados mudaram; revise antes de continuar",
  CANCELLED: "Cancelado",
};
export function JobStatus({
  id,
  pid,
  onComplete,
  onFailure,
  artifact = false,
}: {
  id: string;
  pid: string;
  onComplete?: (output: Row) => void;
  onFailure?: () => void;
  artifact?: boolean;
}) {
  const completed = useRef("");
  const query = useQuery({
    queryKey: ["job", pid, id],
    queryFn: () => api(`jobs/${id}`, pid),
    refetchInterval: (q) =>
      ["SUCCEEDED", "FAILED", "CONFLICT", "CANCELLED"].includes(
        q.state.data?.status,
      )
        ? false
        : 1500,
  });
  const job = query.data;
  useEffect(() => {
    if (job?.status === "SUCCEEDED" && completed.current !== id) {
      completed.current = id;
      onComplete?.(job.output);
    }
    if (
      ["FAILED", "CONFLICT"].includes(job?.status) &&
      completed.current !== `${id}:failed`
    ) {
      completed.current = `${id}:failed`;
      onFailure?.();
    }
  }, [job, id, onComplete, onFailure]);
  return (
    <div
      className={`job-status ${job?.status === "SUCCEEDED" ? "success" : ""}`}
    >
      <span role="status">
        {job?.status === "SUCCEEDED" ? (
          <CheckCircle2 size={18} />
        ) : ["FAILED", "CONFLICT"].includes(job?.status) || query.error ? (
          <AlertTriangle size={18} />
        ) : (
          <LoaderCircle size={18} className="job-spinner" />
        )}
        <strong>
          {query.error
            ? query.error.message
            : names[job?.status] || "Consultando processamento…"}
        </strong>
      </span>
      {job?.error && <p role="alert">{job.error}</p>}
      {artifact && job?.status === "SUCCEEDED" && (
        <a
          className="button primary"
          href={`/api/v1/jobs/${id}/artifact?programId=${pid}`}
        >
          <Download size={14} />
          Baixar PDF
        </a>
      )}
      <small>
        Pedido {id.slice(0, 8)} · {job?.attempts || 0} tentativas · estado
        persistido
      </small>
    </div>
  );
}
