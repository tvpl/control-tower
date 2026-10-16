# Modernization Control Tower

Dashboard interativo de modernização com projetos, features, entregáveis, arquitetura, delivery e governança. Next.js/React/TypeScript e PostgreSQL. **Orange é um tema visual**, ao lado de Grafite e Claro; o nome do produto permanece Modernization Control Tower.

## Executar localmente — somente Docker

Com Docker Engine ativo e Node.js 22+ para o comando de inicialização:

```sh
npm run docker:local
```

Abra http://127.0.0.1:3000. O comando constrói web/worker/ferramentas, sobe PostgreSQL 16 em container, aplica migrations e prepara o inventário fictício. O banco não publica porta no host. Segredos locais são gerados uma vez em `data/docker-local/runtime.env` (0600, ignorado no build); o volume `mct-local_tower_pg` preserva registros entre reinícios. Não instala ou inicia PostgreSQL nativo.

Para parar sem apagar dados:

```sh
npm run docker:stop
```

Este modo é exclusivamente local, com login de demonstração. Produção continua exigindo OIDC e configuração corporativa, sem ALLOW_LOCAL_PREVIEW. A instalação embarcada anterior em `data/control-tower` fica preservada; ela não é migrada implicitamente para o novo volume Docker. Tema fica no navegador; registros e visões salvas ficam no banco do ambiente selecionado.

Contas fictícias, senha `Tower-Demo-2026!`:

| Conta                | Papel                                   |
| -------------------- | --------------------------------------- |
| admin@demo.local     | Administração e arquitetura             |
| lider@demo.local     | Liderança da frente CORE                |
| aprovador@demo.local | Aprovação por categoria de gate         |
| pmo@demo.local       | Revisão independente de baseline/escopo |
| leitor@demo.local    | Consulta                                |

O seed inicial contém 10 domínios, 4 frentes, 20 capacidades e 24 entregáveis. Não representa aprovação, certificação PCI ou dados transacionais reais. Reiniciar o comando não substitui inventário existente.

## Jornadas disponíveis

- **Workspace do projeto:** menu agrupado com nomes e recolhimento, abas por projeto, tela visual de frentes, filtros em chips, densidade Compacta/Confortável e anterior/próximo em detalhes. [Guia do workspace](docs/implementation/WORKSPACE-EXPERIENCE.md).
- **Gestão à vista:** Panorama com features agrupadas por domínio/situação, execução e aceite separados, grupos recolhíveis e alertas. Relações oferece grafo macro→micro com zoom/minimapa e acesso às entregas. Portfólio/frentes/capacidades/planejamento compartilham sinais visuais. [Guia](docs/implementation/VISUAL-MANAGEMENT.md).
- **Cockpit:** macro/micro, projeto → features → entregáveis, gráficos, radar, qualidade, agenda, evolução por snapshots e grafo de dependências com expansão. Cards e detalhes abrem modais amplos, inclusive no celular.
- **Projetos e recortes:** portfólio autorizado; frentes de Desenvolvimento, Negócio, Infraestrutura, Provisionamento, Spike ou Outro; áreas/squads e filtros combinados por projeto, domínio, frente, release, área, squad, camada e responsável. Projeto corresponde a programa no modelo.
- **Prioridades e observações:** filas persistidas por arraste, teclado ou setas, posições visíveis, desfazer, conflito de versão e preservação de itens ocultos. Notas em modal, pontos importantes e status selecionável para copiar/baixar.
- **Operação em lote:** seleção por página/recorte, edição de múltiplos campos e ajuste de forecasts com prévia antes/depois, versões e confirmação atômica. Planejamento destaca itens sem data, sem responsável ou bloqueados. [Guia](docs/implementation/BULK-OPERATIONS.md).
- **IA contextual:** pacote por visão, registro ou seleção, com relatório/checklist/template e reimportação no mesmo modal, protegida por versões e revisão.
- **Inventário e arquitetura:** CRUD, relações N:N tipadas, camadas configuráveis, fornecedores/contratos técnicos versionados, revisão independente e impacto transitivo.
- **Governança:** baseline imutável, change control com preview e revisão segregada, forecast, RAID/decisões, releases, gates por programa e perfis DoD combináveis/versionados. Exceções novas exigem prazo, risco, mitigação e referência de decisão. Saúde derivada e ajuste temporário permanecem distinguíveis.
- **Importação e origem:** CSV/XLSX, validação assíncrona, erros exportáveis, confirmação atômica, deduplicação e proveniência por campo. Preview não altera inventário.
- **Relatórios:** snapshots congelados com hash/contexto; comparação de entregáveis e 28 coleções; revisão/publicação interna, JSON e geração assíncrona de PDF no servidor.
- **Integrações:** Jira, Azure DevOps, GitHub, GitLab, Confluence e catálogo HTTP; deployments Cloud/Server quando suportados. Worker durável, inbox, mappings explícitos, ownership, conflitos, reconciliação, circuit breaker e webhooks autenticados. Sem credenciais, conexão permanece não configurada.
- **Identidade e operação:** IAM administrativo, memberships contextuais, classificação/domínio/expiração, tokens API escopados/revogáveis, auditoria/outbox, notificações internas, probes, métricas e retenção transitória.
- **Análise:** síntese por regras com fontes congeladas, simulação de atraso sem gravar datas e gateway de assistência externa opcional, com opt-in e validação de citações.

