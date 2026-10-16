# Backlog de produto — Épicos e histórias

## Épicos
| Épico | Nome | Prioridade | Dependências |
|---|---|---|---|
| EP-01 | Identidade, programa, domínios e frentes | P0 | OIDC |
| EP-02 | Capacidades e escopo full | P0 | EP-01 |
| EP-03 | Entregáveis, camadas, componentes e relações | P0 | EP-02 |
| EP-04 | Baseline, planejamento, marcos e releases | P0 | EP-03 |
| EP-05 | Dependências, RAID e decisões | P0 | EP-03 |
| EP-06 | DoD, readiness, evidências e exceções | P0 | EP-03 |
| EP-07 | Dashboards, snapshots e reports | P0 | EP-02–06 |
| EP-08 | Importação full e conectores mixed | P0/P1 | EP-03 |
| EP-09 | Grafo e análise de impacto | P1 | EP-05 |
| EP-10 | IA e simulação | P2 | histórico confiável |

## Histórias com critérios de aceite
**US-001 — Programa:** como admin, cadastro programa com código único, timezone e owners; teste unicidade e autorização.
**US-002 — Domínios:** como arquiteto, cadastro domínios de todo programa; cada domínio tem código, owner e maturidade; lista filtrável.
**US-003 — Frentes:** como líder, vejo entregáveis de minha frente; RBAC impede editar outras frentes.
**US-004 — Capacidade:** como arquiteto, crio capacidade com domínio, aceite, criticidade e maturidade; duplicatas rejeitadas.
**US-005 — Entregável:** como líder, crio/edito entregável e vinculo N:N a capacidades; campos obrigatórios validados no compromisso.
**US-006 — Mapa:** como arquiteto, vejo matriz por camada com drill-down; distingue N/A, desconhecido, bloqueado, UAT e concluído.
**US-007 — Baseline:** como PMO, proponho/aprovo baseline versionada; aprovada não é editável; histórico preservado.
**US-008 — Forecast:** como líder, altero forecast com justificativa; delta baseline calculado e auditado.
**US-009 — Dependência:** como líder, registro pré-requisito com owner/prazo/impacto; ciclos impeditivos alertados.
**US-010 — RAID:** como gestor, cadastro risco/issue/ação com severidade, plano, owner e vencimento.
**US-011 — Release:** como PMO, vinculo entregáveis N:N e verifico gates antes de aprovação.
**US-012 — DoD:** como aprovador, avalio gate com evidência, versão e alçada; exceção expira.
**US-013 — Report:** como executivo, comparo snapshots semanais e navego aos registros; relatório reproduzível.
**US-014 — Importação:** como líder, faço dry-run CSV/XLSX, reviso conflitos, confirmo e obtenho relatório de erros.
**US-015 — Sync:** como admin, configuro Jira/ADO com política de ownership; conflitos não sobrescrevem dados gerenciais.
**US-016 — Radar:** como arquiteto, vejo anomalias priorizadas e posso abrir origem.
**US-017 — Auditoria:** como usuário autorizado, consulto alterações, ator, data, motivo e versão.
**US-018 — Decisões:** como arquiteto, registro ADR/decisão, alternativas, prazo, alçada e impacto.

## Regras de refinamento
Cada história deve incluir casos positivos, negativos, permissões, observabilidade, dados vazios, migração, teste de contrato e atualização da documentação.
