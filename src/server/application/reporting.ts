import { inventoryCoverage } from "../domain/inventory-coverage";
import { gateCatalog } from "./catalogs";
import { hashPayload } from "../domain/canonical";
import { randomUUID } from "node:crypto";
import {
  canEdit,
  DomainError,
  FORMULA_VERSION,
  metrics,
} from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { type Row } from "../infrastructure/database";
import { audit, idempotent } from "./transactions";
import { deliverableReadiness } from "../domain/readiness";
const hash = hashPayload;

export async function snapshot(userId: string, pid: string, key: string) {
  const roles = await memberships(userId, pid);
  if (!canEdit(roles, "snapshots"))
    throw new DomainError(403, "Snapshot requer PMO ou administrador.");
  return idempotent(userId, key, { op: "snapshot", pid }, async (tx) => {
    await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
      pid,
    ]);
    if (!canEdit(await memberships(userId, pid, tx), "snapshots"))
      throw new DomainError(403, "Alçada de snapshot revogada.");
    const deliverables = await tx.query(
      "SELECT d.*, EXISTS(SELECT 1 FROM delivery.deliverable_capabilities l WHERE l.deliverable_id=d.id) OR d.transverse_obligation IS NOT NULL AS has_scope, EXISTS(SELECT 1 FROM evidence_records e JOIN portfolio.program_nodes n ON n.id=e.subject_node_id WHERE n.entity_id=d.id AND n.entity_type='deliverables') AS has_evidence FROM delivery.deliverables d WHERE d.program_id=$1",
      [pid],
    );
    const raid = await tx.query(
      "SELECT * FROM governance.raid_items WHERE program_id=$1",
      [pid],
    );
    const decisions = await tx.query(
      "SELECT * FROM governance.decisions WHERE program_id=$1",
      [pid],
    );
    const assessments = await tx.query(
      "SELECT a.*,g.blocking FROM governance.gate_assessments a JOIN governance.gate_definitions g ON g.id=a.gate_id WHERE a.program_id=$1",
      [pid],
    );
    const items = await tx.query(
      "SELECT i.frozen_payload FROM delivery.baseline_items i JOIN delivery.baselines b ON b.id=i.baseline_id WHERE b.program_id=$1 AND b.status='APPROVED' AND b.version=(SELECT max(version) FROM delivery.baselines WHERE program_id=$1 AND status='APPROVED')",
      [pid],
    );
    const [programme] = await tx.query(
      "SELECT health_policy FROM portfolio.programs WHERE id=$1",
      [pid],
    );
    const payload = {
      deliverables,
      raid,
      decisions,
      assessments,
      metrics: metrics(
        deliverables as any,
        items.map((i) => i.frozen_payload),
        new Date(),
        programme.health_policy.stale_days,
      ),
      formulaVersion: FORMULA_VERSION,
    };
    const context: Row = {};
    for (const [name, table] of Object.entries({
      programs: "portfolio.programs",
      observations: "governance.observations",
      capabilities: "portfolio.capabilities",
      domains: "portfolio.domains",
      areas: "portfolio.areas",
      squads: "portfolio.squads",
      workstreams: "portfolio.workstreams",
      components: "architecture.components",
      contracts: "architecture.contracts",
      suppliers: "architecture.suppliers",
      healthOverrides: "governance.health_overrides",
      releases: "delivery.releases",
      milestones: "delivery.milestones",
      dependencies: "governance.dependencies",
      evidence: "evidence_records",
      links: "delivery.deliverable_capabilities",
      componentLinks: "architecture.capability_components",
      releaseLinks: "delivery.release_deliverables",
      change_requests: "governance.change_requests",
      nodes: "portfolio.program_nodes",
      priorityBoards: "portfolio.priority_boards",
      priorityEntries: "portfolio.priority_entries",
      dodProfiles: "governance.dod_profiles",
      layers: "portfolio.layers",
    }))
      context[name] = await tx.query(
        `SELECT * FROM ${table} WHERE ${name === "programs" ? "id" : "program_id"}=$1`,
        [pid],
      );
    context.gates = (await gateCatalog(tx, pid)).gates;
    context.gateVersions = await tx.query(
      "SELECT v.* FROM governance.gate_definition_versions v JOIN governance.gate_definitions g ON g.id=v.gate_id WHERE g.program_id IS NULL OR g.program_id=$1 ORDER BY v.gate_id,v.version",
      [pid],
    );
    context.users = await tx.query(
      "SELECT DISTINCT u.id,u.display_name FROM iam.users u JOIN iam.memberships m ON m.user_id=u.id WHERE m.program_id=$1",
      [pid],
    );
    context.provenanceCheckpoint = (
      await tx.query(
        "SELECT COALESCE(max(sequence),0)::text AS sequence FROM integration.field_provenance WHERE program_id=$1",
        [pid],
      )
    )[0].sequence;
    const frozen = {
      ...payload,
      context,
      baselineItems: items,
      readiness: deliverableReadiness(
        deliverables,
        context.nodes,
        context.gates,
        assessments,
        context.links,
        context.capabilities,
        context.dodProfiles,
      ),
      inventoryCoverage: inventoryCoverage(
        context.programs[0],
        context.capabilities.length,
      ),
      hashScheme: "canonical-json-v1",
    };
    const [record] = await tx.query(
      "INSERT INTO reporting.snapshots(program_id,as_of,formula_version,payload,payload_hash) VALUES($1,now(),$2,$3::jsonb,$4) RETURNING *",
      [pid, FORMULA_VERSION, JSON.stringify(frozen), hash(frozen)],
    );
    await audit(
      tx,
      userId,
      pid,
      "snapshots",
      record.id,
      "Created",
      null,
      record,
      "Snapshot observado",
      randomUUID(),
    );
    return record;
  });
}
