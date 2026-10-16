"use client";
import { FileCode2, Plus, ArrowRight, Building2 } from "lucide-react";
import { canEdit } from "@/server/domain/rules";
import { Badge } from "../presentation";
import type { Kind } from "@/server/domain/schemas";
import type { Row, Select } from "../cockpit/model";
export function ContractPortfolio({
  s,
  select,
  onCreate,
}: {
  s: Row;
  select: Select;
  onCreate: (kind: Kind) => void;
}) {
  const component = (id: string) =>
    s.components.find((c: Row) => c.id === id)?.name || "Componente";
  return (
    <section className="contract-portfolio">
      <div className="section-toolbar">
        <h2>
          <FileCode2 size={18} /> Contratos de integração
        </h2>
        <button
          className="button primary"
          disabled={!canEdit(s.roles, "contracts")}
          onClick={() => onCreate("contracts")}
        >
          <Plus size={15} />
          Novo contrato
        </button>
      </div>
      <p className="ct-footnote">
        Catálogo do programa · contratos aprovados são preservados; mudanças
        exigem outra versão e revisão independente.
      </p>
      <div className="contract-grid">
        {s.contracts.map((c: Row) => (
          <button
            key={c.id}
            className="ct-panel contract-card"
            onClick={() => select("contracts", c)}
          >
            <small>
              {c.code} · {c.contract_version} · {c.protocol}
            </small>
            <strong>{c.name}</strong>
            <span>
              {component(c.source_component_id)} <ArrowRight size={14} />{" "}
              {component(c.target_component_id)}
            </span>
            <Badge value={c.status} />
            <span>
              SLA:{" "}
              {c.sla_ms ? `${c.sla_ms} ms` : c.sla_notes || "Não informado"} ·
              Disponibilidade:{" "}
              {c.availability_target
                ? `${c.availability_target}%`
                : "Não informada"}
            </span>
          </button>
        ))}
        {!s.contracts.length && (
          <p className="policy-note">
            Cadastre interfaces, protocolo, versão, especificação e política de
            SLA para avaliar contratos e seus impactos.
          </p>
        )}
      </div>
      <div className="section-toolbar">
        <h2>
          <Building2 size={18} /> Fornecedores
        </h2>
        <button
          className="button"
          disabled={!canEdit(s.roles, "suppliers")}
          onClick={() => onCreate("suppliers")}
        >
          <Plus size={15} />
          Novo fornecedor
        </button>
      </div>
      <div className="contract-grid">
        {s.suppliers.map((v: Row) => (
          <button
            key={v.id}
            className="ct-panel contract-card"
            onClick={() => select("suppliers", v)}
          >
            <small>{v.code}</small>
            <strong>{v.name}</strong>
            <span>
              {s.contracts.filter((c: Row) => c.supplier_id === v.id).length}{" "}
              contratos · {v.classification}
            </span>
            <Badge value={v.status} />
          </button>
        ))}
        {!s.suppliers.length && (
          <p className="ct-empty">
            Nenhum fornecedor cadastrado. Referências textuais anteriores de
            componentes não são convertidas automaticamente.
          </p>
        )}
      </div>
    </section>
  );
}
