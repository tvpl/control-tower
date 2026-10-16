# Contrato executável da API

Base `/api/v1`. Contrato de máquina em `public/openapi.json` e `docs/05-api/openapi.yaml`, gerado por `npm run api:generate` a partir dos schemas e comandos implementados. A proposta original permanece em `docs/05-api/openapi.original-draft.yaml`; ela não deve ser usada como descrição de endpoints inexistentes.

## Autenticação, escopo e erros

Cookie HttpOnly de sessão local/OIDC ou `Authorization: Bearer <token API>`. Token API tem chave/issuer/audience distintos da sessão, digest persistido, expiração, revogação, programas e READ/WRITE; permissões atuais são reconsultadas. Bearer inválido não recai para cookie. Criar token exige sessão interativa. Nenhum endpoint aceita JWT de sessão como token API.

Escritas por sessão exigem `Origin` igual a `APP_ORIGIN`; bearer não depende de cookie/CSRF. Comandos exigem `Idempotency-Key` conforme OpenAPI. `programId` identifica contexto por query, corpo ou rota aninhada suportada; acesso é conferido no backend, inclusive programa/frente/domínio/categoria/classificação/expiração. Dados restritos são omitidos ou negados antes de projeção/exportação. Health probes e webhooks autenticados têm contratos próprios.

CRUD aceita nomes canônicos snake_case e aliases camelCase dos campos; enviar os dois nomes para o mesmo campo é erro 422. Envelopes adicionam aliases de compatibilidade sem reescrever payloads históricos congelados. Campos gerenciais/derivados são rejeitados no CRUD: aceite, estágio, saúde, datas realizadas e aprovações usam comandos próprios.

Erros são Problem Details com `correlationId`. 400 JSON malformado, 401 identidade ausente/inválida, 403 alçada, 404 recurso não encontrado, 409 conflito/versão/invariante, 422 validação, 429 quota. `X-Correlation-ID`, `Server-Timing` e logs estruturados fornecem correlação sem corpos/tokens. Corpo JSON limitado a 8 MB; webhook a 256 kB.

## Consultas e inventário

- GET `/programs`, `/projects`: somente programas autorizados; portfólio inclui contagens/frentes/organização. Projeto corresponde a programa.
- GET `/state?programId=UUID`: contexto autorizado, métricas, relações, prontidão e resumos dos snapshots. Histórico completo sob demanda via GET `/snapshots/{id}?programId=UUID`; `summary_only` distingue projeção reduzida. Snapshot classificado incompatível é retido integralmente.
- GET/POST `/{resource}` e GET/PATCH/DELETE `/{resource}/{id}`: programs, domains, areas, squads, workstreams, capabilities, deliverables, components, suppliers, contracts, releases, milestones, dependencies, raid, decisions, evidence, connections. PATCH usa versão/If-Match, é parcial e preserva relações não enviadas. FKs restringem exclusão. Contracts/decisions revisados são imutáveis.
- GET `/programs/{id}/overview`, `/programs/{id}/capability-map`, `/programs/{id}/reports/weekly`, `/releases/{id}/readiness`; domínios/frentes também aceitam `/programs/{id}/domains|workstreams`.
- Listagens genéricas: `limit` 1–200 e cursor UUID por id. Deliverables suportam frente/estágio/área/squad; filtros analíticos adicionais são compostos sobre a projeção autorizada na UI, não presumidos em todo endpoint do draft.

Relações incluem `capability_roles` REQUIRED/OPTIONAL/SUPPORTING, `relation_types` de componentes e `deliverable_required` de releases. Referências N:N são do mesmo programa. Frentes têm `kind` DEVELOPMENT/BUSINESS/INFRASTRUCTURE/PROVISIONING/SPIKE/OTHER. Área explícita incompatível com squad é rejeitada. Atribuir responsável/líder não concede membership.

## Comandos gerenciais

