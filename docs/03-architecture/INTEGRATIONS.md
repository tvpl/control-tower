# Integrações, ownership e reconciliação

## Sistemas
Jira, Azure DevOps, GitHub/GitLab, Confluence, CI/QA, catálogo de infraestrutura e identidade corporativa. Cada adaptador tem `connectorType`, `connectionId`, credencial secret-managed, escopo, cursor de sincronização, mapeamento de campos, taxa, retry, circuit breaker e status.

## Ownership por atributo
| Campo | Fonte de verdade |
|---|---|
| Capacidade, escopo aprovado, vínculo com domínio | Control Tower |
| Baseline, forecast gerencial, releases executivos | Control Tower |
| RAID executivo, decisões e gates | Control Tower |
| História/tarefa, sprint, status operacional | Jira/ADO conforme external reference |
| PR, commit, pipeline | GitHub/GitLab |
| Evidência de testes | ferramenta QA, referenciada |
| Ambiente/provisionamento | catálogo IaC/infra, referenciado |

## Sincronização
1. Receber evento ou executar polling incremental.
2. Validar autenticidade e esquema; armazenar inbox idempotente.
3. Resolver referência externa sem duplicar entidade.
4. Aplicar política de campo proprietário.
5. Criar conflito se alteração afetar informação gerencial.
6. Registrar audit e última sincronização.
7. Recalcular projeções e publicar alerta se necessário.

## Segurança
Tokens somente em secret manager; nunca em logs; webhooks com verificação de assinatura; rate limits, backoff e circuit breaker. Erros de sync reduzem frescor, não zeram métricas nem marcam como concluído.

## Contrato canônico de referência
`{ entityType, entityId, connectionId, externalId, externalUrl, externalUpdatedAt, lastSyncedAt, syncState, fieldMappings }`.
