# Decisões de implementação

## ADR-I01 — monólito modular Next.js

Adotado provisoriamente: App Router + API versionada + TypeScript; PostgreSQL; Drizzle como executor SQL parametrizado. Preserva ADR-001 e não cria backend concorrente. Next 16/React 19 estáveis com lockfile.

## ADR-I02 — PostgreSQL local sem Docker

Docker instalado, daemon indisponível no início. PGlite executa PostgreSQL real e persiste em data/ para desenvolvimento. Produção exige DATABASE_URL e AUTH_MODE=oidc. Sem fallback silencioso em produção. DDL base deriva integralmente de docs/04-data/schema.sql; complementos versionados. Extensão pgcrypto removida no embedded porque gen_random_uuid é nativa. Ambiente local não valida HA, backup, RLS ou desempenho do PostgreSQL servidor.

## ADR-I03 — propostas visuais antes da UI

Direção A, escolhida provisoriamente: **Obsidian Atlas**. Rail estreito neutro; canvas grafite; jade reservado à execução aceita; âmbar para risco; tipografia sans com códigos mono; linhas e divisores em vez de grade de cartões enormes. Capability Map é centro de navegação. Trade-off: densidade exige ótima legenda e foco.

Direção B: **Editorial Intelligence**. Fundo marfim, navegação superior, páginas como relatório editorial, tipografia de destaque serif e tabelas finas. Trade-off: excelente para comitê, menos espaço para grafo e inventário diário.

Light mode de A preserva estrutura e semântica com superfícies claras. Não reutiliza visual anterior. Não existe layout anterior no checkout.

## ADR-I04 — hipóteses explícitas

Sem pesos aprovados: contagem de entregáveis aceitos, indicador provisório. Sem universo estimado: cobertura desconhecida. SLA de frescor 7 dias é proposta, não requisito corporativo aprovado. Seed é fictício e nunca é aplicado automaticamente em produção. Baseline é congelamento explícito; alterações criam versão. Admin não recebe permissão de gate automaticamente.

## ADR-I05 — execução local

Solicitação é desenvolvimento no repositório com Next/PostgreSQL, portanto sem publicação Sites/Cloudflare e sem conversão para Vinext/D1. Skill Sites usada no fluxo local/preview; arquitetura normativa preservada.

## Wireframes das seis jornadas

Overview: contexto → faixa de métricas explicadas → frentes e saúde → riscos e marcos → histórico.
Mapa: contexto/filtros → árvore de domínios × camadas → drawer célula → entregável → evidência.
Entregável: identificação → dimensões separadas → forecast e motivo → relações → gates → auditoria.
Delivery: releases → faixa temporal baseline/forecast → composição → desvios → baseline.
Dependências: prioridades → lista/grafo → owner/prazo → dependentes transitivos → ações RAID.
Readiness: release → status binário → gates impeditivos → evidências → avaliação autorizada.

## ADR-I06 — auth

Login local com scrypt, cookie HttpOnly assinado e expirável somente no desenvolvimento; OIDC configurável para produção. Contas de demo documentadas e banner persistente. RBAC na aplicação/API por programa/frente; não confiar em papel enviado pelo cliente. Alçadas de gates por categoria; proibir autoaprovação crítica.

## ADR-I07 — versionamento de fórmulas e hashes

Fórmula mct-1.1.0: qualidade = preenchimento de 7 atributos (owner, aceite, forecast, camada, vínculo, evidência e frescor) / 7N. Sem universo estimado, cobertura é desconhecida. Hash de snapshot/baseline usa JSON canônico com chaves ordenadas recursivamente e hashScheme=canonical-json-v1, pois JSONB não preserva ordem de propriedades. Snapshots fictícios de construção com esquema anterior são preservados e identificados como hashes legados não verificados.

## ADR-I08 — alçadas provisórias e estágios

Decisão histórica da primeira fatia, substituída pelo ADR de conclusão abaixo: o catálogo inicial era global/fixo. Para UAT, exigir gates de engenharia; para produção, todos os bloqueantes e release autorizada. N/A com justificativa; exceção exige validade e risco aceito. RAID pode ter frente responsável; dependência do líder pertence à frente do dependente; evidência do líder precisa comprovar entregável de sua frente. Essas políticas são provisórias, sujeitas à validação corporativa. Não implementar autoaprovação de gate impeditivo.

## ADR-I09 — deploy standalone sem dados de runtime

