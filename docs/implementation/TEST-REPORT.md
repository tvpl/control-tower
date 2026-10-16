# Relatório de verificação — 16/10/2026

Checkpoint: **183 testes e 13 jornadas E2E aprovados** após a revisão de legibilidade. As três etapas anteriores da evolução continuam verificadas. O ensaio de infraestrutura pertence ao checkpoint anterior com migration 021: oito fases PASSED e cleanup COMPLETE; não foi repetido por este incremento de visualização. Banco/aplicação/worker executados exclusivamente em Docker. Host macOS ARM64/Node 22.23.2; containers Node 22.23.3 e PostgreSQL 16.15, Docker Engine 29.3.1. Bases sintéticas isoladas, sem contas ou dados corporativos.

## Resultados

| Verificação                 | Resultado                             | Evidência e alcance                                                                                                                                                                              |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript strict           | PASSOU                                | `npm run typecheck`; também executado no build Docker                                                                                                                                            |
| Lint                        | 0 erros / 1 aviso                     | TanStack Table/API mutável, componente com `use no memo`; nenhuma regra suprimida                                                                                                                |
| Domínio/contratos/processos | **183/183, 26 arquivos**, 16,72 s     | `npm test`; PGlite memory:// e fixtures de processo isoladas, sem servidor nativo                                                                                                                |
| E2E em Docker               | **13/13, 56,4 s**                     | Suíte completa na imagem final; Chromium contra web standalone/PostgreSQL Docker em `127.0.0.1:3001`; QA descartável separado da demonstração                                                    |
| Build Docker                | PASSOU                                | Web reconstruído nesta rodada: Next webpack, TS, OpenAPI/schema manifest, assets e bundle worker. Targets worker/migrate/infra-check e ensaio de infraestrutura aprovados no checkpoint anterior |
| PostgreSQL real             | PASSOU                                | 21 migrations/hashes, execuções concorrentes, fixtures e constraints                                                                                                                             |
| Runtime SQL separado        | PASSOU                                | Web/worker com identidade sem DDL persistente ou UPDATE de schema_migrations; negativas SQL e imutabilidade                                                                                      |
| Worker separado             | PASSOU                                | ready 503 antes do worker → 200 com heartbeat → 503 após stop; live permanece 200                                                                                                                |
| Jobs/importação/PDF         | PASSOU                                | Preview sem inventário, commit, provenance, idempotência concorrente, snapshot e PDF com digest                                                                                                  |
| Backup/restore real         | PASSOU                                | pg_dump → AES-256-GCM → pg_restore em outro banco vazio; conferência de migrations, contagem e hashes de snapshots                                                                               |
| Negativas de restore        | PASSOU                                | Chave errada, destino operacional e destino já populado recusados                                                                                                                                |
| Limpeza                     | PASSOU                                | Recursos etiquetados do ensaio removidos; segunda pilha/volume UI QA removidos; demonstração preservada                                                                                          |
| App local Docker            | PRONTO                                | `/login`, live e ready 200 em `127.0.0.1:3000`; somente web publica porta no loopback                                                                                                            |
| Axe/layout                  | PASSOU nas superfícies exercitadas    | Orange/Grafite/Claro, modais, prioridades, reports, cockpit, mobile e análise; não substitui WCAG manual                                                                                         |
| Audit runtime / completo    | 0 advisories runtime / 5 high tooling | Relatórios JSON preservados; nenhum critical; dependências não alteradas neste incremento                                                                                                        |
| Inventário anterior         | PRESERVADO                            | Migration 011→020 com cópia fria/contagem/hash, sem seed; não foi migrado implicitamente ao Docker                                                                                               |

Ensaio de infraestrutura: [infrastructure-verification.json](infrastructure-verification.json). Detalhes/reprodução: [INFRASTRUCTURE-VALIDATION.md](INFRASTRUCTURE-VALIDATION.md). CI correspondente definido; nenhuma execução remota inventada neste checkout sem Git.

## Defeito detectado pela execução real

