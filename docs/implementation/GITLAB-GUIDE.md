# GitLab: do repositório ao projeto

O tutorial também está disponível em **Integrações → Como conectar o GitLab**. Use **Configurar GitLab** para o cadastro guiado; o formulário genérico continua disponível para todas as fontes e para issues REST legadas.

## Organização recomendada

Escolha o projeto da torre no seletor superior. Crie uma conexão para um projeto GitLab (`empresa/pagamentos/api`) ou um grupo (`empresa/pagamentos`). O modo grupo consulta épicos, issues e tarefas, incluindo descendentes; o modo projeto consulta issues e tarefas. Não é preciso duplicar o projeto da torre para cada repositório.

Aplique uma label como `tower::acqmod` em cada item desejado. Ela é opcional; sem filtro, todos os itens acessíveis no escopo são consultados. Múltiplas labels funcionam como AND. Uma tag Git de release não é filtro de inventário. Aplique a label aos pais e filhos que deseja ver; a filtragem não inclui automaticamente todos os descendentes de um épico marcado.

Abra o GitLab com sua conta para organizar os itens. O acesso da torre usa token de serviço de leitura: não existe login pessoal via OAuth GitLab nesta entrega. A autenticação do usuário da torre é independente da autenticação do conector.

## Credencial somente em Docker

Crie um access token com expiração e `read_api`. A conta precisa conseguir ler os projetos/grupo e os itens relevantes. Épicos exigem licença Premium/Ultimate e API Work Items compatível. Um project token não concede acesso a épicos de um grupo automaticamente; prefira credencial de serviço com acesso explícito ao grupo.

1. Crie `secrets/` na raiz, com permissão 700. Crie `secrets/gitlab.env`, permissão 600. Defina nele `MCT_CONNECTOR_GITLAB` com o token real; não cole o token em campos de negócio, terminal compartilhado ou chat.
2. No tutorial, baixe **complemento Docker** e salve como `compose.gitlab.yaml` na raiz. O arquivo é apenas configuração, sem token:

```yaml
services:
  web:
    env_file:
      - ./secrets/gitlab.env
  worker:
    env_file:
      - ./secrets/gitlab.env
```

3. Execute `npm run docker:local`. O script inclui o complemento quando ele existe; reinicia web/worker, aplica migrations e preserva o volume. `npm run docker:stop` também considera o complemento. Não há PostgreSQL nativo. `secrets/` e o complemento são excluídos do contexto Docker; secrets não são copiados para imagens.
4. No formulário informe o nome **MCT_CONNECTOR_GITLAB**, nunca seu valor.

Para operação manual, mantenha os mesmos arquivos/ambiente/projeto Compose:

```sh
docker compose --project-name mct-local --env-file data/docker-local/runtime.env -f compose.yaml -f compose.local.yaml -f compose.gitlab.yaml up -d --no-build web worker
```

GitLab próprio exige host exato em `MCT_CONNECTOR_ALLOWED_HOSTS` nos dois serviços, TLS válido e DNS acessível. Hosts privados também exigem `MCT_CONNECTOR_ALLOW_PRIVATE=true`, autorizado pelo operador; o cliente continua bloqueando redirecionamentos e pinando DNS. Nunca desative validação TLS.

## Cadastro, teste e acompanhamento

1. Em **Configurar GitLab**, preencha nome, host HTTPS, escopo e caminho completo. Escolha labels para selecionar itens e nome da variável.
2. Opcionalmente configure labels exclusivas de andamento (`status::doing`), bloqueio (`status::blocked`) e pausa (`status::hold`). Aberto mapeia para NOT_STARTED e fechado para DONE. Fechamento prevalece sobre labels antigas; duas labels de estado diferentes produzem UNKNOWN.
3. Comece com **Somente referência**. Salve e use **Testar acesso**, que consulta uma página sem alterar inventário ou executar sincronização. Depois use **Sincronizar**, acompanhando o job e o histórico.
4. A caixa de entrada preserva tipo, referência, labels, pai, ID global e estado original. O painel do GitLab mostra a proporção operacional dos itens mais recentes recebidos, com denominador explícito; não representa o total da instância.
5. Clique **Vincular** no item recebido e selecione o registro certo. Vincule épicos como REFERENCE de capacidades; para atualizar execução de issues/tasks, vincule a um entregável em EXECUTION e selecione **Permitir atualização operacional** na conexão. Sincronize novamente após vincular. A torre não adivinha vínculos pelo nome.
6. Habilite polling para consulta a cada 15 minutos; ou use consulta manual. Conflitos ficam para revisão KEEP/APPLY. Fechado no GitLab não aprova aceite, estágio, gates ou produção.

