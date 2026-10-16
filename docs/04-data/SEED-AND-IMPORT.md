# Inventário full, importação e seeds

## Abordagem
1. Cadastro de **todos os domínios e frentes conhecidos**, mesmo que somente com descrição, owner provisório e maturidade IDENTIFIED.
2. Cadastrar capacidades de negócio macro e seus critérios de aceite; marcar lacunas explicitamente.
3. Importar entregáveis das planilhas e ferramentas; identificar duplicados por ID externo, código e contexto.
4. Validar relacionamentos, owners e camadas em workshop com líderes.
5. Congelar baseline inicial após revisão formal.

## CSV mínimo de entregáveis
`program_code,domain_code,workstream_code,capability_code,deliverable_code,name,layer,owner_email,stage,execution_status,forecast_date,source_url`

## Pipeline de importação
Upload → prévia → validação schema → dedup/matching → relatório de conflitos → confirmação → transação → audit → export de erros. Dry-run obrigatório.

## Seeds
`examples/demo-data.json` é **fictício**; jamais misturar com informações reais sem marcação.
