import { randomUUID } from "node:crypto";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
import { mutate } from "../src/server/application/inventory";
import { state } from "../src/server/application/queries";
import { snapshot } from "../src/server/application/reporting";
import { projectPortfolio } from "../src/server/application/projects";
import {
  effectiveArea,
  filterDeliverables,
  UNASSIGNED,
} from "../src/features/tower/filtering";
import { matchesFilters } from "../src/features/tower/priorities/model";
process.env.PGLITE_DATA_DIR = "memory://";
const db = getDb(),
  admin = randomUUID(),
  viewer = randomUUID(),
  lead = randomUUID(),
  pid = randomUUID(),
  other = randomUUID();
let area: any, areaB: any, squad: any, front: any, cap: any, del: any;
beforeAll(async () => {
  await migrate(db);
  for (const u of [admin, viewer, lead])
    await db.query(
      "INSERT INTO iam.users(id,subject,display_name) VALUES($1,$2,'Organização teste')",
      [u, u],
    );
  for (const p of [pid, other])
    await db.query(
      "INSERT INTO portfolio.programs(id,code,name) VALUES($1,$2,'Projeto teste')",
      [p, p],
    );
  for (const [u, p, role] of [
    [admin, pid, "PROGRAM_ADMIN"],
    [admin, other, "PROGRAM_ADMIN"],
    [viewer, pid, "VIEWER"],
  ])
    await db.query(
      "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,$3)",
      [u, p, role],
    );
  area = await mutate(admin, pid, "areas", {
    code: "BUSINESS",
    name: "Área negócio",
  });
  areaB = await mutate(admin, pid, "areas", {
    code: "TECH",
    name: "Área tecnologia",
  });
  squad = await mutate(admin, pid, "squads", {
    code: "CHECKOUT",
    name: "Squad Checkout",
    area_id: area.id,
  });
  front = await mutate(admin, pid, "workstreams", {
    code: "DEV",
    name: "Desenvolvimento",
    kind: "DEVELOPMENT",
  });
  await db.query(
    "INSERT INTO iam.memberships(user_id,program_id,role,workstream_id) VALUES($1,$2,'WORKSTREAM_LEAD',$3)",
    [lead, pid, front.id],
  );
  const domain: any = await mutate(admin, pid, "domains", {
    code: "AUT",
    name: "Autorização",
  });
  cap = await mutate(admin, pid, "capabilities", {
    code: "CAP",
    name: "Autorizar transação",
    domain_id: domain.id,
  });
  del = await mutate(admin, pid, "deliverables", {
    code: "DEL",
    name: "Entrega principal",
    workstream_id: front.id,
    layer: "BACKEND",
    deliverable_type: "API",
    squad_id: squad.id,
    capability_ids: [cap.id],
  });
});
describe("Projetos, frentes, áreas e squads", () => {
  it("aceita os tipos de frente solicitados sem inferir classificação de registros anteriores", async () => {
    for (const kind of [
      "BUSINESS",
      "INFRASTRUCTURE",
      "PROVISIONING",
      "SPIKE",
    ]) {
      const w: any = await mutate(admin, pid, "workstreams", {
        code: kind,
        name: `Frente ${kind}`,
        kind,
      });
      expect(w.kind).toBe(kind);
    }
    const generic: any = await mutate(admin, pid, "workstreams", {
      code: "OTHER",
      name: "Frente livre",
    });
    expect(generic.kind).toBe("OTHER");
  });
  it("portfólio só inclui projetos acessíveis e contagens reais por frente; vazio permanece desconhecido", async () => {
    const data = await projectPortfolio(viewer);
    expect(data.items.map((p) => p.id)).toEqual([pid]);
    expect(data.items[0].total).toBe(1);
    expect(data.items[0].accepted).toBe(0);
    expect(data.items[0].featureCount).toBe(1);
    expect(data.items[0].active).toBe(0);
    expect(data.items[0].withoutForecast).toBe(1);
    expect(
      data.items[0].workstreams.find((w) => w.id === front.id)?.total,
    ).toBe(1);
    const projects = await projectPortfolio(admin);
    expect(projects.items.find((p) => p.id === other)?.percentage).toBeNull();
  });
  it("área efetiva pode vir do squad; filtros combinados e sem classificação preservam o recorte", async () => {
    const s = await state(admin, pid);
    expect(effectiveArea(del, s)).toBe(area.id);
    expect(
      filterDeliverables(s, s.deliverables, {
        area: area.id,
        squad: squad.id,
        stream: front.id,
        domain: cap.domain_id,
      }),
    ).toHaveLength(1);
    expect(
      filterDeliverables(s, s.deliverables, { area: areaB.id }),
    ).toHaveLength(0);
    expect(
      filterDeliverables(s, s.deliverables, { area: UNASSIGNED }),
    ).toHaveLength(0);
    expect(
      filterDeliverables(
        s,
        [{ id: "unclassified", name: "Sem organização", code: "NONE" }],
        { area: UNASSIGNED, squad: UNASSIGNED },
      ),
    ).toHaveLength(1);
  });
  it("referências alheias e discordância área/squad são rejeitadas; SQl também protege consistência", async () => {
    const external: any = await mutate(admin, other, "squads", {
      code: "EXTERNAL",
      name: "Outro squad",
    });
    await expect(
      mutate(
        admin,
        pid,
        "deliverables",
        { squad_id: external.id },
        del.id,
        Number(del.version),
        "Reclassificar organização",
      ),
    ).rejects.toThrow(/não pertence/);
    await expect(
      mutate(
        admin,
        pid,
        "deliverables",
        { area_id: areaB.id },
        del.id,
        Number(del.version),
        "Reclassificar organização",
      ),
    ).rejects.toThrow(/corresponder/);
    await expect(
      db.query("UPDATE delivery.deliverables SET area_id=$1 WHERE id=$2", [
        areaB.id,
        del.id,
      ]),
    ).rejects.toThrow();
    del = await mutate(
      admin,
      pid,
      "deliverables",
      { area_id: area.id },
      del.id,
      Number(del.version),
      "Explicitar área já herdada",
    );
    await expect(
      mutate(
        admin,
        pid,
        "squads",
        { area_id: areaB.id },
        squad.id,
        Number(squad.version),
        "Mover squad de área",
      ),
    ).rejects.toThrow(/diverge/);
  });
  it("leitor e líder não administram organização; atribuir squad não concede alçada de outra frente", async () => {
    await expect(
      mutate(viewer, pid, "areas", { code: "DENIED", name: "Não permitido" }),
    ).rejects.toThrow(/papel/);
    await expect(
      mutate(lead, pid, "squads", { code: "DENIED", name: "Não permitido" }),
    ).rejects.toThrow(/papel/);
    const foreign: any = await mutate(admin, pid, "workstreams", {
      code: "FOREIGN",
      name: "Outra frente",
    });
    await expect(
      mutate(
        lead,
        pid,
        "deliverables",
        { workstream_id: foreign.id, squad_id: squad.id },
        del.id,
        Number(del.version),
        "Mover entre frentes",
      ),
    ).rejects.toThrow(/outra frente/);
  });
  it("snapshot congela classificações, áreas e squads; revisão de metadata não altera aceite", async () => {
    const snap: any = await snapshot(admin, pid, randomUUID());
    expect(snap.payload.context.areas).toHaveLength(2);
    expect(snap.payload.context.squads[0].id).toBe(squad.id);
    expect(snap.payload.deliverables[0].squad_id).toBe(squad.id);
    const before = (
      await db.query(
        "SELECT accepted,execution_status FROM delivery.deliverables WHERE id=$1",
        [del.id],
      )
    )[0];
    await mutate(
      admin,
      pid,
      "deliverables",
      { squad_id: null, area_id: null },
      del.id,
      Number(del.version),
      "Retirar classificação de equipe",
    );
    expect(
      (
        await db.query(
          "SELECT accepted,execution_status FROM delivery.deliverables WHERE id=$1",
          [del.id],
        )
      )[0],
    ).toEqual(before);
    expect(snap.payload.deliverables[0].squad_id).toBe(squad.id);
  });
  it("filtros de capacidade exigem uma mesma entrega satisfazer a combinação, sem cruzar frentes de itens diferentes", () => {
    const d1 = { id: "d1", workstream_id: "dev", area_id: "a" },
      d2 = { id: "d2", workstream_id: "business", area_id: "b" };
    const s = {
      deliverables: [d1, d2],
      links: [
        { capability_id: "c", deliverable_id: "d1" },
        { capability_id: "c", deliverable_id: "d2" },
      ],
      squads: [],
    };
    const item: any = {
      kind: "capabilities",
      entityId: "c",
      record: { id: "c" },
    };
    expect(matchesFilters(item, s, { stream: "dev", area: "b" })).toBe(false);
    expect(matchesFilters(item, s, { stream: "dev", area: "a" })).toBe(true);
  });
});
