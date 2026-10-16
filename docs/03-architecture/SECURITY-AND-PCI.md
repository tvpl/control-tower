# Segurança e contexto PCI

## Princípios
SSO OIDC; MFA no IdP conforme política; least privilege; segregação entre editar, aprovar, administrar e visualizar; RBAC + escopo de programa/frente e regras ABAC para gates.

## Papéis
- `PROGRAM_ADMIN`: estrutura e configurações; não concede aprovação PCI por padrão.
- `CHIEF_ARCHITECT`: escopo/arquitetura transversal, leitura e edição autorizada.
- `WORKSTREAM_LEAD`: atualizar entregáveis, riscos e previsões de sua frente.
- `PMO`: baselines, reports, marcos conforme alçada.
- `EXECUTIVE`: leitura consolidada e decisões conforme alçada.
- `GATE_APPROVER`: aprova gates específicos por categoria.
- `VIEWER`: leitura limitada.

## PCI e dados
Não persistir PAN, CVV, track data ou dados sensíveis de cartão. Registrar apenas metadados de classificação, escopo PCI, responsáveis, evidências e referências controladas. Classificação de aplicação fora/dentro de escopo PCI **exige avaliação formal**, pois integrações e acessos podem alterar enquadramento.

## Controles
TLS, secrets manager, criptografia at-rest, trilha auditável, autorização no backend, URLs de evidências assinadas e expiráveis, proteção CSRF conforme auth, rate limiting, headers seguros, validação de upload, scans de dependências, backup, restore testado, logs sem secrets.

## Aprovações
Exceções têm justificativa, aprovador com alçada, data de expiração, risco aceito, referência de decisão e revogação. Autoaprovação proibida em gates críticos conforme política.
