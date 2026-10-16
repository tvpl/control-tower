import { inventoryCoverage } from "../domain/inventory-coverage";
import { redactState } from "../domain/access";
import { applyHealthOverrides } from "./governance-actions";
import { gateCatalog } from "./catalogs";
import { createHash } from "node:crypto";
import {
  FORMULA_VERSION,
  metrics,
  projectHealth,
  readiness,
} from "../domain/rules";
import { TABLES } from "../domain/schemas";
import {
  capabilityReadiness,
  deliverableReadiness,
  effectiveAssessments,
} from "../domain/readiness";
import { memberships } from "../infrastructure/auth";
import { getDb, type Row } from "../infrastructure/database";
import { priorityBoards } from "./priorities";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function state(
  userId: string,
  pid: string,
  snapshotMode: "full" | "summary" = "full",
) {
  const roles = await memberships(userId, pid);
  const db = getDb();
  const result: Row = { roles };
  for (const [kind, table] of Object.entries(TABLES))
    result[kind] = await db.query(
      `SELECT * FROM ${table} WHERE ${kind === "programs" ? "id" : "program_id"}=$1 ORDER BY ${kind === "evidence" ? "created_at DESC" : "id"}`,
      [pid],
    );
  result.observations = await db.query(
    "SELECT * FROM governance.observations WHERE program_id=$1 ORDER BY important DESC,created_at DESC,id",
    [pid],
  );
  result.users = await db.query(
    "SELECT DISTINCT u.id,u.display_name,u.email FROM iam.users u JOIN iam.memberships m ON m.user_id=u.id WHERE m.program_id=$1",
    [pid],
  );
  result.nodes = await db.query(
    "SELECT * FROM portfolio.program_nodes WHERE program_id=$1",
    [pid],
  );
  result.links = await db.query(
    "SELECT * FROM delivery.deliverable_capabilities WHERE program_id=$1",
    [pid],
  );
  result.componentLinks = await db.query(
    "SELECT * FROM architecture.capability_components WHERE program_id=$1",
    [pid],
  );
  result.releaseLinks = await db.query(
    "SELECT * FROM delivery.release_deliverables WHERE program_id=$1",
    [pid],
  );
  const catalog = await gateCatalog(db, pid);
  result.gates = catalog.gates;
  result.dodProfiles = catalog.profiles;
  result.layers = await db.query(
    "SELECT * FROM portfolio.layers WHERE program_id=$1 ORDER BY code",
    [pid],
  );
  result.profileVersions = await db.query(
    "SELECT v.* FROM governance.dod_profile_versions v JOIN governance.dod_profiles p ON p.id=v.profile_id WHERE p.program_id=$1 ORDER BY v.version DESC",
    [pid],
  );
  result.gateVersions = await db.query(
    "SELECT v.* FROM governance.gate_definition_versions v JOIN governance.gate_definitions g ON g.id=v.gate_id WHERE g.program_id IS NULL OR g.program_id=$1 ORDER BY v.gate_id,v.version DESC",
    [pid],
  );
  result.assessments = await db.query(
    "SELECT a.*,g.name,g.category,g.blocking,g.version AS definition_version FROM governance.gate_assessments a JOIN governance.gate_definitions g ON g.id=a.gate_id WHERE a.program_id=$1",
    [pid],
  );
  result.baselines = await db.query(
    "SELECT * FROM delivery.baselines WHERE program_id=$1 ORDER BY version DESC",
    [pid],
  );
  result.baselineItems = await db.query(
    "SELECT i.* FROM delivery.baseline_items i JOIN delivery.baselines b ON b.id=i.baseline_id WHERE b.program_id=$1 AND b.status='APPROVED' AND b.version=(SELECT max(version) FROM delivery.baselines WHERE program_id=$1 AND status='APPROVED')",
    [pid],
  );
  result.baselineArchive = await db.query(
    "SELECT i.* FROM delivery.baseline_items i JOIN delivery.baselines b ON b.id=i.baseline_id WHERE b.program_id=$1",
    [pid],
  );
  result.reports = await db.query(
    "SELECT * FROM reporting.reports WHERE program_id=$1 ORDER BY created_at DESC",
    [pid],
  );
  const snapshotColumns =
    snapshotMode === "full"
      ? "id,program_id,as_of,formula_version,payload_hash,payload"
      : `id,program_id,as_of,formula_version,payload_hash,true AS summary_only,
 CASE WHEN jsonb_path_exists(payload,'$.**.classification ? (@ == "RESTRICTED")') THEN 'RESTRICTED' WHEN jsonb_path_exists(payload,'$.**.classification ? (@ == "CONFIDENTIAL")') THEN 'CONFIDENTIAL' ELSE 'INTERNAL' END AS classification,
 jsonb_build_object('metrics',payload->'metrics','readiness',payload->'readiness','raid',payload->'raid','decisions',payload->'decisions','hashScheme',payload->'hashScheme','deliverables',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d->'id','accepted',d->'accepted','execution_status',d->'execution_status')),'[]'::jsonb) FROM jsonb_array_elements(payload->'deliverables') d)) AS payload`;
  result.snapshots = await db.query(
    `SELECT ${snapshotColumns} FROM reporting.snapshots WHERE program_id=$1 AND (id IN (SELECT id FROM reporting.snapshots WHERE program_id=$1 ORDER BY as_of DESC LIMIT 52) OR id IN (SELECT snapshot_id FROM reporting.reports WHERE program_id=$1) OR id IN (SELECT previous_snapshot_id FROM reporting.reports WHERE program_id=$1)) ORDER BY as_of DESC`,
    [pid],
  );
  result.audit = await db.query(
    "SELECT a.*,u.display_name FROM audit.audit_events a LEFT JOIN iam.users u ON u.id=a.actor_id WHERE a.program_id=$1 ORDER BY occurred_at DESC LIMIT 100",
    [pid],
  );
  result.savedViews = await db.query(
    "SELECT * FROM iam.saved_views WHERE user_id=$1 AND program_id=$2",
    [userId, pid],
  );
  result.change_requests = await db.query(
    "SELECT * FROM governance.change_requests WHERE program_id=$1 ORDER BY requested_at DESC",
    [pid],
  );
  result.deliverables = result.deliverables.map((d: Row) => ({
    ...d,
    has_scope:
      !!d.transverse_obligation ||
      result.links.some((l: Row) => l.deliverable_id === d.id),
    has_evidence: result.evidence.some((e: Row) =>
      result.nodes.some(
        (n: Row) => n.entity_id === d.id && n.id === e.subject_node_id,
      ),
    ),
  }));
  result.deliverables = projectHealth(
    result.deliverables,
    result.nodes,
    result.dependencies,
    result.baselineItems,
    new Date(),
    result.programs[0]?.health_policy,
  );
  for (const kind of ["dependencies", "evidence"])
    result[kind] = result[kind].map((r: Row) => ({
      ...r,
      workstream_id:
        result.deliverables.find((d: Row) =>
          result.nodes.some(
            (n: Row) =>
              n.entity_id === d.id &&
              n.id ===
                (kind === "dependencies"
                  ? r.target_node_id
                  : r.subject_node_id),
          ),
        )?.workstream_id || null,
    }));
  result.healthOverrides = await db.query(
    "SELECT * FROM governance.health_overrides WHERE program_id=$1 ORDER BY created_at DESC,id DESC",
    [pid],
  );
  result.deliverables = applyHealthOverrides(
    result.deliverables,
    result.nodes,
    result.healthOverrides,
  );
  result.metrics = metrics(
    result.deliverables,
    result.baselineItems.map((b: Row) => b.frozen_payload),
    new Date(),
    result.programs[0]?.health_policy?.stale_days || 7,
  );
  result.readiness = deliverableReadiness(
    result.deliverables,
    result.nodes,
    result.gates,
    result.assessments,
    result.links,
    result.capabilities,
    result.dodProfiles,
  );
  result.capabilities = result.capabilities.map((c: Row) => ({
    ...c,
    readiness: capabilityReadiness(
      c,
      result.deliverables,
      result.links,
      result.nodes,
      result.gates,
      result.assessments,
      result.dodProfiles,
    ),
  }));
  result.releases = result.releases.map((r: Row) => ({
    ...r,
    readiness: deliverableReadiness(
      result.deliverables.filter((d: Row) =>
        result.releaseLinks.some(
          (l: Row) =>
            l.release_id === r.id && l.deliverable_id === d.id && l.required,
        ),
      ),
      result.nodes,
      result.gates,
      result.assessments,
      result.links,
      result.capabilities,
      result.dodProfiles,
    ),
  }));
  result.effectiveAssessments = effectiveAssessments(
    result.gates,
    result.assessments,
    {
      deliverables: result.deliverables,
      nodes: result.nodes,
      profiles: result.dodProfiles,
    },
  );
  result.asOf = new Date().toISOString();
  result.sourceAsOf = result.asOf;
  result.lastSyncedAt =
    result.connections
      .map((c: Row) => c.last_synced_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
  result.inventoryCoverage = inventoryCoverage(
    result.programs[0],
    result.capabilities.length,
  );
  result.priorityBoards = await priorityBoards(pid, db);
  result.formulaVersion = FORMULA_VERSION;
  return redactState(result, roles);
}
