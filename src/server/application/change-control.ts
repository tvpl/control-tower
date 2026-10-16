import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPayload } from "../domain/canonical";
import { canEdit, DomainError, impactedNodes } from "../domain/rules";
import { schemas, TABLES } from "../domain/schemas";
import {
  assertScopeTransition,
  SCOPE_FIELDS,
  type ScopeKind,
} from "../domain/scope";
import { memberships } from "../infrastructure/auth";
import { getDb, type Database, type Row } from "../infrastructure/database";
import { validateRefs } from "./inventory";
import { audit, idempotent } from "./transactions";

const proposalSchema = z
  .object({
    subject_node_id: z.uuid(),
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(3).max(200),
    reason: z.string().trim().min(3).max(2000),
    alternatives: z.string().trim().min(3).max(2000),
    risk_and_mitigation: z.string().trim().min(3).max(2000),
    changes: z.record(z.string(), z.unknown()),
  })
  .strict();
type Proposal = z.infer<typeof proposalSchema>;

async function target(tx: Database, pid: string, nodeId: string) {
  const [node] = await tx.query(
    "SELECT * FROM portfolio.program_nodes WHERE id=$1 AND program_id=$2",
    [nodeId, pid],
  );
  if (!node || !["capabilities", "deliverables"].includes(node.entity_type))
    throw new DomainError(404, "Alvo de escopo não encontrado neste programa.");
  const kind = node.entity_type as ScopeKind;
  const [before] = await tx.query(
    `SELECT * FROM ${TABLES[kind]} WHERE id=$1 AND program_id=$2 FOR UPDATE`,
    [node.entity_id, pid],
  );
  if (!before) throw new DomainError(404, "Registro de escopo não encontrado.");
  if (typeof before.weight === "string") before.weight = Number(before.weight);
  if (kind === "deliverables") {
    const links = await tx.query(
      "SELECT * FROM delivery.deliverable_capabilities WHERE deliverable_id=$1 ORDER BY capability_id",
      [before.id],
    );
    before.capability_ids = links.map((r) => r.capability_id);
    before.capability_roles = Object.fromEntries(
      links.map((r) => [r.capability_id, r.contribution_type]),
    );
  }
  return { kind, node, before };
}

