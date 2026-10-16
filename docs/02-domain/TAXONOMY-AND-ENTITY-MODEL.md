# Linguagem de domínio e taxonomia

## Entidades
- **Program:** contexto máximo e governança.
- **Domain:** agrupamento funcional (ex. Autorização, Liquidação, Conciliação).
- **Workstream:** unidade de execução e accountability; cruza domínios.
- **Capability:** comportamento de negócio esperado, com aceite e criticidade; pode ter subcapacidade.
- **Deliverable:** compromisso verificável (API, UI, contrato, infra, evento, teste, documentação, operação).
- **Component:** sistema/serviço/artefato reutilizável.
- **Integration Contract:** interface entre componentes/fornecedores; owner, versão, SLA, protocolo.
- **Release:** conjunto versionado de entregáveis para implantação.
- **Milestone:** marco temporal com baseline/forecast/real.
- **Dependency:** pré-requisito tipado entre nós do programa, com criticidade e data.
- **RAID:** risk, assumption, issue, dependency/action (usar categorias consistentes e evitar duplicar dependência estruturada).
- **Gate Definition/Profile/Assessment:** critério, aplicabilidade, avaliação, evidência e alçada.
- **Evidence:** URL/arquivo/metadados de comprovação; sensibilidade e validade.
- **Decision:** decisão registrada com alternativas, justificativa e aprovador.
- **Baseline:** compromisso aprovado e imutável.
- **Snapshot:** estado observado no instante, imutável.
- **External Reference:** mapeamento para ferramenta externa e fonte de verdade por campo.

## Camadas sugeridas
`CLIENT`, `CAAL`, `BACKEND`, `PARTNER`, `DATA`, `INFRA`, `SECURITY`, `OPERATIONS`, `QUALITY`. O catálogo deve ser configurável; DoD é avaliação transversal, não uma camada de execução obrigatória.

## Taxonomia inicial (validar)
Autorização; Credenciamento/Cadastro; Captura/Terminais; Liquidação; Conciliação; Canais/Portais; Dados; Infra/Plataforma; Segurança/PCI; Operações. ACI/RS2 Postilion, Bankworks, GER7 POS7/TMS7/RDS7, DEJA SDK TOP on Phone e ACI Gateway são referências contextuais a cadastrar após validação.

## Invariantes
- Entregável comprometido exige owner, critério de aceite e ao menos vínculo de capacidade **ou** obrigação transversal explicitamente tipada.
- Capacidade pertence a domínio; workstream pode servir múltiplos domínios.
- Relações cruzadas não duplicam componentes ou entregáveis.
- Nós relacionados devem pertencer ao mesmo programa, exceto dependência externa formalmente identificada.
- Dados desconhecidos nunca equivalem a N/A ou sucesso.
- Baseline aprovada é imutável; mudança cria nova versão e evento de aprovação.
