import { DomainError } from "../domain/rules";
import { type Database } from "../infrastructure/database";
export async function assertProductionScope(
  tx: Database,
  pid: string,
  id: string,
) {
  const [d] = await tx.query(
    "SELECT scope_status FROM delivery.deliverables WHERE id=$1 AND program_id=$2",
    [id, pid],
  );
  const invalid = await tx.query(
    "SELECT c.id FROM portfolio.capabilities c JOIN delivery.deliverable_capabilities l ON l.capability_id=c.id WHERE l.deliverable_id=$1 AND l.contribution_type='REQUIRED' AND c.scope_status NOT IN ('APPROVED','CHANGED')",
    [id],
  );
  if (!d || !["APPROVED", "CHANGED"].includes(d.scope_status) || invalid.length)
    throw new DomainError(
      409,
      "Produção/release exige escopo aprovado do entregável e das capacidades obrigatórias.",
    );
}
