"use client";
import { useId } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Layers3,
} from "lucide-react";
import { featureSituation, type Feature, type LandscapeGroup } from "./model";

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : null;
}
export function CompletionMeter({
  done,
  total,
  accepted,
  subject,
}: {
  done: number;
  total: number;
  accepted: number;
  subject: string;
}) {
  const execution = percent(done, total);
  return (
    <div className="mg-completion">
      <div className="mg-completion-label">
        <span>Execução</span>
        <strong>{execution == null ? "—" : `${execution}%`}</strong>
        <small>
          {done}/{total} entregas
        </small>
      </div>
      {total > 0 && (
        <progress
          value={done}
          max={total}
          aria-label={`Execução de ${subject}`}
          aria-valuetext={`${done} de ${total} entregas concluídas`}
        />
      )}
      <span className="mg-acceptance-count">
        Aceite confirmado <b>{total ? `${accepted}/${total}` : "—"}</b>
      </span>
    </div>
  );
}
export function FeatureCard({ f, onOpen }: { f: Feature; onOpen: () => void }) {
  const situation = featureSituation(f);
  return (
    <button
      className={`mg-feature mg-${situation.tone}`}
      onClick={onOpen}
      aria-label={`Explorar feature ${f.record.code} ${f.record.name}`}
    >
      <span className="mg-feature-meta">
        <small>{f.record.code}</small>
        <span className={`mg-situation mg-${situation.tone}`}>
          {situation.name}
        </span>
      </span>
      <strong title={f.record.name}>{f.record.name}</strong>
      {f.total ? (
        <CompletionMeter
          done={f.done}
          total={f.total}
          accepted={f.accepted}
          subject={f.record.code}
        />
      ) : (
        <span className="mg-unplanned">
          Vincule entregas para medir a execução e o aceite.
        </span>
      )}
      {(f.overdue > 0 || f.blocked > 0) && (
        <span className="mg-feature-alerts">
          {f.blocked > 0 && (
            <span>
              <CircleAlert size={12} />
              {f.blocked} bloqueada{f.blocked > 1 ? "s" : ""}
            </span>
          )}
          {f.overdue > 0 && (
            <span>
              <Clock3 size={12} />
              {f.overdue} vencida{f.overdue > 1 ? "s" : ""}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
export function DomainSummary({
  group,
  onOpen,
}: {
  group: LandscapeGroup;
  onOpen: () => void;
}) {
  return (
    <button
      className="mg-domain-node"
      onClick={onOpen}
      aria-label={`Explorar grupo ${group.name}`}
    >
      <span className="mg-domain-code">
        <Layers3 size={13} />
        {group.code}
      </span>
      <strong>{group.name}</strong>
      <small>
        {group.features.length} features · {group.counts.total} entregas únicas
      </small>
      <CompletionMeter
        done={group.counts.done}
        total={group.counts.total}
        accepted={group.counts.accepted}
        subject={group.name}
      />
      <span className="mg-domain-node-footer">
        Explorar features <ChevronRight size={13} />
      </span>
    </button>
  );
}
export function GroupedFeatures({
  groups,
  collapsed,
  onToggle,
  onOpen,
}: {
  groups: LandscapeGroup[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const scope = useId();
  return (
    <div className="mg-domain-grid">
      {groups.map((g) => {
        const folded = collapsed.has(g.id),
          execution = percent(g.counts.done, g.counts.total);
        return (
          <section
            className="mg-domain-group"
            key={g.id}
            aria-label={`Grupo ${g.name} ${g.code}`}
          >
            <header>
              <span className="mg-domain-code">
                <Layers3 size={13} />
                {g.code}
              </span>
              <h3>
                <button
                  onClick={() => onToggle(g.id)}
                  aria-expanded={!folded}
                  aria-controls={!folded ? `${scope}-${g.id}` : undefined}
                  aria-label={`${folded ? "Expandir" : "Recolher"} grupo ${g.name}`}
                >
                  <span>{g.name}</span>
                  {folded ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
              </h3>
              <div className="mg-domain-meta">
                <span>
                  {g.features.length} features · {g.counts.total} entregas
                  únicas
                </span>
                <span>
                  Execução <b>{execution == null ? "—" : `${execution}%`}</b>
                </span>
                {g.features.some((f) => !f.total) && (
                  <span className="mg-domain-incomplete">
                    {g.features.filter((f) => !f.total).length} sem entregas
                    vinculadas
                  </span>
                )}
              </div>
            </header>
            {!folded && (
              <div className="mg-domain-features" id={`${scope}-${g.id}`}>
                {g.features.map((f) => (
                  <FeatureCard
                    key={f.record.id}
                    f={f}
                    onOpen={() => onOpen(f.record.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