async function analyze(tx: Database, pid: string, p: Proposal) {
  const { kind, node, before } = await target(tx, pid, p.subject_node_id);
  if (Number(before.version) !== p.expectedVersion)
    throw new DomainError(409, "Versão do escopo mudou. Refaça a proposta.");
  const allowed = new Set<string>(SCOPE_FIELDS[kind]);
  const keys = Object.keys(p.changes);
  if (!keys.length || keys.some((k) => !allowed.has(k)))
    throw new DomainError(
      422,
      "Proposta contém campos fora do escopo editável.",
    );
  const merged = { ...before, ...p.changes };
  if (p.changes.capability_ids && !p.changes.capability_roles)
    merged.capability_roles = Object.fromEntries(
      Object.entries(before.capability_roles).filter(([id]) =>
        (p.changes.capability_ids as string[]).includes(id),
      ),
    );
  const after = schemas[kind].parse(merged) as Row;
  if (kind === "deliverables") {
    await validateRefs(tx, pid, kind, { ...after, id: before.id });
    after.capability_roles = Object.fromEntries(
      after.capability_ids.map((id: string) => [
        id,
        after.capability_roles?.[id] || "REQUIRED",
      ]),
    );
  }
  // Approval is explicit even when only content changes: APPROVED -> CHANGED.
  if (!("scope_status" in p.changes))
    after.scope_status =
      before.scope_status === "PROPOSED" ? "APPROVED" : "CHANGED";
  assertScopeTransition(before.scope_status, after.scope_status);
  const changes: Row = Object.fromEntries(
    [
      ...new Set([
        ...keys,
        "scope_status",
        ...(kind === "deliverables" && "capability_ids" in p.changes
          ? ["capability_roles"]
          : []),
      ]),
    ].map((k) => [k, after[k]]),
  );
  if (
    hashPayload(changes) ===
    hashPayload(
      Object.fromEntries(Object.keys(changes).map((k) => [k, before[k]])),
    )
  )
    throw new DomainError(422, "Proposta não altera o escopo.");
  await validateRefs(tx, pid, kind, { ...after, id: before.id });
  const ds = await tx.query(
    `SELECT d.* FROM delivery.deliverables d WHERE d.program_id=$1 AND ${kind === "deliverables" ? "d.id=$2" : "EXISTS(SELECT 1 FROM delivery.deliverable_capabilities l WHERE l.deliverable_id=d.id AND l.capability_id=$2)"} ORDER BY d.id`,
    [pid, before.id],
  );
  const nodes = await tx.query(
    "SELECT * FROM portfolio.program_nodes WHERE program_id=$1 ORDER BY id",
    [pid],
  );
  const directNodes = nodes.filter(
    (n) =>
      n.id === node.id ||
      ds.some((d) => d.id === n.entity_id && n.entity_type === "deliverables"),
  );
  const deps = await tx.query(
    "SELECT * FROM governance.dependencies WHERE program_id=$1 AND dependency_type IN ('BLOCKS','REQUIRES','PRECEDES') AND status!='RESOLVED' ORDER BY id",
    [pid],
  );
  const affectedIds = new Set(
    directNodes.flatMap((n) => [n.id, ...impactedNodes(n.id, deps as any)]),
  );
  const affected = nodes.filter((n) => affectedIds.has(n.id));
  const affectedDeliverables = affected
    .filter((n) => n.entity_type === "deliverables")
    .map((n) => n.entity_id);
  const releases = (
    await tx.query(
      "SELECT r.*,l.deliverable_id,l.required FROM delivery.releases r JOIN delivery.release_deliverables l ON l.release_id=r.id WHERE r.program_id=$1 ORDER BY r.id,l.deliverable_id",
      [pid],
    )
  ).filter((r) => affectedDeliverables.includes(r.deliverable_id));
  const baselines = (
    await tx.query(
      "SELECT b.id,b.version,i.subject_node_id,i.payload_hash FROM delivery.baselines b JOIN delivery.baseline_items i ON i.baseline_id=b.id WHERE b.program_id=$1 AND b.status='APPROVED' ORDER BY b.version,i.subject_node_id",
      [pid],
    )
  ).filter((b) => affectedIds.has(b.subject_node_id));
  const gates = (
    await tx.query(
      "SELECT a.*,g.version AS definition_version,g.blocking FROM governance.gate_assessments a JOIN governance.gate_definitions g ON g.id=a.gate_id WHERE a.program_id=$1 ORDER BY a.id",
      [pid],
    )
  ).filter((g) => affectedIds.has(g.subject_node_id));
  const links = (
    await tx.query(
      "SELECT * FROM delivery.deliverable_capabilities WHERE program_id=$1 ORDER BY deliverable_id,capability_id",
      [pid],
    )
  ).filter((l) => affectedDeliverables.includes(l.deliverable_id));
  const related = (
    await tx.query(
      "SELECT id,version,scope_status,parent_id FROM portfolio.capabilities WHERE program_id=$1 ORDER BY id",
      [pid],
    )
  ).filter(
    (c) =>
      kind === "capabilities" ||
      [
        ...(before.capability_ids || []),
        ...(after.capability_ids || []),
      ].includes(c.id),
  );
  const impact = {
    as_of: new Date().toISOString(),
    rule_version: "scope-impact-1.0",
    target: {
      kind,
      id: before.id,
      code: before.code,
      name: before.name,
      version: Number(before.version),
    },
    direct_deliverables: ds,
    affected_nodes: affected,
    dependencies: deps.filter(
      (d) =>
        affectedIds.has(d.source_node_id) || affectedIds.has(d.target_node_id),
    ),
    releases,
    baselines,
    gates,
    links,
    related_capabilities: related,
    effects: [
      "Baseline e snapshots anteriores preservados.",
      "Aceites e avaliações dos entregáveis diretamente alterados exigirão revalidação.",
      "Forecast e custos não são estimados automaticamente; riscos e mitigação são registrados pelo solicitante.",
    ],
  };
  const { as_of: _observed, ...fingerprint } = impact;
  return {
    kind,
    node,
    before,
    after,
    changes,
    impact,
    impactHash: hashPayload(fingerprint),
  };
}

async function canPropose(
  tx: Database,
  user: string,
  pid: string,
  kind: ScopeKind,
  before: Row,
) {
  const roles = await memberships(user, pid, tx);
  if (!canEdit(roles, kind, before.workstream_id))
    throw new DomainError(403, "Sem alçada para propor mudança neste escopo.");
}

export async function previewChange(user: string, pid: string, input: unknown) {
  const p = proposalSchema.parse(input);
  return getDb().transaction(async (tx) => {
    await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
      pid,
    ]);
    const result = await analyze(tx, pid, p);
    await canPropose(tx, user, pid, result.kind, result.before);
    return {
      before: result.before,
      changes: result.changes,
      impact: result.impact,
    };
  });
}

