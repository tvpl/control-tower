import { projectHealth } from "../domain/rules";
import type { Kind } from "../domain/schemas";
import { getDb, type Row } from "../infrastructure/database";
import { applyHealthOverrides } from "./governance-actions";
export async function resourceProjection(
  kind: Kind,
  pid: string,
  records: Row[],
): Promise<Row[]> {
  if (!records.length) return records;
  const ids = records.map((r) => r.id),
    db = getDb();
  if (kind === "deliverables") {
    const nodes = await db.query(
        "SELECT * FROM portfolio.program_nodes WHERE program_id=$1 AND entity_type='deliverables' AND entity_id=ANY(ARRAY(SELECT jsonb_array_elements_text($2::jsonb)::uuid))",
        [pid, JSON.stringify(ids)],
      ),
      dependencies = await db.query(
        "SELECT * FROM governance.dependencies WHERE program_id=$1",
        [pid],
      );
    const baseline = await db.query(
      "SELECT i.frozen_payload FROM delivery.baseline_items i JOIN delivery.baselines b ON b.id=i.baseline_id WHERE b.program_id=$1 AND b.status='APPROVED' AND b.version=(SELECT max(version) FROM delivery.baselines WHERE program_id=$1 AND status='APPROVED')",
      [pid],
    );
    const [program] = await db.query(
      "SELECT health_policy FROM portfolio.programs WHERE id=$1",
      [pid],
    );
    const links = await db.query(
      "SELECT * FROM delivery.deliverable_capabilities WHERE program_id=$1 AND deliverable_id=ANY(ARRAY(SELECT jsonb_array_elements_text($2::jsonb)::uuid))",
      [pid, JSON.stringify(ids)],
    );
    const overrides = await db.query(
      "SELECT * FROM governance.health_overrides WHERE program_id=$1 AND subject_node_id=ANY(ARRAY(SELECT jsonb_array_elements_text($2::jsonb)::uuid)) ORDER BY created_at DESC,id DESC",
      [pid, JSON.stringify(nodes.map((n) => n.id))],
    );
    return applyHealthOverrides(
      projectHealth(
        records,
        nodes,
        dependencies,
        baseline,
        new Date(),
        program.health_policy,
      ),
      nodes,
      overrides,
    ).map((d: Row) => ({
      ...d,
      capability_ids: links
        .filter((l) => l.deliverable_id === d.id)
        .map((l) => l.capability_id),
      capability_roles: Object.fromEntries(
        links
          .filter((l) => l.deliverable_id === d.id)
          .map((l) => [l.capability_id, l.contribution_type]),
      ),
    }));
  }
  if (kind === "components") {
    const links = await db.query(
      "SELECT * FROM architecture.capability_components WHERE program_id=$1 AND component_id=ANY(ARRAY(SELECT jsonb_array_elements_text($2::jsonb)::uuid))",
      [pid, JSON.stringify(ids)],
    );
    return records.map((r) => ({
      ...r,
      capability_ids: links
        .filter((l) => l.component_id === r.id)
        .map((l) => l.capability_id),
      relation_types: Object.fromEntries(
        links
          .filter((l) => l.component_id === r.id)
          .map((l) => [l.capability_id, l.relation_type]),
      ),
    }));
  }
  if (kind === "releases") {
    const links = await db.query(
      "SELECT * FROM delivery.release_deliverables WHERE program_id=$1 AND release_id=ANY(ARRAY(SELECT jsonb_array_elements_text($2::jsonb)::uuid))",
      [pid, JSON.stringify(ids)],
    );
    return records.map((r) => ({
      ...r,
      deliverable_ids: links
        .filter((l) => l.release_id === r.id)
        .map((l) => l.deliverable_id),
      deliverable_required: Object.fromEntries(
        links
          .filter((l) => l.release_id === r.id)
          .map((l) => [l.deliverable_id, l.required]),
      ),
    }));
  }
  return records;
}
