# Operação e homologação

## Separação de ambientes

PGlite atende desenvolvimento/QA local, com um processo por diretório. Nunca executar seed/migrations enquanto esse servidor está aberto. Produção exige PostgreSQL servidor (`DATABASE_URL`), identidade OIDC e `APP_ORIGIN` HTTPS. `ALLOW_LOCAL_PREVIEW` fica ausente em produção real. A imagem web contém standalone e assets, sem `.env`, dados locais ou fixtures.

`compose.yaml` oferece targets separados web, worker e migration. O serviço migrate termina antes do web/worker; o seed não é automático. O exemplo PostgreSQL do Compose usa uma identidade de desenvolvimento; produção deve separar dono de migrations e usuário runtime sem DDL, aplicar grants e isolamento aprovados por TI. Autorização de programa/frente/domínio/classificação é aplicada no backend; o ensaio Docker conferiu grants runtime e negação de DDL; não há certificação de RLS/HA corporativa neste ambiente.

## Aplicar evolução

1. Preserve backup e registre schema atual. Interrompa escritores para PGlite; em PostgreSQL, planeje a janela com TI.
2. Execute `npm ci`, checks e `npm run db:migrate` com a identidade de migration. O runner confere SHA-256 de cada arquivo já aplicado e usa advisory lock transacional no PostgreSQL servidor. Não edite SQL já aplicado.
3. Execute `npm run build`, inicie web com `npm start` e worker com `npm run worker`. O worker exige `DATABASE_URL`; o preview embarcado processa jobs no mesmo processo.
4. Verifique `/api/health/live` e `/api/health/ready`. Ready confere a identidade/hash das migrations; produção exige heartbeat RUNNING recente. Endpoints não expõem dados do programa.
5. Teste login, leitura, uma alteração autorizada, uma negativa de permissão, job e snapshot. Falha de migração deve bloquear o rollout; restauração/reversão exige procedimento aprovado, nunca seed.

## Jobs, outbox e diagnóstico

`/operations/metrics?programId=…` e o painel Administração mostram backlog, idade da outbox e workers; somente administrador. Logs JSON da API trazem correlação, status, método, rota e duração; `X-Correlation-ID` e `Server-Timing` permitem localizar a chamada. Não registrar corpos, tokens ou senhas. Agregar logs em observabilidade corporativa para percentis, alertas e retenção; o collector/APM e seus SLOs exigem configuração externa.

Jobs usam claim atômico/lease de 10 minutos, histórico de tentativas e até três tentativas automáticas com backoff. Interrupção permite retomada; lease expirado não autoriza aplicar página externa. Importação confirma atomicamente com chave estável; artefatos repetidos preservam o hash originalmente gravado. Alteração de report durante a fila exige novo PDF. Falhas não são apresentadas como sucesso: confira status/erro e revalide ou solicite novo processamento.

O worker processa polling, jobs e outbox. Notificações são internas, deduplicadas por evento/usuário e configuráveis por programa; não há envio de e-mail/Slack/Teams. Publicar um report continua sendo publicação interna, sem URL pública. Heartbeats periódicos continuam durante operações longas; SIGTERM/SIGINT interrompem a aquisição de novos jobs e registram STOPPED depois da operação corrente.

## Configurar integrações

Cadastre conexão em Integrações: tipo, deployment CLOUD/SERVER, HTTPS, projeto/espaço/repositório, nome do secret, estados e campos. Jira/Confluence Cloud usam e-mail e token; GitHub/GitLab/servidores/catálogo usam o mecanismo do adaptador. Nomes de secret começam com `MCT_CONNECTOR_`; valores são fornecidos ao runtime pelo secrets manager. Os nomes convencionais estão em `.env.example` e Compose; nomes personalizados precisam ser passados explicitamente ao container.

Hosts cloud conhecidos são permitidos. Hosts próprios exigem entrada exata em `MCT_CONNECTOR_ALLOWED_HOSTS`; redes privadas também exigem `MCT_CONNECTOR_ALLOW_PRIVATE=true`, revisão da rede e TLS válido. O cliente fixa o endereço DNS validado na conexão HTTPS, limita resposta, não segue redirects e mantém validação TLS. Habilitar acesso privado é uma decisão do operador, não uma opção concedida a um usuário comum.

Vincule ID externo ao nó correto; REFERENCE preserva apenas a referência. EXECUTION permite somente campos operacionais configurados. Ownership CONTROL_TOWER preserva a alteração em conflito; EXTERNAL pode atualizar execução válida, sem aprovar escopo, aceite, gates ou produção. Título e divergências gerenciais exigem revisão. Fontes antigas são ignoradas; IDs/payloads repetidos são deduplicados. Após três falhas, o circuito abre por cinco minutos. Credencial ausente, mapping desconhecido e conflito permanecem visíveis.

