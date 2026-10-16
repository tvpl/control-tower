import { applicability } from "@/server/domain/applicability";
import { gateSatisfied, metrics } from "@/server/domain/rules";
import {
  deliverableReadiness,
  effectiveAssessments,
} from "@/server/domain/readiness";
import type { Row } from "./model";

export function scopedReadiness(s: Row, ds: Row[]) {
  return deliverableReadiness(
    ds,
    s.nodes,
    s.gates,
    s.assessments,
    s.links,
    s.capabilities,
    s.dodProfiles || [],
  );
}
export function scopeMetrics(s: Row, ds: Row[]) {
  const ids = new Set(ds.map((d) => d.id));
  const full = ids.size === s.deliverables.length;
  const baseline = (s.baselineItems || [])
    .map((b: Row) => b.frozen_payload)
    .filter((b: Row) => full || ids.has(b.id));
  return metrics(
    ds as any,
    baseline,
    new Date(s.asOf),
    s.programs?.[0]?.health_policy?.stale_days || 7,
  );
}
export type Anomaly = {
  key: string;
  title: string;
  detail: string;
  items: Row[];
  severe: boolean;
  kind?: string;
};
export function deliveryAnomalies(s: Row, ds: Row[]): Anomaly[] {
  const now = new Date(s.asOf).getTime();
  const baseline = new Map(
    (s.baselineItems || []).map((b: Row) => [
      b.frozen_payload.id,
      b.frozen_payload,
    ]),
  );
  const assessments = effectiveAssessments(s.gates || [], s.assessments || [], {
    deliverables: ds,
    nodes: s.nodes || [],
    profiles: s.dodProfiles || [],
  });
  return [
    {
      key: "blocked",
      title: "Execução bloqueada",
      detail: "Interrompe o avanço da entrega",
      items: ds.filter((d) => d.execution_status === "BLOCKED"),
      severe: true,
    },
    {
      key: "gates",
      title: "Gates impeditivos pendentes",
      detail:
        "Entregáveis com gate ausente, falho, expirado ou critério desatualizado",
      items: ds.filter((d) =>
        applicability(d, s.gates || [], s.dodProfiles || []).gates.some(
          (g: Row) =>
            g.blocking &&
            !assessments.some(
              (a: Row) =>
                a.gate_id === g.id &&
                (s.nodes || []).some(
                  (n: Row) =>
                    n.entity_type === "deliverables" &&
                    n.entity_id === d.id &&
                    n.id === a.subject_node_id,
                ) &&
                gateSatisfied(a as any, new Date(s.asOf)),
            ),
        ),
      ),
      severe: true,
    },
    {
      key: "late",
      title: "Desvio da baseline",
      detail: "Forecast posterior ao compromisso aprovado",
      items: ds.filter((d) => {
        const b = baseline.get(d.id) as Row | undefined;
        return (
          b?.forecast_date &&
          d.forecast_date &&
          d.forecast_date.slice(0, 10) > String(b.forecast_date).slice(0, 10)
        );
      }),
      severe: true,
    },
    {
      key: "owner",
      title: "Sem responsável",
      detail: "Definir quem responde pela entrega",
      items: ds.filter((d) => !d.owner_id),
      severe: true,
    },
    {
      key: "forecast",
      title: "Sem previsão",
      detail: "Data de forecast ainda não informada",
      items: ds.filter((d) => !d.forecast_date),
      severe: false,
    },
    {
      key: "criteria",
      title: "Sem critério de aceite",
      detail: "Resultado esperado ainda não definido",
      items: ds.filter((d) => !d.acceptance_criteria?.trim()),
      severe: false,
    },
    {
      key: "evidence",
      title: "Sem evidência",
      detail: "Nenhuma comprovação vinculada",
      items: ds.filter((d) => !d.has_evidence),
      severe: false,
    },
    {
      key: "stale",
      title: "Atualização vencida",
      detail: `Mais de ${s.programs?.[0]?.health_policy?.stale_days || 7} dias sem atualização`,
      items: ds.filter(
        (d) =>
          now - new Date(d.updated_at).getTime() >
          (s.programs?.[0]?.health_policy?.stale_days || 7) * 86400000,
      ),
      severe: false,
    },
    {
      key: "acceptance",
      title: "Concluído sem aceite",
      detail: "DONE não equivale a aceite de negócio",
      items: ds.filter((d) => d.execution_status === "DONE" && !d.accepted),
      severe: false,
    },
    {
      key: "scope",
      title: "Sem vínculo de escopo",
      detail: "Sem capacidade ou obrigação transversal",
      items: ds.filter((d) => !d.has_scope),
      severe: false,
    },
  ];
}
/** Compare matching versions only. Scope is a fixed set of current IDs, explicitly labelled in the UI. */
export function snapshotTrend(s: Row, ds: Row[]) {
  const ids = new Set(ds.map((d) => d.id));
  return [...(s.snapshots || [])].reverse().map((snap: Row) => {
    const comparable = snap.formula_version === s.formulaVersion;
    const historical = snap.payload.deliverables || [];
    const known = historical.filter((d: Row) => ids.has(d.id));
    const present = new Set(known.map((d: Row) => d.id));
    const cohort = known;
    const denominator = ids.size;
    return {
      id: snap.id,
      asOf: snap.as_of,
      label: new Date(snap.as_of).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: s.programs?.[0]?.timezone || "America/Sao_Paulo",
      }),
      accepted:
        comparable && denominator && present.size === ids.size
          ? Math.round(
              (cohort.filter((d: Row) => d.accepted).length / denominator) *
                100,
            )
          : null,
      blocked:
        comparable && present.size === ids.size
          ? cohort.filter((d: Row) => d.execution_status === "BLOCKED").length
          : null,
      comparable,
    };
  });
}

