import { DomainError, impactedNodes } from "./rules";
import { hashPayload } from "./canonical";
type Row = Record<string, any>;
export function snapshotSources(snapshot: Row) {
  return (snapshot.payload.deliverables || []).map((d: Row) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    execution_status: d.execution_status,
    accepted: d.accepted,
    forecast_date: d.forecast_date,
    owner_known: !!d.owner_id,
    version: Number(d.version),
  }));
}
export function groundedSummary(snapshot: Row) {
  const sources = snapshotSources(snapshot),
    blocked = sources.filter((d: Row) => d.execution_status === "BLOCKED"),
    unaccepted = sources.filter(
      (d: Row) => d.execution_status === "DONE" && !d.accepted,
    );
  return {
    mode: "RULES",
    snapshotId: snapshot.id,
    snapshotHash: snapshot.payload_hash,
    asOf: snapshot.as_of,
    summary: `${sources.length} entregáveis no snapshot; ${sources.filter((d: Row) => d.accepted).length} aceitos, ${blocked.length} bloqueados e ${unaccepted.length} concluídos sem aceite.`,
    suggestions: [
      ...blocked.map((d: Row) => ({
        text: `Investigar impedimento de ${d.code}.`,
        citations: [d.id],
      })),
      ...unaccepted.map((d: Row) => ({
        text: `Solicitar revisão de aceite para ${d.code}; conclusão operacional não comprova aceite.`,
        citations: [d.id],
      })),
    ].slice(0, 50),
    sources,
    readOnly: true,
  };
}
/** Delay propagates through structural prerequisites as an assumption, never a committed forecast. */
export function simulateDelay(snapshot: Row, nodeId: string, days: number) {
  const context = snapshot.payload.context || {},
    nodes = context.nodes || [],
    edges = context.dependencies || [];
  const node = nodes.find((n: Row) => n.id === nodeId);
  if (!node) throw new DomainError(422, "Origem não pertence ao snapshot.");
  if (!Number.isInteger(days) || days < 0 || days > 365)
    throw new DomainError(422, "Atraso deve ser entre 0 e 365 dias.");
  const affected = new Set([
      nodeId,
      ...impactedNodes(
        nodeId,
        edges.filter(
          (e: Row) =>
            ["BLOCKS", "REQUIRES", "PRECEDES"].includes(e.dependency_type) &&
            e.status !== "RESOLVED",
        ),
      ),
    ]),
    ds = snapshot.payload.deliverables || [];
  const proposals = nodes
    .filter((n: Row) => affected.has(n.id) && n.entity_type === "deliverables")
    .map((n: Row) => {
      const d = ds.find((d: Row) => d.id === n.entity_id);
      if (!d) return null;
      return {
        id: d.id,
        nodeId: n.id,
        code: d.code,
        name: d.name,
        accepted: d.accepted,
        forecast: d.forecast_date || null,
        simulatedForecast: d.forecast_date
          ? new Date(new Date(d.forecast_date).getTime() + days * 86400000)
              .toISOString()
              .slice(0, 10)
          : null,
        unknown: !d.forecast_date,
      };
    })
    .filter(Boolean);
  const assumption = {
    snapshotId: snapshot.id,
    snapshotHash: snapshot.payload_hash,
    nodeId,
    days,
    method: "uniform-delay-through-prerequisites-v1",
  };
  return {
    ...assumption,
    assumptionHash: hashPayload(assumption),
    affectedNodes: affected.size,
    proposals,
    readOnly: true,
    limitations: [
      "Atraso uniforme propagado por BLOCKS/REQUIRES/PRECEDES; integrações informativas não propagam.",
      "Sem calendários, durações, capacidade de equipe ou cálculo de caminho crítico. Datas ausentes continuam desconhecidas.",
      "Aceite, gates, baselines, prioridades e forecasts persistidos permanecem preservados.",
    ],
  };
}
