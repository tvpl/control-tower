# Máquinas de estado

## Dimensões separadas
1. `scopeStatus`: PROPOSED → APPROVED → CHANGED / EXCLUDED (mudanças aprovadas e versionadas).
2. `planningStatus`: BACKLOG → PLANNED → COMMITTED → REPLANNED.
3. `executionStatus`: NOT_STARTED → IN_PROGRESS → DONE; alternativas BLOCKED, ON_HOLD, CANCELLED, REOPENED (BLOCKED pode ser flag/condição paralela em implementação).
4. `deliveryStage`: IDENTIFIED → SPECIFICATION → DEVELOPMENT → SIT → UAT → PRODUCTION. Fluxos por tipo; salto exige motivo e permissão.
5. `readinessStatus`: NOT_ASSESSED, PENDING, PASSED, FAILED, NOT_APPLICABLE, EXCEPTION_APPROVED.
6. `health`: UNKNOWN, ON_TRACK, AT_RISK, CRITICAL; **derivado**, com override justificado.
7. `inventoryMaturity`: IDENTIFIED → STRUCTURED → VALIDATED → GOVERNED.

## Transições protegidas
- Para `UAT`: SIT conforme perfil e evidência de teste.
- Para `PRODUCTION`: UAT aprovado + gates bloqueantes satisfeitos + release autorizado.
- Para `EXCLUDED`: change request aprovada, motivo e impacto.
- Para `EXCEPTION_APPROVED`: aprovador autorizado, prazo de expiração e aceitação explícita do risco.
- `REOPENED`: motivo obrigatório e evento de auditoria.

## Regras de agregação
Uma capacidade tem readiness `PASSED` apenas se todos os entregáveis **obrigatórios** vinculados satisfazem os gates aplicáveis e critérios de aceite. Componentes compartilhados contam uma única vez nos totais do programa, evitando dupla contagem.
