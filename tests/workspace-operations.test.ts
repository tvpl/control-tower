import { beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { mutate } from "../src/server/application/inventory";
import {
  previewBulkEdit,
  commitBulkEdit,
} from "../src/server/application/bulk-edit";
import {
  previewGitLabLinks,
  commitGitLabLinks,
} from "../src/server/application/gitlab-links";
import { linkExternal } from "../src/server/application/sync-worker";
import { bulkValuesSchema } from "../src/server/domain/workspace-batches";
import { gitLabCandidates } from "../src/shared/gitlab-matching";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  pid = randomUUID(),
  foreign = randomUUID(),
  admin = randomUUID(),
  viewer = randomUUID(),
  lead = randomUUID(),
  ws = randomUUID(),
  otherWS = randomUUID();
let foreignRecord: any;
let connection: any,
  seq = 0;
beforeAll(async () => {
  await migrate(db);
  for (const u of [admin, viewer, lead])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$1,'Operações teste')",
      [u],
    );
  for (const [id, code] of [
    [pid, "OPS"],
    [foreign, "OTHER"],
  ]) {
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Projeto operações')",
      [id, code],
    );
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,'PROGRAM_ADMIN')",
      [admin, id],
    );
  }
  await db.query(
    "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,'VIEWER')",
    [viewer, pid],
  );
  for (const [id, code] of [
    [ws, "OWN"],
    [otherWS, "OTHER"],
  ])
    await db.query(
      "INSERT INTO portfolio.workstreams(id,program_id,code,name) VALUES($1,$2,$3,'Frente teste')",
      [id, pid, code],
    );
  await db.query(
    "INSERT INTO iam.memberships(user_id,program_id,role,workstream_id) VALUES($1,$2,'WORKSTREAM_LEAD',$3)",
    [lead, pid, ws],
  );
  connection = await mutate(admin, pid, "connections", {
    name: "GitLab operações",
    connector_type: "GITLAB",
    base_url: "https://gitlab.com",
    project: "org/projeto",
    secret_env: "MCT_CONNECTOR_TEST_ONLY",
    execution_owner: "EXTERNAL",
  });
  const foreignStream = await mutate(admin, foreign, "workstreams", {
    code: "FOREIGN",
    name: "Frente de outro projeto",
  });
  foreignRecord = await mutate(admin, foreign, "deliverables", {
    code: "FOREIGN-D",
    name: "Entrega de outro projeto",
    workstream_id: foreignStream.id,
    layer: "BACKEND",
    deliverable_type: "API",
  });
});
async function deliverable(date: string | null = "2028-02-27", stream = ws) {
  return mutate(admin, pid, "deliverables", {
    code: `OPS-${++seq}`,
    name: "Entregável operacional",
    workstream_id: stream,
    layer: "BACKEND",
    deliverable_type: "API",
    forecast_date: date,
  });
}
async function row(id: string) {
  return (
    await db.query("SELECT * FROM delivery.deliverables WHERE id=$1", [id])
  )[0];
}
function edit(ds: any[], change: any = { action: "SHIFT_FORECAST", days: 3 }) {
  return {
    items: ds.map((d) => ({ id: d.id, expectedVersion: Number(d.version) })),
    change,
    reason: "Replanejamento confirmado com responsáveis",
  };
}
async function linkItem(
  d: any,
  externalId: string,
  mode = "REFERENCE",
  version: number | null = null,
) {
  const [node] = await db.query(
    "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1",
    [d.id],
  );
  return {
    externalId,
    subjectNodeId: node.id,
    mode,
    expectedReferenceVersion: version,
  };
}
function links(items: any[]) {
  return {
    expectedConnectionVersion: Number(connection.version),
    items,
    reason: "Vínculos revisados no projeto",
  };
}
it("edição parcial não injeta defaults em campos não selecionados", () => {
  expect(bulkValuesSchema.parse({ owner_id: null })).toEqual({
    owner_id: null,
  });
  expect(bulkValuesSchema.parse({ forecast_date: "2028-03-01" })).toEqual({
    forecast_date: "2028-03-01",
  });
});
it("prévia de datas atravessa mês/ano bissexto sem persistir versões ou auditoria", async () => {
  const d = await deliverable(),
    p = edit([d]);
  const before = (
    await db.query(
      "SELECT count(*)::int AS n FROM audit.audit_events WHERE program_id=$1",
      [pid],
    )
  )[0].n;
  const result = await previewBulkEdit(admin, pid, p);
  expect(result.valid).toBe(true);
  expect(result.lines[0].diff).toEqual([
    { field: "forecast_date", from: "2028-02-27", to: "2028-03-01" },
  ]);
  expect((await row(d.id)).forecast_date).toBe("2028-02-27");
  expect(Number((await row(d.id)).version)).toBe(Number(d.version));
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM audit.audit_events WHERE program_id=$1",
        [pid],
      )
    )[0].n,
  ).toBe(before);
});
it("confirma lote idempotente, preserva aceite/baseline e registra proveniência manual", async () => {
  const a = await deliverable(),
    b = await deliverable(),
    p = edit([a, b]),
    preview = await previewBulkEdit(admin, pid, p),
    key = randomUUID();
  const result = await commitBulkEdit(admin, pid, p, preview.hash, key);
  expect(await commitBulkEdit(admin, pid, p, preview.hash, key)).toEqual(
    result,
  );
  for (const d of [a, b]) {
    const r = await row(d.id);
    expect(r.forecast_date).toBe("2028-03-01");
    expect(r.accepted).toBe(false);
    expect(r.baseline_date).toBe(d.baseline_date);
    expect(Number(r.version)).toBe(Number(d.version) + 1);
  }
  const [source] = await db.query(
    "SELECT source_type FROM integration.field_provenance WHERE entity_id=$1 AND field_name='forecast_date' ORDER BY sequence DESC",
    [a.id],
  );
  expect(source.source_type).toBe("MANUAL");
});
it("deslocamento desconhecido, versão concorrente ou outro projeto revertem o lote completo", async () => {
  const a = await deliverable(),
    b = await deliverable(null);
  const p = edit([a, b]),
    invalid = await previewBulkEdit(admin, pid, p);
  expect(invalid.valid).toBe(false);
  expect(invalid.lines[1].errors[0]).toMatch(/desconhecido/);
  await expect(
    commitBulkEdit(admin, pid, p, invalid.hash, randomUUID()),
  ).rejects.toThrow(/Nenhuma alteração/);
  expect((await row(a.id)).forecast_date).toBe(a.forecast_date);
  const c = await deliverable(),
    q = edit([a, c]),
    valid = await previewBulkEdit(admin, pid, q);
  await db.query(
    "UPDATE delivery.deliverables SET version=version+1 WHERE id=$1",
    [c.id],
  );
  await expect(
    commitBulkEdit(admin, pid, q, valid.hash, randomUUID()),
  ).rejects.toThrow(/obsoleta/);
  expect((await row(a.id)).forecast_date).toBe(a.forecast_date);
  expect(
    (
      await previewBulkEdit(admin, pid, {
        ...q,
        items: [
          {
            id: foreignRecord.id,
            expectedVersion: Number(foreignRecord.version),
          },
        ],
      })
    ).valid,
  ).toBe(false);
});
it("leitor e líder de outra frente não contornam alçada via lote", async () => {
  const a = await deliverable(),
    b = await deliverable("2028-02-27", otherWS);
  expect((await previewBulkEdit(viewer, pid, edit([a]))).valid).toBe(false);
  const p = edit([a, b]),
    preview = await previewBulkEdit(lead, pid, p);
  expect(preview.valid).toBe(false);
  await expect(
    commitBulkEdit(lead, pid, p, preview.hash, randomUUID()),
  ).rejects.toThrow(/Nenhuma alteração/);
  expect((await row(a.id)).forecast_date).toBe(a.forecast_date);
});
it("rejeita campos protegidos, seleção vazia/repetida e hash alterado", async () => {
  const d = await deliverable();
  for (const field of [
    "accepted",
    "delivery_stage",
    "baseline_date",
    "scope_status",
  ])
    expect(() =>
      previewBulkEdit(
        admin,
        pid,
        edit([d], { action: "SET", values: { [field]: true } }),
      ),
    ).toThrow();
  expect(() => previewBulkEdit(admin, pid, edit([]))).toThrow();
  expect((await previewBulkEdit(admin, pid, edit([d, d]))).valid).toBe(false);
  const p = edit([d]),
    preview = await previewBulkEdit(admin, pid, p);
  expect(() =>
    commitBulkEdit(
      admin,
      pid,
      { ...p, reason: "Conteúdo diferente" },
      preview.hash,
      randomUUID(),
    ),
  ).toThrow(/mudou/);
});
it("escopo aprovado ainda exige change control, mas forecast mutável continua permitido", async () => {
  const d = await deliverable();
  await db.query(
    "UPDATE delivery.deliverables SET scope_status='APPROVED' WHERE id=$1",
    [d.id],
  );
  expect(
    (
      await previewBulkEdit(
        admin,
        pid,
        edit([d], { action: "SET", values: { criticality: "HIGH" } }),
      )
    ).valid,
  ).toBe(false);
  expect(
    (
      await previewBulkEdit(
        admin,
        pid,
        edit([d], { action: "SET", values: { forecast_date: "2028-04-01" } }),
      )
    ).valid,
  ).toBe(true);
});
it("vínculos GitLab têm prévia sem gravar e confirmação atômica/idempotente sem mudar execução", async () => {
  const a = await deliverable(),
    b = await deliverable(),
    items = [
      await linkItem(a, "gid://gitlab/WorkItem/1001"),
      await linkItem(b, "gid://gitlab/WorkItem/1002", "EXECUTION"),
    ],
    p = links(items);
  const before = (
    await db.query(
      "SELECT count(*)::int AS n FROM integration.external_references WHERE connection_id=$1",
      [connection.id],
    )
  )[0].n;
  const preview = await previewGitLabLinks(admin, pid, connection.id, p);
  expect(preview.valid).toBe(true);
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM integration.external_references WHERE connection_id=$1",
        [connection.id],
      )
    )[0].n,
  ).toBe(before);
  const key = randomUUID(),
    result = await commitGitLabLinks(
      admin,
      pid,
      connection.id,
      p,
      preview.hash,
      key,
    );
  expect(
    await commitGitLabLinks(admin, pid, connection.id, p, preview.hash, key),
  ).toEqual(result);
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM integration.external_references WHERE connection_id=$1",
        [connection.id],
      )
    )[0].n,
  ).toBe(before + 2);
  expect((await row(b.id)).execution_status).toBe("NOT_STARTED");
  expect((await row(b.id)).accepted).toBe(false);
});
it("vínculo concorrente, duplicado, destino alheio e hash incorreto preservam todos os vínculos", async () => {
  const a = await deliverable(),
    item = await linkItem(a, "gid://gitlab/WorkItem/2001"),
    p = links([item]),
    preview = await previewGitLabLinks(admin, pid, connection.id, p);
  expect(() =>
    commitGitLabLinks(
      admin,
      pid,
      connection.id,
      p,
      "f".repeat(64),
      randomUUID(),
    ),
  ).toThrow(/mudou/);
  expect(
    (await previewGitLabLinks(admin, pid, connection.id, links([item, item])))
      .valid,
  ).toBe(false);
  await linkExternal(
    admin,
    pid,
    connection.id,
    {
      externalId: item.externalId,
      subjectNodeId: item.subjectNodeId,
      mode: item.mode,
      reason: "Vínculo concorrente",
    },
    randomUUID(),
  );
  await expect(
    commitGitLabLinks(admin, pid, connection.id, p, preview.hash, randomUUID()),
  ).rejects.toThrow(/Vínculo alterado/);
  const fresh = await linkItem(a, "gid://gitlab/WorkItem/2002");
  const invalid = links([
    fresh,
    {
      ...fresh,
      externalId: "gid://gitlab/WorkItem/2003",
      subjectNodeId: foreign,
    },
  ]);
  const v = await previewGitLabLinks(admin, pid, connection.id, invalid);
  await expect(
    commitGitLabLinks(admin, pid, connection.id, invalid, v.hash, randomUUID()),
  ).rejects.toThrow(/Nenhuma alteração/);
  expect(
    await db.query(
      "SELECT id FROM integration.external_references WHERE external_id=$1",
      [fresh.externalId],
    ),
  ).toHaveLength(0);
});
it("versão de vínculo e destino existente não são sobrescritos por lote antigo", async () => {
  const a = await deliverable(),
    b = await deliverable();
  const original = await linkItem(a, "gid://gitlab/WorkItem/2901");
  const ref: any = await linkExternal(
    admin,
    pid,
    connection.id,
    {
      externalId: original.externalId,
      subjectNodeId: original.subjectNodeId,
      mode: "REFERENCE",
      reason: "Primeiro vínculo revisado",
    },
    randomUUID(),
  );
  const item = {
      ...original,
      mode: "EXECUTION",
      expectedReferenceVersion: Number(ref.version),
    },
    p = links([item]),
    preview = await previewGitLabLinks(admin, pid, connection.id, p);
  expect(preview.valid).toBe(true);
  await commitGitLabLinks(
    admin,
    pid,
    connection.id,
    p,
    preview.hash,
    randomUUID(),
  );
  expect((await previewGitLabLinks(admin, pid, connection.id, p)).valid).toBe(
    false,
  );
  const remap = await linkItem(
    b,
    original.externalId,
    "REFERENCE",
    Number(ref.version) + 1,
  );
  expect(
    (await previewGitLabLinks(admin, pid, connection.id, links([remap]))).valid,
  ).toBe(false);
});
it("conclusão operacional em lote não concede aceite e previsão pode ser antecipada", async () => {
  const initial = await deliverable("2028-03-01");
  expect(
    (
      await previewBulkEdit(
        admin,
        pid,
        edit([initial], {
          action: "SET",
          values: { execution_status: "DONE" },
        }),
      )
    ).valid,
  ).toBe(false);
  const d = await mutate(
      admin,
      pid,
      "deliverables",
      { execution_status: "IN_PROGRESS" },
      initial.id,
      Number(initial.version),
      "Execução iniciada",
    ),
    p = edit([d], { action: "SET", values: { execution_status: "DONE" } });
  const preview = await previewBulkEdit(admin, pid, p);
  expect(preview.valid).toBe(true);
  await commitBulkEdit(admin, pid, p, preview.hash, randomUUID());
  const current = await row(d.id);
  expect(current.execution_status).toBe("DONE");
  expect(current.accepted).toBe(false);
  const shifted = await previewBulkEdit(
    admin,
    pid,
    edit([current], { action: "SHIFT_FORECAST", days: -2 }),
  );
  expect(shifted.lines[0].diff[0].to).toBe("2028-02-28");
});
it("batch GitLab não aceita leitor, outra conexão ou configuração alterada após a prévia", async () => {
  const a = await deliverable(),
    p = links([await linkItem(a, "gid://gitlab/WorkItem/3001")]);
  await expect(
    previewGitLabLinks(viewer, pid, connection.id, p),
  ).rejects.toThrow(/administrador/);
  await expect(previewGitLabLinks(admin, pid, randomUUID(), p)).rejects.toThrow(
    /GitLab/,
  );
  const preview = await previewGitLabLinks(admin, pid, connection.id, p);
  await db.query(
    "UPDATE integration.connections SET version=version+1 WHERE id=$1",
    [connection.id],
  );
  await expect(
    commitGitLabLinks(admin, pid, connection.id, p, preview.hash, randomUUID()),
  ).rejects.toThrow(/conexão mudou/);
});
it("sugere apenas marcadores explícitos, devolve ambiguidades e ignora texto parecido", () => {
  const catalog = {
      deliverables: [{ id: "d", code: "AUTH-1" }],
      capabilities: [{ id: "c", code: "AUTH-1" }],
    },
    nodes = [
      { id: "n1", entity_type: "deliverables", entity_id: "d" },
      { id: "n2", entity_type: "capabilities", entity_id: "c" },
    ];
  expect(
    gitLabCandidates({ title: "AUTH-1 parecido", labels: [] }, nodes, catalog),
  ).toEqual([]);
  expect(
    gitLabCandidates(
      { title: "[mct:AUTH-1] integração", labels: [] },
      nodes,
      catalog,
    ),
  ).toEqual(["n1", "n2"]);
  expect(
    gitLabCandidates(
      { title: "Tarefa", labels: ["mct:auth-1"] },
      nodes.slice(0, 1),
      catalog,
    ),
  ).toEqual(["n1"]);
});