Next.js standalone pode rastrear leituras dinâmicas do diretório de banco. Excluir data/, .env* e evidências de testes do tracing; empacotador falha se dados/secrets aparecerem. Copiar public/static explicitamente. npm start usa servidor standalone e resolve caminho do banco antes de mudar cwd. Docker permanece não validado neste host.

## ADR-I10 — contratos de datas por driver

Postgres.js converte date e timestamptz para objetos Date; PGlite entrega strings. Infraestrutura normaliza datas de calendário para YYYY-MM-DD e instantes para ISO UTC, antes de validar/projetar. Contrato exercitado com formas dos dois drivers; não substitui teste de PostgreSQL servidor real.

## ADR-I11 — change control e segregação de baseline

Propostas congeladas, revisão independente PMO/EXECUTIVE e aplicação explícita por editor autorizado. Administração não implica alçada de decisão; papéis acumulados não autorizam autoaprovação. Programa é bloqueado na transação dos comandos para serializar captura/revisão/mutação. Fingerprint de impacto é conferido na aprovação e na aplicação; baseline também confere inventário antes de aprovar. Aplicação material invalida aceites/gates diretos, preserva histórico e compromisso original. Não inferir custos/esforço. Cancelamento preserva decisão anterior. Alçadas e universo são provisórios e requerem homologação corporativa; não alteram approvals legadas retroativamente. Nova conta fictícia PMO é provisionada explicitamente pelo seed local.

## ADR-I12 — relações obrigatórias e versão de critérios

Contribuição REQUIRED/OPTIONAL/SUPPORTING, relação de componente USES/IMPLEMENTS/SUPPORTS/DEPENDS_ON e obrigatoriedade de release são atributos do vínculo N:N, preservados em PATCH e no histórico. Alterar contribuição congelada exige change control. Prontidão de capacidade considera somente obrigações diretas; opcionais/apoio permanecem no contexto. Programa/release deduplicam entregáveis e exigem escopo aprovado. Escopo proposto/excluído não autoriza produção; baseline mantém universo anterior até nova versão aprovada.

Fórmula de readiness-1.1.0 compara gate_version à versão vigente. N/A obsoleto não reduz denominador. Reavaliação exige expectedGateVersion e grava a versão nova; definição é congelada em histórico SQL, sem inventar revisões anteriores desconhecidas. Revogação de exceção por categoria reabre PENDING com auditoria. Snapshot congela catálogo, versões e readiness. Esta limitação histórica foi substituída na migration 012: perfis/aplicabilidade e catálogo UI/API foram implementados; ver ADR de conclusão. Não confundir teste local desta política provisória com alçada corporativa homologada.

## ADR-I13 — planejamento interativo e componentes

Dois boards por programa: entregáveis e capacidades, independentes de baseline e dos estados de aprovação/execução. Ordem inicial neutra por código; atribuição gerencial começa no salvamento explícito. Novos itens entram sem prioridade, preservando a ordem publicada. Filtros reordenam apenas slots visíveis; nenhum item oculto muda de posição. Ordenação por impacto é sugestão reversível (pendentes primeiro, maior número de dependentes impeditivos, desempate pela ordem atual), sem inventar score corporativo ou executar/publicar automaticamente.

Transação bloqueia programa e valida versão/universo/conjunto completo de nós. Ordenação global é alçada de gestor/arquitetura/PMO/execução executiva; papel enviado pelo cliente não concede permissão. Audit/outbox e snapshot preservam decisão. Rascunhos são React state, dados salvos no PostgreSQL. Componentes separados (intro/tabs/fila/item/contexto/ações/resumo), hook de ordenação, botão e navegação reutilizáveis. Drag nativo de desktop com controles acessíveis equivalentes por teclado e setas móveis. Mantida direção visual Obsidian Atlas com jade/grafite, light mode, foco visível e reduced motion.

## ADR-I14 — cockpit macro/micro e observações contextuais

Feature é o nome de apresentação de capacidade; projeto é programa. Rollup visual percorre descendentes e deduplica entregáveis, sem mudar readiness (somente REQUIRED diretos) ou fórmula ponderada da baseline. Contagem e denominador são explícitos; sem universo/gates não se fabrica porcentagem. Grafo macro agrupa dependências já cadastradas, micro preserva endpoints reais e indica contexto fora do recorte; nós isolados são opcionais para manter a leitura.

