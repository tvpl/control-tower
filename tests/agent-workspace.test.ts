import { beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { mutate } from "../src/server/application/inventory";
import {
  exportAgentPackage,
  previewAgentTemplate,
  commitAgentTemplate,
} from "../src/server/application/agent-workspace";
import { hashPayload } from "../src/server/domain/canonical";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  admin = randomUUID(),
  viewer = randomUUID(),
  domain = randomUUID(),
  ws = randomUUID();
let d: any;
beforeAll(async () => {
  await migrate(db);
  for (const id of [admin, viewer])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$1,'Teste IA')",
      [id],
    );
  await db.query(
    "INSERT INTO portfolio.programs(id,code,name) VALUES($1,'AGENT','Projeto IA')",
    [pid],
  );
  for (const [id, role] of [
    [admin, "PROGRAM_ADMIN"],
    [viewer, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [id, pid, role],
    );
  await db.query(
    "INSERT INTO portfolio.domains(id,program_id,code,name) VALUES($1,$2,'DOM','Domínio')",
    [domain, pid],
  );
  await db.query(
    "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,'WS','Frente')",
    [ws, pid],
  );
  d = await mutate(admin, pid, "deliverables", {
    code: "D-IA",
    name: "Entregável IA",
    workstream_id: ws,
    layer: "BACKEND",
    deliverable_type: "API",
  });
  await mutate(admin, pid, "connections", {
    name: "Origem privada",
    connector_type: "GITLAB",
    base_url: "https://gitlab.com",
    project: "org/repo",
    secret_env: "MCT_CONNECTOR_PRIVATE",
  });
});
function template(changes: any[]) {
  return {
    format: "mct-agent/1",
    programId: pid,
    exportedAt: "2026-10-16T00:00:00.000Z",
    changes,
  };
}
const update = (values: any = { forecast_date: "2026-12-01" }) => ({
  action: "UPDATE",
  kind: "deliverables",
  id: d.id,
  expectedVersion: Number(d.version),
  values,
  reason: "Preenchimento revisado",
});
it("exporta contexto/checklist/template sem conexões, credenciais ou e-mails e preserva KEEP", async () => {
  const pack = await exportAgentPackage(viewer, pid);
  expect(pack.context.deliverables[0].id).toBe(d.id);
  expect(pack.template.changes.every((c) => c.action === "KEEP")).toBe(true);
  expect(pack.prompt).toContain("Não invente");
  expect(pack.report).toContain("Checklist");
  expect(JSON.stringify(pack)).not.toContain("MCT_CONNECTOR_PRIVATE");
  expect(pack.context.connections).toBeUndefined();
});
it("prévia passa pelo domínio sem persistir dados, auditoria ou proveniência; commit é idempotente", async () => {
  const t = template([update()]);
  const count = (
    await db.query(
      "SELECT count(*)::int AS n FROM audit.audit_events WHERE program_id=$1",
      [pid],
    )
  )[0].n;
  const p = await previewAgentTemplate(admin, pid, t);
  expect(p.valid).toBe(true);
  expect(p.lines[0].diff).toEqual([
    { field: "forecast_date", from: null, to: "2026-12-01" },
  ]);
  expect(
    (
      await db.query(
        "SELECT forecast_date FROM delivery.deliverables WHERE id=$1",
        [d.id],
      )
    )[0].forecast_date,
  ).toBeNull();
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM audit.audit_events WHERE program_id=$1",
        [pid],
      )
    )[0].n,
  ).toBe(count);
  const key = randomUUID();
  const r = await commitAgentTemplate(admin, pid, t, p.hash, key);
  expect(await commitAgentTemplate(admin, pid, t, p.hash, key)).toEqual(r);
  const [source] = await db.query(
    "SELECT source_type,source_namespace FROM integration.field_provenance WHERE entity_id=$1 AND field_name='forecast_date' ORDER BY sequence DESC",
    [d.id],
  );
  expect(source).toMatchObject({
    source_type: "IMPORT",
    source_namespace: "agent-template",
  });
  [d] = await db.query("SELECT * FROM delivery.deliverables WHERE id=$1", [
    d.id,
  ]);
});
it("lote inválido reverte também mudanças válidas anteriores", async () => {
  const t = template([
    update({ forecast_date: "2027-01-10" }),
    {
      action: "CREATE",
      kind: "capabilities",
      values: { code: "BAD", name: "Sem domínio" },
      reason: "Completar inventário",
    },
  ]);
  const p = await previewAgentTemplate(admin, pid, t);
  expect(p.valid).toBe(false);
  expect(p.lines[1].errors.length).toBeGreaterThan(0);
  await expect(
    commitAgentTemplate(admin, pid, t, p.hash, randomUUID()),
  ).rejects.toThrow(/Lote não aplicado/);
  expect(
    (
      await db.query(
        "SELECT forecast_date FROM delivery.deliverables WHERE id=$1",
        [d.id],
      )
    )[0].forecast_date,
  ).toBe("2026-12-01");
});
it("cria estrutura com referências reais e bloqueia hash adulterado, outro projeto e versão obsoleta", async () => {
  const t = template([
    {
      action: "CREATE",
      kind: "capabilities",
      values: {
        code: "NEW-IA",
        name: "Nova capacidade",
        domain_id: domain,
        acceptance_criteria: ["Resultado verificável"],
      },
      reason: "Preencher escopo proposto",
    },
  ]);
  const p = await previewAgentTemplate(admin, pid, t);
  expect(p.valid).toBe(true);
  await expect(
    commitAgentTemplate(admin, pid, t, "a".repeat(64), randomUUID()),
  ).rejects.toThrow(/Arquivo mudou/);
  await commitAgentTemplate(admin, pid, t, p.hash, randomUUID());
  expect(
    (
      await db.query(
        "SELECT scope_status FROM portfolio.capabilities WHERE code='NEW-IA'",
      )
    )[0].scope_status,
  ).toBe("PROPOSED");
  await expect(previewAgentTemplate(admin, randomUUID(), t)).rejects.toThrow(
    /outro projeto/,
  );
  const stale = template([{ ...update(), expectedVersion: 999 }]);
  expect(
    (await previewAgentTemplate(admin, pid, stale)).lines[0].errors[0],
  ).toMatch(/obsoleta/);
});
it("rejeita campos protegidos, leitor, IDs duplicados e escopo aprovado sem change control", async () => {
  for (const values of [
    { accepted: true },
    { delivery_stage: "PRODUCTION" },
    { scope_status: "APPROVED" },
  ])
    expect(
      (await previewAgentTemplate(admin, pid, template([update(values)])))
        .valid,
    ).toBe(false);
  expect(
    (await previewAgentTemplate(viewer, pid, template([update()]))).valid,
  ).toBe(false);
  const dup = await previewAgentTemplate(
    admin,
    pid,
    template([update(), update()]),
  );
  expect(dup.valid).toBe(false);
  await db.query(
    "UPDATE delivery.deliverables SET scope_status='APPROVED' WHERE id=$1",
    [d.id],
  );
  expect(
    (
      await previewAgentTemplate(
        admin,
        pid,
        template([update({ name: "Escopo alterado" })]),
      )
    ).lines[0].errors[0],
  ).toMatch(/change control/);
});
it("commit revalida após a prévia e nunca aplica uma versão que mudou", async () => {
  const t = template([update({ forecast_date: "2027-02-01" })]);
  expect((await previewAgentTemplate(admin, pid, t)).valid).toBe(true);
  await db.query(
    "UPDATE delivery.deliverables SET version=version+1 WHERE id=$1",
    [d.id],
  );
  await expect(
    commitAgentTemplate(admin, pid, t, hashPayload(t), randomUUID()),
  ).rejects.toThrow(/obsoleta/);
});

