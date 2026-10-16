import { z } from "zod";
import { hashPayload } from "../domain/canonical";
import { DomainError } from "../domain/rules";
import { getDb, type Database, type Row } from "../infrastructure/database";
import { idempotent } from "./transactions";

export async function batchLines<T>(
  tx: Database,
  items: T[],
  apply: (inner: Database, item: T, index: number) => Promise<Row>,
) {
  const lines: Row[] = [];
  for (const [index, item] of items.entries()) {
    try {
      const result = await tx.transaction((inner) => apply(inner, item, index));
      lines.push({ line: index + 1, ...result, errors: [] });
    } catch (error) {
      const code =
        (error as { code?: string; cause?: { code?: string } })?.code ||
        (error as { cause?: { code?: string } })?.cause?.code;
      if (
        !(error instanceof DomainError) &&
        !(error instanceof z.ZodError) &&
        !["23503", "23505", "23514"].includes(code || "")
      )
        throw error;
      lines.push({
        line: index + 1,
        errors: [
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : error instanceof DomainError
              ? error.message
              : "Vínculo inválido ou registro duplicado.",
        ],
      });
    }
  }
  return {
    valid: lines.every((l) => !l.errors.length),
    count: lines.length,
    lines,
  };
}
export type BatchResult = Awaited<ReturnType<typeof batchLines>> & {
  hash: string;
};
export async function previewBatch(
  run: (tx: Database) => Promise<BatchResult>,
) {
  let result: BatchResult | undefined;
  const rollback = new Error("WorkspacePreviewRollback");
  try {
    await getDb().transaction(async (tx) => {
      result = await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result!;
}
export function commitBatch(
  userId: string,
  key: string,
  scope: string,
  pid: string,
  input: unknown,
  expectedHash: string,
  run: (tx: Database) => Promise<BatchResult>,
) {
  if (hashPayload(input) !== expectedHash)
    throw new DomainError(
      409,
      "O lote mudou desde a prévia. Valide novamente.",
    );
  return idempotent(
    userId,
    key,
    { op: scope, pid, input, expectedHash },
    async (tx) => {
      const result = await run(tx);
      if (!result.valid)
        throw new DomainError(
          409,
          `Nenhuma alteração aplicada. ${result.lines
            .filter((l) => l.errors.length)
            .map((l) => `Linha ${l.line}: ${l.errors.join("; ")}`)
            .join(" | ")}`,
        );
      return result;
    },
  );
}
