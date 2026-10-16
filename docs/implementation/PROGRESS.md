# Progresso — 16/10/2026

Entrega do código direcionada à branch `main` de [tvpl/control-tower](https://github.com/tvpl/control-tower), incluindo migrations, testes, guias e capturas de validação. Credenciais, bancos, volumes e artefatos temporários ficam fora do versionamento. O workflow Quality está incluído; aprovação remota e deploy são verificações independentes das evidências locais abaixo.

**Blocos de implementação local concluídos. Homologação corporativa pendente.** Este checkpoint substitui as listas anteriores que ainda indicavam DoD, XLSX, worker, IAM ou PDF como não implementados.

| Etapa                    | Resultado local                                                                                                                                              | Evidência                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| M0 — definição           | 32 documentos normativos lidos, ADRs, direções e wireframes registrados                                                                                      | IMPLEMENTATION-PLAN.md e docs de discovery                           |
| M1 — inventário          | CRUD/N:N, portfólio, organização por frente/área/squad, filtros, mapas e busca                                                                               | integration, project-organization, contratos E2E                     |
| M2 — delivery            | Forecast, relações obrigatórias, dependências sem ciclos, RAID, decisões revisadas, baseline/change control segregados e contratos/fornecedores              | rules, change-control, governance-actions                            |
| M3 — prontidão/histórico | Gates/camadas por programa, perfis DoD/versionamento, exceções contextualizadas, readiness, snapshots, comparação ampla, revisão/publicação e PDF assíncrono | readiness, catalogs, report-publication, async-workflows             |
| M4 — fontes mixed        | CSV/XLSX assíncronos, provenance, jobs/leases, seis famílias de conector, inbox, conflitos/reconciliação, webhooks e outbox/notificações                     | adapters, async-workflows, sync-worker                               |
| UX solicitada            | Macro/micro, hierarquia expansível, gráficos/grafo, prioridades compartilhadas, notas/modais/status copiável, temas Orange/Grafite/Claro, mobile             | cockpit, priorities, Orange e organização E2E; capturas              |
| Escala/qualidade         | Virtualização e paginação acessível, snapshot completo sob demanda, benchmark 5.000 entregáveis, cobertura com estimativa/fonte/data, timezone de programa   | benchmark-local.json, completion-intelligence, E2E de listas grandes |
| P2                       | Síntese local com fontes, gateway externo opt-in com citações validadas, cenário de atraso sem mutação                                                       | completion-intelligence e jornada Análise                            |
| Hardening/operação       | IAM/JWT revogável/ABAC, quotas persistentes, limites HTTP/SSRF, worker separado/heartbeat, probes, métricas, retenção, scripts de backup/restore e runbook   | access-management, backup-crypto, build, operações documentadas      |

Evolução SQL: migrations 001–021. Fórmula `mct-1.3.0`, prontidão `readiness-1.2.0`. O runner verifica hashes e serializa migrations no PostgreSQL servidor. A migração da instalação local preserva inventário e não aplica seed; evidência final em TEST-REPORT.md.

Verificação atual: 183 testes em 26 arquivos, 13 jornadas E2E no standalone com PostgreSQL Docker, TypeScript/build aprovados, lint sem erros e um aviso. Histórico e ações não são simulados. Credenciais ausentes permanecem visíveis; gate ausente/obsoleto bloqueia; assistência e cenários não aprovam aceite/produção nem gravam forecast.

Homologações externas e limites não foram removidos: [OPEN-ISSUES.md](OPEN-ISSUES.md). Rastreabilidade FR01–14 e pedidos da conversa: [REQUIREMENTS-AUDIT.md](REQUIREMENTS-AUDIT.md). Operação: [OPERATIONS.md](OPERATIONS.md).

## Fechamento de infraestrutura local

Ensaio real Docker aprovado: PostgreSQL 16, migrations concorrentes, identidade runtime, worker separado, importação/PDF, dump cifrado e restore com hashes conferidos. A primeira tentativa expôs importação ESM de contexto HTTP no worker; corrigida com regressão. As 12 jornadas UI principais passaram em 38,4 s, com uma jornada adicional de temas em 2,4 s numa pilha Docker descartável. Aplicação disponível em http://127.0.0.1:3000 via npm run docker:local; volume da demonstração preservado e QA removido. Restam homologações corporativas descritas em OPEN-ISSUES.md.

## Navegação, preenchimento com IA e GitLab

Concluídos: auditoria dos módulos, histórico e deep links de seção/filtros, seções de Administração, ação de criação contextual, menu com rolagem e correção do seletor externo. Novo workspace de IA exporta contexto/relatório/prompt/checklist/schemas/template e aplica preenchimento com prévia, versões, lote atômico e provenance. GitLab tem cadastro guiado, consulta Work Items de projeto/grupo, épicos/issues/tasks, labels, hierarquia, teste de acesso e tutorial Docker. Guias: NAVIGATION-AUDIT.md, AGENT-WORKFLOW.md e GITLAB-GUIDE.md. Conta/credencial reais continuam sendo configuração do operador.

## Evolução de experiência — etapa 1 (checkpoint anterior)

Implementados menu de 18 destinos em quatro grupos, expansão/recolhimento persistido, navegação móvel em diálogo, contexto do projeto com sete abas, tela dedicada de frentes, chips de filtros, densidade Compacta/Confortável e anterior/próximo no detalhe respeitando a ordenação da tabela. Nenhuma migration ou seed nesta etapa. Detalhes: [WORKSPACE-EXPERIENCE.md](WORKSPACE-EXPERIENCE.md).

Verificado: 152 testes e 13 jornadas completas E2E (41,8 s), typecheck/build Docker e lint sem erros. Aplicação local atualizada e login/live/ready HTTP 200; inventário 1/20/24 e 21 migrations preservados antes/depois. QA sintético removido. Captura `workspace-local-orange.png` corresponde ao ambiente disponibilizado.

## Evolução de experiência — etapas 2 e 3 concluídas

Implementados seleção de entregáveis por página/recorte, edição de múltiplos campos, planejamento com definição/deslocamento de forecast e filas de lacunas. Prévia antes/depois, versões, hash, justificativa, atomicidade, idempotência e proveniência MANUAL usam os comandos de domínio existentes; permissões e governança são revalidadas no servidor.

IA contextual por tela, registro ou seleção exporta relatório, checklist, instruções e template focado, mantendo o catálogo autorizado como referência. Reimportação acontece no mesmo modal, com revisão. GitLab tem vínculo em lote por itens recebidos/CSV, marcadores explícitos, busca de destino, proteção de versões e confirmação atômica. Aceite/gates/baseline permanecem sujeitos aos comandos e alçadas próprios.

Validação final: 169 testes/25 arquivos (17,37 s), 13 jornadas E2E completas (48,0 s), TypeScript, geração OpenAPI, build dos targets Docker e lint sem erros/um aviso conhecido. O ensaio de infraestrutura foi repetido: oito fases PASSED e cleanup COMPLETE. Todas as três etapas da evolução estão implementadas; homologação de contas/ambientes reais continua em OPEN-ISSUES.md. Guias: WORKSPACE-EXPERIENCE.md, BULK-OPERATIONS.md, AGENT-WORKFLOW.md e GITLAB-GUIDE.md.

Instalação local final conferida: login/live/ready HTTP 200, 18 destinos, quatro frentes, editor em lote e pacote contextual funcionando. SQL antes/depois confirmou 1 programa, 20 capacidades, 24 entregáveis e 21 migrations. Web e worker atualizados sem seed. Pilha/volume UI QA removidos; somente os três serviços locais permanecem ativos. Capturas reais da instalação: workspace-local-orange.png e context-local-orange.png.

## Gestão à vista ampliada — concluída

Home reorganizada em torno do mapa vivo de features, com zoom/minimapa, mosaico/mobile, sinais filtráveis, busca, agrupamento por domínio/situação, ampliação, inspeção de dependências e panorama da feature com entregas navegáveis. Contexto de foco tem retorno explícito. O cabeçalho foi compactado; indicadores anteriores, governança, IA e notas permanecem disponíveis.

Portfólio ganhou contadores/distribuição de execução e layout que usa a largura quando há um projeto. Frentes exibem andamento e prazo vencido; capacidades alterna matriz/mapa; Delivery apresenta horizonte de entregas por janela. Datas usam calendário/fuso do programa, sem equiparar atraso a desvio da baseline ou DONE a aceite. Nenhuma migration ou seed. Guia: VISUAL-MANAGEMENT.md.

Verificado: 177 testes/26 arquivos (16,45 s), 13 jornadas completas (55,7 s), TypeScript, build web Docker e lint com zero erros/um aviso conhecido. A nova jornada exercita entrega vencida em QA, filtros/busca, minimapa com nós, feature → entregas → detalhe, foco/retorno, ampliação, matriz/mapa, portfólio e mobile/Axe. Detalhes e preservação local em TEST-REPORT.md.

Instalação conferida após atualização do web: login/live/ready HTTP 200, panorama de feature e ampliação funcionando, sem erro de página. Preservados 1 programa, 20 capacidades, 24 entregáveis e 21 migrations. Banco/worker mantidos e QA sintético removido. Evidência: visual-management-verification.json; capturas management-local-home/map/expanded.png.

## Legibilidade das features — revisão concluída

A apresentação inicial passa a Panorama com grupos visíveis, recolhimento individual/global e sequência domínio → feature → entrega. Cada feature mostra execução e aceite em posições fixas; a barra agora representa somente DONE/total, sem alternar para distribuição de estados. Sem entregas, não apresenta percentual conhecido; execução completa sem aceite recebe “Aguardando aceite”. Os grupos mostram lacunas de vinculação.

Relações começa nos grupos e aprofunda nas features, com retorno ao macro. N:N é deduplicado por grupo, domínios homônimos não são fundidos e vínculos preservam IDs de origem. Grupos conectados seguem disposição em ordem de dependência. A mesma composição atende home e alternativa visual da matriz.

Verificado: 183 testes/26 arquivos (16,72 s), 13 jornadas completas (55,7 s), TypeScript/build Docker e lint com zero erros/um aviso conhecido. Guia: FEATURE-READABILITY.md. Sem migration, seed ou alteração das regras de negócio.

Ajustes finais de espaçamento verificados na imagem disponibilizada: 13/13 E2E em 56,4 s, com regressão de altura dos grupos recolhidos e rótulos do grafo sem sobreposição aos nós. Nenhuma alteração de inventário.

Conferência final local: login/live/ready HTTP 200, Panorama inicial com 10 grupos/20 features, recolhimento/expansão, modal de feature e relações macro→micro funcionando sem erros de página. Preservados 1 programa, 20 capacidades, 24 entregáveis e 21 migrations. Apenas web atualizado; banco/worker mantidos e QA removido. Capturas reais clarity-local-panorama/collapsed/group/relations.png. Evidência: feature-readability-verification.json.
