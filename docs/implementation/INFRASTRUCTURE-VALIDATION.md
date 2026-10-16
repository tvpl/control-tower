# Validação integrada de infraestrutura — Docker

**Resultado atual: PASSED.** Ensaio real executado em Docker Engine 29.3.1, imagens Linux ARM64, Node 22.23.3 e PostgreSQL 16.15. Comando reproduzível: `npm run test:infra`. Relatório de máquina: [infrastructure-verification.json](infrastructure-verification.json).

## Etapas aprovadas

1. Build das imagens web, worker e runner com cliente PostgreSQL 16; guarda de empacotamento sem secrets/dados do host.
2. PostgreSQL em rede privada e tmpfs, sem publicar porta no host.
3. Duas migrations concorrentes com advisory lock; conferência das 21 migrations e seus SHA-256.
4. Fixtures fictícias e papel SQL de runtime separado da identidade de migration, sem DDL persistente e sem escrita em schema_migrations.
5. Web em production sem ALLOW_LOCAL_PREVIEW: live 200, ready 503 sem worker, API anônima 401, READ sem escrita e programa alheio negado.
6. Worker separado: ready 200, prévia sem gravar inventário, commit de importação, provenance, idempotência concorrente, snapshot e PDF com digest.
7. Guards SQL de imutabilidade de snapshots/auditoria e negativa de CREATE TABLE pelo usuário runtime.
8. `pg_dump` real → AES-256-GCM → `pg_restore` em banco vazio distinto. Chave errada, destino operacional e destino populado recusados; migrations, contagem e hashes dos snapshots restaurados conferidos.
9. Encerramento do worker: ready retorna 503 e live permanece 200. Limpeza dos recursos etiquetados da execução concluída.

O relatório agrupa essas verificações em oito fases. Nenhuma credencial ou registro corporativo foi usado. Isso valida a integração local em containers; não certifica HA, RLS, TLS/at-rest, RPO/RTO, carga/SLO ou homologação corporativa.

## Defeito encontrado e corrigido

A primeira execução real passou até web/API e falhou ao iniciar o worker. O executável ESM carregava estaticamente `next/headers`, causando ERR_MODULE_NOT_FOUND antes de alcançar o loop de jobs. O contexto de cookies agora é carregado somente quando uma requisição web consulta a sessão; os comandos do worker usam o mesmo controle de membership sem carregar esse contexto HTTP.

Novo teste `worker-runtime.test.ts` constrói e executa o bundle ESM, verificando que chega à guarda de DATABASE_URL sem falha de resolução de módulos. O checkpoint anterior passou com 140 testes em 22 arquivos; a suíte atual passou com 152 testes em 24 arquivos. O ensaio Docker completo foi repetido e passou. Resultado inicial preservado em `infrastructure-first-run.json` para rastreabilidade.

Diagnósticos coletam logs dos containers próprios antes da limpeza, com redação de credenciais. Falha de inspeção não é tratada como prova de recurso inexistente. Oito testes sintéticos da orquestração verificam isolamento, ausência de motor, falhas/limpeza, propriedade dos recursos, interrupção e redação. Quatro testes do CLI de backup complementam a cifra, incluindo remoção de archive parcial após falha do dump.

## Aplicação local disponível

```sh
npm run docker:local
# Para parar, mantendo os dados:
npm run docker:stop
```

A aplicação fica em http://127.0.0.1:3000. Conta fictícia: `admin@demo.local` / `Tower-Demo-2026!`. Web, worker e PostgreSQL rodam em containers do projeto `mct-local`; somente a porta web está vinculada ao loopback. `compose.local.yaml` habilita login local exclusivamente nessa composição; a composição corporativa conserva OIDC e os controles de produção.

Secrets locais aleatórios são persistidos em `data/docker-local/runtime.env` (0600, diretório 0700 e ignorado no build). O volume `mct-local_tower_pg` conserva os registros. O comando não herda credenciais corporativas do shell e não apaga volumes. O inventário embarcado anterior em `data/control-tower` permanece intacto; não é migrado implicitamente ao Docker.

Conferência do ambiente de demonstração: 21 migrations, 1 programa, 20 capacidades e 24 entregáveis. As 12 jornadas E2E principais passaram em **38,4 s**, e uma jornada adicional de IA/temas passou em **2,4 s** numa segunda pilha Docker descartável, em `127.0.0.1:3001`, usando as mesmas imagens e banco próprio. A pilha/volume de QA foram removidos; os dados dos testes não entram no ambiente disponibilizado.

## CI e alcance

O job `infrastructure` em `.github/workflows/quality.yml` executa o ensaio num runner Ubuntu e publica somente o relatório de máquina. CI remoto não executado neste checkout sem Git. O ensaio estrito usa tokens API sintéticos e não homologa OIDC/MFA; E2E usa o modo local explícito. TLS fica desabilitado somente na rede de teste/local, sem modificar política corporativa.

Continuam externos: IdP e contas reais, integrações autenticadas/mappings, gateway de assistência, políticas de negócio, infraestrutura/restore corporativos, observabilidade externa, carga, revisão manual WCAG e pentest/PCI. Ver OPEN-ISSUES.md.

## Histórico da preparação

Tentativas anteriores ficaram BLOCKED por motor indisponível. Após autorização administrativa concluída pelo usuário no macOS, o motor iniciou e permitiu a execução real. A restrição operacional vigente é **somente Docker**. A tentativa anterior de PostgreSQL pelo Homebrew foi revertida: pacote e cluster vazio removidos, sem início de servidor. Dependências compartilhadas instaladas/atualizadas pelo Homebrew não foram removidas automaticamente para evitar afetar outras ferramentas. Nenhum runner nativo foi criado.

Repetição após navegação/IA/GitLab: migration 021 validada junto com as anteriores; oito fases aprovadas e limpeza completa em infrastructure-verification.json (2026-10-15T23:55:36.778Z). Atualização de mct-local executada com db:migrate, sem seed, preservando o volume e as contagens de inventário.
