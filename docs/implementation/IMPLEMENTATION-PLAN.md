# Plano executável e rastreabilidade

Fontes: missão anexada, PRD FR01–14, domínio, DDL, OpenAPI, experiência, UX, épicos, qualidade e exemplos — 32 arquivos normativos. A missão e os refinamentos do usuário prevalecem sobre a limitação da primeira fatia do prompt original.

## Execução do plano

1. M0 — discovery, ADRs, direções e wireframes registrados.
2. M1 — inventário persistente, autenticação contextual, CRUD/N:N, portfólio/filtros, mapas/drawers e auditoria transacional.
3. M2 — forecast, dependências, RAID/decisões, contratos, releases, baseline e change control revisados por outra pessoa.
4. M3 — catálogos/DoD configuráveis, gates/evidências/exceções, prontidão, snapshots, dashboards e reports/PDF servidor.
5. M4 — importação CSV/XLSX assíncrona, provenance, sync worker, inbox/reconciliação, ownership e notificações.
6. P2 — síntese com fontes e gateway externo opt-in; simulação sem alterar planejamento.
7. Hardening local — IAM/API, classificações, quotas, limites/SSRF, virtualização, benchmark, probes/worker/retenção/backup, regressão e runbooks.

Todos os blocos acima têm implementação local. As homologações de ambiente, contas reais, políticas e segurança estão separadas em OPEN-ISSUES.md; não equivalem a funcionalidades falsas ou concluídas por fixture.

## Critérios aplicados

Mutação persiste em PostgreSQL com audit/outbox transacionais. Entrada inválida, alçada insuficiente, contexto alheio, versão obsoleta e violações de baseline são rejeitados. Desconhecido não vira sucesso. UI fornece loading/erro/vazio, refaz consulta após mutação e preserva contexto. DONE, aceite, estágio, gates e saúde são independentes. Reports e assistência usam fontes congeladas; simulação não altera a verdade operacional.

## Épicos e fronteiras

EP01 → EP02 → EP03 → EP04/05/06 → EP07; EP08 usa EP03; EP09 usa EP05; EP10 usa histórico confiável. O incremento P2 de EP10 foi implementado com limitações explícitas de gateway e cenário uniforme.

`src/server/domain`: invariantes/cálculos; `application`: comandos e autorização/transações; `infrastructure`: banco/auth/adapters; `features/tower`: jornadas; `components/ui`: primitives; API versionada: transporte/erros; `db/migrations`: evolução SQL.

## Evidências e aceite externo

177 testes/26 arquivos, 13 E2E, TypeScript, lint e build. Benchmark local de 5.000 entregáveis, inspeção visual Orange/mobile/PDF e axe nas superfícies exercitadas. Ver TEST-REPORT.md para o alcance real. O pipeline está definido; execução remota não ocorreu neste checkout sem Git. Aceite humano de estética/usabilidade e homologação de IdP, conectores, infraestrutura corporativa, carga, desastre/RPO/RTO, segurança e acessibilidade assistiva permanecem externos. PostgreSQL/Docker/worker e dump/restore locais foram executados e aprovados.

## Evolução solicitada: navegação / IA / GitLab — concluída localmente

- [x] Revisar os módulos e 18 destinos atuais do menu, histórico, recarga, filtros e seções; remover criações fora de contexto e corrigir vínculo externo.
- [x] Exportar contexto, relatório, checklist, prompt e templates com schemas; prévia e reimportação atômica protegida.
- [x] GitLab guiado: grupos/projetos, épicos/issues/tasks, labels, teste de acesso, hierarquia/inbox e tutorial Docker.
- [x] Validar 169 testes e 13 jornadas E2E completas, TypeScript/lint/build, infraestrutura Docker real e preservação do volume local.

Guias e limites operacionais estão em NAVIGATION-AUDIT.md, AGENT-WORKFLOW.md, GITLAB-GUIDE.md e TEST-REPORT.md. Credenciais/instância GitLab reais precisam ser configuradas pelo operador para homologação externa.

## Evolução de experiência — três etapas concluídas

- [x] Navegação agrupada/recolhível, abas do projeto, tela de frentes, filtros em chips, densidade e percurso ordenado nos detalhes.
- [x] Seleção por página/recorte; edição de vários campos e planejamento de forecasts com prévia, controle de versões, confirmação atômica e idempotência.
- [x] IA contextual por visão/registro/seleção, relatório/checklist/template e retorno revisado no mesmo modal.
- [x] Vínculos GitLab em lote por itens recebidos/CSV, sugestões por marcadores explícitos e busca manual, sem resolver ambiguidades automaticamente.
- [x] Regressão completa, Axe/mobile, inspeção das capturas, ensaio real de infraestrutura e atualização web/worker sem seed ou mudança de inventário.

Reprodução e evidências: TEST-REPORT.md. Guias de uso: WORKSPACE-EXPERIENCE.md, BULK-OPERATIONS.md, AGENT-WORKFLOW.md e GITLAB-GUIDE.md. Configuração e homologação das contas externas exigem o ambiente do operador.

## Gestão à vista ampliada — incremento entregue

- [x] Mapa/mosaico de features como entrada principal da home, sinais filtráveis, zoom/minimapa, ampliação e panorama com navegação até entregas.
- [x] Projeção consistente de calendário, atraso por forecast, desvio de baseline e contagens N:N deduplicadas.
- [x] Panorama entre projetos, portfólio com gráficos/contadores e aproveitamento da largura, frentes com sinais de prazo, alternância matriz/mapa de capacidades e horizonte visual no planejamento.
- [x] Regressão de domínio, TypeScript/build/lint, jornada browser e inspeção de capturas. Resultados atuais em TEST-REPORT.md.

Guia funcional: VISUAL-MANAGEMENT.md. Sem alteração de schema, seed ou fórmulas de governança.

## Leitura hierárquica e completude — revisão entregue

- [x] Panorama inicial agrupado por domínio/situação, com grupos recolhíveis e caminho feature → entrega.
- [x] Barra apenas de conclusão, execução/aceite em posições fixas e lacunas de entregas explícitas.
- [x] Relações macro de grupos, aprofundamento em features, retorno e disposição por dependências.
- [x] Regressão de estados, N:N/domínios homônimos, agrupamentos e UI/teclado/mobile. Guia: FEATURE-READABILITY.md; evidências em TEST-REPORT.md.
