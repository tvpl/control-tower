# Dicionário e invariantes de dados

| Entidade | Campos relevantes | Observações |
|---|---|---|
| Program | code, name, sponsor, status, version | contexto de isolamento |
| Domain | program, code, owner | pertence a um programa |
| Workstream | program, code, lead | executa em múltiplos domínios |
| Capability | domain, parent, scopeStatus, criticality, inventoryMaturity, acceptanceCriteria | pode ter hierarquia |
| Deliverable | workstream, layer, type, owner, executionStatus, deliveryStage, forecast, weight, version | aceitação verificável |
| Component | program, kind, supplier, owner | reutilizável |
| Dependency | sourceNode, targetNode, type, criticality, neededBy, status | grafo dirigido |
| Milestone | release, baselineDate, forecastDate, actualDate | não sobrescrever baseline |
| Release | program, code, status, dates | N:N com deliverables |
| Gate | profile, applicability, severity, approverRole | versão do critério |
| Assessment | subject, gate, result, evidence, approver, assessedAt | auditável |
| RAID | kind, owner, action, dueDate, severity | registro gerencial |
| Baseline | version, approvedAt, approvedBy | imutável |
| Snapshot | asOf, formulaVersion, payloadHash | imutável |
| ExternalReference | connection, externalId, lastSyncedAt, provenance | sem duplicação |

## Política de datas
Persistir instantes em UTC (`timestamptz`), datas de marcos como `date`, e apresentar semanas ISO com timezone de programa configurável. Previsão não é baseline. Campos `actualDate` somente com evidência/evento de conclusão.

## Pesos
Sem peso aprovado, progresso é provisório; peso > 0; mudanças em peso após baseline exigem change control; componentes compartilhados não devem ser contados em dobro.
