import { assertReadable } from "../domain/access";
import { authorizeGate } from "./authorization";
import { gateCatalog, subjectGateReadiness } from "./catalogs";
import { applicability } from "../domain/applicability";
import { createHash, randomUUID } from "node:crypto";
import { assertTransition, canEdit, DomainError } from "../domain/rules";
import { assessmentSchema, transitionSchema } from "../domain/schemas";
import { memberships } from "../infrastructure/auth";
import { type Row } from "../infrastructure/database";
import { audit, idempotent } from "./transactions";
import { assertProductionScope } from "./scope-policy";
import { z } from "zod";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function assess(
  userId: string,
  pid: string,
  input: unknown,
  key: string,
) {
  const data = assessmentSchema.parse(input);
  return idempotent(
    userId,
    key,
    { op: "assessment", pid, data },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx);
      const [gate] = await tx.query(
        "SELECT * FROM governance.gate_definitions WHERE id=$1 AND (program_id IS NULL OR program_id=$2)",
        [data.gate_id, pid],
      );
      if (!gate) throw new DomainError(404, "Gate não encontrado.");
      if (Number(gate.version) !== data.expectedGateVersion)
        throw new DomainError(
          409,
          "Critério mudou. Recarregue a definição do gate antes de avaliar.",
        );
      if (
        !roles.some(
          (r) =>
            r.role === "GATE_APPROVER" &&
            r.gate_categories.includes(gate.category),
        )
      )
        throw new DomainError(403, "Sem alçada para esta categoria de gate.");
      const [subject] = await tx.query(
        "SELECT * FROM portfolio.program_nodes WHERE id=$1 AND program_id=$2",
        [data.subject_node_id, pid],
      );
      if (!subject)
        throw new DomainError(422, "Entidade não pertence ao programa.");
      await authorizeGate(tx, roles, pid, subject, gate.category);
      const [deliverable] = await tx.query(
        "SELECT * FROM delivery.deliverables WHERE id=$1 AND program_id=$2",
        [subject.entity_id, pid],
      );
      const catalog = await gateCatalog(tx, pid);
      const context = deliverable
        ? applicability(deliverable, catalog.gates, catalog.profiles)
        : { contextKey: null, gates: catalog.gates };
      if (!context.gates.some((g) => g.id === gate.id))
        throw new DomainError(
          422,
          "Gate não aplicável ao perfil desta entrega.",
        );
      if (
        context.contextKey !== null &&
        data.expectedContextKey !== context.contextKey
      )
        throw new DomainError(
          409,
          "Perfil mudou. Recarregue a aplicabilidade antes de avaliar.",
        );
      if (
        gate.blocking &&
        deliverable?.owner_id === userId &&
        data.result !== "PENDING"
      )
        throw new DomainError(
          403,
          "Autoaprovação de gate impeditivo proibida.",
        );
      if (
        ["PASSED", "EXCEPTION_APPROVED"].includes(data.result) &&
        !data.evidence_ids.length
      )
        throw new DomainError(422, "Aprovação exige evidência.");
      const frozenEvidence: Row[] = [];
      for (const eid of data.evidence_ids) {
        const [ev] = await tx.query(
          "SELECT * FROM evidence_records WHERE id=$1 AND program_id=$2 AND subject_node_id=$3",
          [eid, pid, subject.id],
        );
        if (!ev)
          throw new DomainError(
            422,
            "Evidência não corresponde à entidade avaliada.",
          );
        assertReadable(ev, roles);
        frozenEvidence.push(ev);
      }
      if (
        data.result === "EXCEPTION_APPROVED" &&
        (!data.expires_at ||
          new Date(data.expires_at) <= new Date() ||
          !data.accepted_risk ||
          data.accepted_risk.trim().length < 3 ||
          !data.mitigation_plan ||
          data.mitigation_plan.trim().length < 3 ||
          !data.decision_reference ||
          data.decision_reference.trim().length < 3)
      )
        throw new DomainError(
          422,
          "Exceção exige validade futura, risco aceito, mitigação e referência da decisão.",
        );
      const [before] = await tx.query(
        "SELECT * FROM governance.gate_assessments WHERE subject_node_id=$1 AND gate_id=$2 FOR UPDATE",
        [subject.id, gate.id],
      );
      if (Number(before?.version || 0) !== data.expectedVersion)
        throw new DomainError(409, "Avaliação atualizada por outra pessoa.");
      const [after] = await tx.query(
        "INSERT INTO governance.gate_assessments(program_id,subject_node_id,gate_id,gate_version,result,assessed_by,assessed_at,justification,evidence_refs,expires_at,accepted_risk,context_key,mitigation_plan,decision_reference) VALUES($1,$2,$3,$4,$5,$6,now(),$7,$8::jsonb,$9,$10,$11,$12,$13) ON CONFLICT(subject_node_id,gate_id) DO UPDATE SET gate_version=excluded.gate_version,result=excluded.result,assessed_by=excluded.assessed_by,assessed_at=now(),justification=excluded.justification,evidence_refs=excluded.evidence_refs,expires_at=excluded.expires_at,accepted_risk=excluded.accepted_risk,context_key=excluded.context_key,mitigation_plan=excluded.mitigation_plan,decision_reference=excluded.decision_reference,version=governance.gate_assessments.version+1 RETURNING *",
        [
          pid,
          subject.id,
          gate.id,
          gate.version,
          data.result,
          userId,
          data.justification,
          JSON.stringify(frozenEvidence),
          data.expires_at || null,
          data.accepted_risk || null,
          context.contextKey,
          data.mitigation_plan || null,
          data.decision_reference || null,
        ],
      );
      await audit(
        tx,
        userId,
        pid,
        "assessments",
        after.id,
        "Assessed",
        before || null,
        after,
        data.justification,
        randomUUID(),
      );
      return after;
    },
  );
}
export async function transition(
  userId: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  const data = transitionSchema.parse(input);
  return idempotent(
    userId,
    key,
    { op: "transition", pid, id, data },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx);
      const [d] = await tx.query(
        "SELECT * FROM delivery.deliverables WHERE id=$1 AND program_id=$2 FOR UPDATE",
        [id, pid],
      );
      if (!d) throw new DomainError(404, "Entregável não encontrado.");
      if (!canEdit(roles, "deliverables", d.workstream_id))
        throw new DomainError(403, "Sem permissão para esta frente.");
      if (Number(d.version) !== data.expectedVersion)
        throw new DomainError(409, "Versão obsoleta.");
      if (
        data.targetStage === "PRODUCTION" &&
        (!d.accepted || d.execution_status !== "DONE")
      )
        throw new DomainError(
          409,
          "Produção exige execução concluída e aceite atual; aprovação antiga de release não substitui aceite.",
        );
      if (data.targetStage === "PRODUCTION")
        await assertProductionScope(tx, pid, id);
      const gateStatus = await subjectGateReadiness(
        tx,
        pid,
        id,
        data.targetStage === "PRODUCTION" ? undefined : "ENGINEERING",
      );
      const ready = gateStatus.known && gateStatus.blockingGates === 0;
      const releases = await tx.query(
        "SELECT r.id FROM delivery.releases r JOIN delivery.release_deliverables l ON l.release_id=r.id WHERE l.deliverable_id=$1 AND r.status='APPROVED'",
        [id],
      );
      let authorizedRelease = false;
      for (const release of releases) {
        const members = await tx.query(
          "SELECT d.id,d.accepted,d.execution_status,n.id AS node_id FROM delivery.release_deliverables l JOIN delivery.deliverables d ON d.id=l.deliverable_id JOIN portfolio.program_nodes n ON n.entity_id=d.id AND n.entity_type='deliverables' WHERE l.release_id=$1 AND l.required=true",
          [release.id],
        );
        if (
          !members.length ||
          members.some((m) => !m.accepted || m.execution_status !== "DONE")
        )
          continue;
        let satisfied = true;
        for (const member of members) {
          try {
            await assertProductionScope(tx, pid, member.id);
          } catch (e) {
            if (e instanceof DomainError) {
              satisfied = false;
              break;
            }
            throw e;
          }
          const current = await subjectGateReadiness(tx, pid, member.id);
          if (!current.known || current.blockingGates > 0) {
            satisfied = false;
            break;
          }
        }
        if (satisfied) {
          authorizedRelease = true;
          break;
        }
      }
      assertTransition(
        d.delivery_stage,
        data.targetStage,
        ready,
        authorizedRelease,
        data.reason,
      );
      const [after] = await tx.query(
        "UPDATE delivery.deliverables SET delivery_stage=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *",
        [data.targetStage, id],
      );
      await audit(
        tx,
        userId,
        pid,
        "deliverables",
        id,
        "StageChanged",
        d,
        after,
        data.reason,
        randomUUID(),
      );
      return after;
    },
  );
}

