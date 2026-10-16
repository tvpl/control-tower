import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/server/infrastructure/auth";
import { getDb, type Database } from "../src/server/infrastructure/database";
nextEnv.loadEnvConfig(process.cwd());
if (process.env.NODE_ENV === "production")
  throw new Error("Seed fictício proibido em produção");
const db = getDb();
async function ensureDemoPmo(tx: Database, pid: string) {
  const [program] = await tx.query(
    "SELECT demo FROM portfolio.programs WHERE id=$1",
    [pid],
  );
  if (!program?.demo) return;
  const [u] = await tx.query(
    "INSERT INTO iam.users(subject,display_name,email,password_hash) VALUES('demo-pmo','Bruno Reis','pmo@demo.local',$1) ON CONFLICT(subject) DO UPDATE SET subject=EXCLUDED.subject RETURNING id",
    [hashPassword("Tower-Demo-2026!")],
  );
  await tx.query(
    "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,'PMO') ON CONFLICT DO NOTHING",
    [u.id, pid],
  );
}
await db.transaction(async (tx) => {
  const existing = await tx.query(
    "SELECT id FROM portfolio.programs WHERE code='ACQ-MOD'",
  );
  if (existing.length) {
    await ensureDemoPmo(tx, existing[0].id);
    console.log(
      "Inventário existente preservado; conta fictícia de PMO disponível.",
    );
    return;
  }
  const uid = randomUUID(),
    lead = randomUUID(),
    approver = randomUUID(),
    viewer = randomUUID(),
    pid = randomUUID();
  for (const [id, subject, name, email] of [
    [uid, "demo-admin", "Alex Morgan", "admin@demo.local"],
    [lead, "demo-lead", "Marina Costa", "lider@demo.local"],
    [approver, "demo-approver", "Rafael Almeida", "aprovador@demo.local"],
    [viewer, "demo-viewer", "Camila Santos", "leitor@demo.local"],
  ])
    await tx.query(
      "INSERT INTO iam.users(id,subject,display_name,email,password_hash) VALUES($1,$2,$3,$4,$5)",
      [id, subject, name, email, hashPassword("Tower-Demo-2026!")],
    );
  await tx.query(
    "INSERT INTO portfolio.programs(id,code,name,description,demo) VALUES($1,'ACQ-MOD','Modernização da adquirência','Inventário sintético para explorar arquitetura, delivery e governança.',true)",
    [pid],
  );
  const streams = [
    ["CORE", "Plataforma core"],
    ["INT", "Integrações & parceiros"],
    ["WEB", "Experiência digital"],
    ["INFRA", "Cloud & segurança"],
  ];
  const ws: string[] = [];
  for (const [code, name] of streams) {
    const id = randomUUID();
    ws.push(id);
    await tx.query(
      "INSERT INTO portfolio.workstreams(id,program_id,code,name,lead_id) VALUES($1,$2,$3,$4,$5)",
      [id, pid, code, name, lead],
    );
  }
  for (const [id, role, stream, cats] of [
    [uid, "PROGRAM_ADMIN", null, []],
    [uid, "CHIEF_ARCHITECT", null, []],
    [lead, "WORKSTREAM_LEAD", ws[0], []],
    [
      approver,
      "GATE_APPROVER",
      null,
      ["PRODUCT", "ENGINEERING", "SECURITY", "OPERATIONS"],
    ],
    [viewer, "VIEWER", null, []],
  ])
    await tx.query(
      "INSERT INTO iam.memberships(user_id,program_id,role,workstream_id,gate_categories) VALUES($1,$2,$3,$4,$5::jsonb)",
      [id, pid, role, stream, JSON.stringify(cats)],
    );
  const catalog = [
    ["AUT", "Autorização", "Autorizar transação", "Processar reversão"],
    [
      "CAD",
      "Credenciamento",
      "Cadastrar estabelecimento",
      "Gerenciar credenciais",
    ],
    ["CAP", "Captura & terminais", "Capturar transação", "Gerenciar terminais"],
    ["LIQ", "Liquidação", "Liquidar recebíveis", "Processar agenda financeira"],
    ["CON", "Conciliação", "Conciliar movimentos", "Tratar divergências"],
    ["POR", "Canais & portais", "Consultar vendas", "Gerenciar atendimento"],
    [
      "DAD",
      "Dados & analytics",
      "Publicar eventos financeiros",
      "Manter linhagem de dados",
    ],
    ["INF", "Infraestrutura", "Provisionar ambientes", "Garantir resiliência"],
    ["SEG", "Segurança & PCI", "Gerenciar identidades", "Avaliar escopo PCI"],
    ["OPS", "Operações", "Monitorar serviços", "Executar recuperação"],
  ];
  const deliveries: { id: string; node: string; code: string }[] = [];
  for (let i = 0; i < catalog.length; i++) {
    const [code, name, ...names] = catalog[i];
    const domain = randomUUID();
    await tx.query(
      "INSERT INTO portfolio.domains(id,program_id,code,name,owner_id,inventory_maturity) VALUES($1,$2,$3,$4,$5,$6)",
      [domain, pid, code, name, uid, i < 6 ? "STRUCTURED" : "IDENTIFIED"],
    );
    for (let j = 0; j < names.length; j++) {
      const cap = randomUUID();
      await tx.query(
        "INSERT INTO portfolio.capabilities(id,program_id,domain_id,code,name,criticality,inventory_maturity,acceptance_criteria) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
        [
          cap,
          pid,
          domain,
          `${code}-00${j + 1}`,
          names[j],
          i === 0 ? "CRITICAL" : "HIGH",
          i < 6 ? "STRUCTURED" : "IDENTIFIED",
          JSON.stringify([
            `Demonstrar ${names[j].toLowerCase()} com evidência de teste e aceite do responsável.`,
          ]),
        ],
      );
      await tx.query(
        "INSERT INTO portfolio.program_nodes(program_id,entity_type,entity_id) VALUES($1,'capabilities',$2)",
        [pid, cap],
      );
      if (i >= 6 && j === 1) continue;
      const layer =
        i < 5
          ? "BACKEND"
          : i === 5
            ? "CLIENT"
            : i === 6
              ? "DATA"
              : i === 7
                ? "INFRA"
                : i === 8
                  ? "SECURITY"
                  : "OPERATIONS";
      for (let k = 0; k < (i < 4 ? 2 : 1); k++) {
        const id = randomUUID(),
          node = randomUUID();
        const delcode = `${code}-${String(10 + j * 2 + k).padStart(3, "0")}`;
        const blocked = (i === 0 && j === 0 && k === 1) || (i === 3 && j === 1);
        const done = i === 1 || (i === 2 && j === 0);
        const forecast = `2026-${i < 5 ? "10" : "11"}-${String(20 + j * 4 + k).padStart(2, "0")}`;
        await tx.query(
          "INSERT INTO delivery.deliverables(id,program_id,workstream_id,code,name,layer,deliverable_type,owner_id,forecast_date,execution_status,delivery_stage,planning_status,acceptance_criteria,accepted,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PLANNED',$12,$13,$14)",
          [
            id,
            pid,
            ws[k === 1 ? 1 : i === 5 ? 2 : i >= 7 ? 3 : 0],
            delcode,
            k === 1
              ? `Contrato parceiro · ${names[j]}`
              : `${layer === "BACKEND" ? "API" : layer === "CLIENT" ? "Portal" : "Serviço"} · ${names[j]}`,
            k === 1 ? "PARTNER" : layer,
            k === 1 ? "CONTRACT" : layer === "CLIENT" ? "UI" : "API",
            lead,
            forecast,
            blocked
              ? "BLOCKED"
              : done
                ? "DONE"
                : i >= 7
                  ? "NOT_STARTED"
                  : "IN_PROGRESS",
            done ? "SIT" : i >= 7 ? "SPECIFICATION" : "DEVELOPMENT",
            "Teste integrado aprovado, contrato revisado e critérios funcionais comprovados.",
            done && i === 1,
            new Date(Date.UTC(2026, 9, i === 3 ? 1 : 13, 12)).toISOString(),
          ],
        );
        await tx.query(
          "INSERT INTO portfolio.program_nodes(id,program_id,entity_type,entity_id) VALUES($1,$2,'deliverables',$3)",
          [node, pid, id],
        );
        await tx.query(
          "INSERT INTO delivery.deliverable_capabilities(program_id,deliverable_id,capability_id) VALUES($1,$2,$3)",
          [pid, id, cap],
        );
        deliveries.push({ id, node, code: delcode });
      }
      const comp = randomUUID();
      await tx.query(
        "INSERT INTO architecture.components(id,program_id,code,name,kind,supplier,owner_id) VALUES($1,$2,$3,$4,'SERVICE',$5,$6)",
        [
          comp,
          pid,
          `${code}-SVC-${j}`,
          `${name} · serviço ${j + 1}`,
          i < 4
            ? "Catálogo fictício · validar fornecedor"
            : "Plataforma interna (fictícia)",
          uid,
        ],
      );
      await tx.query(
        "INSERT INTO portfolio.program_nodes(program_id,entity_type,entity_id) VALUES($1,'components',$2)",
        [pid, comp],
      );
      await tx.query(
        "INSERT INTO architecture.capability_components(program_id,capability_id,component_id) VALUES($1,$2,$3)",
        [pid, cap, comp],
      );
    }
  }
  for (const [code, name, date, start, end] of [
    ["R01", "Fundação & credenciamento", "2026-10-30", 0, 10],
    ["R02", "Core transacional", "2026-11-20", 10, 20],
    ["R03", "Escala & operação", "2026-12-15", 20, 40],
  ] as const) {
    const rid = randomUUID();
    await tx.query(
      "INSERT INTO delivery.releases(id,program_id,code,name,planned_date,forecast_date) VALUES($1,$2,$3,$4,$5,$6)",
      [rid, pid, code, name, date, code === "R02" ? "2026-11-27" : date],
    );
    await tx.query(
      "INSERT INTO portfolio.program_nodes(program_id,entity_type,entity_id) VALUES($1,$2,$3)",
      [pid, "releases", rid],
    );
    for (const d of deliveries.slice(start, end))
      await tx.query(
        "INSERT INTO delivery.release_deliverables(program_id,release_id,deliverable_id) VALUES($1,$2,$3)",
        [pid, rid, d.id],
      );
    await tx.query(
      "INSERT INTO delivery.milestones(program_id,release_id,name,baseline_date,forecast_date) VALUES($1,$2,$3,$4,$5)",
      [
        pid,
        rid,
        `Gate de implantação · ${code}`,
        date,
        code === "R02" ? "2026-11-27" : date,
      ],
    );
  }
  for (const [index, [code, name, category]] of [
    ["SIT", "Testes de integração", "ENGINEERING"],
    ["UAT", "Aceite do negócio", "PRODUCT"],
    ["PCI", "Avaliação de segurança / PCI", "SECURITY"],
    ["OPS", "Operação & rollback", "OPERATIONS"],
  ].entries()) {
    const gate = randomUUID();
    await tx.query(
      "INSERT INTO governance.gate_definitions(id,code,name,category) VALUES($1,$2,$3,$4)",
      [gate, code, name, category],
    );
    for (const d of deliveries.slice(2, 8))
      await tx.query(
        "INSERT INTO governance.gate_assessments(program_id,subject_node_id,gate_id,gate_version,result,justification) VALUES($1,$2,$3,1,$4,$5)",
        [
          pid,
          d.node,
          gate,
          index === 0 ? "PENDING" : "NOT_ASSESSED",
          "Seed fictício; não representa aprovação real.",
        ],
      );
  }
  for (const [s, t, description] of [
    [1, 10, "Homologação do contrato de autorização bloqueia captura."],
    [10, 16, "Eventos de captura necessários para conciliação."],
    [16, 20, "Contrato financeiro necessário para disponibilizar eventos."],
  ] as const)
    await tx.query(
      "INSERT INTO governance.dependencies(program_id,source_node_id,target_node_id,dependency_type,criticality,status,needed_by,owner_id,description) VALUES($1,$2,$3,'BLOCKS','CRITICAL','BLOCKED','2026-10-22',$4,$5)",
      [pid, deliveries[s].node, deliveries[t].node, lead, description],
    );
  for (const [title, action, date] of [
    [
      "Sandbox do parceiro ainda indisponível",
      "Confirmar provisionamento e plano alternativo com fornecedor.",
      "2026-10-20",
    ],
    [
      "Contrato de eventos financeiros sem revisão",
      "Revisar esquema e obter aceite do domínio de dados.",
      "2026-10-23",
    ],
    [
      "Plano de rollback pendente",
      "Validar procedimento de recuperação com operações.",
      "2026-11-02",
    ],
  ])
    await tx.query(
      "INSERT INTO governance.raid_items(program_id,kind,title,severity,owner_id,action_plan,due_date) VALUES($1,'RISK',$2,'CRITICAL',$3,$4,$5)",
      [pid, title, lead, action, date],
    );
  await tx.query(
    "INSERT INTO governance.decisions(program_id,code,name,rationale,alternatives,owner_id,due_date) VALUES($1,'DEC-001','Definir estratégia de coexistência','Evitar corte sem rollback comprovado.','Migração por ondas; corte integral; operação paralela.',$2,'2026-10-20')",
    [pid, uid],
  );
  console.log(
    "Inventário FICTÍCIO criado. Login: admin@demo.local / Tower-Demo-2026!",
  );
  await ensureDemoPmo(tx, pid);
});
process.exit(0);
