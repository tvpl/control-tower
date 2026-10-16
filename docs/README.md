# Modernization Control Tower — Documentação para implementação com IA

**Versão da especificação:** 1.0 | **Data:** 2026-10-13 | **Idioma:** pt-BR | **Status:** baseline proposta, sujeita a validação.

## Implementação local — checkpoint 15/10/2026

Os blocos do plano foram implementados e verificados localmente: 20 migrations, 140 testes/22 arquivos, 12 jornadas E2E e build aprovados. A especificação abaixo permanece como fonte normativa; o estado executável e as homologações externas estão em [rastreabilidade](implementation/REQUIREMENTS-AUDIT.md), [relatório de testes](implementation/TEST-REPORT.md), [contrato implementado](implementation/API-IMPLEMENTED.md) e [operação](implementation/OPERATIONS.md).

## Propósito

Plataforma híbrida de **Architecture + Scope + Delivery + Readiness + Executive Intelligence** para modernização enterprise de adquirência. A ferramenta **não substitui Jira/Azure DevOps**: consolida a visão de escopo, arquitetura, dependências, compromissos, evidências, readiness e reports.

## Decisões confirmadas

1. **Operação mixed:** Jira, Azure DevOps e outras ferramentas podem coexistir; adaptadores desacoplados e proveniência obrigatória.
2. **Abrangência full:** cadastrar todo o programa em alto nível desde o início, aprofundando por domínio progressivamente; desconhecido ≠ concluído.
3. **Atualização por leaders:** líderes de frente são responsáveis por dados de gestão; arquitetos atuam transversalmente; aprovações por alçada.
4. **Layout anterior rejeitado:** NÃO reproduzir sidebar azul-escura + cartões convencionais das prévias anteriores. O novo design é um trabalho de descoberta e experimentação, com critérios descritos em `07-ux/`.

## Como usar este pacote

1. Leia `00-start-here/AI-BUILD-BRIEF.md` e `01-product/PRD.md`.
2. Leia `02-domain/`, `03-architecture/`, `04-data/`, `05-api/` antes de escrever código.
3. Leia `06-experience/`, `07-ux/`, `08-delivery/` e `09-quality/`.
4. Comece pela **vertical slice** proposta em `10-ai-prompts/01-IMPLEMENTATION-PLAN.md`.
5. Não invente dados reais do programa; os exemplos em `examples/` são **fictícios**.

## Estrutura

- `00-start-here/` — orientação, decisões e escopo de implementação
- `01-product/` — PRD, personas, métricas e não objetivos
- `02-domain/` — taxonomia, regras de negócio, estados, eventos
- `03-architecture/` — arquitetura técnica, ADRs, integrações e segurança
- `04-data/` — ERD, SQL relacional, política de dados
- `05-api/` — OpenAPI 3.1, contratos, exemplos
- `06-experience/` — funcionalidades, dashboards e relatórios
- `07-ux/` — briefing de redesign e wireframes agnósticos
- `08-delivery/` — épicos, histórias, milestones, backlog
- `09-quality/` — DoD, QA, testes e NFRs
- `10-ai-prompts/` — prompts e execução incremental para agentes
- `examples/` — dados sintéticos de referência

## Observações

Este pacote é uma especificação de produto/engenharia, **não** código de produção. Regras PCI, retenção, RBAC e thresholds de SLA requerem validação corporativa. Exemplos de fornecedores (ACI/RS2 Postilion, Bankworks, GER7, DEJA, ACI Gateway) são contexto de mapeamento, não contratos confirmados. Evitar armazenamento de dados sensíveis de pagamento.
