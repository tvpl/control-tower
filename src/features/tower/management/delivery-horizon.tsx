"use client";
import { useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { programDay, isOverdue } from "@/shared/management-signals";
import type { Row, Select } from "../cockpit/model";
import { label } from "../metadata";
import { fmt } from "../presentation";
export function DeliveryHorizon({ s, select }: { s: Row; select: Select }) {
  const [opened, setOpened] = useState<string | null>(null),
    [page, setPage] = useState(0);
  const today = programDay(s.asOf, s.programs[0]?.timezone),
    next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const week = next.toISOString().slice(0, 10);
  const live = s.deliverables.filter(
    (d: Row) => !["DONE", "CANCELLED"].includes(d.execution_status),
  );
  const groups = [
    {
      id: "late",
      name: "Prazo vencido",
      tone: "overdue",
      detail: "Forecast anterior a hoje",
      items: live.filter((d: Row) => isOverdue(d, today)),
    },
    {
      id: "week",
      name: "Próximos 7 dias",
      tone: "active",
      detail: `De ${fmt(today)} a ${fmt(week)}`,
      items: live.filter(
        (d: Row) =>
          d.forecast_date &&
          d.forecast_date.slice(0, 10) >= today &&
          d.forecast_date.slice(0, 10) <= week,
      ),
    },
    {
      id: "later",
      name: "Mais adiante",
      tone: "waiting",
      detail: "Forecast após os próximos 7 dias",
      items: live.filter(
        (d: Row) => d.forecast_date && d.forecast_date.slice(0, 10) > week,
      ),
    },
    {
      id: "unknown",
      name: "Sem previsão",
      tone: "waiting",
      detail: "Planejamento ainda incompleto",
      items: live.filter((d: Row) => !d.forecast_date),
    },
  ].map((g) => ({
    ...g,
    items: g.items.sort(
      (a: Row, b: Row) =>
        String(a.forecast_date || "").localeCompare(b.forecast_date || "") ||
        a.code.localeCompare(b.code),
    ),
  }));
  const active = groups.find((g) => g.id === opened),
    currentPage = Math.min(
      page,
      Math.max(0, Math.ceil((active?.items.length || 0) / 25) - 1),
    );
  const card = (d: Row) => (
    <button
      key={d.id}
      className="mg-horizon-delivery"
      onClick={() => {
        setOpened(null);
        select("deliverables", d);
      }}
    >
      <small>{d.code}</small>
      <strong>{d.name}</strong>
      <span>
        {label(d.execution_status)}
        <ArrowUpRight size={12} />
      </span>
      <small>{d.forecast_date ? fmt(d.forecast_date) : "Sem forecast"}</small>
    </button>
  );
  return (
    <section className="mg-horizon" aria-label="Horizonte de entregas">
      <div className="mg-heading">
        <div>
          <span className="mg-eyebrow">
            <CalendarDays size={14} /> HORIZONTE DE ENTREGAS
          </span>
          <h2>O que exige ação agora</h2>
          <p>
            Entregas ainda abertas no recorte atual. Concluídas e canceladas
            ficam fora destas filas.
          </p>
        </div>
      </div>
      <div className="mg-horizon-columns">
        {groups.map((g) => (
          <article className={`mg-horizon-column mg-${g.tone}`} key={g.id}>
            <header>
              <h3>{g.name}</h3>
              <b>{g.items.length}</b>
            </header>
            <p>{g.detail}</p>
            <div>{g.items.slice(0, 4).map(card)}</div>
            {!g.items.length && (
              <span className="mg-horizon-empty">
                Nenhuma entrega nesta janela.
              </span>
            )}
            {g.items.length > 4 && (
              <button
                className="button small"
                onClick={() => {
                  setOpened(g.id);
                  setPage(0);
                }}
              >
                Ver todas ({g.items.length}) <ArrowUpRight size={12} />
              </button>
            )}
          </article>
        ))}
      </div>
      <Modal
        open={!!active}
        onClose={() => setOpened(null)}
        wide
        title={`Horizonte · ${active?.name || ""}`}
        description={`${active?.items.length || 0} entregas no recorte · forecast de calendário no fuso do projeto.`}
      >
        <div className="mg-deliverable-grid">
          {active?.items
            .slice(currentPage * 25, (currentPage + 1) * 25)
            .map(card)}
        </div>
        {active && active.items.length > 25 && (
          <div className="mg-pagination">
            <button
              className="button"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </button>
            <span>
              {currentPage + 1}/{Math.ceil(active.items.length / 25)}
            </span>
            <button
              className="button"
              disabled={(currentPage + 1) * 25 >= active.items.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </Modal>
    </section>
  );
}
