# Workspace do projeto — evolução completa

Esta etapa melhora orientação, leitura e navegação do sistema existente. Não altera o modelo de governança, permissões, fórmulas ou banco de dados. Orange continua sendo apenas um tema.

## Navegação e contexto

O menu reúne 18 destinos em Projetos, Execução, Governança e Ferramentas. Exibe ícone e nome no desktop; pode ser recolhido para ampliar a área de trabalho. A preferência é guardada no navegador. No modo automático, telas intermediárias usam a versão compacta. No celular, um diálogo com rolagem contém os mesmos destinos, com foco contido, Escape para fechar e retorno ao botão de abertura.

O projeto ativo permanece visível com código, nome, quantidade de entregas, proporção de aceites confirmados e quantidade de frentes. Esses totais são do projeto completo; o recorte filtrado aparece separadamente. Sem entregas, a proporção é desconhecida (—).

As abas Resumo, Frentes, Features, Entregas, Planejamento, Prontidão e Atividade abrem visões reais do projeto. Links preservam projeto e filtros na URL; o menu mantém acesso aos demais módulos de cada grupo. Histórico, recarga e links diretos continuam suportados.

## Frentes do projeto

A nova tela `/?view=fronts` apresenta cards com tipo, código, liderança, execução concluída, aceite confirmado e bloqueios. Desenvolvimento, Negócio, Infraestrutura, Provisionamento, Spike e Outro usam o cadastro existente, com nome livre.

Execução = entregas DONE / entregas do recorte da frente. Aceite = entregas aceitas / entregas do mesmo recorte. São contagens distintas; DONE não concede aceite. Sem entregas, mostra — e informa a ausência de itens. Não substitui o avanço ponderado por baseline nem calcula prontidão a partir desses percentuais.

O título abre o detalhe da frente. **Ver entregas** abre o inventário com aquela frente aplicada e mantém os outros filtros. **Nova frente** abre o formulário correto, sujeito às mesmas permissões do cadastro administrativo. Não concede papéis ao líder selecionado.

## Filtros, densidade e detalhes

Filtros ativos aparecem como chips, com o nome do registro e remoção individual ou limpeza total. Continuam visíveis ao recolher os campos. A quantidade exibida informa entregas no recorte / total do projeto. Projeto, domínio, frente, release, área, squad, camada, responsável e busca mantêm a semântica existente; módulos sem vínculo organizacional não recebem um recorte fictício.

Densidades Compacta e Confortável ajustam espaçamento de cards, tabelas e componentes do workspace. A preferência é local ao navegador. A opção não muda a quantidade ou o conteúdo dos registros.

O painel de detalhes permite percorrer registro anterior/próximo dentro do contexto aberto. Em tabelas, respeita a ordenação selecionada, inclusive entre páginas. A posição informa o universo do recorte; os controles ficam desabilitados nos extremos. A ampliação para modal largo permanece disponível.

## Componentes e verificação

- `workspace-navigation.tsx`: grupos, modos do menu, identidade e diálogo móvel.
- `projects/project-context.tsx`: contexto, abas, densidade e chips de filtro.
- `projects/front-workspace.tsx`: composição visual das frentes e ações contextuais.
- `workspace.css`: estilos compartilhados e responsividade por tema.
- `detail.tsx` / `data-table.tsx`: percurso de registros na ordem visível.

O fluxo E2E verifica persistência do menu/densidade, nomes visíveis em Orange, abas, denominador de aceite, formulário de frente, filtro por frente com recarga, remoção de chips, percurso ordenado, ampliação, 18 destinos no celular, acesso ao fim do menu com retorno às frentes, retorno de foco, limites de conteúdo dos cards e Axe em Orange/Grafite/mobile. Capturas: workspace-fronts-orange/dark/mobile e workspace-navigation-mobile. Evidências e resultados finais: [TEST-REPORT.md](TEST-REPORT.md).

## Etapas 2 e 3 — operação e contexto

**Entregáveis** agora permite seleção por página ou recorte, edição de vários campos com prévia e confirmação atômica. **Planejar datas** define ou desloca forecasts; **Delivery & roadmap** inclui filas de lacunas de planejamento. Fluxo, limites e API: [BULK-OPERATIONS.md](BULK-OPERATIONS.md).

**IA desta visão**, **IA deste registro** e **IA da seleção** preparam pacotes com foco, contagens, checklist, relatório, prompt e template. O catálogo completo autorizado permanece como referência; o template se concentra no foco. O retorno é importado no mesmo modal com prévia/versionamento, reutilizando o fluxo de IA existente. [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md).

**Vincular em lote** em uma conexão GitLab usa itens recebidos ou CSV. A escolha de destino tem busca; sugestões usam marcadores explícitos, sem resolver ambiguidades automaticamente. A confirmação é atômica e protege versões de conexão e vínculos. Tutorial e API: [GITLAB-GUIDE.md](GITLAB-GUIDE.md).

As três etapas de implementação da evolução estão presentes. Credenciais, conta GitLab e gateway/modelo real continuam sendo configuração/homologação externa, conforme [OPEN-ISSUES.md](OPEN-ISSUES.md). Resultados finais da validação estão em [TEST-REPORT.md](TEST-REPORT.md).

## Gestão à vista — home e telas de gestão

A home começa pelo mapa vivo de features, com sinais de andamento, prazo vencido, bloqueio e execução concluída. Mapa/mosaico, zoom/minimapa/ampliação, filtros por domínio/situação, inspeção de vínculos e panorama de feature com entregas tornam a navegação visual. Portfólio/frentes mostram distribuição de execução; capacidades alterna matriz/mapa; planejamento ganha horizonte de prazos. Indicadores anteriores continuam abaixo do mapa. Regras e limites: [VISUAL-MANAGEMENT.md](VISUAL-MANAGEMENT.md).

## Revisão da leitura — Panorama e Relações

Panorama substitui a grade plana como entrada inicial, com domínio/situação → feature → entrega e recolhimento de grupos. A barra do item representa somente conclusão; aceite e alertas têm lugar fixo. Relações abre pelos grupos e aprofunda em features. Grupos indicam features sem entregas e os totais deduplicam N:N. Esse comportamento substitui a apresentação anterior de mapa/mosaico plano descrita nos checkpoints históricos. Guia atual: FEATURE-READABILITY.md.