export async function proposeChange(
  user: string,
  pid: string,
  input: unknown,
  key: string,
) {
  const p = proposalSchema.parse(input);
  return idempotent(user, key, { op: "scope-propose", pid, p }, async (tx) => {
    await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
      pid,
    ]);
    const r = await analyze(tx, pid, p);
    await canPropose(tx, user, pid, r.kind, r.before);
    const [record] = await tx.query(
      "INSERT INTO governance.change_requests(program_id,subject_node_id,title,reason,alternatives,risk_and_mitigation,target_version,before_data,changes,impact,impact_hash,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12) RETURNING *",
      [
        pid,
        p.subject_node_id,
        p.title,
        p.reason,
        p.alternatives,
        p.risk_and_mitigation,
        p.expectedVersion,
        JSON.stringify(r.before),
        JSON.stringify(r.changes),
        JSON.stringify(r.impact),
        r.impactHash,
        user,
      ],
    );
    await audit(
      tx,
      user,
      pid,
      "change_requests",
      record.id,
      "Submitted",
      null,
      record,
      p.reason,
      randomUUID(),
    );
    return record;
  });
}

async function request(tx: Database, pid: string, id: string, version: number) {
  await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
    pid,
  ]);
  const [r] = await tx.query(
    "SELECT * FROM governance.change_requests WHERE id=$1 AND program_id=$2 FOR UPDATE",
    [id, pid],
  );
  if (!r) throw new DomainError(404, "Solicitação não encontrada.");
  if (Number(r.version) !== version)
    throw new DomainError(409, "Versão da solicitação mudou. Recarregue.");
  return r;
}
async function fresh(tx: Database, pid: string, r: Row) {
  const result = await analyze(tx, pid, {
    subject_node_id: r.subject_node_id,
    expectedVersion: Number(r.target_version),
    title: r.title,
    reason: r.reason,
    alternatives: r.alternatives,
    risk_and_mitigation: r.risk_and_mitigation,
    changes: r.changes,
  });
  if (result.impactHash !== r.impact_hash)
    throw new DomainError(
      409,
      "Impacto mudou desde a proposta. Cancele e crie uma nova solicitação para revisão.",
    );
  return result;
}

export async function reviewChange(
  user: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = z
    .object({
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["APPROVED", "REJECTED"]),
      reason: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(input);
  return idempotent(
    user,
    key,
    { op: "scope-review", pid, id, p },
    async (tx) => {
      const roles = await memberships(user, pid, tx);
      if (!roles.some((r) => ["PMO", "EXECUTIVE"].includes(r.role)))
        throw new DomainError(
          403,
          "Decisão de escopo requer PMO ou executivo do programa.",
        );
      const r = await request(tx, pid, id, p.expectedVersion);
      if (r.requested_by === user)
        throw new DomainError(
          403,
          "Solicitante não pode aprovar ou rejeitar a própria mudança.",
        );
      if (r.status !== "SUBMITTED")
        throw new DomainError(409, "Solicitação já foi decidida.");
      if (p.decision === "APPROVED") await fresh(tx, pid, r);
      const [decision] = await tx.query(
        "INSERT INTO governance.decisions(program_id,code,name,rationale,alternatives,owner_id,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          pid,
          `CR-${r.id}`,
          r.title,
          p.reason,
          r.alternatives,
          user,
          p.decision,
        ],
      );
      const [after] = await tx.query(
        "UPDATE governance.change_requests SET status=$1,reviewed_by=$2,reviewed_at=now(),review_reason=$3,decision_id=$4,version=version+1 WHERE id=$5 RETURNING *",
        [p.decision, user, p.reason, decision.id, r.id],
      );
      const cid = randomUUID();
      await audit(
        tx,
        user,
        pid,
        "decisions",
        decision.id,
        "Created",
        null,
        decision,
        p.reason,
        cid,
      );
      await audit(
        tx,
        user,
        pid,
        "change_requests",
        r.id,
        p.decision === "APPROVED" ? "Approved" : "Rejected",
        r,
        after,
        p.reason,
        cid,
      );
      return after;
    },
  );
}