it("pacote fornece schemas e suporta atualização do projeto atual sem permitir criar/mover projetos", async () => {
  const b = await exportAgentPackage(admin, pid);
  expect(b.fieldSchemas.deliverables.properties.execution_status).toBeTruthy();
  expect(b.fieldSchemas.deliverables.properties.accepted).toBeUndefined();
  const own = b.template.changes.find((c) => c.kind === "programs")!;
  const t = template([
    {
      ...own,
      action: "UPDATE",
      values: { description: "Contexto preenchido pela IA e revisado" },
      reason: "Revisar descrição do projeto",
    },
  ]);
  expect((await previewAgentTemplate(admin, pid, t)).valid).toBe(true);
  const bad = template([
    {
      ...own,
      action: "CREATE",
      id: undefined,
      expectedVersion: undefined,
      values: { name: "Outro projeto" },
      reason: "Criar outro projeto",
    },
  ]);
  expect((await previewAgentTemplate(admin, pid, bad)).valid).toBe(false);
});

it("IA contextual recorta template e contagens, preservando o catálogo autorizado como referência", async () => {
  const other = await mutate(admin, pid, "deliverables", {
    code: "OTHER-IA",
    name: "Outra entrega",
    workstream_id: ws,
    layer: "BACKEND",
    deliverable_type: "API",
  });
  const pack = await exportAgentPackage(viewer, pid, {
    view: "deliverables",
    intent: "FILL",
    filters: { search: "D-IA" },
  });
  expect(pack.focus?.deliverableIds).toEqual([d.id]);
  expect(pack.focus?.metrics.total).toBe(1);
  expect(pack.context.deliverables).toHaveLength(2);
  expect(pack.template.changes.map((c) => c.id)).toEqual([d.id]);
  expect(pack.report).toContain("Contagens do recorte");
  expect(pack.focus?.indicatorScope).toContain("projeto");
  expect(JSON.stringify(pack)).not.toContain("MCT_CONNECTOR_PRIVATE");
  await expect(
    exportAgentPackage(viewer, pid, {
      view: "deliverables",
      filters: { search: "D-IA" },
      selection: [other.id],
    }),
  ).rejects.toThrow(/fora do recorte/);
});
it("registro aberto usa versões atuais e não aceita ID alheio nem configurações privadas", async () => {
  const pack = await exportAgentPackage(admin, pid, {
    view: "overview",
    intent: "EXPLAIN",
    subject: { kind: "deliverables", id: d.id },
  });
  const [current] = await db.query(
    "SELECT version FROM delivery.deliverables WHERE id=$1",
    [d.id],
  );
  expect(pack.template.changes.map((c) => c.id)).toEqual([d.id]);
  expect(pack.template.changes[0].expectedVersion).toBe(
    Number(current.version),
  );
  expect(pack.prompt).toContain("Markdown");
  expect(pack.prompt).toContain("Não invente");
  await expect(
    exportAgentPackage(admin, pid, {
      view: "overview",
      subject: { kind: "deliverables", id: randomUUID() },
    }),
  ).rejects.toThrow(/não disponível/);
  await expect(
    exportAgentPackage(admin, pid, {
      view: "integrations",
      subject: { kind: "connections", id: randomUUID() },
    }),
  ).rejects.toThrow();
});
it("planejamento contextual mantém datas desconhecidas e checklist de lacunas real", async () => {
  const [other] = await db.query(
    "SELECT id FROM delivery.deliverables WHERE code='OTHER-IA' AND program_id=$1",
    [pid],
  );
  const pack = await exportAgentPackage(admin, pid, {
    view: "delivery",
    intent: "PLAN",
    selection: [other.id],
  });
  expect(pack.focus?.metrics.withoutForecast).toBe(1);
  expect(pack.report).toContain("forecast desconhecido");
  expect(pack.prompt).toContain("sem mudar baseline");
  expect(pack.checklist).toContain(
    "Revisar 1 entregas sem forecast, sem inventar datas",
  );
  expect(pack.template.changes).toHaveLength(1);
});
it("foco em feature inclui descendentes e suas entregas, sem incluir o restante do projeto", async () => {
  const parent = await mutate(admin, pid, "capabilities", {
    code: "FOCUS-PARENT",
    name: "Feature pai",
    domain_id: domain,
  });
  const child = await mutate(admin, pid, "capabilities", {
    code: "FOCUS-CHILD",
    name: "Feature filha",
    domain_id: domain,
    parent_id: parent.id,
  });
  const linked = await mutate(admin, pid, "deliverables", {
    code: "D-FOCUS",
    name: "Entrega da feature",
    workstream_id: ws,
    layer: "BACKEND",
    deliverable_type: "API",
    capability_ids: [child.id],
  });
  const pack = await exportAgentPackage(viewer, pid, {
    view: "capabilities",
    subject: { kind: "capabilities", id: parent.id },
  });
  expect(pack.focus?.deliverableIds).toEqual([linked.id]);
  expect(new Set(pack.template.changes.map((c) => c.id))).toEqual(
    new Set([parent.id, child.id, linked.id]),
  );
  await expect(
    exportAgentPackage(viewer, pid, {
      view: "deliverables",
      selection: [linked.id, linked.id],
    }),
  ).rejects.toThrow(/repetidos/);
});