/** Architecture and governance signals retain their resource type for drill-down. */
export function governanceAnomalies(
  s: Row,
  ds: Row[],
): (Anomaly & { kind: string })[] {
  const now = new Date(s.asOf).getTime(),
    dids = new Set(ds.map((d) => d.id)),
    capids = new Set(
      (s.links || [])
        .filter((l: Row) => dids.has(l.deliverable_id))
        .map((l: Row) => l.capability_id),
    );
  const components = (s.components || []).filter((c: Row) =>
    (s.componentLinks || []).some(
      (l: Row) => l.component_id === c.id && capids.has(l.capability_id),
    ),
  );
  const cids = new Set(components.map((c: Row) => c.id)),
    contracts = (s.contracts || []).filter(
      (c: Row) =>
        cids.has(c.source_component_id) || cids.has(c.target_component_id),
    );
  const nodes = new Set(
    (s.nodes || [])
      .filter(
        (n: Row) =>
          dids.has(n.entity_id) ||
          capids.has(n.entity_id) ||
          cids.has(n.entity_id),
      )
      .map((n: Row) => n.id),
  );
  const capUsage = new Map<string, Set<string>>();
  for (const l of s.componentLinks || []) {
    const set = capUsage.get(l.component_id) || new Set<string>();
    set.add(l.capability_id);
    capUsage.set(l.component_id, set);
  }
  return [
    {
      key: "contracts-unapproved",
      kind: "contracts",
      title: "Contrato sem aprovação",
      detail: "Interfaces do recorte aguardam revisão independente",
      items: contracts.filter((c: Row) => c.status !== "APPROVED"),
      severe: true,
    },
    {
      key: "suppliers-attention",
      kind: "suppliers",
      title: "Fornecedor inativo em contrato",
      detail: "Fornecedores vinculados às interfaces do recorte",
      items: (s.suppliers || []).filter(
        (v: Row) =>
          v.status !== "ACTIVE" &&
          contracts.some((c: Row) => c.supplier_id === v.id),
      ),
      severe: true,
    },
    {
      key: "shared-critical",
      kind: "components",
      title: "Componente compartilhado sob bloqueio",
      detail:
        "Atende mais de uma capacidade e participa de dependência impeditiva crítica",
      items: components.filter(
        (c: Row) =>
          (capUsage.get(c.id)?.size || 0) > 1 &&
          (s.dependencies || []).some(
            (e: Row) =>
              e.status === "BLOCKED" &&
              ["HIGH", "CRITICAL"].includes(e.criticality) &&
              ["BLOCKS", "REQUIRES", "PRECEDES"].includes(e.dependency_type) &&
              (s.nodes || []).some(
                (n: Row) =>
                  n.entity_id === c.id &&
                  [e.source_node_id, e.target_node_id].includes(n.id),
              ),
          ),
      ),
      severe: true,
    },
    {
      key: "risk-plan",
      kind: "raid",
      title: "Risco sem plano de ação",
      detail: "Riscos abertos do recorte ainda sem mitigação registrada",
      items: (s.raid || []).filter(
        (r: Row) =>
          r.kind === "RISK" &&
          r.status !== "RESOLVED" &&
          !r.action_plan?.trim() &&
          (!r.subject_node_id || nodes.has(r.subject_node_id)),
      ),
      severe: true,
    },
    {
      key: "changes-baseline",
      kind: "changeRequests",
      title: "Mudança aplicada sem nova baseline",
      detail:
        "Solicitação aplicada após o compromisso aprovado; avaliar replanejamento",
      items: (s.change_requests || []).filter(
        (r: Row) =>
          r.status === "APPLIED" &&
          nodes.has(r.subject_node_id) &&
          r.applied_at &&
          !(s.baselines || []).some(
            (b: Row) =>
              b.status === "APPROVED" &&
              new Date(b.created_at).getTime() >=
                new Date(r.applied_at).getTime(),
          ),
      ),
      severe: false,
    },
    {
      key: "sync-stale",
      kind: "connections",
      title: "Fonte sem sincronização recente",
      detail:
        "Programa completo · consultas habilitadas sem sucesso dentro de duas cadências",
      items: (s.connections || []).filter(
        (c: Row) =>
          c.enabled &&
          (!c.last_synced_at ||
            now - new Date(c.last_synced_at).getTime() >
              Number(c.poll_interval_seconds || 900) * 2000),
      ),
      severe: true,
    },
  ];
}
