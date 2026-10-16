# Decisões e pontos em aberto

## Decidido
- Ferramentas de operação: **mixed**.
- Cobertura inicial: **full**, com aprofundamento progressivo.
- Atualização de status: **leaders**.
- Produto: plataforma híbrida, não gerenciador de subtarefas.
- Rejeitado: layout visual da primeira demonstração.

## Decisões a validar (não bloquear inventário inicial)
| ID | Questão | Proposta provisória | Impacto |
|---|---|---|---|
| OQ-01 | Stack do backend | Next.js API modular inicialmente; avaliar Java separado | deploy/contratos |
| OQ-02 | Provedor OIDC | Integrar provedor corporativo configurável | segurança |
| OQ-03 | Jira/ADO | Implementar conectores separadamente, após definir credenciais e campos | sincronização |
| OQ-04 | Pesos de progresso | Definidos por entregável e congelados por baseline | indicadores |
| OQ-05 | SLA de atualização | Semanal como padrão configurável | frescor |
| OQ-06 | Alçada de aprovação | Matriz por gate, domínio e programa | compliance |
| OQ-07 | Releases | Modelo ondas/releases com entregáveis N:N | delivery |
| OQ-08 | Retenção de auditoria | Política corporativa | custo/compliance |
| OQ-09 | Identidade de fornecedores | Catálogo validado por arquitetura | governança |

## Política para IA
Nunca transformar proposta provisória em requisito aprovado sem indicar a hipótese e solicitar validação em checkpoint de arquitetura.
