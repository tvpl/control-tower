"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { api } from "../client";
import { fullDate } from "../presentation";
import type { Row } from "../cockpit/model";
export function NotificationCenter({
  pid,
  timezone,
}: {
  pid: string;
  timezone?: string;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["notifications", pid],
    queryFn: () => api("notifications", pid),
    enabled: !!pid,
    refetchInterval: 15000,
  });
  return (
    <>
      <button
        className="button small"
        aria-label={`Notificações${q.data ? `: ${q.data.unread} não lidas` : ""}`}
        onClick={() => setOpen(true)}
      >
        <Bell size={16} />
        {q.data?.unread || 0}
      </button>
      {open && (
        <Modal
          open
          wide
          title="Central de notificações"
          onClose={() => setOpen(false)}
        >
          <p className="ct-footnote">
            Atualizações de governança do programa. Consulte os módulos para os
            detalhes autorizados.
          </p>
          {q.data && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={q.data.enabled}
                onChange={async (e) => {
                  try {
                    await api("notifications/preferences", pid, "POST", {
                      enabled: e.target.checked,
                    });
                    await q.refetch();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />{" "}
              Receber novas notificações deste programa
            </label>
          )}
          {q.error && (
            <p className="error" role="alert">
              {q.error.message}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="contract-grid">
            {q.data?.items.map((n: Row) => (
              <article key={n.id} className="ct-panel contract-card">
                <small>
                  {fullDate(n.created_at, timezone)} ·{" "}
                  {n.read_at ? "Lida" : "Não lida"}
                </small>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                {!n.read_at && (
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await api(
                          `notifications/${n.id}/read`,
                          pid,
                          "POST",
                          {},
                        );
                        await q.refetch();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Marcar como lida
                  </button>
                )}
              </article>
            ))}
          </div>
          {q.data && !q.data.items.length && (
            <p className="ct-empty">Nenhuma notificação disponível.</p>
          )}
        </Modal>
      )}
    </>
  );
}
