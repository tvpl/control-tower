import {
  ArrowUpRight,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "../presentation";
import { label } from "../metadata";
import { type QueueItem, type TowerState } from "./types";
export function PriorityFocus({
  item,
  rank,
  ranked,
  s,
  onOpen,
  onMoveToTop,
  editable,
}: {
  item: QueueItem | undefined;
  rank: number;
  ranked: boolean;
  s: TowerState;
  onOpen: (item: QueueItem) => void;
  onMoveToTop: () => void;
  editable: boolean;
}) {
  if (!item)
    return (
      <aside className="priority-focus">
        <div className="priority-focus-empty">
          <Target size={28} />
          <h2>Escolha um item</h2>
          <p>Selecione uma linha para ver contexto, impacto e dependências.</p>
        </div>
      </aside>
    );
  const scope = s[item.kind].find((r: TowerState) => r.id === item.entityId);
  const related = item.impactIds
    .map((id) => {
      const n = s.nodes.find((n: TowerState) => n.id === id);
      return n
        ? (s[n.entity_type] || []).find((r: TowerState) => r.id === n.entity_id)
        : null;
    })
    .filter(Boolean);
  return (
    <aside
      className="priority-focus"
      aria-label="Contexto da prioridade selecionada"
    >
      <div className="priority-focus-cover">
        <div className="priority-focus-eyebrow">
          <span>
            <span className="tiny-dot" />
            EM FOCO
          </span>
          <span>
            {ranked
              ? `PRIORIDADE ${String(rank).padStart(2, "0")}`
              : "SEM ORDEM SALVA"}
          </span>
        </div>
        <span className="priority-focus-code">{item.code}</span>
        <h2>{item.name}</h2>
        <div>
          <Badge value={item.health} />
          <Badge value={scope.scope_status} />
        </div>
      </div>
      <div className="priority-focus-body">
        <div className="priority-focus-context">
          <span>
            Responsável<strong>{item.owner}</strong>
          </span>
          <span>
            Contexto<strong>{item.context}</strong>
          </span>
        </div>
        <section className="priority-impact-section">
          <h3>
            <GitBranch size={15} />
            Impacto na sequência
          </h3>
          <p>
            {related.length
              ? `${related.length} itens dependem deste escopo, direta ou indiretamente.`
              : "Nenhuma dependência impeditiva registrada a jusante."}
          </p>
          {related.slice(0, 4).map((r: TowerState) => (
            <div className="priority-dependent" key={r.id}>
              <ArrowRight size={12} />
              <span>
                <small>{r.code}</small>
                {r.name}
              </span>
            </div>
          ))}
          {related.length > 4 && (
            <small className="muted">
              + {related.length - 4} outros itens no contexto completo
            </small>
          )}
        </section>
        {!!item.blockers.length && (
          <section className="priority-blockers">
            <h3>Antes de avançar</h3>
            {item.blockers.map((b) => (
              <p key={b.id}>{b.name}</p>
            ))}
          </section>
        )}
        <div className="priority-policy">
          <ShieldCheck size={16} />
          <p>
            Prioridade é uma decisão de planejamento. Aceite, gates e aprovação
            de escopo continuam necessários.
          </p>
        </div>
        <Button
          variant="primary"
          className="priority-context-button"
          onClick={() => onOpen(item)}
        >
          Abrir contexto completo
          <ArrowUpRight size={15} />
        </Button>
        {editable && rank > 1 && (
          <Button className="priority-promote-button" onClick={onMoveToTop}>
            Trazer para o topo da seleção
            <ArrowRight size={14} />
          </Button>
        )}
        {scope.criticality && (
          <p className="priority-criticality">
            Criticidade de negócio: <strong>{label(scope.criticality)}</strong>
          </p>
        )}
      </div>
    </aside>
  );
}
