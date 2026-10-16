# Cockpit visual, prioridades e componentes

Evolução atual do workspace: [WORKSPACE-EXPERIENCE.md](WORKSPACE-EXPERIENCE.md). Menu agrupado, contexto com abas, tela de frentes, chips, densidade e percurso nos detalhes compartilham tokens Orange/Grafite/Claro. A navegação móvel usa o mesmo conteúdo dentro de um diálogo Radix.

Pedido de 14/10/2026: sistema interativo, ordem de prioridade editável e visível, design bonito e componentizado. Implementação local sobre Next/React/PostgreSQL; sem publicação ou troca de arquitetura.

## Jornada

Abra **Prioridades** ou **Definir/Revisar prioridades** na visão executiva. Escolha entregáveis/capacidades, filtre por domínio/frente/release ou busca, selecione um item para ver responsável, estado e impacto. Arraste pelo handle no desktop ou use subir/descer/topo. No teclado, espaço pega, setas movem, Enter solta, Escape cancela; Alt+seta também move. No celular, use os controles equivalentes por toque.

Alteração é proposta local até **Salvar prioridades**. Nota é opcional; no celular pode ser aberta por **Nota**. Desfazer reverte a última ação; Restaurar recupera a ordem atual. Rascunho permanece ao navegar entre módulos do mesmo programa e dispara aviso nativo antes de reload; troca de tipo com rascunho fica bloqueada até salvar/restaurar. Trocar programa inicia contexto próprio, sem reaproveitar a ordem de outro programa.

O painel de impacto mostra dependentes impeditivos registrados, sem estimar capacidade/esforço/custo. **Ordenar por impacto** propõe pendentes primeiro, depois maior número de dependentes; empate mantém ordem atual. É reversível e não salva automaticamente. Itens opcionais, gates, escopo, pesos e forecasts mantêm sua semântica original.

As posições são do programa: ao filtrar A, B e C entre outros itens, reordenar altera apenas os slots destes três. A ordem dos ocultos fica intacta. Novos registros aparecem sem prioridade no final; a ordem neutra por código não é apresentada como decisão salva. Leitores, líderes e aprovadores consultam; gestores, arquitetos, PMO e executivos podem reordenar o programa.

## Biblioteca

| Componente                | Responsabilidade                                                          |
| ------------------------- | ------------------------------------------------------------------------- |
| components/ui/Button      | variantes, tamanho, foco e disabled nativos                               |
| WorkspaceNavigation       | navegação ativa, mobile, tema e identidade                                |
| PriorityWorkspace         | composição e integração com contexto/API                                  |
| PriorityIntro             | indicadores reais e introdução da jornada                                 |
| PriorityTabs              | tipo de board e navegação por teclado                                     |
| PriorityRow               | posição, estado, responsável e controles equivalentes                     |
| PriorityFocus             | contexto, dependências, bloqueios e drill-down                            |
| PrioritySaveBar           | nota, undo/reset e confirmação de persistência                            |
| PrioritySummary           | resumo do incremento anterior; ranking agora aparece na árvore do cockpit |
| usePriorityOrder          | rascunho, histórico local, conflito e atualização                         |
| model / domain priorities | projeções, alçada, reordenação filtrada                                   |
| application priorities    | persistência/validação/auditoria/idempotência                             |

Estilos de prioridades isolados por prefixo e arquivo. Tokens de cor/tema e primitives seguem o sistema existente: superfícies neutras e tokens por tema (jade em Grafite/Claro, laranja em Orange), âmbar para risco, bordas leves, tipografia hierárquica, raios 8–14px e espaços 8/12/16/24/32. Sem assets ou placeholders externos. Dark/light, 1440px/390px e contraste axe examinados; não substitui revisão manual integral com leitor de tela.

## Evidência e limites

Migration 008, testes/priorities (7 casos de domínio/PostgreSQL), E2E priorities (2 jornadas) e capturas priorities-desktop/light/mobile. Ranking/audit/outbox são atômicos; stale version e mudança de inventário retornam 409 sem sobrescrever outra decisão. Baseline e estado do entregável ficam preservados, e snapshots congelam a ordem.

