# Modelo relacional — ERD lógico

```mermaid
erDiagram
  PROGRAM ||--o{ DOMAIN : has
  PROGRAM ||--o{ WORKSTREAM : has
  DOMAIN ||--o{ CAPABILITY : owns
  CAPABILITY ||--o{ DELIVERABLE_CAPABILITY : needs
  DELIVERABLE ||--o{ DELIVERABLE_CAPABILITY : contributes
  WORKSTREAM ||--o{ DELIVERABLE : executes
  COMPONENT ||--o{ CAPABILITY_COMPONENT : supports
  CAPABILITY ||--o{ CAPABILITY_COMPONENT : uses
  PROGRAM ||--o{ RELEASE : plans
  RELEASE ||--o{ RELEASE_DELIVERABLE : includes
  DELIVERABLE ||--o{ RELEASE_DELIVERABLE : included
  PROGRAM ||--o{ PROGRAM_NODE : registers
  PROGRAM_NODE ||--o{ DEPENDENCY : source
  PROGRAM_NODE ||--o{ RELATIONSHIP : source
  GATE_DEFINITION ||--o{ GATE_ASSESSMENT : evaluated
  PROGRAM_NODE ||--o{ GATE_ASSESSMENT : subject
  PROGRAM ||--o{ BASELINE : versions
  BASELINE ||--o{ BASELINE_ITEM : freezes
  PROGRAM ||--o{ SNAPSHOT : captures
  PROGRAM_NODE ||--o{ EXTERNAL_REFERENCE : links
```

## Schemas propostos
`iam`, `portfolio`, `architecture`, `delivery`, `governance`, `evidence`, `integration`, `reporting`, `audit`.

## Decisões de modelagem
- `program_nodes` permite FK real para relações/dependências tipadas, evitando `type + UUID` solto.
- `deliverable_capabilities` é N:N e tem `contribution_type` (REQUIRED, OPTIONAL, SUPPORTING).
- `baseline_items` guarda dados congelados e hashes/versões, não referencia somente linha mutável.
- `snapshots` incluem `payload`, `formula_version`, `source_as_of`, hash e timestamp.
- `gate_assessments` guarda `gate_version`, `assessment_version`, evidências e aprovador.
- `external_references` tem UNIQUE `(connection_id, external_id, entity_type)`.
- `audit_events` append-only; edição/exclusão por política de retenção, não pelo usuário comum.

## Notas
SQL em `schema.sql` é **referência inicial**, não substitui migrations incrementais, testes de integridade e validação de políticas de acesso.
