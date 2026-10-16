import { ArrowRight, ArrowDownUp } from "lucide-react";
import { type TowerState } from "./types";
export function PrioritySummary({
  s,
  onNavigate,
}: {
  s: TowerState;
  onNavigate: () => void;
}) {
  const board = s.priorityBoards.deliverables;
  const next = board.savedIds
    .slice(0, 3)
    .map((id: string) => {
      const n = s.nodes.find((n: TowerState) => n.id === id);
      return n
        ? s.deliverables.find((d: TowerState) => d.id === n.entity_id)
        : null;
    })
    .filter(Boolean);
  return (
    <section
      className="priority-overview-callout"
      aria-label="Prioridades do programa"
    >
      <div className="priority-overview-title">
        <ArrowDownUp size={20} />
        <div>
          <span className="eyebrow">SEQUÊNCIA DE TRABALHO</span>
          <h2>
            {next.length
              ? "As prioridades do programa"
              : "Dê direção às próximas entregas"}
          </h2>
        </div>
      </div>
      {next.length ? (
        <ol>
          {next.map((d: TowerState, i: number) => (
            <li key={d.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <strong>{d.name}</strong>
              <small>{d.code}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p>Crie uma ordem compartilhada e veja o impacto de cada decisão.</p>
      )}
      <button className="button" onClick={onNavigate}>
        {next.length ? "Revisar prioridades" : "Definir prioridades"}
        <ArrowRight size={14} />
      </button>
    </section>
  );
}
