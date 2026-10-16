# Conclusão da fila autorizada — 15/10/2026

Objetivo: implementar os pontos faltantes das docs, preservar as jornadas visuais solicitadas e verificar o resultado. **Blocos locais concluídos.** Esta revisão substitui os checkpoints intermediários de integração.

| Bloco              | Entrega                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 012                | Camadas/gates por programa, perfis DoD combináveis/versionados e contexto de aprovação                                                                                                                                         |
| 013                | Contratos/fornecedores, decisões com revisão independente e ajuste temporário de saúde                                                                                                                                         |
| 014                | IAM administrativo, memberships contextuais/versionadas, API JWT revogável e quotas persistentes                                                                                                                               |
| 015                | Jobs/leases/tentativas, CSV/XLSX assíncrono, proveniência, artefatos e PDF servidor                                                                                                                                            |
| 016                | Sync durável, inbox/mappings/ownership, seis famílias de adaptador, reconciliação, cursor/circuito, webhooks e notificações internas                                                                                           |
| 017                | Worker standalone/heartbeat, probes, índices, métricas e retenção transitória                                                                                                                                                  |
| 018                | Política de saúde, opt-in de assistência e preferência individual de notificações                                                                                                                                              |
| 019                | Owner do programa e universo estimado com fonte/data auditáveis                                                                                                                                                                |
| 020                | Mitigação e referência de decisão obrigatórias para novas exceções; histórico preservado                                                                                                                                       |
| P2 / UX / operação | Síntese/cenários, gateway com fontes, radar ampliado, filtros, virtualização/paginação, comparação de 28 coleções, snapshots completos sob demanda, timezone, OpenAPI gerada, scripts de backup/restore, Compose/CI e runbooks |

## Verificação final

- 140 testes/22 arquivos passaram; 12 E2E passaram em 31,8 s no standalone, com base isolada e 20 migrations.
- TypeScript/build passaram; lint sem erros, um aviso conhecido. Audit runtime zero; tooling cinco high documentados.
- PDF renderizado e inspecionado; fluxos Orange/mobile, IAM, DoD, importação/provenance, relatórios, análise e listas grandes exercitados.
- Benchmark local 5.000 entregáveis/500 capacidades registrado, sem extrapolar para SLA corporativo.
- Base existente migrada 011→020 após cópia fria, sem seed. Comparação de contagem/hash de todas as colunas preexistentes registrada em migration-preservation.json.

Não restam itens da fila local declarados como implementação faltante. Homologações que dependem de ambiente/política/credenciais estão em OPEN-ISSUES.md. Rastreabilidade em REQUIREMENTS-AUDIT.md, contrato em API-IMPLEMENTED.md e operação em OPERATIONS.md. Este checkout não possui Git; não houve commit/PR/deploy/CI remoto.

## Fechamento da operação local

Docker Engine liberado após autorização do usuário. O ensaio real passou nas oito fases: imagens, PostgreSQL, migrations concorrentes, fixtures/grants, API sem worker, worker/jobs, backup/restore e parada/prontidão. Recursos descartáveis removidos. O primeiro ensaio identificou erro ESM do worker; corrigido e coberto por regressão. Suíte atual: 140 testes/22 arquivos; 12 E2E Docker em 32,8 s. Aplicação `mct-local` disponível via npm run docker:local em 127.0.0.1:3000, com PostgreSQL persistente e dados fictícios; QA usa outra pilha/volume, removidos ao terminar. Nenhum PostgreSQL nativo é utilizado. Homologações corporativas continuam externas. Ver INFRASTRUCTURE-VALIDATION.md.

## Evolução solicitada: navegação / IA / GitLab — concluída localmente

- [x] Revisar 17 menus, histórico, recarga, filtros e seções; remover criações fora de contexto e corrigir vínculo externo.
- [x] Exportar contexto, relatório, checklist, prompt e templates com schemas; prévia e reimportação atômica protegida.
- [x] GitLab guiado: grupos/projetos, épicos/issues/tasks, labels, teste de acesso, hierarquia/inbox e tutorial Docker.
- [x] Validar 152 testes, 12 jornadas E2E principais + 1 jornada de temas, TypeScript/lint/build, infraestrutura Docker real e preservação do volume local.

Guias e limites operacionais estão em NAVIGATION-AUDIT.md, AGENT-WORKFLOW.md, GITLAB-GUIDE.md e TEST-REPORT.md. Credenciais/instância GitLab reais precisam ser configuradas pelo operador para homologação externa.
