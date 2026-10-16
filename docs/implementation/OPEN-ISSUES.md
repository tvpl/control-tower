# Pendências e limites — revisão de conclusão

## Implementação local

Os blocos funcionais anteriormente listados como faltantes foram implementados: perfis/camadas/DoD versionados, contratos e fornecedores, decisões/saúde, importação XLSX assíncrona e provenance, PDF servidor e comparação ampla, IAM/JWT/ABAC, sync/inbox/reconciliação/notificações, radar/filtros/virtualização, assistência com fontes e simulação. A cobertura do inventário agora aceita universo estimado com fonte e data auditáveis; ausência continua desconhecida. Ver REQUIREMENTS-AUDIT.md e API-IMPLEMENTED.md.

A revisão final de regressão está registrada em TEST-REPORT.md. Implementação local não é homologação corporativa nem autorização para deploy.

## Infraestrutura local validada

`npm run test:infra` passou em Docker com PostgreSQL servidor, web/worker separados, migrations concorrentes, papel runtime, importação/PDF e backup/restore reais. Os hashes dos snapshots restaurados foram conferidos; recursos de teste removidos. Um erro de importação ESM do worker foi encontrado e corrigido, com teste de regressão. As 13 jornadas E2E passaram contra uma pilha Docker isolada no fechamento da evolução; 183 testes/26 arquivos aprovados após o incremento de gestão à vista. A aplicação está disponível por `npm run docker:local`; nenhum PostgreSQL nativo é utilizado. Ver INFRASTRUCTURE-VALIDATION.md e infrastructure-verification.json.

## Homologações externas necessárias

- **Identidade:** IdP OIDC, MFA, provisionamento, callbacks e expiração/revogação corporativa com contas reais. A UI não envia convites nem concede papéis implicitamente.
- **Negócio:** universo estimado, taxonomia, pesos da baseline, contribuição REQUIRED/OPTIONAL/SUPPORTING, perfis de gates, alçadas e política de saúde aprovados pelos responsáveis. Configuração não equivale a validação do programa.
- **Integrações:** credenciais, URLs, deployment, permissões, paginação/volumes e mappings reais de Jira/ADO/GitHub/GitLab/Confluence/catálogo. Os contratos HTTP e negativos foram testados com fontes sintéticas; nenhuma conta externa foi apresentada como conectada.
- **Assistência:** gateway/modelo contratado, autorização do destino e classificação/retenção. Sem configuração, apenas a síntese determinística funciona. Sugestões externas não aprovam gates, produção, aceite ou exceções.
- **Infraestrutura corporativa:** grants/roles aprovados pela organização, RLS se exigida, TLS/criptografia at-rest, HA, volumetria e estratégia de rollout/restore no ambiente corporativo. Docker/PostgreSQL/migrations concorrentes foram verificados localmente; isso não homologa infraestrutura de produção. O inventário embarcado anterior fica preservado, sem processos concorrentes.
- **Operação:** collector/APM, alertas e SLOs, retenção/legal hold, distribuição de secrets, armazenamento externo de backup, restore de desastre e RPO/RTO corporativos. Ferramentas/runbooks estão em OPERATIONS.md; não houve certificação de desastre.
- **Qualidade humana:** estética, usabilidade, leitor de tela, teclado em tecnologia assistiva, pentest e revisão WCAG 2.2 AA. Axe e testes de teclado complementam essa avaliação.
- **Entrega:** homologação do CI remoto e deploy. Código destinado à `main` de [tvpl/control-tower](https://github.com/tvpl/control-tower); o workflow Quality está versionado e seus resultados devem ser conferidos em Actions. As evidências locais não comprovam aprovação remota ou deploy.

## Limites explícitos

- O benchmark local de 5.000 entregáveis/500 capacidades é de processo isolado, sem concorrência ou snapshots históricos. Não certifica latência de rede, p95 de produção ou escala ilimitada. Filas/matriz têm janela virtual e modo paginado; API possui páginas de até 200 registros. Histórico completo é consultado sob demanda.
- Evidências são metadados/versionamento e referências HTTPS a sistemas controlados. Permissão, expiração e disponibilidade do artefato pertencem ao sistema de origem; não há serviço próprio de upload/object storage.
- Simulação propaga atraso uniforme por pré-requisitos. Não é estimativa de custo, esforço, capacidade de equipe ou caminho crítico calculado. Datas ausentes permanecem desconhecidas; nenhum forecast é gravado pelo cenário.
- Publicação de report e notificações são internas. Compartilhar status copia/baixa conteúdo autorizado; não envia mensagens externas nem cria links públicos.
- Retenção automatizada limpa somente conteúdo transitório elegível; não apaga trilha imutável. Política corporativa não é assumida como aprovada.
- O resultado de domínio não é certificação PCI. Nenhum PAN/CVV ou transação real integra as fixtures.

## Dependências de desenvolvimento

Scan de produção: zero advisories reportados. O scan completo mantém cinco high na cadeia ESLint/fast-glob/micromatch/braces. O advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) não publica versão corrigida. Não foi aplicado downgrade incompatível do Next/ESLint nem escondido o alerta. A cadeia fica fora do runtime standalone; globs do lint vêm do código/configuração do repositório. Acompanhar correção upstream e validar antes de homologar tooling.

Lint tem um aviso conhecido de TanStack Table/API mutável; há opt-out explícito de memoização. Não há erro de lint suprimido. Estado atualizado e contagens verificadas em TEST-REPORT.md.
