import { randomUUID } from "node:crypto";
import { bulkEditSchema, type BulkEdit } from "../domain/workspace-batches";
import { hashPayload } from "../domain/canonical";
import { DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import type { Database, Row } from "../infrastructure/database";
import { readableResource } from "./authorization";
import { mutate } from "./inventory";
import { batchLines, commitBatch, previewBatch } from "./batches";

async function apply(tx: Database, userId: string, pid: string, p: BulkEdit) {
  await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
    pid,
  ]);
  const roles = await memberships(userId, pid, tx),
    seen = new Set<string>(),
    correlation = randomUUID();
  const result = await batchLines(tx, p.items, async (inner, item) => {
    if (seen.has(item.id))
      throw new DomainError(422, "Entregável repetido no lote.");
    seen.add(item.id);
    const [before] = await inner.query(
      "SELECT * FROM delivery.deliverables WHERE id=$1 AND program_id=$2 FOR UPDATE",
      [item.id, pid],
    );
    if (!before)
      throw new DomainError(404, "Entregável não encontrado neste projeto.");
    await readableResource(inner, roles, "deliverables", before);
    if (Number(before.version) !== item.expectedVersion)
      throw new DomainError(409, "Versão obsoleta. Atualize a seleção.");
    let values: Row;
    if (p.change.action === "SHIFT_FORECAST") {
      if (!before.forecast_date)
        throw new DomainError(
          422,
          "Forecast desconhecido: defina uma data antes de deslocar.",
        );
      const date = new Date(
        `${String(before.forecast_date).slice(0, 10)}T00:00:00.000Z`,
      );
      date.setUTCDate(date.getUTCDate() + p.change.days);
      values = { forecast_date: date.toISOString().slice(0, 10) };
    } else values = p.change.values;
    const after = await mutate(
      userId,
      pid,
      "deliverables",
      values,
      item.id,
      item.expectedVersion,
      p.reason,
      correlation,
      inner,
    );
    return {
      id: after.id,
      code: before.code,
      kind: "deliverables",
      diff: Object.entries(values)
        .map(([field, to]) => ({ field, from: before[field] ?? null, to }))
        .filter((d) => hashPayload(d.from) !== hashPayload(d.to)),
    };
  });
  return { ...result, hash: hashPayload(p) };
}
export function previewBulkEdit(userId: string, pid: string, raw: unknown) {
  const p = bulkEditSchema.parse(raw);
  return previewBatch((tx) => apply(tx, userId, pid, p));
}
export function commitBulkEdit(
  userId: string,
  pid: string,
  raw: unknown,
  expectedHash: string,
  key: string,
) {
  const p = bulkEditSchema.parse(raw);
  return commitBatch(
    userId,
    key,
    "bulk-deliverables",
    pid,
    p,
    expectedHash,
    (tx) => apply(tx, userId, pid, p),
  );
}
