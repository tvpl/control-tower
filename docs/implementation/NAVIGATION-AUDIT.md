# Revisão de navegação e telas

O workspace usa URLs `/?view=...&program=...`, com seção e filtros quando aplicáveis. Trocar de módulo registra histórico; voltar/avançar restaura tela, projeto, seção e filtros. Recarga mantém o destino. Tela inexistente apresenta um estado explícito, sem fingir que é a visão executiva.

| Menu | Conteúdo esperado |
| --- | --- |
| Visão executiva | Cockpit macro/micro, features, indicadores, gráficos, grafo, observações |
| Projetos | Portfólio, frentes, filtros, expansão; abrir cockpit ou entregáveis da frente |
| Frentes do projeto | Visão dedicada por frente, execução e aceite distintos, liderança, bloqueios e entregas filtradas |
| Mapa de capacidades | Árvore/matriz de features e seus entregáveis |
| Arquitetura | Sistemas, relações, contratos e grafo |
| Entregáveis | Inventário filtrável, edição, importação CSV/XLSX e exportação |
| Delivery & roadmap | Releases, marcos, previsões, baseline e revisões |
| Prioridades | Ordem por programa/frente, arraste, teclado, persistência |
| Change control | Proposta, impacto, revisão e aplicação de escopo |
| Dependências & RAID | Seções próprias de dependências/grafo, RAID e decisões |
| Readiness & gates | Aplicabilidade, gates, avaliações e bloqueios |
| Evidências | Comprovação e vínculos com registros |
| Relatórios | Snapshots, relatórios, revisão/publicação, comparativos e PDF |
| Análise e cenários | Diagnóstico, hipóteses e análise assistida com fontes |
| Trabalhar com IA | Contexto, relatório, prompt/checklist, templates e prévia/commit |
| Integrações | Configuração, teste, sync, inbox, vínculos, conflitos e tutorial GitLab |
| Auditoria | Histórico de alterações |
| Administração | Seções Estrutura, Acessos, Catálogos/DoD, Políticas e Operação |

## Correções concretas

- Histórico deixava apenas o último destino; agora usa pushState e restaura popstate.
- Submenus e filtros passam a integrar o endereço. Aliases `raid`, `decisions`, `contracts` e `suppliers` abrem a seção correta.
- Clicar em uma frente no portfólio abre seus entregáveis; “Abrir cockpit” continua sendo a entrada explícita para a visão executiva do projeto.
- “Novo registro” em Análise/Readiness criava entregável fora de contexto; ações de criação foram limitadas aos módulos pertinentes. Integrações usa “Nova conexão”.
- Administração acumulava todos os painéis em uma página longa; agora cada seção é selecionável e pode ser compartilhada por URL.
- O seletor de vínculo externo repetia o primeiro nó; agora mostra os registros correspondentes. A abertura de vínculo começa em referência para tornar a delegação explícita.
- A navegação lateral permite rolagem em telas baixas/mobile, mantendo os 18 destinos acessíveis. Menu agrupado com nomes, recolhimento persistido e diálogo móvel substitui a dependência de ícones isolados.
- Painéis de IA têm grade de três passos, prévia compacta com nomes das referências, relatório em modal amplo e layout móvel. O rótulo do editor permanece separado do conteúdo JSON após preenchimento.

A validação automatizada de navegador cobre os 18 destinos, histórico, recarga, destino inexistente, alias RAID, modais, temas e responsividade; os fluxos existentes continuam exercitando edição, expansão, gráficos, filtros, notas, priorização e governança. Não há redirecionamento genérico para home para encobrir uma tela ausente.

O contexto do projeto e suas sete abas preservam projeto/filtros ao trocar de visão. Chips mantêm o recorte legível com os campos recolhidos. A nova tela de frentes permite abrir detalhes ou seus entregáveis; detalhes de tabela percorrem a ordenação corrente. Comportamentos e limites: [WORKSPACE-EXPERIENCE.md](WORKSPACE-EXPERIENCE.md).