export async function revokeException(
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
      reason: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(input);
  return idempotent(
    userId,
    key,
    { op: "exception-revoke", pid, id, p },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx);
      const [before] = await tx.query(
        "SELECT a.* FROM governance.gate_assessments a WHERE a.id=$1 AND a.program_id=$2 FOR UPDATE",
        [id, pid],
      );
      if (!before) throw new DomainError(404, "Avaliação não encontrada.");
      const [gate] = await tx.query(
        "SELECT category FROM governance.gate_definitions WHERE id=$1",
        [before.gate_id],
      );
      const [subject] = await tx.query(
        "SELECT * FROM portfolio.program_nodes WHERE id=$1 AND program_id=$2",
        [before.subject_node_id, pid],
      );
      if (!subject || !gate)
        throw new DomainError(404, "Contexto da avaliação não encontrado.");
      await authorizeGate(tx, roles, pid, subject, gate.category);
      if (
        !roles.some(
          (r) =>
            r.role === "GATE_APPROVER" &&
            r.gate_categories.includes(gate.category),
        )
      )
        throw new DomainError(403, "Revogação exige alçada da categoria.");
      if (
        Number(before.version) !== p.expectedVersion ||
        before.result !== "EXCEPTION_APPROVED"
      )
        throw new DomainError(
          409,
          "Exceção já foi atualizada, revogada ou não existe.",
        );
      const [after] = await tx.query(
        "UPDATE governance.gate_assessments SET result='PENDING',expires_at=now(),justification=$1,assessed_by=$2,assessed_at=now(),version=version+1 WHERE id=$3 RETURNING *",
        [p.reason, userId, id],
      );
      await audit(
        tx,
        userId,
        pid,
        "assessments",
        id,
        "ExceptionRevoked",
        before,
        after,
        p.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
