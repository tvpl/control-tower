# Arquitetura de referência — C4 textual

## Contexto
Usuários (arquiteto, líderes, PMO, executivo, aprovador) interagem com Control Tower. Sistemas externos: Jira, Azure DevOps, GitHub, Confluence, catálogo de infraestrutura, testes/QA, OIDC, armazenamento de evidências. Integrações são adaptadores, não fonte de autoridade sobre escopo aprovado.

## Containers
1. **Web:** Next.js App Router + TypeScript; server components para leitura, client components para interação complexa; design system acessível.
2. **Application API:** módulos de domínio com validação Zod/OpenAPI, autenticação OIDC e RBAC/ABAC por programa/frente.
3. **PostgreSQL:** transações, relações, baselines, snapshots, outbox/inbox e auditoria.
4. **Workers:** ingestão e reconciliação externa, geração de snapshots/reports, alertas e recalculação de projeções.
5. **Object Storage:** anexos e evidências protegidas; preferir links a artefatos corporativos.
6. **Observability:** logs estruturados, métricas, traces e alertas.

## Modularidade
- Portfolio & Scope
- Architecture & Relationships
- Delivery & Releases
- Dependencies & RAID
- Readiness & Governance
- Reporting & Snapshots
- Integrations & Provenance
- Identity & Audit

Cada módulo é dono das próprias regras e tabelas. Compartilhar contratos internos e eventos; não consultar tabelas de outro módulo diretamente pela camada de domínio.

## Fluxos
**Atualização líder:** UI → API → autorização por frente → validação de transição → transação (entregável + audit + outbox) → atualização de projeções → dashboards.
**Sync mixed:** connector → polling/webhook → inbox dedup → normalização → matching de external ref → política de ownership → conflito ou atualização → auditoria → projeções.
**Report semanal:** job cria snapshot imutável → calcula métricas com fórmula versionada → compõe report → líder revisa → publica versão.

## Qualidades
Observabilidade desde o início; migrações versionadas; idempotência; retries com backoff; paginação; busca indexada; índices por programa/status/data; isolamento de tenants/programas; exportação controlada.

## Evolução
Não iniciar com microsserviços. Separar serviço de API se necessidades organizacionais ou técnicas comprovarem valor; primeiro preservar fronteiras internas.
