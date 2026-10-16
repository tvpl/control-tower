import { recordProvenance, type ProvenanceSource } from "./provenance";
import { hashPayload } from "../domain/canonical";
import { createHash } from "node:crypto";
import { DomainError } from "../domain/rules";
import { getDb, type Database } from "../infrastructure/database";
const hash = hashPayload;

export async function audit(
  tx: Database,
  actor: string,
  pid: string,
  kind: string,
  id: string,
  action: string,
  before: unknown,
  after: unknown,
  reason: string,
  correlation: string,
  source?: ProvenanceSource,
) {
  await tx.query(
    "INSERT INTO audit.audit_events(program_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason,correlation_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)",
    [
      pid,
      actor,
      kind,
      id,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
      reason,
      correlation,
    ],
  );
  await recordProvenance(tx, actor, pid, kind, id, before, after, source);
  await tx.query(
    "INSERT INTO audit.outbox(program_id,event_type,aggregate_id,correlation_id,payload) VALUES($1,$2,$3,$4,$5::jsonb)",
    [pid, `${kind}.${action}`, id, correlation, JSON.stringify(after)],
  );
}
export async function idempotent(
  userId: string,
  key: string,
  input: unknown,
  fn: (tx: Database) => Promise<unknown>,
) {
  if (!key || key.length > 200)
    throw new DomainError(422, "Idempotency-Key é obrigatória.");
  const requestHash = hash(input);
  return getDb().transaction(async (tx) => {
    await tx.query("SELECT id FROM iam.users WHERE id=$1 FOR UPDATE", [userId]);
    const [existing] = await tx.query(
      "SELECT * FROM audit.idempotency WHERE actor_id=$1 AND key=$2",
      [userId, key],
    );
    if (existing) {
      if (existing.request_hash !== requestHash)
        throw new DomainError(
          409,
          "Chave idempotente reutilizada com conteúdo diferente.",
        );
      return existing.response;
    }
    const result = await fn(tx);
    await tx.query(
      "INSERT INTO audit.idempotency(actor_id,key,request_hash,response) VALUES($1,$2,$3,$4::jsonb)",
      [userId, key, requestHash, JSON.stringify(result)],
    );
    return result;
  });
}