Matriz e prioridades usam janela virtual acima de 100 itens e alternativa paginada de 25. Benchmark local com 5.000 entregáveis e jornada de rolagem/paginação estão em TEST-REPORT.md. Carga corporativa continua dependente de homologação; ordenação não constitui aprovação de release.

## Cockpit compacto — refinamento de 14/10

A visão executiva passa a compor gráficos, árvore e grafo no mesmo cockpit. **Macro** mostra o projeto; selecionar uma feature ativa **Micro**, isola suas entregas e atualiza os gráficos. A árvore respeita `parent_id`, permite expandir/recolher individualmente ou tudo e abre o detalhe do entregável. Features são capacidades do modelo existente, sem criar um inventário duplicado. Entregas compartilhadas aparecem em seus vínculos e são deduplicadas no consolidado do projeto. A posição salva de prioridade aparece junto ao código; a edição continua no board compartilhado.

Aceite por contagem tem numerador/denominador explícitos; sem itens, a porcentagem é desconhecida. Não substitui o indicador ponderado por baseline usado nas regras/relatórios. DONE sem aceite aparece separadamente. Distribuição de execução inclui todos os estados do catálogo; barras mostram frente no macro e camada no micro. Prontidão segue a fórmula do servidor: programa completo no macro, obrigações diretas da feature no micro. Filtros de domínio/frente/release/busca recortam entregáveis, rollups e dependências, sem fingir recalcular o catálogo de gates.

O grafo agrupa os vínculos existentes entre features no macro; micro mostra nós reais de entregáveis, incluindo pré-requisitos externos ao recorte, marcados como contexto. Por padrão, só entram itens com dependências, evitando uma rede ilegível de nós isolados. **Sem vínculos** inclui os demais; zoom, pan, fit e **Ampliar** permitem explorar. Clique numa conexão para listar cada dependência cadastrada e abrir seus detalhes. Setas sempre representam pré-requisito → dependente; não inferem relações de contenção ou esforço.

**Observações** abre a lista em modal. Colaboradores podem criar notas no projeto, numa feature ou num entregável, registrar título/corpo e marcar um ponto importante. Autor e gestores podem editar com conferência de versão; leitor consulta. Autoria/contexto permanecem fixos na edição. Migration 009 persiste em PostgreSQL; audit/outbox são atômicos e snapshots congelam as notas. Comentários não alteram escopo, aprovação ou estado operacional. A política permite anotação transversal por contribuidor, sem conceder edição do inventário de outra frente.

**Compartilhar status** abre uma prévia com data da consulta, recorte, contagens, prontidão e pontos selecionados. **Copiar resumo** usa o clipboard; se indisponível, a mensagem oferece seleção manual/download. **Baixar resumo** gera Markdown local. Não há publicação de relatório ou link público implícito. O texto identifica consulta ao vivo e separa execução, aceite e prontidão.

| Componente novo                     | Responsabilidade                                                |
| ----------------------------------- | --------------------------------------------------------------- |
| Overview / cockpit                  | contexto macro/micro, foco, composição e modais                 |
| ProjectExplorer / Progress          | hierarquia, expansão, ranking e rollup de aceite                |
| CockpitCharts                       | anel de aceite, donut de execução e barras por frente/camada    |
| DependencyCanvas / MetricNode       | projeção de vínculos, disposição topológica compacta e inspeção |
| ObservationFeed / ObservationDialog | lista compacta, leitura, criação e revisão contextual           |
| ShareDialog / statusBrief           | seleção de pontos, prévia verificável, copiar e download        |
| application observations            | alçada, validação, versão, idempotência e auditoria             |

Estilos ficam em `cockpit/cockpit.css`, com prefixo próprio e tokens de tema. A fila de prioridades também recebeu menor densidade vertical. Cobertura: testes de hierarquia/dedup/unknown/resumo, observações em PostgreSQL e duas jornadas E2E adicionais. Capturas `cockpit-macro/micro/light/mobile/share.png`. O alcance do benchmark, a integração corporativa e a revisão manual global de acessibilidade estão documentados em TEST-REPORT.md.