Observações pertencem ao programa e opcionalmente a um nó do mesmo programa, protegido por FK composta. Qualquer membro contribuidor pode anotar transversalmente, incluindo líder/aprovador; VIEWER permanece somente leitura. Edição exige autor ou PROGRAM_ADMIN/CHIEF_ARCHITECT/PMO/EXECUTIVE, com versão e autoria/contexto imutáveis no contrato. Não equivale a alçada para modificar inventário ou aprovar gates. Comando serializa o programa, registra audit/outbox e usa idempotência. Snapshot captura as notas; versões anteriores permanecem em auditoria/snapshots.

Compartilhamento é uma prévia revisável exportada pelo usuário via cópia/Markdown, com data, recorte, numeradores e pontos escolhidos. Não cria endpoint público nem dispara mensagens externas. Status ao vivo não se confunde com publicação/revisão de relatório histórico, acrescentada posteriormente no ADR-I18.

## ADR-I15 — portfólio e recortes organizacionais

Projeto continua a representar um programa; não se inventa uma segunda hierarquia programa→projeto. `/projects` é uma projeção de portfólio somente leitura sobre programas autorizados, com contagens de aceite sem ponderação e denominador explícito. Frentes têm nome livre e tipo editável. OTHER é o padrão genérico para inventário anterior, sem deduzir categorias dos nomes.

Áreas e squads têm escopo de programa, códigos únicos nesse escopo e referências por FK composta. Área efetiva de entregável é área explícita ou, se ausente, área do squad. Divergência explícita é rejeitada em API e SQL, inclusive na atualização de squad. Liderança de squad não atribui membership; alçada operacional continua por frente. Associação organizacional é metadata operacional, preservada em audit/snapshot sem invalidar aceite/gates ou alterar a baseline já congelada. Administração de diretórios exige admin ou arquiteto; líder pode classificar somente entregáveis de sua frente.

Filtros de frente/release/área/squad combinam condições sobre o mesmo entregável. Programas são isolados e a troca de contexto limpa seleções/foco e atualiza URL. Snapshot inclui diretórios organizacionais. Portfólio filtra presença de tipo de frente/projeto, mas contagens são do projeto inteiro; cockpit fornece o recorte micro. Filtros sem semântica definida para visões globais/históricas são desabilitados, preservando dados e explicitando alcance. Perfis de DoD não são inferidos: agora podem ser configurados explicitamente por contexto na Administração.

## ADR-I16 — Orange como tela e tema (substituída por ADR-I17)

Orange é uma identidade visual própria e uma entrada alternativa para o cockpit, sem duplicar modelo de dados, porcentagens ou ações. `view=orange` ativa a tela e o tema; seleção de tema pode ser aplicada aos outros módulos. Preferência visual é local; não é entidade de negócio. Nome e símbolo são próprios, sem assets de terceiros ou fontes proprietárias. Ações usam tom escuro para contraste com branco e gráficos usam realce vivo. Cores de execução/dependências vêm de tokens com fallback que preserva Grafite/Claro. Não há publicação ou mudança de arquitetura.

## ADR-I17 — Orange somente como tema e indicadores por recorte

Substitui ADR-I16 por correção explícita do usuário. Orange deixa de ser tela, nome ou símbolo do produto; apenas o seletor escolhe o tema, inclusive no mobile. O legado view=orange abre overview com esse tema. A restauração deve terminar antes da persistência da preferência inicial para evitar sobrescrita em hidratação/Strict Mode.

Síntese pondera com pesos congelados da baseline; sem peso, contagem provisória explícita. Prontidão e qualidade são recalculadas para os entregáveis do recorte, com a fórmula de domínio. Série histórica usa coorte fixa de IDs atuais, sem interpolar registros ausentes ou fórmulas incompatíveis. Agenda do programa é identificada separadamente. Radar é determinístico; usa contratos/componentes/conexões cadastrados e não inventa dados ausentes.

## ADR-I18 — reports revisados e publicados internamente

Migration 011 adiciona reporting.reports: conteúdo imutável após submissão, snapshot do mesmo programa e opcional anterior, hash canônico, autor, revisão segregada com motivo, publicação auditada e versão otimista. SUBMITTED → APPROVED/REJECTED; APPROVED → PUBLISHED. Rejeição/publicação encerram a versão. SQL protege conteúdo e decisões, e FK composta protege referência de programa. Comandos usam membership, Origin, idempotência, lock transacional e audit/outbox.

Publicação disponibiliza o report aos membros autorizados dentro do sistema; não envia mensagem nem cria URL pública. JSON exporta referências e payloads congelados. Impressão permite salvar PDF no navegador, sem prometer job PDF no servidor. Comparação lista alterações de entregáveis, adições e remoções; KPI delta exige mesma versão de fórmula. Estado inclui snapshots referidos por reports além dos 52 recentes.