| Operação             | Endpoint / contrato                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Estágio              | POST `/deliverables/{id}/transitions`: targetStage, reason, expectedVersion; avanço sequencial e gates/release atuais                                                                                              |
| Aceite               | POST `/deliverables/{id}/accept`: reason, expectedVersion; execução DONE, evidência, contexto e alçada                                                                                                             |
| Saúde temporária     | POST `/deliverables/{id}/health-override`: SET/CLEAR, reason, versão de contexto; SET exige validade de até 90 dias; saúde derivada preservada                                                                     |
| Aprovação de release | POST `/releases/{id}/approve`: reason, expectedVersion; somente obrigatórios prontos                                                                                                                               |
| Avaliação            | POST `/gate-assessments`: subject_node_id, gate_id, expectedGateVersion, expectedVersion, result, justification, evidence_ids; exceção exige expires_at futuro, accepted_risk, mitigation_plan, decision_reference |
| Revogação            | POST `/gate-assessments/{id}/revoke`: expectedVersion, reason; categoria/alçada atual                                                                                                                              |
| Baseline             | POST `/baselines`; POST `/baselines/{id}/review`: APPROVED/REJECTED, expectedVersion, reason; revisor diferente, hash atual e freeze SQL                                                                           |
| Change control       | POST `/change-requests/preview`, POST `/change-requests`, GET `/change-requests[/{id}]`, POST `/change-requests/{id}/review                                                                                        | apply | cancel`; escopo permitido, impacto congelado, versão/revisão segregada |
| Contratos/decisões   | POST `/contracts/{id}/review`, `/decisions/{id}/review`: APPROVED/REJECTED, reason, expectedVersion; alçada configurada e autor diferente                                                                          |

Mudança material reabre aceite/gates afetados, sem reescrever baseline/snapshot. Gates de contexto/versão antigos tornam-se NOT_ASSESSED. Fórmulas atuais: `mct-1.3.0` e `readiness-1.2.0`. N/A exige avaliação explícita; gate ausente ou obrigatório desconhecido bloqueia.

## Catálogos, IAM e prioridades

GET/POST `/catalogs/layers|gates|profiles` e POST `/catalogs/{kind}/{id}` administram código/nome/ativo/versão e regras/gates aplicáveis. Gates globais são somente leitura no editor de programa. Perfis combinam dimensões de aplicabilidade; versões são imutáveis. Alterar contexto exige reavaliação.

GET `/access/state`; POST `/access/identities`, `/access/members`, `/access/members/{id}`, `/access/members/{id}/revoke`; POST `/access/tokens`, `/access/tokens/{id}/revoke`. Administra identidades locais/OIDC sem envio de convite, memberships versionadas e tokens exibidos uma vez. Protege o último administrador permanente; sessão, membership e escopo do token continuam independentes.

GET `/priorities`; POST `/priorities/reorder`: kind, orderedIds completos, expectedVersion, universeHash, reason. Ordem compartilhada por programa com auditoria, sem alterar pesos/escopo/datas. Filtros preservam posições ocultas. POST `/saved-views`: name/filters, privado por identidade/programa.

GET `/observations[/{id}]`, POST `/observations`, PATCH `/observations/{id}` com title/body/important/contexto e expectedVersion. Autor ou gestor autorizado edita; VIEWER apenas consulta. O resumo compartilhável copia/baixa dados autorizados; não envia mensagem ou cria URL pública.

## Importação, provenance e processamento

POST `/import-jobs`: arquivo CSV/XLSX em base64 com filename/namespace conforme schema; retorna job 202. Limites: 5 MB, 10 mil linhas, 25 MB descompactados e 500 entradas ZIP; fórmulas/macros/objetos/links externos são recusados. Preview não grava inventário. POST `/import-jobs/{id}/commit` confirma hash/contexto validado; revalidação atômica, estado inicial IDENTIFIED e dedup namespace/externalId. Preview expirado requer nova validação.

GET `/jobs/{id}`, `/jobs/{id}/errors.csv`, `/jobs/{id}/artifact`: status, erros e artefato pronto com SHA-256. Acesso ao solicitante/admin e classificação dos snapshots para PDF. Jobs têm lease, tentativas e erro explícito. O worker de produção é separado; preview local processa no mesmo processo.

GET `/provenance/{kind}/{id}?checkpoint=N`: última origem por campo no checkpoint, respeitando classificação. MANUAL/IMPORT/CONNECTOR, hash/ator/data/origem/id/versão são registrados; snapshots congelam checkpoint.

Compatibilidade: POST `/imports/preview` e `/imports/commit` mantêm CSV síncrono legado até 500 linhas/1 MB, com hash e idempotência.

## Snapshots, relatórios e análise

GET/POST `/snapshots`, GET `/snapshots/{id}`, POST `/programs/{id}/snapshots`: payload congelado, contexto/versões/checkpoint e hash. GET `/reports` e `/reports/{id}`; POST `/reports` submete narrativa imutável com snapshotId e previousSnapshotId opcional anterior. POST `/reports/{id}/review|publish`: versão/motivo, revisão independente e publicação interna. POST `/reports/{id}/pdf` gera job com versão do report; resultado disponível em artifact. PDF tem paginação, fontes incorporadas, autores/hashes e limites de detalhes explícitos; JSON conserva dados completos.

