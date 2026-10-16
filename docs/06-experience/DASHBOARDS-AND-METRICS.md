# Dashboards, indicadores e report

## Dashboard 1 — Executive Overview
Saúde geral e por frente; avanço ponderado vs baseline; entregas aceitas; prontidão; riscos críticos; próximos marcos; decisões requeridas; frescor e completude dos dados. Drill-down de qualquer KPI.

## Dashboard 2 — Capability Map (prioridade de UX)
Matriz de capacidade/domínio × camada; agregação por release, frente, criticidade e owner. Célula mostra contagens e estado (DONE/UAT/IN_PROGRESS/BLOCKED/NOT_STARTED/NOT_ASSESSED/NOT_APPLICABLE). Clique abre entregáveis e evidências.

## Dashboard 3 — Delivery Roadmap
Timeline/Gantt com baseline, forecast e actual; ondas/releases; predecessoras; atraso; comparação de snapshots; impacto de dependência.

## Dashboard 4 — Dependencies & RAID
Lista priorizada + grafo navegável; dependências críticas, vencidas, transversais; decisões e ações; análise determinística de impacto.

## Dashboard 5 — Readiness & Quality Gates
Prontidão por release/capacidade/entregável; critérios aplicáveis; exceções expiring; evidências faltantes; bloqueios PCI, observabilidade, dados, operação e rollback.

## Dashboard 6 — Architecture & Delivery Radar
Fila de anomalias: item sem owner/aceite/forecast, contrato não aprovado, gate crítico vencido, mudança sem baseline, sync stale, risco sem plano, componente compartilhado em caminho crítico.

## Indicadores
- **Cobertura inventário:** capacidades identificadas / universo estimado (denominador auditável).
- **Qualidade inventário:** % campos essenciais preenchidos, vínculos e atualização.
- **Progresso ponderado:** Σ peso de entregáveis aceitos / Σ peso de entregáveis da baseline. Deduplicar por ID.
- **Readiness:** gates obrigatórios aplicáveis aprovados / total obrigatório aplicável; exibir bloqueios separadamente.
- **Aderência:** delta entre baseline e forecast/actual, com comparação temporal.
- **Saúde:** derivada de atrasos, dependências, gates e frescor; fórmula configurável/versionada.
- **Freshness:** última atualização por item e por conector; stale não vira verde.

## Report semanal
Snapshot as-of → mudanças desde snapshot anterior → marcos vencidos/próximos → riscos/decisões → prontidão por release → recomendações de ação → revisão líder/PMO → publicação. Números devem ser reproduzíveis.
