import { assertReadable } from "../domain/access";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPayload } from "../domain/canonical";
import { DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { audit, idempotent } from "./transactions";
const reason = z.string().trim().min(3).max(2000);
export async function reportCommand(
  userId: string,
  pid: string,
  id: string | undefined,
  action: string | undefined,
  input: unknown,
  key: string,
) {
  if (id) z.uuid().parse(id);
  const data = (
    id
      ? z.object({
          expectedVersion: z.number().int().positive(),
          reason,
          ...(action === "review"
            ? { decision: z.enum(["APPROVED", "REJECTED"]) }
            : {}),
        })
      : z.object({
          title: z.string().trim().min(3).max(160),
          narrative: z.string().trim().min(3).max(12000),
          snapshotId: z.uuid(),
          previousSnapshotId: z.uuid().nullable(),
        })
  )
    .strict()
    .parse(input) as Record<string, any>;
  if (id && !["review", "publish"].includes(action || ""))
    throw new DomainError(404, "Comando de relatório desconhecido.");
  return idempotent(
    userId,
    key,
    { op: "report", pid, id, action, data },
    async (tx) => {
      const roles = await memberships(userId, pid, tx);
      if (
        !roles.some((r) =>
          ["PROGRAM_ADMIN", "PMO", "CHIEF_ARCHITECT", "EXECUTIVE"].includes(
            r.role,
          ),
        )
      )
        throw new DomainError(
          403,
          "Relatório requer PMO, arquiteto, executivo ou administrador.",
        );
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      if (!id) {
        const [snap] = await tx.query(
          "SELECT * FROM reporting.snapshots WHERE id=$1 AND program_id=$2",
          [data.snapshotId, pid],
        );
        if (snap) assertReadable(snap, roles);
        if (!snap)
          throw new DomainError(404, "Snapshot não pertence ao programa.");
        if (data.previousSnapshotId) {
          const [previous] = await tx.query(
            "SELECT * FROM reporting.snapshots WHERE id=$1 AND program_id=$2 AND as_of<$3",
            [data.previousSnapshotId, pid, snap.as_of],
          );
          if (!previous)
            throw new DomainError(
              422,
              "Comparação requer snapshot anterior do mesmo programa.",
            );
        }
        const hash = hashPayload({
          title: data.title,
          narrative: data.narrative,
          snapshotId: snap.id,
          snapshotHash: snap.payload_hash,
          previousSnapshotId: data.previousSnapshotId,
        });
        const [record] = await tx.query(
          "INSERT INTO reporting.reports(program_id,snapshot_id,previous_snapshot_id,title,narrative,author_id,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            pid,
            snap.id,
            data.previousSnapshotId,
            data.title,
            data.narrative,
            userId,
            hash,
          ],
        );
        await audit(
          tx,
          userId,
          pid,
          "reports",
          record.id,
          "Submitted",
          null,
          record,
          "Conteúdo submetido para revisão independente",
          randomUUID(),
        );
        return record;
      }
      const [before] = await tx.query(
        "SELECT * FROM reporting.reports WHERE id=$1 AND program_id=$2 FOR UPDATE",
        [id, pid],
      );
      if (!before) throw new DomainError(404, "Relatório não encontrado.");
      const refs = await tx.query(
        "SELECT * FROM reporting.snapshots WHERE id=$1 OR id=$2",
        [before.snapshot_id, before.previous_snapshot_id],
      );
      for (const ref of refs) assertReadable(ref, roles);
      if (Number(before.version) !== data.expectedVersion)
        throw new DomainError(
          409,
          "Relatório alterado. Atualize antes de decidir.",
        );
      if (action === "review") {
        if (before.author_id === userId)
          throw new DomainError(
            403,
            "Revisão deve ser realizada por outra pessoa.",
          );
        if (before.status !== "SUBMITTED")
          throw new DomainError(409, "Relatório não está em revisão.");
        const [record] = await tx.query(
          "UPDATE reporting.reports SET status=$1,reviewer_id=$2,review_reason=$3,reviewed_at=now(),version=version+1 WHERE id=$4 RETURNING *",
          [data.decision, userId, data.reason, id],
        );
        await audit(
          tx,
          userId,
          pid,
          "reports",
          id,
          data.decision,
          before,
          record,
          data.reason,
          randomUUID(),
        );
        return record;
      }
      if (before.status !== "APPROVED")
        throw new DomainError(409, "Publicação exige revisão aprovada.");
      const [record] = await tx.query(
        "UPDATE reporting.reports SET status='PUBLISHED',publisher_id=$1,published_at=now(),version=version+1 WHERE id=$2 RETURNING *",
        [userId, id],
      );
      await audit(
        tx,
        userId,
        pid,
        "reports",
        id,
        "Published",
        before,
        record,
        data.reason,
        randomUUID(),
      );
      return record;
    },
  );
}
