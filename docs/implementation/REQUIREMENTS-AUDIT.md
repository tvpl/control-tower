# Auditoria de requisitos — 16/10/2026

Fonte de verdade: missão anexada, PRD FR01–14, histórias US001–018, módulos/dashboards/UX/regras/qualidade em `docs/` e os refinamentos da conversa. **Os blocos locais anteriormente faltantes foram implementados e verificados. Homologação externa permanece separada.**

## Pedidos da conversa

| Pedido                                    | Implementação                                                                                                         | Evidência                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Prioridades interativas e posições        | Filas de entregáveis/capacidades, arraste/teclado/setas, persistência, undo e concorrência                            | priorities.test.ts e 2 E2E                                               |
| Projeto → features, macro/micro           | Árvore expansível, recorte por feature, rollup N:N deduplicado                                                        | cockpit.test.ts e cockpit E2E                                            |
| Grafo/expansão/modais grandes             | Grafo de arquitetura/dependência, pan/zoom e ampliação de cards/detalhes/gráficos                                     | cockpit e organização E2E                                                |
| Gráficos, percentuais, dashboard compacto | Síntese, execução/aceite/prontidão, qualidade, agenda, radar e série histórica                                        | dashboard-intelligence e Orange E2E                                      |
| Observações e status compartilhável       | Notas persistentes/versionadas, leitura em modal, pontos importantes, copiar/baixar resumo                            | observations.test.ts e cockpit E2E                                       |
| Projetos e frentes diferentes             | Portfólio e frentes DEVELOPMENT/BUSINESS/INFRASTRUCTURE/PROVISIONING/SPIKE/OTHER, áreas/squads                        | project-organization.test.ts e 2 E2E                                     |
| Filtros combinados                        | Programa/domínio/frente/release/área/squad/camada/responsável, visões salvas; agenda/decisões rotuladas como programa | organização, dashboard e E2E                                             |
| Orange como tema, cor e espaço útil       | Identidade do produto preservada, seletor desktop/mobile, componentes compartilhados e preferência restaurada         | Orange E2E, ORANGE.md e capturas                                         |
| Listas grandes legíveis                   | Janela virtual acima de 100, rolagem e alternativa paginada de 25 itens                                               | E2E com 105 features/entregáveis adicionais e completion-scale.png       |
| Navegação e leitura contextual            | 18 destinos, abas de projeto, frentes, densidade, chips, histórico/recarga e percurso de detalhes                     | workspace-experience E2E, NAVIGATION-AUDIT.md                            |
| Preenchimento operacional rápido          | Seleção por página/recorte, múltiplos campos, definição/deslocamento de forecast com prévia e lote atômico            | workspace-operations.test.ts, operational-completion E2E                 |
| Sistema utilizável com IA                 | Export por projeto/visão/registro/seleção, relatório/checklist/template, reimportação revisada no mesmo modal         | agent-workspace.test.ts, agent-navigation e operational-completion E2E   |
| GitLab simples e guiado                   | Tutorial, escopo/labels, teste, sync e vínculos em lote com marcadores/CSV/busca e controle de versões                | workspace-operations, adapters, sync-worker e operational-completion E2E |

## Gestão à vista ampliada

Home com mapa/mosaico de features, zoom/minimapa, dependências agrupadas, busca/filtros, counters e panorama navegável feature → entregas → detalhe. Portfólio, frentes, capacidades e planejamento compartilham execução e prazos. Forecast vencido usa calendário/fuso do projeto e não equivale a desvio da baseline. Evidências: visual-management.test.ts (oito casos), project-organization e jornada visual-management no cockpit E2E. Guia: VISUAL-MANAGEMENT.md.

## Rastreabilidade normativa

