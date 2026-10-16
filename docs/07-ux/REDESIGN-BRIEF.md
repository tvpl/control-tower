# UX/UI — Redesign obrigatório do zero

## Contexto
O usuário **não gostou do layout anterior**. Não reutilizar o visual anterior nem tratar os screenshots demonstrativos como referência estética. O objetivo é construir um cockpit contemporâneo, autoral, de alta densidade informacional, que funcione em reunião executiva e no trabalho diário do arquiteto.

## Antes de codificar UI
1. Propor **2–3 direções visuais realmente diferentes** (ex.: spatial architecture canvas, editorial enterprise intelligence, command center minimal), com moodboard textual, hierarquia e trade-offs.
2. Mostrar wireframes low-fidelity das 6 telas prioritárias; validar organização e fluxos.
3. Definir tokens (cores, tipografia, espaçamento, elevação, grid), estados e componentes; validar acessibilidade.
4. Só então implementar design system e telas.

## Diretrizes
- Evitar aparência de dashboard genérico com 4 cartões enormes e sidebar convencional como solução automática.
- O **Capability Map** é centro do produto: visão de arquitetura e entrega navegável, não apenas tabela estática.
- Usar densidade progressiva: executivo vê síntese; arquiteto navega relações; líder edita entregáveis.
- Legenda clara de estados; nunca depender só de cor; mostrar `desconhecido`, `não avaliado` e `N/A` de modo inequívoco.
- Layout desktop-first com versão responsiva utilizável; navegação por teclado; contraste WCAG AA.
- Microinterações úteis (hover de dependência, seleção, foco, drill-down), sem animações decorativas que prejudiquem leitura.
- Data freshness, fontes e confiança sempre visíveis nos KPIs.
- Tipografia legível em português; boa hierarquia, pouco ruído e espaço para observações longas.

## Critérios de avaliação
1. Em 10 segundos, executivo identifica risco principal e decisão pendente.
2. Em 3 cliques, arquiteto encontra a evidência de um bloqueio em uma capacidade.
3. Líder atualiza forecast e justificativa sem perder contexto.
4. Diferença entre `concluído`, `UAT`, `PRD`, `N/A` e `desconhecido` é evidente.
5. Uma matriz com centenas de linhas continua navegável (virtualização, filtros, sticky headers).

## Entregáveis de design
Mapa de navegação, protótipos desktop/mobile, design tokens, biblioteca de componentes, interações e especificação de estados vazios/erro/loading.
