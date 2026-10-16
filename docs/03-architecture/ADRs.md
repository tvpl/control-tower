# Architecture Decision Records

## ADR-001 — Modular monolith e Next.js
**Status:** proposta. Usar Next.js App Router/TypeScript para frontend e API modular inicialmente; PostgreSQL para persistência. Alternativa: backend Java 21+/Micronaut se integração corporativa e equipe justificarem. **Critério:** evitar duas implementações concorrentes e registrar decisão antes do código.

## ADR-002 — PostgreSQL antes de graph DB
**Status:** proposta. Relacionamentos N:N e grafo com tabelas relacionais e recursive CTE. Avaliar banco de grafos somente após medir consultas de impacto.

## ADR-003 — Ferramentas mixed via adapters
**Status:** confirmado. Conectores isolados por fornecedor, modelo canônico, campo proprietário, inbox/outbox, proveniência e reconciliação.

## ADR-004 — Baseline imutável e snapshots versionados
**Status:** confirmado. Baseline é compromisso aprovado; snapshot é observação periódica. Nunca sobrescrever versões publicadas.

## ADR-005 — Full inventory com maturidade independente
**Status:** confirmado. Cobertura inicial de alto nível para todo o programa; profundidade por frente; desconhecido não equivale a pronto.

## ADR-006 — Aprovação humana para gates e reports
**Status:** confirmado. IA auxilia, mas não aprova produção, PCI ou exceções autonomamente.

## ADR-007 — Design visual greenfield
**Status:** confirmado. Layout anterior rejeitado; iniciar exploração visual sem copiar cores, hierarquia ou navegação prévias.
