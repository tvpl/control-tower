# PRD — Modernization Control Tower

## Visão
Sistema de registro e análise da modernização da adquirência, combinando **mapa arquitetural**, **escopo**, **delivery**, **dependências**, **readiness** e **report executivo**. Permitir responder: o que está no escopo? o que falta? quem depende de quem? quais gates faltam para UAT/PRD? o que mudou desde a última semana? o que compromete releases?

## Contexto
Programa multi-domínio com canais de cliente (apps, portais, backoffice), camada CAAL/abstração, serviços backend, integrações com fornecedores, eventos e DataLake, infraestrutura, segurança/PCI, observabilidade e operações. Ferramentas e informações distribuídas entre equipes e fornecedores.

## Problemas
1. Escopo fragmentado, cobertura desconhecida e duplicidade de itens.
2. Conclusão técnica confundida com aprovação UAT/PRD.
3. Dependências externas pouco rastreáveis e previsão sem baseline histórica.
4. Reports executivos manuais e não reproduzíveis.
5. Arquitetura transversal sem visão de impacto sobre delivery.

## Usuários
- **Arquiteto geral:** visão de camadas, integrações, decisões, lacunas, impacto, compliance.
- **Líder de frente:** responsável por entregáveis, previsão, riscos, dependências, updates semanais.
- **PMO/coordenação:** baselines, milestones, releases, tendências e reports.
- **Executivo:** saúde, progresso confiável, riscos, decisões e próximos marcos.
- **Aprovador:** valida gates, evidências, exceções conforme alçada.
- **Leitor técnico:** consulta sem editar.

## Escopo P0
- Cadastro programa/domínios/frentes/capacidades/entregáveis e relações N:N.
- Inventário full com estado de maturidade por domínio/capacidade.
- Mapa de capacidades por camada e drill-down.
- Estados separados: escopo, planejamento, execução, estágio, saúde, readiness.
- Baseline/forecast/marcos/releases e comparação.
- Dependências, RAID e decisões com owners, datas e ações.
- Perfis de DoD, avaliação de gates, evidências e exceções.
- Dashboards executivo, por frente, radar arquitetural e relatórios por snapshot.
- Importação CSV/XLSX com prévia e validação.
- RBAC, auditoria, filtros, histórico, exportação.

## P1
- Conectores Jira/ADO/GitHub/Confluence, grafo de impacto, notificações, sincronização e reconciliação.

## P2
- Sumários assistidos por IA com citações internas, simulações e recomendações não-autônomas.

## Fora do escopo
- Substituir Jira/ADO; gerir horas/timesheets; armazenar PAN/CVV; executar CI/CD; certificar PCI automaticamente; IA alterar baselines ou aprovar gates sem humano.

## Requisitos de produto
FR-01 Programa/domínios/frentes. FR-02 Capacidades e critérios de aceite. FR-03 Entregáveis/camadas/componentes. FR-04 Relações e dependências. FR-05 Estados e transições. FR-06 Baselines/forecast/releases. FR-07 RAID/decisões. FR-08 Gates/evidências. FR-09 Dashboards/matriz. FR-10 Snapshots/reports. FR-11 Importação/exportação. FR-12 Proveniência e sincronização mixed. FR-13 RBAC/auditoria. FR-14 Acessibilidade e estados de dado desconhecido.

## Metas propostas (validar baseline real)
- 100% dos domínios e frentes conhecidos cadastrados.
- 100% dos entregáveis comprometidos com owner e vínculo de escopo ou obrigação transversal.
- 100% das dependências críticas com responsável e data necessária.
- 95% dos itens ativos atualizados dentro da cadência acordada.
- 100% dos releases com avaliação de gates obrigatórios.
- Report semanal reproduzível a partir de snapshot.

## Aceite do MVP
- Importar inventário completo em alto nível, sem inferir conclusão de ausências.
- Filtrar programa por domínio/frente/camada/release/owner.
- Navegar do programa até evidência de entregável.
- Identificar lacunas, bloqueios, previsão e desvios de baseline.
- Registrar e auditar gates e decisões.
- Gerar snapshot e report reproduzíveis.

## Dependências de negócio
Validação de taxonomia, owners, alçadas, classificação PCI, critérios de DoD e convenção de pesos por representantes do programa.
