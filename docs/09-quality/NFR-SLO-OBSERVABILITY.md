# NFRs e observabilidade

## Metas iniciais propostas (não SLA aprovado)
- Consultas comuns de dashboard: p95 < 3 s no volume de referência a definir.
- Busca/paginação: responsiva em inventário de milhares de entregáveis.
- Importação: processamento assíncrono, status e relatório de erro.
- Availability, RPO/RTO, retenção e backup: definir com TI/Segurança conforme criticidade.
- Suporte a timezone e semanas ISO; locale pt-BR.
- Acessibilidade: WCAG 2.2 AA como alvo.

## Telemetria
- API: request count, latency p50/p95/p99, erros 4xx/5xx, correlação.
- Domínio: mudanças de baseline, gates pendentes, dependências críticas, itens stale, cobertura do inventário.
- Sync: last success, backlog, retries, conflito, tempo de atualização, falhas de auth.
- Jobs: duração de snapshot/report, falhas e duplicidade evitada.
- Auditoria: autor, recurso, ação, resultado e justificativa sem expor segredo.

## Operação
Runbooks para falha de sync, importação parcial, migração, restore, evidência inacessível e job de snapshot. Dashboards de saúde técnica separados da saúde do programa.