| Requisito / histórias | Implementação final                                                                                                                        | Evidência local                                                  | Homologação externa                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------ |
| FR01 / US001–003      | Programas com timezone/owner, domínios/maturidade, frentes e alçada contextual                                                             | integration, project-organization, access-management             | taxonomia e IdP                      |
| FR02 / US004          | Capacidades, hierarquia sem ciclos, aceite/criticidade/maturidade, change control                                                          | integration e change-control                                     | política de escopo                   |
| FR03 / US005          | Entregáveis/N:N REQUIRED/OPTIONAL/SUPPORTING, camadas configuráveis, componentes, fornecedores e contratos revisados/versionados           | integration, catalogs, governance-actions                        | contratos/alçadas reais              |
| FR04 / US009          | Dependências tipadas, ciclos impeditivos, impacto transitivo e fornecedores/componentes no radar                                           | rules, governance-actions, completion-intelligence               | severidades e fonte real             |
| FR05 / US005/012      | Execução/estágio/aceite separados, saúde derivada e ajustes temporários auditáveis                                                         | rules, readiness, governance-actions                             | política de saúde                    |
| FR06 / US007/008/011  | Forecast motivado, baseline congelada/revisada, marcos/releases, estimativa de universo com fonte/data                                     | change-control, report-publication, completion-intelligence      | pesos/estimativa aprovados           |
| FR07 / US010/018      | RAID com owner/plano/prazo e decisões com alternativas, alçada e revisão independente                                                      | integration, governance-actions                                  | workflow corporativo                 |
| FR08 / US012          | Gates/DoD combináveis/versionados, aplicabilidade por contexto, evidência classificada, exceção com mitigação/decisão/validade e revogação | catalogs, readiness, relations-and-gates E2E                     | catálogo e aprovadores reais         |
| FR09 / US006/016      | Cockpit/matriz/prioridades/radar, componentes compartilhados/contratos/conectores, filtros e virtualização                                 | dashboard-intelligence, completion-intelligence, E2E e benchmark | carga/SLO/usabilidade                |
| FR10 / US013          | Snapshots/hash, comparação de entregáveis e 28 coleções, revisão/publicação interna, JSON e PDF servidor assíncrono                        | report-publication, async-workflows, PDF visual e E2E            | política de publicação/retenção      |
| FR11 / US014          | CSV/XLSX assíncrono, dry-run/commit, validação/dedup/erros CSV e origem por campo                                                          | async-workflows e jornada de importação                          | planilhas/fontes reais               |
| FR12 / US015          | Jira/ADO/GitHub/GitLab/Confluence/catálogo, Cloud/Server, worker/inbox/cursor, conflitos/reconciliação, ownership, webhooks e provenance   | adapters, sync-worker, fixtures HTTP e UI                        | credenciais/mappings reais           |
| FR13 / US017          | IAM UI, OIDC/local, JWT API revogável/escopado, ABAC/classificação, auditoria/outbox/notificações, quotas/retenção                         | access-management, integration e E2E negativos                   | IdP/MFA, RLS se exigida, pentest/PCI |
| FR14 / UX             | Radix dialogs, loading/erro/vazio, teclado, temas/mobile, paginação acessível                                                              | axe e E2E das superfícies exercitadas                            | leitor de tela e WCAG manual         |
| EP10 / P2             | Síntese determinística, gateway externo opt-in com fontes/citações e simulação de atraso sem gravação                                      | completion-intelligence e E2E Análise                            | modelo/gateway/destino aprovado      |

## Regras preservadas

DONE não representa aceite; nenhum estágio, gate, cobertura ou forecast desconhecido é tratado como sucesso. Aprovação depende de contexto/versão atual. Alteração material reabre avaliações, sem modificar história congelada. Categorias de gate, revisão independente e permissões são rechecadas no backend. Cenários e assistência não aprovam gates/produção, alteram datas ou executam ferramentas.

A cobertura usa universo estimado somente quando informado com fonte e data; abaixo do inventário identificado, ela é apresentada como inconsistente/desconhecida. Estimativa não é inventário comprovado. Saúde efetiva mostra ajuste temporário separado da derivação. Payloads restritos não vazam por snapshot, report, provenance, evidência ou artefato.

## Evidências e limites

183 testes em 26 arquivos, 13 jornadas E2E no standalone/PostgreSQL Docker, TypeScript/build aprovados. Benchmark: 5.000 entregáveis/500 capacidades, p95 local 546 ms para state e 6 ms para página de 50; sem rede, concorrência ou snapshots históricos. Matriz/prioridades foram exercitadas com listas grandes no browser. PDF foi baixado, renderizado e inspecionado visualmente. Details e evidências em TEST-REPORT.md.

Não se infere homologação de produção desses resultados. PostgreSQL/Docker, migrations concorrentes, worker separado e dump/restore reais passaram localmente. IdP, conectores reais, carga/SLO, observabilidade, infraestrutura corporativa, segurança e revisão humana de acessibilidade permanecem em OPEN-ISSUES.md. Não existe certificação PCI, envio externo de status ou deploy. Um aviso de lint e cinco advisories high de tooling estão registrados; runtime audit sem advisories.
