# Mudanças de escopo e baseline

Implementado e verificado localmente em 14/10/2026. Política de alçadas provisória; não representa aprovação corporativa.

## Jornada de escopo

1. Abra uma capacidade/entregável e selecione **Propor mudança de escopo**, ou entre em **Change control → Nova solicitação**.
2. Registre alteração, motivo, alternativas e riscos/mitigação. Analise impacto em entregáveis, dependentes transitivos, releases, avaliações e baselines. Preview não escreve dados de negócio.
3. Envie para revisão. Proposta, dados anteriores e impacto são congelados. Administrador/arquiteto podem propor; líder apenas para entregável da própria frente.
4. Outra pessoa com PMO/EXECUTIVE decide com justificativa. Solicitante não decide a própria proposta, mesmo acumulando papéis. Cada decisão gera registro vinculado imutável.
5. Editor autorizado aplica mudança aprovada. Backend confere novamente versão e fingerprint do impacto; mudanças concorrentes exigem cancelamento e nova proposta. Nenhuma aprovação antiga autoriza automaticamente um contexto novo.
6. Aceites e gates dos entregáveis diretamente alterados exigem revalidação se a mudança é material. Dependentes transitivos são apresentados no impacto; suas avaliações não são revogadas automaticamente. Forecast/custo/esforço não são inferidos.

PROPOSED → APPROVED/EXCLUDED; APPROVED → CHANGED/EXCLUDED; CHANGED → CHANGED/EXCLUDED; reinclusão de EXCLUDED exige CHANGED aprovado. API aceita vários campos na mesma proposta; formulário permite escolher um campo por solicitação. Scope status implícito é apresentado no detalhe da proposta.

## Jornada de baseline

Delivery & roadmap → Propor nova baseline → motivo. Itens, forecasts, pesos, vínculos e contexto de capacidades são congelados ainda em SUBMITTED. Outra pessoa com PMO/EXECUTIVE confere e aprova/rejeita. Aprovação verifica que o inventário permanece igual à proposta. Se mudou, rejeitar e propor outra versão; itens de proposta não são editados. KPIs usam somente a última versão APPROVED.

Baselines aprovadas antes deste incremento permanecem preservadas, identificadas como histórico anterior, sem inventar proposta/revisor retroativos. Aplicar mudança de escopo não reescreve a baseline: aprovar novo compromisso em nova versão. Validação corporativa do universo (exclusões, obrigações transversais, pesos e escopo estimado) permanece pendente.

## Demonstração e recuperação

Contas fictícias `admin@demo.local` e `pmo@demo.local`, senha `Tower-Demo-2026!`, permitem exercitar segregação. Novo seed disponibiliza PMO no programa demonstrativo existente e preserva inventário/senhas anteriores. Não executar seed/migrations com PGlite em uso por outro processo.

SUBMITTED pode ser rejeitada ou cancelada. APPROVED pode ser aplicada ou cancelada, mantendo decisão. REJECTED/APPLIED/CANCELLED são terminais e preservadas. Solicitação obsoleta retorna 409 com motivo; recarregar resolve versão de tela, mas mudança no impacto exige nova proposta.

Audit/outbox e mutações do domínio são atômicos. Idempotency-Key evita repetição de proposta/decisão/aplicação; chave reutilizada com conteúdo diferente é rejeitada. Baseline e snapshots originais, proposta congelada, decisão e auditoria são protegidos por triggers PostgreSQL.
