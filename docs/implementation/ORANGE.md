# Orange — tema visual

**Orange é somente uma opção de tema. O produto continua Modernization Control Tower.** Esta definição substitui a identidade/tela Orange do checkpoint anterior, conforme correção explícita do usuário em 15/10.

## Acesso e identidade

Selecione **Tema visual → Orange**, inclusive no celular. Grafite e Claro continuam disponíveis. Título da janela, wordmark, navegação e rodapé preservam o nome do sistema. Não existe item de navegação ou página chamada Orange. O antigo `view=orange` é aceito como compatibilidade e abre a visão executiva no tema Orange. A preferência fica em `mct-theme`; a escrita aguarda a restauração inicial, evitando que o render inicial sobrescreva a escolha salva.

## Direção e componentes

Laranja aparece na faixa de síntese, barra superior, navegação ativa, progresso, cabeçalhos e ações. A barra lateral de 78px libera largura para o conteúdo. Desktop usa toda a largura disponível, gráficos maiores (200px de conteúdo), exploração hierárquica e grafo de 440px; modais amplos chegam a 1440px. No celular a composição vira uma coluna, preservando botões, seleção de tema, filtros e ampliação.

Tokens: fundo #f7f5f2, superfície branca, texto #272321, secundário #56504b, auxiliar #70665f; ação #b33d00, realce #ed6200, síntese #ff791c com texto escuro; navegação #33251e. Bloqueio #ba2941, aviso #975400 e prontidão #285c9b mantêm significados distintos. Estados têm rótulos e contagens além da cor. Componentes de negócio são compartilhados, sem duplicar regras.

## Novos painéis

- Pulso do projeto: avanço ponderado pela baseline ou contagem explicitamente provisória, bloqueio principal e decisão pendente.
- Aceite, prontidão do recorte, bloqueios, execução, frentes/camadas e hierarquia expansível.
- Radar com drill-down: execução, gates impeditivos, drift da baseline, owner, forecast, aceite, evidências, freshness e vínculos de escopo.
- Qualidade: sete critérios por entregável, mesma fórmula de domínio.
- Evolução de aceites: snapshots existentes, coorte fixa de IDs do recorte atual, tabela acessível; fórmula diferente ou registro ausente não vira zero/comparação inventada.
- Agenda de governança: decisões, marcos e riscos do programa, alcance explicitamente separado dos filtros de entregáveis.
- Observações e status continuam editáveis/compartilháveis por modal, com persistência e alçadas.

Filtros de camada e responsável foram adicionados aos filtros de projeto/domínio/frente/release/área/squad e às visões salvas. Controles sem aplicação no módulo ficam desabilitados; arquitetura usa domínio e roadmap usa release. Não se afirma uniformidade completa ou suporte a milhares antes das pendências de consultas/virtualização.

## Verificação

`tests/e2e/orange.spec.ts` verifica identidade do sistema, ausência de navegação Orange, escolha e persistência do tema, contagens vs API, responsável/frente, prontidão no recorte, radar/modal, prioridades, mobile 390px e axe desktop/modal/mobile. `tests/dashboard-intelligence.test.ts` verifica pesos congelados, denominadores, filtros, drift, gates obsoletos e comparação histórica. Capturas do inventário fictício isolado: orange-desktop.png, orange-mobile.png e orange-expanded.png.
