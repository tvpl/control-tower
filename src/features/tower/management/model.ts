import {
  isOverdue,
  managementCounts,
  programDay,
} from "@/shared/management-signals";
import { featureDeliverables, type Row } from "../cockpit/model";
export type Signal =
  "ALL" | "ACTIVE" | "OVERDUE" | "BLOCKED" | "DONE" | "NO_DATE";
export const SIGNALS: { id: Signal; name: string; count: string }[] = [
  { id: "ALL", name: "Todas", count: "total" },
  { id: "ACTIVE", name: "Em andamento", count: "active" },
  { id: "OVERDUE", name: "Prazo vencido", count: "overdue" },
  { id: "BLOCKED", name: "Bloqueadas", count: "blocked" },
  { id: "DONE", name: "Concluídas", count: "done" },
  { id: "NO_DATE", name: "Sem previsão", count: "withoutForecast" },
];
export function signalMatches(d: Row, signal: Signal, today: string) {
  if (signal === "ACTIVE") return d.execution_status === "IN_PROGRESS";
  if (signal === "OVERDUE") return isOverdue(d, today);
  if (signal === "BLOCKED") return d.execution_status === "BLOCKED";
  if (signal === "DONE") return d.execution_status === "DONE";
  if (signal === "NO_DATE") return !d.forecast_date;
  return true;
}
export function featureLandscape(s: Row, ds: Row[], caps: Row[]) {
  const today = programDay(s.asOf, s.programs[0]?.timezone);
  const baseline = new Map<string, Row>(
    (s.baselineItems || []).map((b: Row) => [
      b.frozen_payload.id,
      b.frozen_payload,
    ]),
  );
  const features = caps.map((record) => {
    const items = featureDeliverables(s, ds, record.id);
    return {
      record,
      items,
      ...managementCounts(items, today),
      baselineComparable: items.filter(
        (d) => baseline.get(d.id)?.forecast_date && d.forecast_date,
      ).length,
      slipped: items.filter(
        (d) =>
          baseline.get(d.id)?.forecast_date &&
          d.forecast_date &&
          d.forecast_date.slice(0, 10) >
            baseline.get(d.id)!.forecast_date.slice(0, 10),
      ).length,
    };
  });
  const linked = new Set(features.flatMap((f) => f.items.map((d) => d.id)));
  return {
    today,
    features,
    counts: managementCounts(ds, today),
    unlinked: ds.filter((d) => !linked.has(d.id)),
  };
}
export type Feature = ReturnType<typeof featureLandscape>["features"][number];

export function featureSituation(f: Feature) {
  if (!f.total) return { key: "EMPTY", name: "Sem entregas", tone: "waiting" };
  if (f.blocked)
    return { key: "BLOCKED", name: "Com bloqueio", tone: "blocked" };
  if (f.overdue)
    return { key: "OVERDUE", name: "Prazo vencido", tone: "overdue" };
  if (f.done === f.total)
    return f.accepted === f.total
      ? { key: "ACCEPTED", name: "Aceite concluído", tone: "done" }
      : { key: "REVIEW", name: "Aguardando aceite", tone: "review" };
  if (f.active) return { key: "ACTIVE", name: "Em andamento", tone: "active" };
  if (f.items.every((d) => d.execution_status === "CANCELLED"))
    return { key: "CANCELLED", name: "Cancelada", tone: "waiting" };
  if (f.items.some((d) => d.execution_status === "REOPENED"))
    return { key: "REOPENED", name: "Reaberta", tone: "active" };
  if (f.items.some((d) => d.execution_status === "ON_HOLD"))
    return { key: "HOLD", name: "Em espera", tone: "waiting" };
  return { key: "NOT_STARTED", name: "A iniciar", tone: "waiting" };
}
export function featureGroup(f: Feature, domains: Row[], grouping: string) {
  if (grouping === "STATE") {
    const situation = featureSituation(f);
    return {
      id: `state:${situation.key}`,
      name: situation.name,
      code: "SITUAÇÃO",
    };
  }
  const domain = domains.find((d) => d.id === f.record.domain_id);
  return {
    id: `domain:${domain?.id || "unassigned"}`,
    name: domain?.name || "Sem domínio",
    code: domain?.code || "SEM DOMÍNIO",
  };
}
export function landscapeGroups(
  features: Feature[],
  domains: Row[],
  grouping: string,
  today: string,
) {
  const grouped = new Map<
    string,
    ReturnType<typeof featureGroup> & { features: Feature[] }
  >();
  for (const feature of features) {
    const descriptor = featureGroup(feature, domains, grouping);
    const group = grouped.get(descriptor.id) || { ...descriptor, features: [] };
    group.features.push(feature);
    grouped.set(group.id, group);
  }
  return [...grouped.values()]
    .map((g) => ({
      ...g,
      counts: managementCounts(
        g.features.flatMap((f) => f.items),
        today,
      ),
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id),
    );
}
export type LandscapeGroup = ReturnType<typeof landscapeGroups>[number];
