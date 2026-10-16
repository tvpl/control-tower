# Gestão à vista — home e telas de gestão

A Visão executiva agora começa pelo mapa de features. O portfólio, frentes, capacidades e planejamento compartilham sinais e componentes, sem criar estados paralelos de negócio. Orange continua um tema.

## Home: do projeto à entrega

O panorama superior informa quantos projetos a identidade pode consultar e abre o portfólio. Havendo vários projetos, mostra cartões navegáveis com distribuição de execução e contagens; com um único projeto, evita repetir o cabeçalho já visível.

**Mapa vivo do projeto** começa em **Panorama**, tanto no desktop quanto no celular. Domínios (ou situações) são grupos visíveis, com código, título e contagens. As features ficam dentro do grupo; cada item abre seu panorama e as entregas. Os filtros globais continuam delimitando o recorte; busca e filtro de grupo preservam a navegação. Há páginas de até 20 features. Grupos com features sem entregas informam essa lacuna.

**Recolher grupos** oferece leitura macro por domínio; **Expandir grupos** restaura os itens. Cada título também pode ser acionado por teclado para expandir/recolher seu grupo. Execução e aceite permanecem em posições fixas no item. A barra representa exclusivamente DONE / entregas, sem confundir distribuição de estados com completude. Alertas de prazo/bloqueio ficam separados, e não substituem o percentual. Sem entregas não vira 0% conhecido. Execução 100% com aceite pendente é rotulada **Aguardando aceite**.

**Relações** é uma visão distinta. Começa por nós de domínio/situação; selecionar um grupo revela suas features, com **Voltar aos grupos**. As dependências agregam vínculos reais, guardando seus IDs para inspeção. Grupos conectados seguem a ordem das dependências; grupos sem vínculos ficam abaixo. Zoom, minimapa e ampliação continuam disponíveis. Só aparecem conexões entre itens presentes na página; o módulo de dependências preserva exploração completa dos nós técnicos e contexto externo.

Selecionar uma feature abre panorama com execução, aceite, prazo, baseline e cards de entregas. O card da entrega abre o detalhe existente. **Focar nesta feature** recorta a home; **Voltar ao mapa completo** mantém uma saída visível. IA, notas, prioridade, prontidão, radar, árvore e histórico continuam disponíveis.

## Indicadores e datas

- Em andamento: `IN_PROGRESS`. Bloqueadas: `BLOCKED`. Concluídas: `DONE`. Outros estados permanecem separados na distribuição.
- Prazo vencido: forecast anterior ao dia da consulta no fuso do projeto, execução diferente de DONE/CANCELLED. Hoje ainda não venceu. Data ausente não vira atraso conhecido.
- Desvio da baseline: forecast posterior ao forecast congelado da baseline aprovada. É diferente de prazo vencido; ausência de datas comparáveis é exibida como indisponível.
- Percentual de execução: DONE / entregas do recorte. Percentual de aceite: aceitas / entregas do recorte. Ambos por contagem; não substituem progresso ponderado ou prontidão. Sem denominador: —.
- Uma entrega compartilhada pode aparecer em mais de uma feature e em ancestrais. Os totais do projeto deduplicam IDs; não devem ser obtidos somando cards.
- Entregas sem representação nas features do mapa são acessíveis em **Entregas fora do mapa**.

Cor e rótulo trabalham juntos. A situação do card prioriza bloqueio, prazo vencido, andamento, execução integralmente concluída e outros estados. Cards e barras não aprovam aceite, gates ou produção.

## Outras telas

**Projetos** agrega contadores dos projetos autorizados após busca/filtros, distribuição visual de execução e sinais de prazo. Com um projeto, o card aproveita a largura disponível, com frentes e indicadores lado a lado. Abrir uma frente preserva a navegação existente.

**Frentes** acrescenta barra segmentada de execução, contagem de andamento e prazo vencido, preservando percentuais separados de execução e aceite.

**Mapa de capacidades** permite alternar matriz e o mesmo panorama/visão de relações. O mapa reutiliza a mesma projeção e filtros; matriz continua disponível para leitura por camadas e listas grandes.

**Delivery & roadmap** começa com **Horizonte de entregas**: Prazo vencido, Próximos 7 dias (hoje até hoje + 7, inclusive), Mais adiante e Sem previsão. As filas excluem execução DONE/CANCELLED, respeitam o recorte e abrem detalhes. Quatro cartões por janela; **Ver todas** abre modal paginado de 25. Timeline, baseline e edição em lote permanecem abaixo.

## Implementação e verificação

`management-signals.ts` compartilha datas e contagens entre API de projetos e UI. `management/model.ts` deduplica e projeta features/descendentes. FeatureLandscape, ExecutionOrbit, ExecutionBand, ProjectPulse e DeliveryHorizon usam tokens dos três temas e componentes de modal existentes. Nenhuma migration, seed ou nova mutação de inventário.

Cobertura: `visual-management.test.ts`, extensão de `project-organization.test.ts` e jornada `visual-management.ts` dentro do E2E cockpit. Inclui calendário/fuso, desconhecidos, cancelamento, DONE sem aceite, N:N/descendentes, baseline distinta de atraso, filtros, busca, modais, ampliação, foco/retorno, vínculo, mosaico/mobile, portfólio e alternância matriz/mapa. Resultados e limites da rodada: TEST-REPORT.md.