## Projetos, frentes, área/squad e janelas ampliadas — 14/10

**Projetos** lista apenas programas acessíveis à identidade atual, com contagens reais de entregáveis, aceites, bloqueios, squads e progressos por frente. O cadastro **Novo projeto** utiliza o recurso programs e concede administração do novo contexto ao criador autorizado. Projeto vazio exibe —, não 0% de um universo inventado. Busca, seletor de projeto e tipo de frente recortam o portfólio; as contagens de cada card são do projeto completo. O card abre uma janela de até 1100px e a seleção de uma frente abre o cockpit do projeto com essa frente aplicada. A barra de filtros de inventário fica oculta no portfólio para não sugerir que o recorte de outro módulo afeta esses totais.

Em **Administração**, cadastre **Frentes**, **Áreas** e **Squads**. Frente aceita nome livre e tipo DEVELOPMENT/BUSINESS/INFRASTRUCTURE/PROVISIONING/SPIKE/OTHER; registros anteriores continuam OTHER, sem inferência de classificação. Área e squad são diretórios por projeto. Squad pode pertencer a uma área. Entregável pode ter squad e/ou área; quando a área explícita está vazia, o filtro usa a área do squad. Área explícita discordante da área do squad é rejeitada no serviço e SQL. Alterar a área do squad também verifica os entregáveis com área explícita já associados.

No cockpit, matriz de capacidades, entregáveis, prioridades e prontidão, combine projeto, domínio, frente, release, área e squad. **Sem área/Sem squad** mostram a ausência real de classificação. Filtro de área restringe as opções de squad compatíveis e limpa a seleção anterior. Um registro deve satisfazer a combinação inteira; não se combina a frente de uma entrega com a área de outra. Prioridades preservam os slots ocultos. Evidências são recortadas pelos nós de entregáveis correspondentes. Módulos globais/históricos e visões sem vínculo organizacional mantêm área/squad desabilitados; não se aplica filtragem fictícia de RAID/decisões/relatórios. Visões salvas persistem os novos recortes no PostgreSQL, por identidade e projeto.

**Ampliar** nos gráficos abre o mesmo indicador em janela maior, com seus entregáveis e drill-down. Clique em um KPI para abrir seu contexto ampliado; o grafo mantém Ampliar. Os painéis de feature/entregável/frente/área/squad têm **Ampliar detalhes**, alternando entre drawer e modal largo. Radix mantém fechamento, scroll e foco. No celular, o modal respeita a largura da tela. A janela larga aparece sem fade para garantir contraste estável desde sua abertura.

Não confundir dimensões: frente é fluxo de trabalho, área é recorte organizacional e squad é equipe. Cadastrar um líder ou atribuir squad não concede papel IAM nem alçada de outra frente; os acessos continuam por programa/frente. Classificação organizacional não muda gates/aceite/compromisso. Migration 010, sete testes adicionais e duas jornadas E2E cobrem isolamento, consistência, filtros, snapshot, cadastro e modais. Componentes novos: ProjectPortfolio/StreamBars, ExpandablePanel e helper de filtros compartilhados. Snapshots congelam áreas/squads e atribuições; nenhuma classificação foi criada pelo seed.

## Tema Orange e densidade progressiva — 15/10

Orange existe apenas no seletor de temas. Nome e título continuam Modernization Control Tower. Layout usa largura útil, síntese laranja, gráficos maiores, grafo de 440px e modais até 1440px, com composição responsiva. `cockpit/intelligence.tsx` compõe síntese/radar/qualidade/histórico/agenda; `insight-model.ts` reutiliza regras de domínio sem números ilustrativos. Prontidão acompanha o recorte. Filtros de camada/owner integram visões salvas e prioridades. Fonte de estilo: ORANGE.md.

`reporting/report-workspace.tsx` compõe preparação, comparação, revisão segregada, publicação interna, JSON e impressão. Conteúdo preservado em reporting.reports. Comparações e exports usam snapshots, sem consultar valores vivos para reconstruir os números. Os controles de impressão são ocultos na mídia print. Governança/HTML/WCAG automatizados são exercitados em E2E; ver REQUIREMENTS-AUDIT.md para o que ainda está pendente.

