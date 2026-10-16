import {
  assertReadable,
  gateAuthority,
  type AccessMembership,
} from "../domain/access";
import { DomainError } from "../domain/rules";
import type { Database, Row } from "../infrastructure/database";
export async function authorizeGate(
  tx: Database,
  roles: AccessMembership[],
  pid: string,
  subject: Row,
  category: string,
) {
  let workstream: string | null = null,
    domains: string[] = [];
  if (subject.entity_type === "deliverables") {
    const [d] = await tx.query(
      "SELECT workstream_id FROM delivery.deliverables WHERE id=$1 AND program_id=$2",
      [subject.entity_id, pid],
    );
    workstream = d?.workstream_id || null;
    domains = (
      await tx.query(
        "SELECT DISTINCT c.domain_id FROM portfolio.capabilities c JOIN delivery.deliverable_capabilities l ON l.capability_id=c.id WHERE l.deliverable_id=$1 AND c.program_id=$2",
        [subject.entity_id, pid],
      )
    ).map((r) => r.domain_id);
  } else if (subject.entity_type === "capabilities")
    domains = (
      await tx.query(
        "SELECT domain_id FROM portfolio.capabilities WHERE id=$1 AND program_id=$2",
        [subject.entity_id, pid],
      )
    ).map((r) => r.domain_id);
  if (!gateAuthority(roles, category, workstream, domains))
    throw new DomainError(
      403,
      "Sem alçada de gate para categoria, frente ou domínios deste registro.",
    );
}
export async function readableResource(
  tx: Database,
  roles: AccessMembership[],
  kind: string,
  record: Row,
) {
  assertReadable(record, roles);
  if (kind === "contracts" && record.supplier_id) {
    const [supplier] = await tx.query(
      "SELECT classification FROM architecture.suppliers WHERE id=$1 AND program_id=$2",
      [record.supplier_id, record.program_id],
    );
    if (supplier) assertReadable(supplier, roles);
  }
}
