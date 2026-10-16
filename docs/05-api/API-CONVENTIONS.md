# Convenções de API

- Base `/api/v1`, JSON UTF-8, OpenAPI 3.1 em `openapi.yaml`.
- OIDC bearer tokens; autorização por recurso/ação e escopo de programa.
- UUID como ID interno; `code` legível e único por programa.
- Paginação `limit`/`cursor`; filtros combináveis; ordenação whitelist.
- PATCH condicional com `If-Match` para concorrência otimista; retornar `ETag`.
- `Idempotency-Key` em POST de criação de snapshots, importações e aprovações.
- Erros RFC 9457 Problem Details com `type`, `title`, `status`, `detail`, `instance`, `correlationId`.
- Timestamps ISO 8601 UTC, datas de planejamento ISO date, timezone do programa.
- Exibir `sourceAsOf`, `lastSyncedAt` e `dataQuality` em dashboards.
- Mutations em baselines aprovadas são proibidas; criar nova versão.
- Endpoints de transição separados de PATCH genérico, pois exigem gates.

## Recursos adicionais planejados
`/programs/{id}/domains`, `/programs/{id}/workstreams`, `/capabilities`, `/components`, `/relationships`, `/milestones`, `/releases`, `/dependencies`, `/raid`, `/decisions`, `/gates`, `/assessments`, `/baselines`, `/snapshots`, `/reports`, `/imports`, `/integrations`.

## Exemplos
`GET /api/v1/programs/{id}/capability-map?domainId=...&releaseId=...&includeUnknown=true`.
`POST /api/v1/deliverables/{id}/transitions` com `{ "targetStage": "UAT", "reason": "SIT aprovado" }`.
`POST /api/v1/gate-assessments` com subject, gate, resultado, evidência e versão esperada.
