# Regras de negócio (catálogo normativo)

| ID | Regra | Verificação |
|---|---|---|
| BR-001 | Entregável comprometido tem owner, aceite, camada e vínculo | validação no commit |
| BR-002 | Capacidade pronta somente com entregáveis obrigatórios aceitos e gates satisfeitos | projeção de readiness |
| BR-003 | `DONE` de execução não implica UAT ou PRD | estados independentes |
| BR-004 | Bloqueio crítico impacta saúde dos dependentes | cálculo transitivo com ciclo detectado |
| BR-005 | Baseline aprovada não pode ser alterada in-place | versionamento + RBAC |
| BR-006 | Gate obrigatório pendente impede aprovação de release | policy engine |
| BR-007 | N/A requer justificativa; exceção exige alçada, expiração e risco | workflow de aprovação |
| BR-008 | Evidência registra origem, versão, autor, timestamp, classificação | validação e auditoria |
| BR-009 | Campo sincronizado tem `source`, `sourceUpdatedAt` e owner | proveniência |
| BR-010 | Dependência impeditiva circular gera erro/alerta | DFS ou topological check |
| BR-011 | RAID crítico exige owner, plano de ação, prazo | validação |
| BR-012 | Mudança de escopo gera impacto e decisão quando compromete baseline | workflow |
| BR-013 | Indicador calculado documenta denominador e universo de escopo | testes de métrica |
| BR-014 | Item sem atualização reduz confiança, não vira verde por omissão | score freshness |
| BR-015 | Histórico registra ator, valor anterior/novo, motivo e correlação | append-only audit |
| BR-016 | Exceção expirada deixa de satisfazer gate | recalcular readiness |
| BR-017 | Sync externa nunca sobrescreve baseline/decisão gerencial | ownership de campo |
| BR-018 | Snapshot mantém dados e versão da fórmula de KPIs | reproduzibilidade |
| BR-019 | Releases são bloqueados por gates impeditivos, salvo exceção autorizada | policy engine |
| BR-020 | Aprovação por alçada separada da edição do entregável | autorização contextual |

## Semântica de progresso
- Execução: usar marcos aceitos e pesos congelados por baseline; sem pesos, exibir contagem e marcar indicador provisório.
- Prontidão: gates obrigatórios aplicáveis aprovados / total de gates obrigatórios aplicáveis, **mas** percentual alto não substitui decisão binária de bloqueio.
- Cobertura: capacidades inventariadas / universo estimado; o denominador precisa ter origem.
- Qualidade do inventário: completude de owners, aceites, vínculos, camada, atualização e evidências, separada do progresso.
- Saúde: regra configurável de atraso, bloqueio, gate, criticidade e frescor, com transparência e justificativa de override.

## Conflitos de atualização
Atributos gerenciais são da Control Tower; atributos operacionais podem vir da ferramenta externa. Em caso de divergência, criar aviso e trilha de reconciliação, sem merge silencioso.
