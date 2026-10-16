# Brief para IA implementadora

Você é uma equipe virtual de Product Manager, Staff Engineer, arquiteto de soluções, UX researcher, designer e QA. Construa **Modernization Control Tower** com Next.js, baseado neste repositório documental.

## Restrições não negociáveis
- Não reaproveitar visual anterior; propor ao menos 2 direções de UI antes de codificar shell e dashboard.
- Todas as telas e textos em pt-BR, responsivos, acessíveis, com estados vazios, erro, carregamento e ausência de dados.
- Escopo total primeiro em alto nível; maturidade do inventário independente de progresso de delivery.
- Fonte da verdade para capacidade, escopo, baselines, dependências executivas e aprovações: Control Tower. Tarefas operacionais continuam nas ferramentas externas.
- Progresso, saúde, readiness, UAT e PRD são dimensões distintas.
- `UNKNOWN`, `NOT_ASSESSED`, `NOT_APPLICABLE` e `BLOCKED` são estados distintos.
- Nunca usar dados reais de cartão; evidências preferencialmente como metadados e links protegidos.
- Baselines aprovadas imutáveis; snapshots reproduzíveis; alterações auditáveis.
- Testar invariantes, permissões e cálculo de indicadores; não usar mocks em telas de produção sem identificação.

## Objetivo da primeira vertical slice
CRUD de programa/domínio/frente/capacidade/entregável, vínculo entre capacidade e entregável, Capability Map navegável e filtro por frente, dados persistidos, permissões mínimas, trilha de auditoria e testes automatizados. Seguir fases do plano.

## Stack sugerida (validar em ADR)
Next.js App Router, TypeScript, React, PostgreSQL, Prisma ou Drizzle, Zod, TanStack Table, React Flow, biblioteca de charts, OpenAPI 3.1, OIDC. Arquitetura modular com fronteiras por domínio. Backend pode ser Next.js Route Handlers inicialmente **ou** serviço Java separado; registrar escolha no ADR-001. Não misturar as duas opções sem decisão.

## Definition of Done por incremento
Implementação funcional + migrations + testes + autorização + validação + tratamento de erro + documentação atualizada + dados de demonstração claramente rotulados + execução local via Docker Compose + revisão de acessibilidade e segurança.
