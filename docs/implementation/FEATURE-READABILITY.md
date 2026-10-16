# Leitura do projeto: domínio → feature → entrega

A revisão substitui a grade plana de features por um panorama hierárquico. Os sinais e percentuais de negócio continuam usando as mesmas fontes.

## Panorama inicial

Cada domínio aparece em um bloco com código, nome, número de features e entregas únicas. Dentro dele, a feature mantém uma ordem fixa: código/situação, nome, execução (percentual e fração), barra de conclusão e aceite confirmado. Alertas ficam separados dos percentuais.

A barra anterior mostrava distribuição de execução: podia estar quase totalmente colorida com 0% concluído. Agora a barra de cada feature mostra somente DONE/total. Sem entregas, não aparece percentual; a feature recebe uma indicação de que precisa de entregas vinculadas. Grupos sinalizam essa lacuna. DONE completo com aceite pendente recebe “Aguardando aceite”; aceite completo recebe “Aceite concluído”, sem afirmar prontidão ou produção.

Grupos podem ser recolhidos individualmente ou em conjunto, inclusive por teclado. O recorte, busca, seleção de grupo e paginação são preservados. Não se obtêm totais somando features N:N: a contagem do grupo deduplica IDs. Um domínio com todas as entregas conhecidas concluídas ainda pode ter features sem entregas; a lacuna permanece visível.

## Relações sob demanda

A visão Relações começa nos grupos. Selecionar um deles revela as features; “Voltar aos grupos” retorna ao macro. Setas agregam somente dependências reais, com IDs disponíveis para consulta. Hierarquia é tracejada e aparece no nível de features. Os grupos conectados são posicionados na ordem das dependências; os demais ficam abaixo. Agregações com ciclos têm disposição limitada, sem travar o cálculo; um ciclo entre grupos não prova ciclo entre features.

A ampliação funciona para as duas apresentações. O mesmo componente atende home e alternativa visual da matriz de capacidades. Não há nova mutação, migration ou seed.

## Implementação

- `model.ts`: situação legível e grupos por ID, com contagens únicas.
- `feature-cards.tsx` / `feature-groups.css`: ordem fixa dos indicadores, hierarquia e expandir/recolher.
- `relationship-model.ts`: projeção macro/micro e vínculos rastreáveis.
- `feature-landscape.tsx`: coordenação dos filtros, modos, navegação e modais.

Testes: estados de execução/aceite, ausência de entregas, domínios homônimos, N:N, agregação de dependências e separação de hierarquia. Browser: panorama inicial, recolher/expandir, filtro/busca, feature→entrega, relações macro→micro/retorno, minimapa, ampliação, teclado/mobile e Axe. Evidências finais em TEST-REPORT.md.
