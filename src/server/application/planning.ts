import { hashPayload } from "../domain/canonical";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canEdit, DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { type Database } from "../infrastructure/database";
import { audit, idempotent } from "./transactions";

async function commitment(tx: Database, pid: string) {
  const rows = await tx.query(
    "SELECT d.*,n.id AS node_id,COALESCE((SELECT jsonb_agg(l.capability_id ORDER BY l.capability_id) FROM delivery.deliverable_capabilities l WHERE l.deliverable_id=d.id),'[]'::jsonb) AS capability_ids,COALESCE((SELECT jsonb_object_agg(l.capability_id::text,l.contribution_type) FROM delivery.deliverable_capabilities l WHERE l.deliverable_id=d.id),'{}'::jsonb) AS capability_roles FROM delivery.deliverables d JOIN portfolio.program_nodes n ON n.entity_id=d.id AND n.entity_type='deliverables' WHERE d.program_id=$1 ORDER BY d.id",
    [pid],
  );
  for (const r of rows) if (r.weight !== null) r.weight = Number(r.weight);
  const capabilities = await tx.query(
    "SELECT * FROM portfolio.capabilities WHERE program_id=$1 ORDER BY id",
    [pid],
  );
  return { rows, capabilities };
}
export async function baseline(
  userId: string,
  pid: string,
  key: string,
  reason = "Proposta explícita de baseline para revisão independente",
) {
  z.string().trim().min(3).max(2000).parse(reason);
  return idempotent(
    userId,
    key,
    { op: "baseline-propose", pid, reason },
    async (tx) => {
      const roles = await memberships(userId, pid, tx);
      if (!canEdit(roles, "baselines"))
        throw new DomainError(
          403,
          "Proposta de baseline requer PMO ou administrador.",
        );
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const current = await commitment(tx, pid);
      if (!current.rows.length)
        throw new DomainError(422, "Baseline exige ao menos um entregável.");
      if (
        current.rows.some(
          (r) => !r.owner_id || !r.acceptance_criteria || !r.forecast_date,
        )
      )
        throw new DomainError(
          422,
          "Baseline exige responsável, aceite e forecast em todos os entregáveis.",
        );
      const [b] = await tx.query(
        "INSERT INTO delivery.baselines(program_id,version,proposed_by,proposal_reason,proposal_hash,proposal_context) SELECT $1,COALESCE(max(version),0)+1,$2,$3,$4,$5::jsonb FROM delivery.baselines WHERE program_id=$1 RETURNING *",
        [
          pid,
          userId,
          reason,
          hashPayload(current),
          JSON.stringify({ capabilities: current.capabilities }),
        ],
      );
      for (const row of current.rows) {
        const frozen = { ...row, hashScheme: "canonical-json-v1" };
        await tx.query(
          "INSERT INTO delivery.baseline_items(baseline_id,subject_node_id,frozen_payload,payload_hash) VALUES($1,$2,$3::jsonb,$4)",
          [b.id, row.node_id, JSON.stringify(frozen), hashPayload(frozen)],
        );
      }
      const [submitted] = await tx.query(
        "UPDATE delivery.baselines SET status='SUBMITTED' WHERE id=$1 RETURNING *",
        [b.id],
      );
      await audit(
        tx,
        userId,
        pid,
        "baselines",
        b.id,
        "Submitted",
        null,
        submitted,
        reason,
        randomUUID(),
      );
      return submitted;
    },
  );
}
export async function reviewBaseline(
  userId: string,
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
    userId,
    key,
    { op: "baseline-review", pid, id, p },
    async (tx) => {
      const roles = await memberships(userId, pid, tx);
      if (!roles.some((r) => ["PMO", "EXECUTIVE"].includes(r.role)))
        throw new DomainError(
          403,
          "Revisão de baseline requer PMO ou executivo.",
        );
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const [b] = await tx.query(
        "SELECT * FROM delivery.baselines WHERE id=$1 AND program_id=$2 FOR UPDATE",
        [id, pid],
      );
      if (!b) throw new DomainError(404, "Baseline não encontrada.");
      if (b.status !== "SUBMITTED" || Number(b.version) !== p.expectedVersion)
        throw new DomainError(409, "Baseline já decidida ou versão obsoleta.");
      if (b.proposed_by === userId)
        throw new DomainError(
          403,
          "Solicitante não pode decidir a própria baseline.",
        );
      if (
        p.decision === "APPROVED" &&
        hashPayload(await commitment(tx, pid)) !== b.proposal_hash
      )
        throw new DomainError(
          409,
          "Inventário mudou desde a proposta. Rejeite esta baseline e proponha uma nova versão.",
        );
      const [after] = await tx.query(
        "UPDATE delivery.baselines SET status=$1,reviewed_by=$2,reviewed_at=now(),review_reason=$3,approved_by=$4,approved_at=CASE WHEN $1='APPROVED' THEN now() ELSE NULL END WHERE id=$5 RETURNING *",
        [
          p.decision,
          userId,
          p.reason,
          p.decision === "APPROVED" ? userId : null,
          b.id,
        ],
      );
      await audit(
        tx,
        userId,
        pid,
        "baselines",
        b.id,
        p.decision === "APPROVED" ? "Approved" : "Rejected",
        b,
        after,
        p.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
