import { validateConnectorURL } from "../infrastructure/adapters";
import type { ProvenanceSource } from "./provenance";
import { assertReadable } from "../domain/access";
import { createHash, randomUUID } from "node:crypto";
import {
  assertExecutionChange,
  canEdit,
  DomainError,
  hasCycle,
} from "../domain/rules";
import { schemas, TABLES, type Kind } from "../domain/schemas";
import { memberships } from "../infrastructure/auth";
import { getDb, type Database, type Row } from "../infrastructure/database";
import { audit } from "./transactions";
import { SCOPE_FIELDS } from "../domain/scope";
import { hashPayload } from "../domain/canonical";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function validateRefs(
  tx: Database,
  pid: string,
  kind: Kind,
  data: Row,
) {
  for (const [mapKey, idsKey] of [
    ["capability_roles", "capability_ids"],
    ["relation_types", "capability_ids"],
    ["deliverable_required", "deliverable_ids"],
  ]) {
    if (
      data[mapKey] &&
      Object.keys(data[mapKey]).some((id) => !data[idsKey]?.includes(id))
    )
      throw new DomainError(
        422,
        "Tipo de relação informado para item não vinculado.",
      );
  }
  const refs: Record<string, string> = {
    supplier_id: TABLES.suppliers,
    source_component_id: TABLES.components,
    target_component_id: TABLES.components,
    supersedes_id: TABLES.contracts,
    area_id: TABLES.areas,
    squad_id: TABLES.squads,
    domain_id: TABLES.domains,
    workstream_id: TABLES.workstreams,
    parent_id: TABLES.capabilities,
    release_id: TABLES.releases,
    subject_node_id: "portfolio.program_nodes",
    source_node_id: "portfolio.program_nodes",
    target_node_id: "portfolio.program_nodes",
  };
  for (const [key, table] of Object.entries(refs))
    if (data[key]) {
      const [r] = await tx.query(
        `SELECT id FROM ${table} WHERE id=$1 AND program_id=$2`,
        [data[key], pid],
      );
      if (!r)
        throw new DomainError(422, `Vínculo ${key} não pertence ao programa.`);
    }
  if (
    kind === "contracts" &&
    (data.source_component_id === data.target_component_id ||
      (data.supersedes_id && data.supersedes_id === data.id))
  )
    throw new DomainError(
      422,
      "Contrato exige componentes distintos e não pode substituir a si mesmo.",
    );
  if (kind === "deliverables" && data.layer) {
    const [layer] = await tx.query(
      "SELECT active FROM portfolio.layers WHERE program_id=$1 AND code=$2",
      [pid, data.layer],
    );
    if (
      !layer ||
      (!layer.active &&
        (!data.id ||
          (
            await tx.query(
              "SELECT layer FROM delivery.deliverables WHERE id=$1",
              [data.id],
            )
          )[0]?.layer !== data.layer))
    )
      throw new DomainError(422, "Camada não está ativa no programa.");
  }
  if (kind === "deliverables" && data.squad_id && data.area_id) {
    const [squad] = await tx.query(
      "SELECT area_id FROM portfolio.squads WHERE id=$1 AND program_id=$2",
      [data.squad_id, pid],
    );
    if (squad?.area_id && squad.area_id !== data.area_id)
      throw new DomainError(422, "Área e squad precisam corresponder.");
  }
  if (kind === "squads" && data.id && data.area_id) {
    const assigned = await tx.query(
      "SELECT id FROM delivery.deliverables WHERE squad_id=$1 AND program_id=$2 AND area_id IS NOT NULL AND area_id<>$3 LIMIT 1",
      [data.id, pid, data.area_id],
    );
    if (assigned.length)
      throw new DomainError(
        409,
        "A nova área diverge dos entregáveis vinculados ao squad. Revise suas atribuições primeiro.",
      );
  }
  for (const key of ["owner_id", "lead_id"])
    if (data[key]) {
      const [r] = await tx.query(
        "SELECT user_id FROM iam.memberships WHERE user_id=$1 AND program_id=$2 LIMIT 1",
        [data[key], pid],
      );
      if (!r)
        throw new DomainError(422, "Responsável não pertence ao programa.");
    }
  if (data.capability_ids)
    for (const cid of data.capability_ids) {
      const [r] = await tx.query(
        "SELECT id FROM portfolio.capabilities WHERE id=$1 AND program_id=$2",
        [cid, pid],
      );
      if (!r)
        throw new DomainError(422, "Capacidade não pertence ao programa.");
    }
  if (kind === "capabilities" && data.parent_id) {
    const rows = await tx.query(
      "SELECT id,parent_id FROM portfolio.capabilities WHERE program_id=$1 AND id<>$2",
      [pid, data.id || randomUUID()],
    );
    if (
      hasCycle([
        ...rows
          .filter((r) => r.parent_id)
          .map((r) => ({ source_node_id: r.id, target_node_id: r.parent_id })),
        {
          source_node_id: data.id || "__new__",
          target_node_id: data.parent_id,
        },
      ])
    )
      throw new DomainError(409, "Hierarquia de capacidades cria um ciclo.");
  }
  if (
    kind === "deliverables" &&
    data.planning_status === "COMMITTED" &&
    (!data.owner_id ||
      !data.acceptance_criteria ||
      (!data.capability_ids?.length && !data.transverse_obligation))
  )
    throw new DomainError(
      422,
      "Compromisso exige responsável, aceite e capacidade ou obrigação transversal.",
    );
  if (
    kind === "raid" &&
    data.severity === "CRITICAL" &&
    (!data.owner_id || !data.action_plan || !data.due_date)
  )
    throw new DomainError(
      422,
      "RAID crítico exige responsável, plano e prazo.",
    );
  if (kind === "dependencies") {
    if (
      ["HIGH", "CRITICAL"].includes(data.criticality) &&
      (!data.owner_id || !data.needed_by)
    )
      throw new DomainError(
        422,
        "Dependência crítica exige responsável e prazo.",
      );
    const edges = await tx.query(
      "SELECT source_node_id,target_node_id FROM governance.dependencies WHERE program_id=$1 AND dependency_type IN ('BLOCKS','REQUIRES','PRECEDES') AND status!='RESOLVED' AND id!=$2",
      [pid, data.id || randomUUID()],
    );
    if (
      ["BLOCKS", "REQUIRES", "PRECEDES"].includes(data.dependency_type) &&
      data.status !== "RESOLVED" &&
      hasCycle([
        ...(edges as { source_node_id: string; target_node_id: string }[]),
        data as { source_node_id: string; target_node_id: string },
      ])
    )
      throw new DomainError(409, "Esta dependência cria um ciclo impeditivo.");
  }
}
export async function mutate(
  userId: string,
  pid: string,
  kind: Kind,
  input: Row,
  id?: string,
  version?: number,
  reason = "Cadastro",
  correlation: string = randomUUID(),
  database: Database = getDb(),
  source?: ProvenanceSource,
) {
  const allowed = new Set(Object.keys(schemas[kind].shape));
  const unknown = Object.keys(input).filter((k) => !allowed.has(k));
  if (unknown.length)
    throw new DomainError(
      422,
      `Campos não editáveis: ${unknown.join(", ")}. Utilize a ação de domínio correspondente.`,
    );
  const table = TABLES[kind];
  return database.transaction(async (tx) => {
    await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
      pid,
    ]);
    const roles = await memberships(userId, pid, tx);
    const [before] = id
      ? await tx.query(
          `SELECT * FROM ${table} WHERE id=$1 AND ${kind === "programs" ? "id" : "program_id"}=$2 FOR UPDATE`,
          [id, pid],
        )
      : [];
    if (id && !before) throw new DomainError(404, "Registro não encontrado.");
    let previousLinks: Row = {};
    if (id && ["deliverables", "components"].includes(kind)) {
      const link =
        kind === "components"
          ? "architecture.capability_components"
          : "delivery.deliverable_capabilities";
      const column = kind === "components" ? "component_id" : "deliverable_id";
      const links = await tx.query(`SELECT * FROM ${link} WHERE ${column}=$1`, [
        id,
      ]);
      previousLinks.capability_ids = links.map((r) => r.capability_id);
      previousLinks[
        kind === "components" ? "relation_types" : "capability_roles"
      ] = Object.fromEntries(
        links.map((r) => [
          r.capability_id,
          kind === "components" ? r.relation_type : r.contribution_type,
        ]),
      );
    }
    if (id && kind === "releases") {
      const links = await tx.query(
        "SELECT * FROM delivery.release_deliverables WHERE release_id=$1",
        [id],
      );
      previousLinks.deliverable_ids = links.map((r) => r.deliverable_id);
      previousLinks.deliverable_required = Object.fromEntries(
        links.map((r) => [r.deliverable_id, r.required]),
      );
    }
    if (
      ["decisions", "contracts"].includes(kind) &&
      before &&
      ["APPROVED", "REJECTED"].includes(before.status)
    )
      throw new DomainError(
        409,
        "Registro revisado é imutável. Crie nova versão.",
      );
    if (kind === "decisions" && input.status && input.status !== "PROPOSED")
      throw new DomainError(
        409,
        "Aprovação de decisão exige o comando de revisão por alçada.",
      );
    const merged = { ...before, ...previousLinks, ...input };
    for (const [mapKey, idsKey] of [
      ["capability_roles", "capability_ids"],
      ["relation_types", "capability_ids"],
      ["deliverable_required", "deliverable_ids"],
    ]) {
      if (input[idsKey] && input[mapKey] === undefined && merged[mapKey])
        merged[mapKey] = Object.fromEntries(
          Object.entries(merged[mapKey]).filter(([id]) =>
            input[idsKey].includes(id),
          ),
        );
    }
    if (typeof merged.weight === "string")
      merged.weight = Number(merged.weight);
    if (
      id &&
      input.capability_ids === undefined &&
      ["deliverables", "components"].includes(kind)
    ) {
      const link =
        kind === "components"
          ? "architecture.capability_components"
          : "delivery.deliverable_capabilities";
      const key = kind === "components" ? "component_id" : "deliverable_id";
      merged.capability_ids = (
        await tx.query(`SELECT capability_id FROM ${link} WHERE ${key}=$1`, [
          id,
        ])
      ).map((r) => r.capability_id);
    }
    if (id && kind === "releases" && input.deliverable_ids === undefined)
      merged.deliverable_ids = (
        await tx.query(
          "SELECT deliverable_id FROM delivery.release_deliverables WHERE release_id=$1",
          [id],
        )
      ).map((r) => r.deliverable_id);
    const parsed = schemas[kind].parse(merged) as Row;
    if (kind === "programs" && parsed.inventory_estimate != null) {
      if (
        !parsed.inventory_estimate_as_of ||
        !parsed.inventory_estimate_notes?.trim() ||
        parsed.inventory_estimate_notes.trim().length < 3
      )
        throw new DomainError(
          422,
          "Estimativa exige data e fonte/justificativa auditáveis.",
        );
      if (id) {
        const [known] = await tx.query(
          "SELECT count(*)::integer AS total FROM portfolio.capabilities WHERE program_id=$1",
          [pid],
        );
        if (parsed.inventory_estimate < known.total)
          throw new DomainError(
            422,
            "Estimativa inferior ao inventário já identificado.",
          );
      }
    }
    await validateRefs(tx, pid, kind, { ...parsed, id });
    if (kind === "deliverables")
      parsed.capability_roles = Object.fromEntries(
        parsed.capability_ids.map((id: string) => [
          id,
          parsed.capability_roles?.[id] || "REQUIRED",
        ]),
      );
    if (kind === "components")
      parsed.relation_types = Object.fromEntries(
        parsed.capability_ids.map((id: string) => [
          id,
          parsed.relation_types?.[id] || "USES",
        ]),
      );
    if (kind === "releases")
      parsed.deliverable_required = Object.fromEntries(
        parsed.deliverable_ids.map((id: string) => [
          id,
          parsed.deliverable_required?.[id] ?? true,
        ]),
      );
    if (
      kind === "releases" &&
      id &&
      before.status === "APPROVED" &&
      (JSON.stringify([...previousLinks.deliverable_ids].sort()) !==
        JSON.stringify([...parsed.deliverable_ids].sort()) ||
        hashPayload(previousLinks.deliverable_required) !==
          hashPayload(parsed.deliverable_required))
    )
      throw new DomainError(
        409,
        "Composição de release aprovada é preservada. Crie uma nova release para novo escopo.",
      );
    if (["evidence", "suppliers"].includes(kind)) {
      if (before) assertReadable(before, roles);
      assertReadable(parsed, roles);
    }
    if (kind === "connections" && before) {
      const namespaceChanged =
        ["connector_type", "base_url", "project"].some(
          (k) => parsed[k] !== before[k],
        ) ||
        (parsed.gitlab_options?.api || "ISSUES") !==
          (before.gitlab_options?.api || "ISSUES") ||
        (parsed.gitlab_options?.scope || "PROJECT") !==
          (before.gitlab_options?.scope || "PROJECT");
      if (
        namespaceChanged &&
        (
          await tx.query(
            "SELECT id FROM integration.external_references WHERE connection_id=$1 LIMIT 1",
            [id],
          )
        ).length
      )
        throw new DomainError(
          409,
          "A origem possui vínculos. Crie outra conexão para mudar projeto, grupo ou API preservando os IDs existentes.",
        );
      await tx.query(
        "UPDATE integration.connections SET cursor=NULL,status='NOT_CONFIGURED',last_error=NULL,failures=0,circuit_open_until=NULL WHERE id=$1",
        [id],
      );
    }
    if (kind === "connections") {
      validateConnectorURL(parsed.connector_type, parsed.base_url);
      if (
        parsed.webhook_secret_env &&
        parsed.webhook_secret_env === parsed.secret_env
      )
        throw new DomainError(422, "Use um secret diferente para o webhook.");
      if (
        ["JIRA", "CONFLUENCE"].includes(parsed.connector_type) &&
        parsed.deployment !== "SERVER" &&
        !parsed.jira_email
      )
        throw new DomainError(
          422,
          "Conector Atlassian Cloud exige e-mail da conta de serviço.",
        );
    }
    if (kind === "contracts" && parsed.supplier_id) {
      const [supplier] = await tx.query(
        "SELECT classification FROM architecture.suppliers WHERE id=$1 AND program_id=$2",
        [parsed.supplier_id, pid],
      );
      if (supplier) assertReadable(supplier, roles);
    }
    const scope = await authorizationScope(tx, kind, before || parsed, pid);
    if (!canEdit(roles, kind, scope))
      throw new DomainError(403, "Seu papel não permite editar este registro.");
    if (kind === "deliverables" && !canEdit(roles, kind, parsed.workstream_id))
      throw new DomainError(
        403,
        "Não é permitido mover entregável para outra frente.",
      );
    if (
      ["dependencies", "evidence", "raid"].includes(kind) &&
      !canEdit(roles, kind, await authorizationScope(tx, kind, parsed, pid))
    )
      throw new DomainError(403, "O novo vínculo não pertence à sua frente.");
    if (id && (Number(before.version) !== version || reason.trim().length < 3))
      throw new DomainError(
        409,
        "Versão obsoleta ou justificativa ausente. Recarregue o registro.",
      );
    if (kind === "capabilities" || kind === "deliverables") {
      if (!id && parsed.scope_status !== "PROPOSED")
        throw new DomainError(
          409,
          "Escopo deve nascer proposto; use change control para aprovar.",
        );
      const scopeChanged =
        id &&
        SCOPE_FIELDS[kind].some(
          (k) =>
            hashPayload(
              k === "capability_ids"
                ? [...(previousLinks[k] || [])].sort()
                : (previousLinks[k] ?? before[k] ?? null),
            ) !==
            hashPayload(
              k === "capability_ids"
                ? [...(parsed[k] || [])].sort()
                : (parsed[k] ?? null),
            ),
        );
      if (
        id &&
        (before.scope_status !== parsed.scope_status ||
          (before.scope_status !== "PROPOSED" && scopeChanged))
      )
        throw new DomainError(
          409,
          "Mudança de escopo requer solicitação aprovada em change control.",
        );
      if (scopeChanged) {
        const frozen = await tx.query(
          `SELECT i.id FROM delivery.baseline_items i JOIN delivery.baselines b ON b.id=i.baseline_id JOIN portfolio.program_nodes n ON n.id=i.subject_node_id WHERE b.status='APPROVED' AND n.program_id=$1 AND ${kind === "deliverables" ? "n.entity_id=$2" : "n.entity_type='deliverables' AND EXISTS(SELECT 1 FROM delivery.deliverable_capabilities l WHERE l.deliverable_id=n.entity_id AND l.capability_id=$2)"} LIMIT 1`,
          [pid, id],
        );
        if (frozen.length)
          throw new DomainError(
            409,
            "Escopo congelado por baseline. Mudança exige change control.",
          );
      }
    }
    if (kind === "deliverables" && id) {
      if (
        JSON.stringify([...previousLinks.capability_ids].sort()) !==
        JSON.stringify([...parsed.capability_ids].sort())
      ) {
        const frozen = await tx.query(
          "SELECT i.id FROM delivery.baseline_items i JOIN delivery.baselines b ON b.id=i.baseline_id JOIN portfolio.program_nodes n ON n.id=i.subject_node_id WHERE b.status='APPROVED' AND n.entity_id=$1",
          [id],
        );
        if (frozen.length)
          throw new DomainError(
            409,
            "Vínculo de escopo congelado por baseline. Mudança exige change control.",
          );
      }
      if (
        (before.weight === null ? null : Number(before.weight)) !==
        (parsed.weight ?? null)
      ) {
        const rows = await tx.query(
          "SELECT i.id FROM delivery.baseline_items i JOIN delivery.baselines b ON b.id=i.baseline_id JOIN portfolio.program_nodes n ON n.id=i.subject_node_id WHERE b.status='APPROVED' AND n.entity_id=$1",
          [id],
        );
        if (rows.length)
          throw new DomainError(
            409,
            "Peso congelado por baseline; requer nova aprovação.",
          );
      }
      assertExecutionChange(
        before.execution_status,
        parsed.execution_status,
        reason,
      );
      if (
        before.execution_status !== parsed.execution_status &&
        parsed.execution_status !== "DONE"
      )
        parsed.accepted = false;
      if (
        before.execution_status !== parsed.execution_status &&
        parsed.execution_status === "REOPENED" &&
        reason.length < 3
      )
        throw new DomainError(422, "Reabertura exige motivo.");
    }
    if (kind === "evidence" && id) {
      const used = await tx.query(
        "SELECT id FROM governance.gate_assessments WHERE program_id=$1 AND evidence_refs @> $2::jsonb",
        [pid, JSON.stringify([{ id }])],
      );
      if (used.length)
        throw new DomainError(
          409,
          "Evidência usada em avaliação é preservada. Cadastre uma nova versão como novo registro.",
        );
    }
    await validateRefs(tx, pid, kind, { ...parsed, id });
    const caps = parsed.capability_ids,
      deliverableIds = parsed.deliverable_ids,
      capabilityRoles = parsed.capability_roles,
      relationTypes = parsed.relation_types,
      deliverableRequired = parsed.deliverable_required;
    delete parsed.capability_ids;
    delete parsed.deliverable_ids;
    delete parsed.capability_roles;
    delete parsed.relation_types;
    delete parsed.deliverable_required;
    if (kind === "programs" && parsed.health_policy)
      parsed.health_policy = JSON.stringify(parsed.health_policy);
    if (kind === "connections") {
      parsed.state_mapping = JSON.stringify(parsed.state_mapping);
      parsed.field_mapping = JSON.stringify(parsed.field_mapping);
      parsed.gitlab_options = JSON.stringify(parsed.gitlab_options);
    }
    if (kind === "capabilities")
      parsed.acceptance_criteria = JSON.stringify(parsed.acceptance_criteria);
    if (kind === "evidence" && !id) parsed.author_id = userId;
    if (["contracts", "decisions", "connections"].includes(kind) && !id)
      parsed.created_by = userId;
    const values = Object.entries(parsed).filter(([, v]) => v !== undefined);
    let after: Row;
    if (id) {
      const params = values.map(([, v]) => v);
      params.push(id);
      [after] = await tx.query(
        `UPDATE ${table} SET ${values.map(([k], i) => `${k}=$${i + 1}`).join(",")},version=version+1${kind === "deliverables" ? ",updated_at=now()" : ""} WHERE id=$${params.length} RETURNING *`,
        params,
      );
    } else {
      const data =
        kind === "programs" ? parsed : { ...parsed, program_id: pid };
      const entries = Object.entries(data).filter(([, v]) => v !== undefined);
      [after] = await tx.query(
        `INSERT INTO ${table}(${entries.map(([k]) => k).join(",")}) VALUES(${entries.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
        entries.map(([, v]) => v),
      );
    }
    if (
      [
        "capabilities",
        "deliverables",
        "components",
        "releases",
        "contracts",
        "suppliers",
      ].includes(kind)
    )
      await tx.query(
        "INSERT INTO portfolio.program_nodes(program_id,entity_type,entity_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [pid, kind, after.id],
      );
    if (caps) {
      const link =
        kind === "components"
          ? "architecture.capability_components"
          : "delivery.deliverable_capabilities";
      const column = kind === "components" ? "component_id" : "deliverable_id";
      await tx.query(`DELETE FROM ${link} WHERE ${column}=$1`, [after.id]);
      for (const cap of caps) {
        await tx.query(
          `INSERT INTO ${link}(program_id,${column},capability_id,${kind === "components" ? "relation_type" : "contribution_type"}) VALUES($1,$2,$3,$4)`,
          [
            pid,
            after.id,
            cap,
            kind === "components" ? relationTypes[cap] : capabilityRoles[cap],
          ],
        );
      }
    }
    if (deliverableIds) {
      await tx.query(
        "DELETE FROM delivery.release_deliverables WHERE release_id=$1",
        [after.id],
      );
      for (const did of deliverableIds)
        await tx.query(
          "INSERT INTO delivery.release_deliverables(program_id,release_id,deliverable_id,required) VALUES($1,$2,$3,$4)",
          [pid, after.id, did, deliverableRequired[did]],
        );
    }
    if (kind === "programs" && !id) {
      await tx.query(
        "INSERT INTO iam.memberships(user_id,program_id,role) VALUES($1,$2,'PROGRAM_ADMIN')",
        [userId, after.id],
      );
    }
    await audit(
      tx,
      userId,
      kind === "programs" ? after.id : pid,
      kind,
      after.id,
      id ? "Updated" : "Created",
      before ? { ...before, ...previousLinks } : null,
      {
        ...after,
        ...(caps ? { capability_ids: caps } : {}),
        ...(deliverableIds ? { deliverable_ids: deliverableIds } : {}),
        ...(capabilityRoles ? { capability_roles: capabilityRoles } : {}),
        ...(relationTypes ? { relation_types: relationTypes } : {}),
        ...(deliverableRequired
          ? { deliverable_required: deliverableRequired }
          : {}),
      },
      reason,
      correlation,
      source,
    );
    return after;
  });
}
export async function authorizationScope(
  tx: Database,
  kind: string,
  data: Row,
  pid: string,
) {
  if (data.workstream_id) return data.workstream_id;
  const node =
    kind === "evidence"
      ? data.subject_node_id
      : kind === "dependencies"
        ? data.target_node_id
        : null;
  if (!node) return null;
  const [d] = await tx.query(
    "SELECT d.workstream_id FROM delivery.deliverables d JOIN portfolio.program_nodes n ON n.entity_id=d.id AND n.entity_type='deliverables' WHERE n.id=$1 AND n.program_id=$2",
    [node, pid],
  );
  return d?.workstream_id || null;
}
