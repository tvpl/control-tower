# Framework de DoD e Quality Gates

## Perfis de aplicação
`CLIENT_UI`, `BACKEND_SERVICE`, `PARTNER_INTEGRATION`, `DATA_PIPELINE`, `INFRA_COMPONENT`, `PCI_CRITICAL`, `OPERATIONAL_RELEASE`. Perfis podem compor gates; regra de aplicabilidade configurável e versionada.

## Categorias de gates
| Categoria | Exemplos de critérios |
|---|---|
| Produto | requisitos aceitos, UAT assinado, documentação de negócio |
| Arquitetura | ADR, diagramas, contratos, NFRs, revisão de dependências |
| Engenharia | testes unitários/integrados, qualidade de código, versionamento |
| Performance | volumetria, pico, lotes, paginação, cache, testes de carga |
| Segurança/PCI | escopo PCI avaliado, ameaças, segregação, secrets, controles |
| Resiliência | rate limit, circuit breaker, retries, timeout, idempotência |
| Dados | classificação, eventos para DataLake, lineage, retenção |
| Observabilidade | logs, traces, métricas, dashboards, alertas, SLO |
| Infraestrutura | provisionamento, IaC, ambientes, capacidade, sandbox |
| Operações | runbook, SLA, rollback, feature flags, auditoria, suporte |
| Integrações | contrato fornecedor, homologação, SLA, certificação quando aplicável |

## Estados
`NOT_ASSESSED`, `PENDING`, `PASSED`, `FAILED`, `NOT_APPLICABLE`, `EXCEPTION_APPROVED`.

## Regras
- N/A com justificativa e validação de alçada conforme categoria.
- Evidência pode ser URL protegida, ID de execução ou documento; metadados e versão obrigatórios.
- Exceção registra risco, mitigação, aprovador, prazo de expiração; expiração reabre bloqueio.
- Release não fica READY com gate bloqueante pendente/failed.
- DoD não é um checkbox único; é avaliação de requisitos aplicáveis por tipo de entrega.