A primeira tentativa Docker passou banco/migrations/API e falhou no worker. O bundle ESM carregava `next/headers` estaticamente, causando ERR_MODULE_NOT_FOUND. O contexto HTTP agora é carregado quando a consulta de sessão web o utiliza; o worker alcança seus comandos e mantém a autorização por memberships. Novo teste constrói e executa o bundle ESM para conferir essa inicialização e a guarda que exige DATABASE_URL. A repetição completa passou, incluindo as 12 jornadas web com cookie após a mudança. Resultado inicial em infrastructure-first-run.json.

O runner agora preserva logs dos containers próprios em falha, redige credenciais e não confunde inspeção indisponível com recurso inexistente. A suíte tem oito testes da orquestração e quatro do CLI de backup; o CLI remove archive parcial de sua tentativa após falha de pg_dump e preserva arquivos preexistentes. Os testes sintéticos são complementares à execução real Docker, sem substituí-la.

## Cobertura funcional e negativos

Os 26 arquivos cobrem regras/forecast/saúde, PostgreSQL embarcado e driver de datas, adaptadores/ownership, change control/baseline, prontidão, prioridades, cockpit, observações, organização/filtros, dashboard/radar, reports, DoD, contratos/decisões/override, IAM/tokens, jobs/importação/provenance/PDF, sync/reconciliação/outbox, políticas/P2/retenção/OpenAPI, cifra/CLI de backup, orquestração e inicialização do worker.

Os testes novos também verificam template KEEP/CREATE/UPDATE, prévia revertida, commit atômico/idempotente, hash adulterado, versão obsoleta, projeto alheio, leitor, campos protegidos, schemas exportados e escopo aprovado. Contratos GitLab cobrem grupo/projeto, EPIC/ISSUE/TASK, labels, cursor, hierarquia, erros GraphQL e preservação de IDs REST. Um ciclo de sync com respostas controladas verifica DONE sem aceite e proteção do namespace vinculado.

Negativas incluem DONE sem aceite, denominador/gate desconhecido, gate obsoleto, exceção expirada ou sem contexto, alçada/frente/classificação alheia, auto-revisão, último admin, token READ/revogado, versão/contexto antigos, FKs cruzadas, freeze SQL, rollback, importação/fórmula/ZIP inválidos, origem duplicada/antiga, estado externo desconhecido, circuito, replay, proteção dos campos gerenciais e assistência com citação inexistente. Contratos dos conectores e gateway usam fontes sintéticas; não homologam contas externas.

## Jornadas E2E

1. Cockpit macro→micro, árvore/grafo, ampliação, observações persistidas e resumo compartilhável.
2. Leitor consulta notas sem editar.
3. API: ETag, PATCH parcial, paginação, isolamento e snapshot idempotente.
4. Escopo/baseline com revisão independente; report revisado/publicado e impressão.
5. Orange, identidade, indicadores, filtros, preferência, expansão e mobile.
6. Prioridades por arraste/teclado/filtros com persistência, impacto e responsividade.
7. Leitor não altera prioridade global.
8. Projeto/frente Spike/área/squad/modais; importação/provenance, PDF, análise/cenário, DoD/IAM/token, política/estimativa, integrações e listas grandes.
9. Portfólio isolado e cadastro negado ao leitor.
10. Relação técnica e avaliação/revogação de exceção com mitigação/referência.
11. Login, CRUD, mapa, drawer, snapshot, temas/mobile, 18 menus, histórico/recarga, alias RAID, template IA exportado/validado/confirmado, bloqueio de versão antiga, cadastro GitLab, erro de credencial ausente e seletor de vínculos. Inclui menu agrupado/recolhimento persistido, densidade, abas, frentes, denominador de aceite, formulário correto, chips com recarga, percurso ordenado, modal amplo e navegação móvel até Administração, com retorno de foco.
12. API sem identidade e escrita por leitor rejeitadas.
13. Painéis de IA em Orange/Grafite/Claro, leitor sem edição, tutorial GitLab em modal móvel, Axe e ausência de overflow.

QA UI final da evolução anterior: projeto Docker `mct-ui-qa-40ac1d06`, com volume próprio e imagem web final disponibilizada localmente. Foi encerrado e seu volume sintético removido após os testes. Demonstração `mct-local`: 1 programa, 20 capacidades e 24 entregáveis, sem registros E2E; volume persistente. Secrets locais 0600 ficam fora do build.

