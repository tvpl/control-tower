# Estratégia de testes e qualidade

## Pirâmide
- Unitários: agregação de progresso, saúde, readiness, transições, permissão e impacto.
- Integração: PostgreSQL real via Testcontainers/Docker; migrations, constraints, isolamento por programa, audit/outbox.
- Contrato: OpenAPI schemas, responses, erros, ETag, idempotência.
- E2E: jornadas arquiteto/líder/executivo/aprovador, importação, drill-down e relatório.
- Segurança: RBAC negativo, IDOR, CSRF conforme auth, upload malicioso, rate limit, secrets.
- Performance: matriz grande com virtualização; consultas indexadas; carga de report e sincronização.
- Acessibilidade: teclado, foco, contraste, leitores de tela, tabelas complexas.

## Casos de risco obrigatório
1. Gate pendente não aprova release.
2. N/A não é inferido automaticamente.
3. Entregável compartilhado não conta duas vezes.
4. Snapshot e baseline aprovados não mudam com PATCH posterior.
5. Leader não edita entregável de outra frente.
6. Conector stale não marca progresso como concluído.
7. Conflito de sincronização não sobrescreve decisão gerencial.
8. Dependência circular impeditiva gera alerta.
9. Exceção expirada invalida readiness.
10. Repetição de POST idempotente não duplica snapshot.
11. Importação com erro faz rollback ou rejeita linhas de acordo com política explícita.
12. Comparação de KPI mantém versão da fórmula.

## Critérios de pipeline
Lint, typecheck, unit, integration, contract, e2e smoke, dependency scan, migration check e build; bloquear merge em falha crítica.
