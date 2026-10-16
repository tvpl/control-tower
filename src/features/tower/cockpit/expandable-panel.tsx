"use client";
import { useState, type ReactNode } from "react";
import { Expand } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { label } from "../metadata";
import type { Row, Select } from "./model";
export function ExpandablePanel({
  title,
  caption,
  footer,
  children,
  ds,
  select,
  allowExpand = true,
}: {
  title: string;
  caption: string;
  footer: string;
  children: ReactNode;
  ds: Row[];
  select?: Select;
  allowExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="ct-panel ct-chart-card">
      <header>
        <h2>{title}</h2>
        <div className="ct-chart-actions">
          <span>{caption}</span>
          {allowExpand && (
            <button
              className="ct-small-button"
              aria-label={`Ampliar ${title}`}
              onClick={() => setExpanded(true)}
            >
              <Expand size={12} />
            </button>
          )}
        </div>
      </header>
      {children}
      <footer>{footer}</footer>
      <Modal
        open={expanded}
        onClose={() => setExpanded(false)}
        wide
        title={title}
        description={`Recorte atual · ${ds.length} entregáveis. Porcentagens, execução e aceite mantêm denominadores explícitos.`}
      >
        {expanded && (
          <>
            <div className="ct-expanded-chart">{children}</div>
            <p className="ct-expanded-caption">{footer}</p>
            <div className="ct-expanded-records">
              <h3>Entregáveis deste recorte</h3>
              {ds.map((d) => (
                <button
                  key={d.id}
                  disabled={!select}
                  onClick={() => {
                    setExpanded(false);
                    select?.("deliverables", d);
                  }}
                >
                  <span>
                    <small>{d.code}</small>
                    <strong>{d.name}</strong>
                  </span>
                  <span>
                    {label(d.execution_status)} ·{" "}
                    {d.accepted ? "aceito" : "sem aceite"}
                  </span>
                </button>
              ))}
              {!ds.length && (
                <p className="ct-empty">
                  Nenhum entregável atende aos filtros atuais.
                </p>
              )}
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
