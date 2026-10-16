# Adaptadores e operação mixed

A implementação local inclui Jira, Azure DevOps, GitHub, GitLab, Confluence e catálogo HTTP, worker persistente, inbox, provenance, conflitos/reconciliação, cursor e circuit breaker. A operação completa e os contratos de webhook estão em [OPERATIONS.md](OPERATIONS.md). Esta revisão substitui a versão anterior que indicava worker/UI como pendentes.

## Configuração

1. Forneça secret de runtime com prefixo `MCT_CONNECTOR_`; valor não vai para o banco nem para logs. Compose passa os nomes convencionais de `.env.example`; nomes próprios exigem configuração do container.
2. Cadastre tipo/deployment, URL HTTPS, projeto/repositório/espaço e nome do secret. Hosts próprios precisam de allowlist exata; redes privadas também exigem opt-in do operador e TLS válido. O cliente valida e fixa DNS, limita resposta, timeout/retry e não segue redirects.
3. Configure mappings de estado/campos aprovados. Sem mapping válido, o estado é UNKNOWN. Nenhum estado externo aprova aceite, escopo, gates ou produção.
4. Vincule ID externo ao nó do programa como REFERENCE ou EXECUTION. Fonte não vinculada fica na inbox; não cria inventário implicitamente. EXECUTION respeita ownership, validação de workflow e aceite existente.
5. Solicite sincronização pela UI. Job persistido processa páginas com lease e cursor; tentativas/run history ficam visíveis. Credencial ausente permanece NOT_CONFIGURED, sem indicador fictício de sucesso.
6. Revise conflitos KEEP/APPLY com motivo e versão atual. Dados gerenciais permanecem protegidos; histórico de resolução é imutável. Se o registro mudou, reavalie o conflito em vez de contornar a concorrência.

## Endereçamento

| Fonte             | Configuração                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Jira Cloud        | `https://empresa.atlassian.net`, project key, e-mail/token; `/rest/api/3/search/jql`                    |
| Jira Server       | URL HTTPS permitida, project key e token do adaptador; `/rest/api/2/search`                             |
| ADO               | `https://dev.azure.com/organizacao`, project name, PAT; WIQL/batch API 7.1                              |
| GitHub            | API URL e `owner/repo`, token restrito; issues, excluindo PRs                                           |
| GitLab            | API URL e ID/caminho do projeto; issues paginadas                                                       |
| Confluence Cloud  | URL do tenant, ID do espaço e e-mail/token; páginas REST v2                                             |
| Confluence Server | URL HTTPS permitida, spaceKey e token; content REST                                                     |
| Catálogo          | HTTPS permitido, `{items:[{externalId,externalUrl,title,operationalState,sourceUpdatedAt}],nextCursor}` |

Deployments corporativos não são homologados pela existência do adaptador. URLs, autenticação, versão e mappings devem ser ensaiados na instância real; não presumir ADO on-prem a partir do contrato cloud.

## Falhas e proteção

401/403 exige conferir/rotacionar secret e escopos, sem registrar token. 429/5xx usa retry limitado/backoff. Três falhas abrem circuito por cinco minutos. Fonte antiga é ignorada, delivery/payload repetido é deduplicado e cursor só avança após ingestão transacional. Conflito não é sucesso operacional. Snapshot registra checkpoint de origem.

Webhooks são autenticados e agendam pull da API de origem; não aplicam payload não confiável diretamente ao inventário. Notificações/outbox são internas ao produto, sem envio a terceiros. Nenhum conector com conta real foi homologado neste ambiente.

Fontes oficiais: [Jira](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/), [ADO](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1), [GitHub](https://docs.github.com/en/rest/issues/issues), [GitLab](https://docs.gitlab.com/api/issues/), [Confluence Cloud](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/).

## GitLab e preenchimento com IA

O cadastro guiado, filtro por labels, Work Items (épicos/issues/tasks), teste de leitura e tutorial Docker estão em [GITLAB-GUIDE.md](GITLAB-GUIDE.md). O fluxo independente de IA com exportação, relatório, template, prévia e reimportação atômica está em [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md). Os cadastros GitLab legados preservam API e IDs REST.