## Conclusão local — catálogos, fontes e operação (15/10/2026)

Migrations 012–020 substituem limitações da primeira fatia. Gates por programa e perfis DoD versionados compõem aplicabilidade/contexto; prontidão atual é readiness-1.2.0 e fórmula mct-1.3.0. Novas exceções exigem risco, mitigação e referência de decisão; histórico anterior não é reescrito. Camadas configuráveis conservam identidade e uso histórico.

Contratos/decisões têm revisão independente; saúde temporária é append-only e não altera derivação/aceite. IAM/UI e tokens revogáveis usam autorização atual e classificação. Jobs duráveis atendem CSV/XLSX, PDF e sync; provenance e snapshots congelam checkpoint. Integrações nunca promovem aceite/escopo/gates/produção. Outbox gera notificações internas, sem envio externo.

State usa resumos de snapshots; payload completo é lido sob demanda sem mudar hash. Comparação abrange 28 coleções e cenários/assistência não executam mutações. Universo estimado é opcional, auditável e nunca presumido. Virtualização tem paginação alternativa. Worker/probes/métricas/retenção e scripts cifrados de backup/restore estão implementados; homologações externas permanecem em OPEN-ISSUES.md.

## ADR-I19 — operações em lote e contexto de IA (16/10/2026)

Edição operacional e vínculos GitLab usam prévia em transação revertida e confirmação atômica com hash canônico, versões e chave idempotente. Até 100 itens; qualquer linha inválida reprova o lote. Comandos de domínio existentes continuam responsáveis por autorização, invariantes, auditoria/outbox e provenance. Não há novo mecanismo de aprovação nem migration.

Planejamento desloca datas de calendário, sem inferir esforço/capacidade ou preencher desconhecidos. IA contextual concentra template e contagens no foco e mantém o catálogo autorizado como referência; indicadores gerais permanecem identificados como projeto completo. Retorno é proposta revisada pelo usuário, não execução automática de modelo. Vínculos GitLab sugerem somente marcadores explícitos; nomes semelhantes não resolvem correspondências. Credenciais, sync operacional e aceite gerencial conservam suas fronteiras.

## ADR-I20 — gestão à vista por projeção (16/10/2026)

A home prioriza um mapa navegável de features com alternativa em mosaico, sinais de execução/prazo e acesso ao panorama da feature e aos entregáveis. As mesmas projeções atendem portfólio, frentes, capacidades e horizonte de planejamento. Não se cria novo estado gerencial ou migration; aceite, prontidão, saúde, maturidade e avanço ponderado mantêm seus cálculos e comandos anteriores.

Prazo vencido é uma projeção de calendário: forecast anterior ao dia `asOf` no fuso do programa, excluindo execução DONE/CANCELLED. Hoje não venceu e data ausente permanece desconhecida. Desvio de baseline é comparado separadamente com forecast congelado aprovado; ausência de datas comparáveis permanece indisponível. Percentuais de execução/aceite por contagem mantêm denominadores explícitos. N:N e descendentes são deduplicados nos totais; uma entrega compartilhada pode participar de vários cards.

Cada mapa contém até 20 features para preservar leitura; filtros, busca e paginação dão acesso ao restante. Só se desenham dependências com as duas features presentes na página, com legenda explícita; o módulo de dependências conserva a exploração completa. Mosaico inicia no celular e oferece alternativa ao canvas. Mapas e novos cards consultam dados; não aprovam ou alteram inventário.

## ADR-I21 — hierarquia e completude legível (16/10/2026)

A apresentação inicial passa a Panorama: grupos nomeados por domínio/situação contêm as features. A ordem de informação é fixa e a barra significa apenas entregas DONE/total. Aceite fica identificado separadamente; alertas não substituem percentuais. Sem entregas não recebe 0% conhecido, e grupos mostram lacunas de vinculação. Execução completa sem aceite é “Aguardando aceite”, sem nova transição ou regra de aprovação.

Relações separa a leitura de conexões da leitura do panorama: começa nos grupos e permite aprofundar em features. Contagens de grupo deduplicam N:N; domínios homônimos usam IDs distintos. Dependências mantêm IDs para inspeção, agrupamentos internos não viram auto-conexões e o nível micro diferencia hierarquia tracejada de dependência. Posicionamento segue a ordem de dependências quando possível, com fallback limitado em ciclos de agrupamento. Nenhuma alteração de schema, engine de prontidão ou dados de negócio.