export async function applyChange(
  user: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = z
    .object({ expectedVersion: z.number().int().positive() })
    .strict()
    .parse(input);
  return idempotent(
    user,
    key,
    { op: "scope-apply", pid, id, p },
    async (tx) => {
      const r = await request(tx, pid, id, p.expectedVersion);
      if (r.status !== "APPROVED")
        throw new DomainError(409, "Aplicação exige solicitação aprovada.");
      const t = await fresh(tx, pid, r);
      await canPropose(tx, user, pid, t.kind, t.before);
      const entries = Object.entries(t.changes).filter(
        ([k]) => !["capability_ids", "capability_roles"].includes(k),
      );
      const params = entries.map(([k, v]) =>
        k === "acceptance_criteria" && t.kind === "capabilities"
          ? JSON.stringify(v)
          : v,
      );
      params.push(t.before.id);
      const [entity] = await tx.query(
        `UPDATE ${TABLES[t.kind]} SET ${entries.map(([k], i) => `${k}=$${i + 1}`).join(",")},version=version+1${t.kind === "deliverables" ? ",updated_at=now()" : ""} WHERE id=$${params.length} RETURNING *`,
        params,
      );
      if ("capability_ids" in t.changes || "capability_roles" in t.changes) {
        await tx.query(
          "DELETE FROM delivery.deliverable_capabilities WHERE deliverable_id=$1",
          [entity.id],
        );
        for (const cap of t.after.capability_ids)
          await tx.query(
            "INSERT INTO delivery.deliverable_capabilities(program_id,deliverable_id,capability_id,contribution_type) VALUES($1,$2,$3,$4)",
            [pid, entity.id, cap, t.after.capability_roles[cap]],
          );
      }
      const cid = randomUUID();
      await audit(
        tx,
        user,
        pid,
        t.kind,
        entity.id,
        "ScopeChanged",
        t.before,
        {
          ...entity,
          ...(t.kind === "deliverables"
            ? {
                capability_ids: t.after.capability_ids,
                capability_roles: t.after.capability_roles,
              }
            : {}),
        },
        r.reason,
        cid,
      );
      // Initial approval without changed content preserves acceptance; material changes invalidate it.
      const material =
        Object.keys(t.changes).some(
          (k) =>
            k !== "scope_status" &&
            hashPayload(t.before[k] ?? null) !==
              hashPayload(t.after[k] ?? null),
        ) ||
        t.after.scope_status === "EXCLUDED" ||
        t.before.scope_status === "EXCLUDED";
      if (material)
        for (const d of t.impact.direct_deliverables) {
          const [before] = await tx.query(
            "SELECT * FROM delivery.deliverables WHERE id=$1 FOR UPDATE",
            [d.id],
          );
          const [after] = await tx.query(
            "UPDATE delivery.deliverables SET accepted=false,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
            [d.id],
          );
          await audit(
            tx,
            user,
            pid,
            "deliverables",
            d.id,
            "AcceptanceInvalidated",
            before,
            after,
            `Change control ${r.id}: revalidar aceite`,
            cid,
          );
          const node = t.impact.affected_nodes.find(
            (n: Row) =>
              n.entity_id === d.id && n.entity_type === "deliverables",
          );
          if (node)
            for (const g of t.impact.gates.filter(
              (g: Row) => g.subject_node_id === node.id,
            )) {
              const [afterGate] = await tx.query(
                "UPDATE governance.gate_assessments SET result='PENDING',justification=$1,version=version+1 WHERE id=$2 RETURNING *",
                [
                  `Escopo alterado pela solicitação ${r.id}; reavaliação necessária.`,
                  g.id,
                ],
              );
              await audit(
                tx,
                user,
                pid,
                "assessments",
                g.id,
                "ScopeInvalidated",
                g,
                afterGate,
                r.reason,
                cid,
              );
            }
        }
      const [after] = await tx.query(
        "UPDATE governance.change_requests SET status='APPLIED',applied_by=$1,applied_at=now(),version=version+1 WHERE id=$2 RETURNING *",
        [user, r.id],
      );
      await audit(
        tx,
        user,
        pid,
        "change_requests",
        r.id,
        "Applied",
        r,
        after,
        r.reason,
        cid,
      );
      return after;
    },
  );
}

export async function cancelChange(
  user: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = z
    .object({
      expectedVersion: z.number().int().positive(),
      reason: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(input);
  return idempotent(
    user,
    key,
    { op: "scope-cancel", pid, id, p },
    async (tx) => {
      const r = await request(tx, pid, id, p.expectedVersion);
      const roles = await memberships(user, pid, tx);
      const t = await target(tx, pid, r.subject_node_id);
      if (!roles.some((r) => ["PMO", "EXECUTIVE"].includes(r.role)))
        await canPropose(tx, user, pid, t.kind, t.before);
      if (!["SUBMITTED", "APPROVED"].includes(r.status))
        throw new DomainError(409, "Solicitação já encerrada.");
      const [after] = await tx.query(
        "UPDATE governance.change_requests SET status='CANCELLED',cancelled_by=$1,cancelled_at=now(),cancellation_reason=$2,version=version+1 WHERE id=$3 RETURNING *",
        [user, p.reason, r.id],
      );
      await audit(
        tx,
        user,
        pid,
        "change_requests",
        r.id,
        "Cancelled",
        r,
        after,
        p.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
