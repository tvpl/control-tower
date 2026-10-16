import { scopedReadiness } from "./insight-model";
export type Row = Record<string, any>;
export type Select = (kind: string, record: Row) => void;
export function descendantIds(capabilities: Row[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const c of capabilities)
      if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        changed = true;
      }
  }
  return ids;
}
export function featureDeliverables(s: Row, visible: Row[], id: string) {
  const ids = descendantIds(s.capabilities, id);
  const linked = new Set(
    s.links
      .filter((l: Row) => ids.has(l.capability_id))
      .map((l: Row) => l.deliverable_id),
  );
  return visible.filter((d) => linked.has(d.id));
}
export function acceptance(ds: Row[]) {
  const unique = [...new Map(ds.map((d) => [d.id, d])).values()];
  const total = unique.length,
    accepted = unique.filter((d) => d.accepted).length;
  return {
    total,
    accepted,
    percentage: total ? Math.round((accepted / total) * 100) : null,
  };
}
export function priorityRank(s: Row, kind: string, id: string) {
  const node = s.nodes.find(
    (n: Row) => n.entity_type === kind && n.entity_id === id,
  );
  const board = s.priorityBoards?.[kind];
  return board?.savedIds.includes(node?.id)
    ? board.orderedIds.indexOf(node.id) + 1
    : null;
}
export function statusBrief(
  s: Row,
  ds: Row[],
  feature: Row | undefined,
  observations: Row[],
) {
  const m = acceptance(ds);
  const ids = new Set(
    s.nodes
      .filter(
        (n: Row) =>
          ds.some((d) => d.id === n.entity_id) || n.entity_id === feature?.id,
      )
      .map((n: Row) => n.id),
  );
  const deps = s.dependencies.filter(
    (d: Row) => ids.has(d.source_node_id) || ids.has(d.target_node_id),
  );
  const readiness = scopedReadiness(s, ds);
  return [
    `STATUS · ${s.programs[0]?.name || "Projeto"}${feature ? ` / ${feature.name}` : ""}`,
    `Consulta em ${new Date(s.asOf).toLocaleString("pt-BR", { timeZone: s.programs[0]?.timezone || "America/Sao_Paulo" })} · visão ao vivo`,
    `Recorte: ${feature ? feature.code : "projeto"} · ${ds.length} entregáveis após filtros`,
    `Aceite: ${m.accepted}/${m.total} (${m.percentage === null ? "não avaliado" : `${m.percentage}%`}) · contagem de itens, sem ponderação.`,
    `Execução: ${ds.filter((d) => d.execution_status === "DONE").length} concluídos, ${ds.filter((d) => d.execution_status === "BLOCKED").length} bloqueados.`,
    `Dependências: ${deps.filter((d: Row) => d.status === "BLOCKED").length} bloqueadas de ${deps.length} no recorte.`,
    `Prontidão do recorte: ${readiness.percentage ?? "não avaliada"}${readiness.percentage == null ? "" : "%"} · ${readiness.satisfied}/${readiness.totalApplicableGates} gates aplicáveis.`,
    "\nPONTOS SELECIONADOS",
    ...(observations.length
      ? observations.map(
          (n) =>
            `${n.important ? "★ " : ""}${n.title}\n${n.body}\nContexto: ${
              n.subject_node_id
                ? (() => {
                    const node = s.nodes.find(
                      (v: Row) => v.id === n.subject_node_id,
                    );
                    return node
                      ? s[node.entity_type]?.find(
                          (r: Row) => r.id === node.entity_id,
                        )?.name || node.entity_type
                      : "Registro";
                  })()
                : "Projeto"
            }\nAutor: ${s.users.find((u: Row) => u.id === n.author_id)?.display_name || "Membro"} · v${n.version}`,
        )
      : ["Nenhum ponto selecionado."]),
    "\nAceite, execução e prontidão são indicadores independentes. Este resumo é uma consulta; o relatório histórico usa snapshots imutáveis.",
  ].join("\n");
}
