"use client";
import { useState } from "react";
import { ListChecks, ArrowUpRight } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { label } from "../metadata";
import { fmt } from "../presentation";
import type { Row } from "./model";
export function InventoryCoverage({
  s,
  select,
}: {
  s: Row;
  select: (kind: string, r: Row) => void;
}) {
  const [open, setOpen] = useState(false),
    c = s.inventoryCoverage;
  if (!c) return null;
  return (
    <>
      <button className="ct-coverage-strip" onClick={() => setOpen(true)}>
        <ListChecks size={18} />
        <strong>Cobertura do inventário</strong>
        <span>
          {c.percentage == null
            ? c.status === "ESTIMATE_OUTDATED"
              ? "Estimativa desatualizada"
              : "Universo ainda desconhecido"
            : `${c.percentage}% · ${c.numerator}/${c.denominator} capacidades estimadas`}
        </span>
        <small>Programa completo · estimativa auditável</small>
        <ArrowUpRight size={16} />
      </button>
      <Modal
        open={open}
        wide
        title="Cobertura e maturidade do inventário"
        onClose={() => setOpen(false)}
      >
        <p>
          {c.numerator} capacidades identificadas.{" "}
          {c.denominator == null
            ? "Cadastre o universo estimado e sua fonte na política do programa para calcular cobertura."
            : `Universo estimado: ${c.denominator}. Fonte: ${c.source}. Referência: ${fmt(c.asOf)}. Versão do programa: ${c.programVersion}.`}
        </p>
        {c.status === "ESTIMATE_OUTDATED" && (
          <p className="error">
            O inventário identificado ultrapassou a estimativa. Revise a fonte
            antes de apresentar porcentagem.
          </p>
        )}
        <p className="ct-footnote">
          Cobertura de um universo estimado não comprova completude real nem
          aceite de entregas.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Domínio</th>
                <th>Maturidade</th>
                <th>Capacidades identificadas</th>
              </tr>
            </thead>
            <tbody>
              {s.domains.map((d: Row) => (
                <tr key={d.id}>
                  <td>
                    <button
                      className="row-link"
                      onClick={() => {
                        setOpen(false);
                        select("domains", d);
                      }}
                    >
                      {d.name}
                    </button>
                  </td>
                  <td>{label(d.inventory_maturity)}</td>
                  <td>
                    {
                      s.capabilities.filter((c: Row) => c.domain_id === d.id)
                        .length
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