## Layout, PDF e escala

Capturas workspace-fronts-orange/dark/mobile, workspace-navigation-mobile, agent-preview/agent-mobile/agent-orange/agent-orange-mobile/gitlab-tutorial e completion-administration/integrations/intelligence/provenance/report-pdf/scale e Orange/cockpit/projetos/mobile em docs/implementation. A nova jornada verifica os limites dos elementos dentro dos cards em Orange/Grafite/mobile. PDF servidor foi baixado por job e teve formato/digest verificados também no Docker. A inspeção visual anterior com Poppler confirmou A4, fontes, autoria/hashes e ausência de cortes/acentos incorretos; PDF não é tagged e requer avaliação específica de acessibilidade.

Benchmark-local.json: 5.000 entregáveis/500 capacidades, 10 amostras após aquecimento, state p50 519 ms/p95 546 ms e página de 50 p95 6 ms. Medição PGlite local, aproximadamente 6,87 MB de state, sem rede/concorrência/históricos: não é SLO corporativo nem benchmark do Docker. Listas grandes, rolagem, janela virtual e paginação de 25 foram novamente exercitadas em E2E Docker. Snapshots completos são buscados sob demanda.

## Preservação e limites

Base anterior em `data/control-tower` preservada. A migração anterior 011→020 ocorreu sem seed após cópia fria em data/backups/completion-20261015/control-tower-before-020. migration-preservation.json registra 34 tabelas/267 linhas, colunas originais com contagem/hash idênticos. A nova operação local usa volume Docker próprio e não lê/escreve essa base.

Após a orientação de usar somente Docker, PostgreSQL nativo e cluster vazio de uma tentativa inicial foram removidos, sem início de servidor; dependências compartilhadas do Homebrew não foram removidas automaticamente. Nenhum runner nativo foi criado.

