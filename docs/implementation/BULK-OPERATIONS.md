# Operação em lote e planejamento

## Selecionar sem perder o recorte

Em **Entregáveis**, combine os filtros e marque registros na tabela. O checkbox do cabeçalho seleciona apenas a página. **Selecionar recorte** usa os registros editáveis do recorte; acima de 100, o botão diz **Selecionar primeiros 100**. A seleção atravessa a paginação, tem contador e limpeza explícita. Mudar projeto ou filtros reinicia a seleção. Registros fora da alçada continuam protegidos pelo servidor.

## Editar e planejar

**Editar em lote** permite definir responsável, frente, área, squad, forecast, planejamento, execução e criticidade. Adicione campos para aplicar uma combinação. **Limpar valor** é explícito e só aparece para responsável, área, squad e forecast. Limpar a área explícita não remove a área herdada de um squad; para retirar essa atribuição, revise também o squad.

**Planejar datas** permite definir um forecast comum ou deslocar as previsões existentes em dias corridos. Positivo adia; negativo antecipa. O cálculo usa a data de calendário em UTC, sem mudança de fuso ou horário de verão. Datas desconhecidas geram erro por linha; não são inventadas. A operação não calcula esforço, capacidade ou caminho crítico.

Em **Delivery & roadmap**, o painel **Planejamento operacional** reúne Todas, Sem forecast, Sem responsável e Bloqueadas. Os contadores respeitam o recorte atual. A seleção usa o mesmo editor; a timeline, marcos e revisão de baseline continuam disponíveis.

## Prévia e confirmação

Justifique o lote e clique **Validar lote**. Cada linha mostra antes/depois e erros. A prévia executa os comandos de inventário em transação revertida, incluindo auditoria e proveniência: não grava alterações. Campos não escolhidos não recebem valores padrão.

**Aplicar** revalida hash, versões, referências e permissões. Qualquer erro reverte todas as linhas. A interface mantém a mesma chave idempotente ao repetir uma confirmação cuja resposta não chegou; editar a proposta exige nova prévia. Cada alteração registra autoria, justificativa, correlação do lote e proveniência MANUAL.

Baseline, datas reais, aceite, estágio, gates e escopo não fazem parte da edição em lote. Criticidade e outros campos de escopo continuam sujeitos a change control quando aprovado/congelado. Atribuição de frente não concede papel IAM. DONE respeita a sequência de execução existente e não concede aceite.

## API

- `POST /api/v1/deliverables/bulk/preview?programId=...`: `{batch}`.
- `POST /api/v1/deliverables/bulk/commit?programId=...`: `{batch,expectedHash}` e `Idempotency-Key`.

`batch` contém `items: [{id,expectedVersion}]`, `reason` e `change`. Para definir campos: `{action:"SET",values:{forecast_date:"2028-06-01"}}`; para deslocar: `{action:"SHIFT_FORECAST",days:7}`. Até 100 registros, sem duplicação, e deslocamento inteiro entre -3650 e 3650, diferente de zero. Schemas completos e limites estão na OpenAPI gerada.

Prévia inválida retorna `valid:false` com erros por linha; confirmação inválida retorna conflito e nenhuma alteração. Leitores não ganham escrita por usar a API de lote. Em UI de consulta, a seleção para edição não aparece; IA da visão e do registro continuam disponíveis.