DONE, aceite, estágio, gates, saúde e maturidade são dimensões independentes. Sem peso aprovado, progresso é provisório. Sem universo estimado com fonte/data, cobertura é desconhecida. Resultado ausente ou obsoleto não vira aprovação.

## PostgreSQL, produção e worker

Produção exige `DATABASE_URL`, OIDC, `APP_ORIGIN` HTTPS e secrets do operador. Configure callback OIDC `${APP_ORIGIN}/api/auth/oidc/callback`; provisione identidades/memberships pela Administração. PKCE, state e nonce são verificados; não existe concessão implícita de administrador. `ALLOW_LOCAL_PREVIEW=true` serve exclusivamente ao QA local do standalone.

```sh
npm run db:migrate
npm run build
npm start
# Em outro processo, usando PostgreSQL servidor:
npm run worker
```

O build empacota web standalone e `dist/worker.mjs`, sem banco, `.env` ou fixtures. Compose oferece PostgreSQL, migration, web e worker separados, sem seed automático. Docker e PostgreSQL servidor foram executados e verificados localmente, inclusive backup/restore e worker. IdP e infraestrutura corporativa continuam dependentes de homologação. Configuração, backups cifrados, restore, retenção e integrações: [OPERATIONS.md](docs/implementation/OPERATIONS.md).

## Qualidade e documentação

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
# Com o servidor e banco de QA isolado ativos:
npm run test:e2e
npm run build
# Ensaio isolado de PostgreSQL/containers/worker/restore, com Docker ativo:
npm run test:infra
```

Checkpoint local: **183 testes/26 arquivos e 13 jornadas E2E**, build e TypeScript aprovados. Lint sem erros, com um aviso conhecido; scan de runtime sem advisories, cinco high em ferramentas de desenvolvimento. Axe e inspeção visual complementam a revisão humana. E2E cria dados sintéticos: não apontar para inventário de negócio.

Regras em `src/server/domain`, casos de uso em `application`, banco/auth/adapters em `infrastructure`, jornadas em `features/tower`, primitives em `components/ui`. OpenAPI executável em [public/openapi.json](public/openapi.json), gerada dos schemas/comandos; draft original preservado. [Contrato implementado](docs/implementation/API-IMPLEMENTED.md), [rastreabilidade](docs/implementation/REQUIREMENTS-AUDIT.md), [evidências](docs/implementation/TEST-REPORT.md) e [homologações/limites](docs/implementation/OPEN-ISSUES.md).

Os blocos locais do plano original e as três etapas da evolução de experiência foram implementados e verificados. Homologação corporativa, pentest/PCI, carga/SLO, RLS/HA, recuperação de desastre na infraestrutura alvo, contas externas e deploy continuam dependentes do ambiente e dos responsáveis. Backup/restore real em Docker foi validado localmente. O repositório de entrega é [tvpl/control-tower](https://github.com/tvpl/control-tower), branch `main`; resultados locais não substituem o resultado do workflow remoto em [Actions](https://github.com/tvpl/control-tower/actions).

Ensaio Docker de infraestrutura repetido e aprovado neste checkpoint; job de CI definido: [INFRASTRUCTURE-VALIDATION.md](docs/implementation/INFRASTRUCTURE-VALIDATION.md). Resultados e alcance da regressão atual de interface estão em [TEST-REPORT.md](docs/implementation/TEST-REPORT.md).

### Preencher com IA e sincronizar GitLab

Use **Trabalhar com IA** para o projeto completo, ou **IA desta visão**, **IA deste registro** e **IA da seleção** para um recorte. É possível baixar contexto, relatório, prompt/checklist e template editável; reimporte o retorno, revise o diff e confirme o lote. Consulte o [guia de preenchimento](docs/implementation/AGENT-WORKFLOW.md).

Em **Integrações**, use **Configurar GitLab** e **Como conectar o GitLab**. Há escopo por projeto/grupo, épicos/issues/tasks, labels, teste de acesso e vínculo com o inventário, inclusive em lote por itens recebidos ou CSV com busca e prévia. O [tutorial GitLab](docs/implementation/GITLAB-GUIDE.md) explica credenciais somente em Docker e acompanhamento operacional.
