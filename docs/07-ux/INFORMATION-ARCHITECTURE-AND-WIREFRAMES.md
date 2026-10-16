# Arquitetura de informação e wireframes funcionais

**Wireframes estruturais, NÃO prescrevem cores nem estética.**

## Navegação proposta (validar em design)
`Program Switcher | Command/Busca | Overview | Scope | Architecture | Delivery | Dependencies | Readiness | Reports | Admin`
Contexto persistente: programa, domínio, frente, release, período, owner.

## Tela A — Overview
```
[Programa] [Período] [Filtro] [Qualidade/Frescor]
[Saúde geral + por quê] [Baseline vs forecast] [Prontidão] [Decisões pendentes]
[Tendência temporal]       [Frentes por risco]
[Top bloqueios]            [Próximos marcos]
[O que mudou na semana]    [Abrir report]
```

## Tela B — Capability Map
```
[Busca capacidades] [Domínio] [Frente] [Release] [Camada] [Legenda]
[Árvore de domínios/capacidades] | [Matriz de camadas rolável/virtualizada]
                                 |  CLIENT CAAL BACKEND PARTNER DATA INFRA
[Capacidade A]                 |    ... células de status ...
[Capacidade B]                 |    ... células de status ...
[Detalhe lateral da célula: entregáveis, owners, datas, bloqueios, evidências]
```

## Tela C — Entregável
```
[breadcrumb] [ID + título] [owner] [saúde] [atualizado em]
[Status por dimensão] [Baseline/forecast/actual] [Ações]
[Escopo & aceite] [Camada/componente/fornecedor]
[Dependências] [Gates/evidências] [Links Jira/ADO]
[Comentários/decisões] [Timeline auditável]
```

## Tela D — Delivery Roadmap
```
[Release/Onda] [Frente] [Baseline/Forecast/Real]
[Marcos + timeline com dependências e atrasos]
[Lista de mudanças vs baseline]
[Detalhe de marco / release / responsáveis]
```

## Tela E — Dependencies & RAID
```
[Lista priorizada] [Grafo de dependências] [Filtros por impacto]
[Selecionar nó → caminhos impactados, owner, prazo, ação]
[Decisões em aberto e escalonamento]
```

## Tela F — Readiness
```
[Release] [Prontidão binária] [Gates bloqueantes] [Exceções]
[Checklist por perfil, categoria, evidência e aprovador]
[Histórico e autorização de passagem]
```

## Tela G — Report
```
[Snapshot e comparação] [Prévia narrativa revisável]
[KPIs com fontes] [Mudanças] [Riscos] [Decisões]
[Revisar] [Publicar] [Exportar]
```

## Interações-chave
Click cell → drawer → entregável → evidência. Drill-down mantém filtros. Breadcrumb navegável. Alterações de forecast pedem motivo. Aprovações mostram gates e permissão. Exportações identificam snapshot e origem.