## Vínculos em lote

Na conexão, abra **Vincular em lote**. A lista reúne os últimos itens recebidos daquela conexão; marque as linhas e use a busca de destinos. Para uma lista própria, expanda **Colar uma lista de vínculos por código**, baixe o cabeçalho CSV e preencha `external_id;codigo;modo`. Copie o ID imutável da API/recepção, use o código existente da torre e modo `REFERENCE` ou `EXECUTION`. Código ausente, desconhecido ou ambíguo exige escolha manual no seletor; título parecido não decide o vínculo.

Para sugestões, adicione uma label `mct:CODIGO` ou o marcador `[mct:CODIGO]` ao título no GitLab. Essa convenção pertence à torre, não é funcionalidade especial do GitLab. Depois de sincronizar, **Sugerir por marcador** prepara somente correspondências únicas. Ambiguidades permanecem sem destino; sugestões exigem revisão e confirmação. A label usada para filtrar o projeto (por exemplo `tower::acqmod`) é independente desse marcador por registro.

Justifique e clique **Validar vínculos** para conferir destinos e modos. **Aplicar** verifica novamente versões da conexão e referências. Um erro reverte o lote inteiro; até 100 vínculos por confirmação. Referência existente não muda silenciosamente de destino. Salvar vínculos não consulta nem escreve no GitLab, nem altera a execução na torre: sincronize novamente para processar o andamento. Aceite, gates e baseline continuam protegidos.

API: `POST /connections/{id}/links/preview` recebe `{batch}`; `/commit` recebe `{batch,expectedHash}` com `Idempotency-Key`. O lote contém `expectedConnectionVersion`, `reason` e `items` com `externalId`, `subjectNodeId`, `mode` e `expectedReferenceVersion` (null para novo vínculo). Programa via `programId`; somente administrador, destinos autorizados no mesmo programa. A conexão precisa ser GITLAB. Esse fluxo registra origens; não cria issues/épicos no GitLab.

## Compatibilidade e erros da conexão

Novos cadastros usam `/api/graphql`, Work Items, paginação por cursor, tipos EPIC/ISSUE/TASK e widgets de labels/hierarquia. Referência consultada: GitLab 18.1+; permissões/licença/versão precisam ser validadas na sua instância. A API ainda tem campos experimentais conforme a referência oficial. Campos GraphQL indisponíveis causam erro explícito, sem resultado falso de zero itens.

Conexões antigas mantêm `/api/v4/projects/:id/issues` e IDs numéricos existentes. Não converta silenciosamente esses IDs em WorkItem IDs. Se já há vínculos, mudar projeto/grupo/API exige outra conexão. Editar configuração reinicia cursor/circuit breaker; jobs com configuração antiga são rejeitados pela versão.

Credencial ausente → configurar em web e worker; 401 → conferir expiração/token; 403 → escopo/papel/licença; namespace não retornado → caminho/acesso; zero itens → labels/escopo; UNKNOWN → mapping ou labels conflitantes; item sem vínculo → criar vínculo e sincronizar novamente. Mais de 100 labels em um item produz falha explícita para evitar mapping parcial.

O conector só lê o GitLab. Webhooks autenticados existentes podem antecipar uma consulta; polling já permite operar sem publicar endpoint local na internet. Não foram fornecidos token/instância reais: contratos e integração foram testados com respostas controladas; a configuração real é o passo operacional restante.

Fontes oficiais: [migração de épicos para Work Items](https://docs.gitlab.com/api/graphql/epic_work_items_api_migration_guide/), [referência GraphQL](https://docs.gitlab.com/api/graphql/reference/experimental/objects/), [tokens pessoais e escopos](https://docs.gitlab.com/user/profile/personal_access_tokens/), [issues REST](https://docs.gitlab.com/api/issues/).
