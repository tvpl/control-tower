# Preenchimento assistido por IA

## Contexto da tela, seleção e registro

Use **IA desta visão** no cabeçalho de qualquer módulo do projeto, **IA deste registro** nos detalhes compatíveis ou **IA da seleção** na tabela de entregáveis. O modal permite completar informações, explicar o contexto ou revisar planejamento. Prepare o recorte para ler o relatório, copiar/baixar o pedido e baixar pacote/template.

`focus` registra visão, filtros, intenção, registro/seleção e contagens reais do recorte. `context` continua sendo o catálogo completo autorizado do projeto, para resolver referências; seus indicadores de projeto não são apresentados como indicadores recalculados do recorte. `template` contém apenas os registros do foco: uma feature inclui seus descendentes e entregas vinculadas. Campos permitidos e guardas de importação permanecem iguais. Um foco de observação é somente leitura e pode produzir template vazio.

Na aba **Trazer preenchimento**, importe e revise a resposta sem sair do modal. O editor usa o mesmo serviço de prévia/commit do workspace de IA. Após aplicar, o pacote antigo é invalidado; prepare novamente antes de pedir novas mudanças. Nenhum pedido é enviado automaticamente a um provedor externo. O fluxo funciona com uma IA operada fora da torre; o gateway opt-in de Análise continua separado.

API contextual: `GET /api/v1/agents/package?programId=...&context=...`, com `context` JSON codificado conforme o schema `AgentContext` da OpenAPI. IDs do foco devem estar no projeto e disponíveis para a identidade; seleção de até 100 entregáveis precisa pertencer ao recorte. O contexto de registro não exporta configurações de conexões, tokens ou secrets. O pacote do projeto completo permanece disponível pelo menu abaixo.

## Projeto completo

No menu **Trabalhar com IA**, baixe o pacote do projeto selecionado. O JSON contém `context` (dados para consulta), `report` (relatório legível), `prompt`, `checklist` e `template` (retorno importável). `templateSchema` e `fieldSchemas` descrevem tipos, campos e valores aceitos para a IA preencher com precisão. Há downloads separados do template, instruções e relatório. Nenhum modelo precisa ser contratado ou configurado na torre para esse fluxo.

1. Abra o pacote no Cursor ou outra ferramenta aprovada para a classificação dos dados. Use o campo `prompt` como pedido e os demais campos como dados. Peça explicações citando códigos/IDs, frentes, features, dependências e lacunas.
2. Peça para devolver apenas `template`, em JSON válido. O template inicial usa `KEEP` em todos os registros. `UPDATE` preserva `id` e `expectedVersion` e informa apenas os campos alterados em `values`. `CREATE` omite esses dois campos, usa código novo e referências existentes no contexto. Cada alteração exige `reason`.
3. Importe o JSON ou cole o template na torre. “Validar e ver alterações” mostra antes/depois e erros por linha, sem gravar o inventário, auditoria ou proveniência. A prévia executa as mesmas validações de domínio em transação revertida.
4. Revise e aplique o lote. Até 100 mudanças por vez; qualquer falha reverte todas. A confirmação confere hash e versões novamente. Solicitações repetidas com a mesma chave idempotente retornam o resultado anterior.

## Exemplo de retorno

Use os UUIDs reais do seu pacote:

```json
{
  "format": "mct-agent/1",
  "programId": "UUID-DO-PROJETO",
  "exportedAt": "2026-10-16T00:00:00.000Z",
  "changes": [
    {
      "action": "UPDATE",
      "kind": "deliverables",
      "id": "UUID-DO-ENTREGAVEL",
      "expectedVersion": 3,
      "values": { "forecast_date": "2026-12-01" },
      "reason": "Forecast confirmado pelo responsável"
    }
  ]
}
```

O exemplo ilustra o formato; os placeholders não são UUIDs válidos. O pacote baixado já contém referências e versões válidas.

## Superfície de edição e proteção

Templates cobrem projeto atual (somente atualização), domínios, frentes, áreas, squads, capacidades, entregáveis, componentes, releases, marcos, dependências, RAID, evidências, decisões propostas, fornecedores e contratos propostos. A lista exata de campos está no prompt e em `src/server/domain/agent-template.ts`. Aplique primeiro a estrutura e exporte novamente antes de criar dependentes que precisam de IDs novos. Registros ausentes nunca são excluídos.

Aceite, estágio, catálogo de gates, avaliações/aprovações, baseline, estado de aprovação e exclusões não são campos importáveis. Alterar escopo já aprovado exige change control. Conclusão operacional não concede aceite. Permissões por frente, classificação, referências e versões passam pelo serviço de inventário existente. Proveniência registra `IMPORT` / `agent-template`, identidade e versão do pacote. Não há envio automático de dados a um provedor de IA.

Contexto exclui conexões, tokens, secrets, e-mails de usuários e payloads de auditoria. Evidências, fornecedores, contratos e relatórios respeitam os filtros de leitura da sessão. O relatório cobre o inventário atual e indicadores; detalhes estruturados, vínculos, prioridades e configurações estão no JSON. Não é um backup do banco. O template contém no máximo 2.000 registros (flag `truncatedTemplate` quando excedido); lotes têm até 100 alterações. O upload de retorno é limitado a 900 KB na interface; use só o template e remova KEEP desnecessários.

## API

- `GET /api/v1/agents/package?programId=...`
- `POST /api/v1/agents/preview`: `{template}`
- `POST /api/v1/agents/commit`: `{template,expectedHash}`, `Idempotency-Key` obrigatório.

Sessão ou token de API com escopo do projeto. Tokens READ não confirmam alterações; VIEWER não altera inventário. As regras do domínio são revalidadas no commit e o lote é atômico.