Permanecem externos: OIDC/MFA, conectores reais, gateway/modelo, grants/políticas corporativos, RLS/HA/TLS/at-rest, restore de desastre/RPO/RTO, armazenamento externo, carga/SLO, CI remoto, pentest/PCI e revisão WCAG/leitor de tela. A integração local e o restore real estão aprovados; isso não certifica produção. Cinco high de tooling continuam documentados em OPEN-ISSUES.md; [advisory upstream](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Revisão solicitada nesta rodada

Navegação: [NAVIGATION-AUDIT.md](NAVIGATION-AUDIT.md). IA: [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md). GitLab: [GITLAB-GUIDE.md](GITLAB-GUIDE.md). A primeira execução UI encontrou um rótulo instável após preencher o editor; o rótulo foi separado do conteúdo e a regressão completa passou. A validação de infraestrutura foi repetida com a migration 021, resultado PASSED e cleanup COMPLETE. Local atualizado sem seed: 1 programa, 20 capacidades, 24 entregáveis, 21 migrations; login/live/ready HTTP 200. Nenhuma conta GitLab real foi fornecida ou homologada.

## Evolução do workspace — etapa 1 (histórico)

Escopo e guia: [WORKSPACE-EXPERIENCE.md](WORKSPACE-EXPERIENCE.md). A revisão detectou contraste transitório nos rótulos ao trocar temas, rótulos ocultos pela cascata Orange, animação de contraste no diálogo móvel e aviso de demonstração fora de uma região identificada. Corrigidos com estilo estável, regras explícitas de visibilidade e semântica acessível. A inspeção das capturas também encontrou controles ultrapassando cards estreitos; o rodapé agora permite quebra, os indicadores ficam alinhados e o teste confere os limites de cada elemento. As verificações preservam os testes de permissão, IA, GitLab, edição e governança existentes.

Resultado final: 152 testes (15,94 s), 13 jornadas E2E na mesma execução (41,8 s), typecheck, build web Docker e lint com zero erros/um aviso conhecido. Atualizado apenas o container web com `up -d --no-build --no-deps web`, sem migration ou seed. Conferência SQL antes/depois: 1 programa, 20 capacidades, 24 entregáveis, 21 migrations. Login, live e ready retornaram HTTP 200; sessão real abriu as quatro frentes e os 18 destinos, verificou o inventário e os limites dos cards. Captura do ambiente disponibilizado: `workspace-local-orange.png`. QA descartável removido; banco e worker locais preservados.

## Fechamento da evolução — etapas 2 e 3

169 testes/25 arquivos passaram em 17,37 s. Os 13 casos de operações cobrem campos explícitos sem defaults, datas de calendário, preview sem gravação, atomicidade/idempotência, origem MANUAL, versões obsoletas, projetos/frentes alheios, leitor, change control, sequência de execução, forecast desconhecido e vínculos GitLab com versões/remapeamento/duplicações. IA contextual cobre seleção fora do recorte, registro alheio, template focado versus catálogo completo, hierarquia de feature e proteção de informações de conexão.

A suíte completa passou 13/13 em 48,0 s, na imagem final, com oito sessões administrativas dentro da quota. A jornada principal também confirma edição de vários campos em dois registros, deslocamento de datas, persistência após recarga, exportação do recorte e reimportação no mesmo modal, IA de registro com retorno de foco, filas de planejamento e vínculos GitLab por CSV/busca manual com prévia e persistência. Leitor tem acesso ao contexto e não ganha seleção de edição. Axe e limites de largura passam nos modais desktop/mobile.

Falhas encontradas e corrigidas: os fixtures API precisavam de recarga antes da interação UI; regiões de relatório/diff roláveis precisavam aceitar foco; a lista GitLab encolhia após prévia, corrigida com layout sem encolhimento; indicadores GitLab foram alinhados em quatro colunas e avisos antigos limpos após a escolha. As capturas finais foram inspecionadas: bulk-review-orange.png, planning-review-mobile.png, context-agent-orange/mobile.png e gitlab-batch-orange/mobile.png.

Uma tentativa final encontrou Docker Desktop parado e conexão recusada em todos os casos. O Docker foi reaberto e os containers existentes retomados, sem reseed; a repetição completa acima passou. O ensaio de infraestrutura também foi repetido, incluindo migrations concorrentes, permissões runtime, worker/heartbeat, importação/PDF e backup/restauração cifrado. Resultado em infrastructure-verification.json.

Web e worker locais foram atualizados com as imagens finais via Compose, sem seed ou migration. A verificação de disponibilidade e inventário usa somente consultas no ambiente local; E2E grava somente na pilha sintética descartável. Contagens preservadas: 1 programa, 20 capacidades, 24 entregáveis e 21 migrations. Nenhuma conta GitLab real foi fornecida/homologada. O tutorial e o cadastro estão prontos para a configuração do operador.

Smoke final no ambiente entregue: `/login`, `/api/health/live` e `/api/health/ready` HTTP 200; quatro frentes, 18 destinos, abertura do editor em lote, preparação de IA da seleção e GET contextual com foco/template de um registro. Nenhuma mutação de negócio nesse smoke. Capturas workspace-local-orange.png e context-local-orange.png. QA `mct-ui-qa-40ac1d06` encerrado e volume próprio removido; `mct-local_tower_pg` preservado. Evidência consolidada: [workspace-verification.json](workspace-verification.json).

## Gestão à vista ampliada — verificação final

177/177 testes em 26 arquivos (16,45 s), 13/13 jornadas na mesma execução (55,7 s), typecheck/build Docker aprovados e lint sem erros/um aviso conhecido. Oito casos novos de domínio verificam virada de calendário por fuso, hoje/forecast desconhecido, DONE/cancelamento, independência de aceite, deduplicação N:N/descendentes, baseline versus prazo vencido e recorte de features. O contrato do portfólio verifica também as novas contagens.

A jornada de gestão visual cria uma entrega fictícia vencida somente no projeto Docker de QA, com responsável/critérios para preservar os pré-requisitos da baseline. Confere alertas não nulos, busca/filtro por situação, abrir feature → entrega → detalhe, foco/retorno, minimapa com 20 nós, ampliação, vínculos, mosaico/mobile, portfólio, horizonte e alternância matriz/mapa. Continua exercitando observações, IA, importação, GitLab, permissões e governança nas outras jornadas. Capturas management-map-orange/mobile/expanded, management-home-firstfold, management-portfolio e management-delivery foram inspecionadas.

A revisão corrigiu minimapa vazio por ausência de dimensões explícitas nos nós controlados, repetição do contexto ativo acima do mapa, largura desperdiçada no portfólio com um projeto e comparação de baseline sem dados. A regressão expôs um fixture incompleto que bloqueava corretamente a baseline e um seletor de teste que confundia limpeza global/local: o fixture e os seletores foram corrigidos, preservando as regras do produto.

QA final: `mct-ui-qa-b7e28008`, porta 3001 e volume sintético próprio. Imagem final aplicada apenas ao web local, sem migration/seed. Banco e worker preservados. O ensaio de infraestrutura anterior permanece em infrastructure-verification.json; esta rodada não altera schema, jobs ou operação do worker. Guia: VISUAL-MANAGEMENT.md.

Smoke final do ambiente entregue: login/live/ready HTTP 200; 20 features e 24 entregáveis preservados; contagem do portfólio conferida; panorama de feature e mapa ampliado abertos sem erros de página. SQL antes/depois: 1 programa, 20 capacidades, 24 entregáveis, 21 migrations. Somente web atualizado; banco/worker anteriores mantidos. QA e volume próprios removidos; apenas três serviços locais permanecem. Capturas do ambiente real: management-local-home.png, management-local-map.png e management-local-expanded.png. Evidência consolidada: [visual-management-verification.json](visual-management-verification.json).

## Revisão da legibilidade de grupos e completude

183/183 testes em 26 arquivos (16,72 s), 13/13 E2E (55,7 s), typecheck/build web Docker e lint sem erros/um aviso conhecido. Seis casos novos verificam execução completa versus aceite pendente/confirmado, rótulos de situação, N:N por grupo, domínios homônimos, ausência de entregas, relações macro e separação de hierarquia no micro. O cálculo de negócio e o schema permanecem inalterados.

O fluxo browser verifica Panorama como apresentação inicial, grupos nomeados, ausência de canvas nessa apresentação, recolher/expandir, filtros/busca, modal de feature/entrega, foco/retorno, relação macro→micro com retorno ao grupo, minimapa, ampliação, celular e Axe. A regressão preserva as demais jornadas de governança/IA/GitLab/importação/permissões. Capturas clarity-panorama-orange/mobile.png e clarity-relations.png foram inspecionadas; o primeiro ensaio direcionado passou em 10,5 s, seguido da suíte completa na imagem final.

A inspeção corrigiu espaço interno excessivo dos itens e setas cruzando grupos sem relação: a barra de conclusão fica após o título e os grupos conectados são posicionados em ordem de dependência, com os demais abaixo. Grupos exibem features sem entregas para não ocultar falta de planejamento atrás do percentual conhecido. QA final: mct-ui-qa-ead4b65b, volume sintético próprio. Web local atualizado sem seed/migration; banco e worker preservados. Guia: FEATURE-READABILITY.md.

Fechamento dos ajustes de espaçamento: 13/13 jornadas novamente aprovadas em 56,4 s na imagem final. O teste confere que um grupo recolhido não herda a altura do grupo aberto vizinho e que os rótulos das conexões não sobrepõem os nós. Os 14 casos de gestão visual foram repetidos após a alteração geométrica (140 ms). QA final deste ajuste: mct-ui-qa-16abe727, encerrado com volume próprio removido. O checkpoint anterior de 55,7 s continua registrado como histórico.

Conferência final local: login/live/ready HTTP 200, Panorama inicial com 10 grupos/20 features, recolhimento/expansão, modal de feature e relações macro→micro funcionando sem erros de página. Preservados 1 programa, 20 capacidades, 24 entregáveis e 21 migrations. Apenas web atualizado; banco/worker mantidos e QA removido. Capturas reais clarity-local-panorama/collapsed/group/relations.png. Evidência: feature-readability-verification.json.
