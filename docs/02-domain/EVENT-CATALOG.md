# Catálogo de eventos internos

Envelope: `eventId`, `eventType`, `schemaVersion`, `aggregateId`, `programId`, `occurredAt`, `actorId`, `correlationId`, `payload`.

- `ProgramCreated`
- `CapabilityCreated`, `CapabilityScopeChanged`
- `DeliverableCreated`, `DeliverableStatusChanged`, `DeliverableForecastChanged`
- `DependencyCreated`, `DependencyBlocked`, `DependencyResolved`
- `BaselineProposed`, `BaselineApproved`
- `GateAssessmentChanged`, `GateExceptionApproved`, `GateExceptionExpired`
- `ReleaseReadinessChanged`, `ReleaseApproved`
- `SnapshotCreated`, `ReportPublished`
- `ExternalSyncCompleted`, `ExternalSyncFailed`, `ExternalConflictDetected`

Usar outbox transacional para publicação e inbox idempotente nos consumidores; processamento **at-least-once** com deduplicação. Não prometer exactly-once end-to-end.