## Componentes da conclusão

Administração agrega catálogos versionados/DoD, IAM e políticas/saúde técnica. Arquitetura oferece fornecedores e contratos com revisão. Integrações usa status/jobs reais, inbox e resolução de conflitos. Importação compartilha modal de prévia/paginação/erros e detalhes mostram provenance/checkpoint. Reports agora geram PDF servidor por job e consultam snapshots completos sob demanda. Análise usa fontes congeladas, síntese, assistência opt-in e cenário sem mutação.

`useVirtualWindow` limita elementos de matriz/prioridades; paginação oferece leitura por teclado sem depender de itens desmontados. Orange/Grafite/Claro compartilham os mesmos componentes. Novas capturas `completion-*.png` e evidências estão em TEST-REPORT.md.

## Workspace, operação em lote e IA contextual — 16/10

Navegação agrupada e diálogo móvel compartilham 18 destinos. ProjectContext reúne abas, densidade e chips. FrontWorkspace apresenta tipos de frente, responsáveis e percentuais com denominadores explícitos. DataTable preserva ordenação no percurso do detalhe e oferece checkbox de página com estado parcial.

`operations/deliverable-selection.tsx` compartilha seleção entre Entregáveis e Planejamento. `bulk-edit-dialog.tsx` compõe campos explícitos, deslocamento de datas e justificativa. `batch-review.tsx` mostra antes/depois e erros por linha em região rolável acessível. Seleções, preview e confirmação têm limites visíveis; modais compartilham tokens Orange/Grafite/Claro e layout móvel.

`governance/context-agent.tsx` usa o contexto capturado ao abrir, com objetivo, contagens, relatório e downloads. A aba de retorno reutiliza AgentWorkspace sem duplicar o fluxo de importação. IDs únicos e retorno de foco permitem abrir a IA de dentro de um detalhe. `gitlab-batch-links.tsx` oferece lista de correspondências, CSV, busca de destino via RecordPicker e revisão compartilhada; ambiguidades exigem escolha explícita.

Inspeção visual corrigiu encolhimento da lista GitLab após prévia, grade de quatro indicadores e avisos obsoletos após escolha. Regiões roláveis aceitam foco; o fluxo cobre teclado, modais aninhados, Axe e largura móvel. Capturas bulk-review-orange, planning-review-mobile, context-agent-orange/mobile e gitlab-batch-orange/mobile. Resultados: TEST-REPORT.md.

## Gestão à vista — mapa e horizonte

`management/feature-landscape.tsx` compõe FeatureCard, mapa React Flow, MiniMap, mosaico e modais de panorama/vínculos. ExecutionBand e ExecutionOrbit são compartilhados no portfólio e frentes. `project-pulse.tsx` navega entre projetos; `delivery-horizon.tsx` organiza datas em janelas, com cards e modal paginado. A matriz de capacidades oferece alternância para o mesmo mapa. `management.css` compartilha tokens, estados legíveis por texto/cor e composição responsiva.

`shared/management-signals.ts` fornece calendário no fuso do programa, atraso por forecast e contagens deduplicadas à API e UI. `management/model.ts` projeta N:N/descendentes e distingue desvio de baseline. Sem dados comparáveis, o indicador de baseline é indisponível. Features sem entregas preservam denominador desconhecido. Nenhuma migration ou mutação nova. Limites e fluxo: VISUAL-MANAGEMENT.md; resultados: TEST-REPORT.md.

## Panorama agrupado e completude legível

FeatureCard, CompletionMeter, GroupedFeatures e DomainSummary ficam em feature-cards.tsx, com estilos em feature-groups.css. Panorama começa agrupado, com expansão acessível e ordem fixa de execução/aceite. relationship-model.ts projeta grupos no macro e features no micro, mantendo IDs das dependências e disposição em ordem de vínculo. Essa revisão substitui a grade plana e a barra de distribuição dos itens, preservando ExecutionBand para as visualizações que explicitamente mostram distribuição. Guia: FEATURE-READABILITY.md.