Confluence usa ID do espaço em Cloud e spaceKey em Server. GitHub recebe `owner/repository`; GitLab recebe ID ou caminho do projeto; ADO recebe organização na URL e nome do projeto. O catálogo implementa `{items:[{externalId,externalUrl,title,operationalState,sourceUpdatedAt}],nextCursor}`. Confluence/catálogo podem ser apenas referência, conforme ownership configurado. Nenhum teste com fixture comprova homologação de conta real.

Webhooks usam `/api/v1/webhooks/{connectionId}` e secret separado. GitHub verifica HMAC SHA-256 do corpo, GitLab verifica token constante e os demais gateways verificam HMAC de `timestamp + '.' + bytes` com janela de cinco minutos. Delivery ID deduplica replays; payload máximo 256 kB. O evento agenda pull autenticado da fonte. Jira/ADO/Confluence sem assinatura nativa compatível devem chegar por gateway corporativo que implemente esse contrato, nunca por webhook sem autenticação.

## Assistência externa

A síntese por regras é local e identificada como tal. A opção externa exige `MCT_AI_ENDPOINT`, `MCT_AI_TOKEN`, host na allowlist, opt-in do programa e comando do usuário. O gateway recebe `task: mct-grounded-status-v1`, instruções, snapshot/hash e até 200 resumos de entregáveis; responde `{summary,suggestions:[{text,citations:[UUID]}]}`. A aplicação valida estrutura/citações e exige revisão humana. Nenhuma ferramenta ou comando gerencial é executado a partir da resposta. Não configure um provedor sem aprovar destino, classificação, retenção e uso dos dados. Esta implementação não presume uma conta ou modelo específico contratado.

## Retenção

`npm run ops:retention` calcula dry-run; `npm run ops:retention -- --apply` aplica limpeza transitória. `MCT_TRANSIENT_RETENTION_DAYS` aceita 7–3650 dias (padrão 30). Retém metadados/digests dos jobs e proveniência; expira CSV/linhas de prévia, remove PDFs transitórios antigos, receipts de webhook e buckets de login vencidos. Prévia expirada exige nova validação. Histórico imutável, snapshots, decisões, avaliações e auditoria não são apagados por esse comando. Retenção automática fica desabilitada até `MCT_RETENTION_ENABLED=true`; prazo/legal hold corporativos precisam de aprovação externa.

## Backup e restore

PostgreSQL exige `pg_dump`/`pg_restore` compatíveis instalados pelo operador e acesso autorizado. `npm run ops:backup -- /caminho/novo/backup.mct` usa `DATABASE_URL` e `MCT_BACKUP_KEY_HEX` (32 bytes aleatórios). O dump é cifrado em stream com AES-256-GCM; arquivo 0600, destino existente recusado, sem dump intermediário em claro. Sidecar registra SHA-256, data e schema, nunca a chave. Credencial PostgreSQL é passada por ambiente, sem senha em argv. Mantenha a chave separada do backup e defina sua rotação/escrow com TI.

`npm run ops:restore-test -- /caminho/backup.mct` verifica a autenticação criptográfica antes de enviar dados ao PostgreSQL. Exige `RESTORE_DATABASE_URL` diferente do URL operacional e banco vazio; recusa limpeza/overwrite. `pg_restore` usa transação única e aborta em erro. O comando informa migrations/snapshots restaurados e ainda exige conferência de hashes, amostras, papéis e acesso pelos responsáveis. TLS é exigido por padrão pelo CLI; somente ambientes locais deliberados devem usar `sslmode=disable`.

A cifra/round-trip e recusa de overwrite têm teste automatizado. Dump e restore reais passaram em PostgreSQL 16 no Docker, com verificação de migrations, inventário e hashes de snapshots. Restauração de desastre, RPO/RTO e armazenamento externo corporativos **não foram homologados**. Backup PGlite exige cópia fria de seu diretório com o processo parado; não use o CLI PostgreSQL para afirmar homologação do banco embarcado.

## Executar ensaio isolado

`npm run test:infra` cria seu próprio PostgreSQL/container web/worker e testa dump/restore sem carregar as credenciais operacionais. Não publica portas e remove somente recursos etiquetados pela execução. Exige Docker Engine ativo. O job CI correspondente publica relatório de máquina, nunca tokens/backup de QA. Consulte INFRASTRUCTURE-VALIDATION.md para etapas e evidência; ausência de motor é BLOCKED/exit 2, sem sucesso fictício. O CLI de backup agora remove o archive desta tentativa se pg_dump falhar após emitir um stream parcial; arquivos preexistentes são preservados.

## Ambiente local Docker

`npm run docker:local` constrói as imagens, sobe o PostgreSQL, aplica migrations/seed fictício idempotente e inicia web/worker em http://127.0.0.1:3000. O overlay local não publica o banco e habilita explicitamente login local; não altera a composição corporativa OIDC. `npm run docker:stop` encerra a composição preservando o volume. Secrets gerados ficam em data/docker-local/runtime.env com modo 0600, fora do build. A base embarcada anterior permanece preservada, sem migração implícita. O ensaio estrito de infraestrutura e as jornadas UI usam bases descartáveis distintas desse ambiente.