Comparação mostra mudanças em 16 campos de entregáveis e 28 coleções de contexto. Dados ausentes em snapshot antigo são indisponíveis; fórmulas incompatíveis não geram deltas de KPI. GET histórico não altera payload/hash.

POST `/intelligence`: RULES, ASSIST ou SIMULATE conforme schema. RULES usa snapshot/fontes; ASSIST exige opt-in/configuração e citações válidas; SIMULATE propaga atraso sem mutações. Limitações e revisão humana são parte do resultado.

## Integrações e operação

GET `/integrations/status`; POST `/connections/{id}/sync|links`; POST `/sync-conflicts/{id}/resolve`: fila durável, vínculos REFERENCE/EXECUTION, ownership e resolução KEEP/APPLY com versão/reason. IDs/payloads deduplicados; cursor/circuito/histórico persistidos. Credenciais externas só no runtime. POST `/webhooks/{id}` usa assinatura/token específico, limite de bytes, replay/delivery e agenda pull autenticado.

GET `/notifications`, POST `/notifications/{id}/read`, POST `/notifications/preferences`: notificações internas por evento, preferência individual e sem envio externo. GET `/operations/metrics` é administrativo. `/api/health/live|ready` fornece probes, schema/hash e heartbeat de produção. Configuração, contratos de conectores/webhooks/assistência e ferramentas operacionais estão em OPERATIONS.md.

## Templates IA e teste GitLab

GET /agents/package retorna contexto autorizado, relatório, prompt, checklist, schemas e template. POST /agents/preview valida {template} em transação revertida; POST /agents/commit aplica {template,expectedHash} com Idempotency-Key, verificação de versão e atomicidade. Campos aprovativos e exclusões não são importáveis.

POST /connections/{id}/test consulta a primeira página sem alterar inventário. Connections inclui gitlab_options {api: ISSUES|WORK_ITEMS,scope: PROJECT|GROUP,labels: string[]}. Work Items usa GraphQL, IDs globais e hierarquia; legado mantém IDs REST. Mudar namespace/API de uma conexão com vínculos exige novo cadastro. OpenAPI público foi regenerado dos schemas.

## Operação em lote e contexto da visão

`POST /deliverables/bulk/preview` recebe `{batch}`; `POST /deliverables/bulk/commit` recebe `{batch,expectedHash}` e chave idempotente. Até 100 itens `{id,expectedVersion}`; `change` define campos explícitos ou desloca forecasts em dias corridos. Justificativa obrigatória; prévia revertida e confirmação atômica. Não injeta defaults nos campos omitidos, não contorna change control e não concede aceite/estágio/gates. [Contrato e exemplos](BULK-OPERATIONS.md).

`GET /agents/package` aceita `context` como JSON codificado na query, até 8.000 caracteres, validado pelo schema AgentContext. Contém `view`, `intent` EXPLAIN/FILL/PLAN, filtros, registro opcional ou seleção de até 100 IDs. O servidor valida autorização e pertencimento ao recorte; retorna foco/contagens e template direcionado, mantendo o catálogo autorizado como referência. Indicadores gerais continuam rotulados como projeto completo. Preview/commit de IA preservam o contrato anterior.

`POST /connections/{id}/links/preview|commit` recebe lote GitLab com `expectedConnectionVersion`, até 100 itens `{externalId,subjectNodeId,mode,expectedReferenceVersion}` e `reason`; commit exige `expectedHash` e chave idempotente. Versão de referência nula significa vínculo novo. Duplicação, remapeamento, versão obsoleta ou destino fora do programa/alçada rejeitam o lote completo. REFERENCE aceita nós suportados; EXECUTION exige entregável. Registrar vínculos não consulta nem altera o GitLab e não executa sincronização. [Tutorial e formato CSV](GITLAB-GUIDE.md).

## Portfólio e sinais de gestão

GET `/projects` acrescenta `featureCount`, `done`, `active`, `overdue` e `withoutForecast` por projeto; contagens de execução/prazo também aparecem por frente. Usa a mesma data `asOf` da consulta e o fuso cadastrado de cada programa. `overdue` significa forecast anterior ao dia da consulta e execução diferente de DONE/CANCELLED. Não infere desvio de baseline, prontidão ou aprovação. Campos existentes de aceite/contagem permanecem compatíveis. A consulta continua limitada a projetos com membership vigente.
