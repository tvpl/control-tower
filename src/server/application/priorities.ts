import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPayload } from "../domain/canonical";
import {
  canPrioritize,
  PRIORITY_KINDS,
  reconcileOrder,
  type PriorityKind,
} from "../domain/priorities";
import { DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { getDb, type Database } from "../infrastructure/database";
import { audit, idempotent } from "./transactions";

async function universe(tx: Database, pid: string, kind: PriorityKind) {
  // Table names are selected from a closed enum, never supplied as SQL by the caller.
  const table =
    kind === "deliverables"
      ? "delivery.deliverables"
      : "portfolio.capabilities";
  return tx.query(
    `SELECT n.id,d.id AS entity_id FROM ${table} d JOIN portfolio.program_nodes n ON n.entity_id=d.id AND n.entity_type=$2 AND n.program_id=d.program_id WHERE d.program_id=$1 ORDER BY d.code,d.id`,
    [pid, kind],
  );
}
export async function priorityBoard(
  tx: Database,
  pid: string,
  kind: PriorityKind,
) {
  const nodes = await universe(tx, pid, kind);
  const [board] = await tx.query(
    "SELECT * FROM portfolio.priority_boards WHERE program_id=$1 AND entity_type=$2",
    [pid, kind],
  );
  const entries = board
    ? await tx.query(
        "SELECT subject_node_id,position FROM portfolio.priority_entries WHERE board_id=$1 ORDER BY position",
        [board.id],
      )
    : [];
  const current = nodes.map((n) => n.id);
  const saved = entries.map((e) => e.subject_node_id);
  return {
    kind,
    version: Number(board?.version || 0),
    orderedIds: reconcileOrder(saved, current),
    savedIds: saved,
    universeHash: hashPayload([...current].sort()),
    unrankedIds: current.filter((id) => !saved.includes(id)),
    updatedBy: board?.updated_by || null,
    updatedAt: board?.updated_at || null,
    reason: board?.reason || null,
  };
}
export async function priorityBoards(pid: string, tx: Database = getDb()) {
  // Shared programme lock gives a coherent view of board version, membership and inventory.
  return tx.transaction(async (database) => {
    await database.query(
      "SELECT id FROM portfolio.programs WHERE id=$1 FOR SHARE",
      [pid],
    );
    return {
      deliverables: await priorityBoard(database, pid, "deliverables"),
      capabilities: await priorityBoard(database, pid, "capabilities"),
    };
  });
}
const reorderSchema = z
  .object({
    kind: z.enum(PRIORITY_KINDS),
    orderedIds: z.array(z.uuid()).max(10000),
    expectedVersion: z.number().int().nonnegative(),
    universeHash: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export async function reorderPriorities(
  userId: string,
  pid: string,
  input: unknown,
  key: string,
) {
  const data = reorderSchema.parse(input);
  return idempotent(
    userId,
    key,
    { op: "priorities-reorder", pid, data },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx);
      if (!canPrioritize(roles))
        throw new DomainError(
          403,
          "Reordenar prioridades do programa exige gestor, arquiteto, PMO ou executivo.",
        );
      const before = await priorityBoard(tx, pid, data.kind);
      if (before.version !== data.expectedVersion)
        throw new DomainError(
          409,
          "Outra pessoa atualizou as prioridades. Recarregue a ordem antes de salvar.",
        );
      if (before.universeHash !== data.universeHash)
        throw new DomainError(
          409,
          "O inventário mudou. Recarregue para incluir os novos itens antes de salvar.",
        );
      const set = new Set(before.orderedIds);
      if (
        data.orderedIds.length !== set.size ||
        new Set(data.orderedIds).size !== set.size ||
        data.orderedIds.some((id) => !set.has(id))
      )
        throw new DomainError(
          422,
          "A ordem deve conter cada item deste programa e tipo exatamente uma vez.",
        );
      const [board] = await tx.query(
        "INSERT INTO portfolio.priority_boards(program_id,entity_type,updated_by,reason) VALUES($1,$2,$3,$4) ON CONFLICT(program_id,entity_type) DO UPDATE SET version=portfolio.priority_boards.version+1,updated_by=excluded.updated_by,reason=excluded.reason,updated_at=now() RETURNING *",
        [pid, data.kind, userId, data.reason],
      );
      await tx.query(
        "DELETE FROM portfolio.priority_entries WHERE board_id=$1",
        [board.id],
      );
      for (const [i, node] of data.orderedIds.entries())
        await tx.query(
          "INSERT INTO portfolio.priority_entries(board_id,program_id,subject_node_id,position) VALUES($1,$2,$3,$4)",
          [board.id, pid, node, i + 1],
        );
      const after = await priorityBoard(tx, pid, data.kind);
      await audit(
        tx,
        userId,
        pid,
        "priorities",
        board.id,
        "Reordered",
        before,
        after,
        data.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
