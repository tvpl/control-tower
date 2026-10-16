import { readableResource } from "./authorization";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canEdit, DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { idempotent, audit } from "./transactions";
const reason = z.string().trim().min(3).max(2000);
export async function reviewRecord(
  userId: string,
  pid: string,
  kind: "decisions" | "contracts",
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = z
    .object({
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["APPROVED", "REJECTED"]),
      reason,
    })
    .strict()
    .parse(input);
  return idempotent(
    userId,
    key,
    { op: "review-record", pid, kind, id, p },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx),
        table =
          kind === "contracts"
            ? "architecture.contracts"
            : "governance.decisions";
      const [before] = await tx.query(
        `SELECT * FROM ${table} WHERE id=$1 AND program_id=$2 FOR UPDATE`,
        [id, pid],
      );
      if (!before) throw new DomainError(404, "Registro não encontrado.");
      await readableResource(tx, roles, kind, before);
      const required =
        kind === "contracts" ? "CHIEF_ARCHITECT" : before.approval_role;
      if (!roles.some((r) => r.role === required))
        throw new DomainError(403, `Revisão exige alçada ${required}.`);
      if (!before.created_by || before.created_by === userId)
        throw new DomainError(
          403,
          "Revisão exige autoria conhecida e outra pessoa.",
        );
      if (
        Number(before.version) !== p.expectedVersion ||
        !["DRAFT", "PROPOSED"].includes(before.status)
      )
        throw new DomainError(
          409,
          "Versão/estado alterado. Atualize o registro.",
        );
      if (
        kind === "contracts" &&
        p.decision === "APPROVED" &&
        (!before.owner_id ||
          !before.specification_url ||
          (!before.sla_ms &&
            (!before.sla_notes || before.sla_notes.trim().length < 3)))
      )
        throw new DomainError(
          422,
          "Aprovação de contrato exige owner, especificação e SLA ou justificativa de aplicabilidade.",
        );
      const [after] = await tx.query(
        `UPDATE ${table} SET status=$1,reviewed_by=$2,reviewed_at=now(),review_reason=$3,version=version+1 WHERE id=$4 RETURNING *`,
        [p.decision, userId, p.reason, id],
      );
      await audit(
        tx,
        userId,
        pid,
        kind,
        id,
        "Reviewed",
        before,
        after,
        p.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
export async function overrideHealth(
  userId: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("SET"),
        health: z.enum(["UNKNOWN", "ON_TRACK", "AT_RISK", "CRITICAL"]),
        expires_at: z.iso.datetime(),
        reason,
        expectedOverrideId: z.uuid().nullable(),
      }),
      z.object({
        action: z.literal("CLEAR"),
        reason,
        expectedOverrideId: z.uuid().nullable(),
      }),
    ])
    .parse(input);
  return idempotent(
    userId,
    key,
    { op: "health-override", pid, id, p },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx);
      const [d] = await tx.query(
        "SELECT d.*,n.id AS node_id FROM delivery.deliverables d JOIN portfolio.program_nodes n ON n.entity_type='deliverables' AND n.entity_id=d.id AND n.program_id=d.program_id WHERE d.id=$1 AND d.program_id=$2",
        [id, pid],
      );
      if (!d) throw new DomainError(404, "Entregável não encontrado.");
      if (
        !canEdit(roles, "deliverables", d.workstream_id) &&
        !roles.some((r) => r.role === "PMO")
      )
        throw new DomainError(
          403,
          "Sem alçada para ajustar saúde desta frente.",
        );
      const [before] = await tx.query(
        "SELECT * FROM governance.health_overrides WHERE subject_node_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
        [d.node_id],
      );
      if ((before?.id || null) !== p.expectedOverrideId)
        throw new DomainError(409, "Ajuste alterado por outra pessoa.");
      if (
        p.action === "SET" &&
        (new Date(p.expires_at).getTime() <= Date.now() ||
          new Date(p.expires_at).getTime() > Date.now() + 90 * 86400000)
      )
        throw new DomainError(
          422,
          "Ajuste exige validade futura de até 90 dias.",
        );
      const [after] = await tx.query(
        "INSERT INTO governance.health_overrides(program_id,subject_node_id,action,health,reason,expires_at,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          pid,
          d.node_id,
          p.action,
          p.action === "SET" ? p.health : null,
          p.reason,
          p.action === "SET" ? p.expires_at : null,
          userId,
        ],
      );
      await audit(
        tx,
        userId,
        pid,
        "health_overrides",
        after.id,
        p.action,
        before || null,
        after,
        p.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
export function applyHealthOverrides(
  ds: Record<string, any>[],
  nodes: Record<string, any>[],
  overrides: Record<string, any>[],
  asOf = new Date(),
) {
  return ds.map((d) => {
    const node = nodes.find(
      (n) => n.entity_type === "deliverables" && n.entity_id === d.id,
    );
    const latest = overrides.find((o) => o.subject_node_id === node?.id);
    const active =
      latest?.action === "SET" && new Date(latest.expires_at) > asOf;
    return {
      ...d,
      derived_health: d.health,
      health: active ? latest.health : d.health,
      health_override: active ? latest : null,
    };
  });
}
