import { hashPayload } from "../domain/canonical";
import type { Database } from "../infrastructure/database";
export type ProvenanceSource = {
  sourceType: "MANUAL" | "IMPORT" | "CONNECTOR";
  sourceUrl?: string | null;
  namespace?: string | null;
  externalId?: string | null;
  version?: string | null;
  updatedAt?: string | null;
  jobId?: string | null;
};
const kinds = new Set([
  "programs",
  "domains",
  "workstreams",
  "areas",
  "squads",
  "capabilities",
  "deliverables",
  "components",
  "contracts",
  "suppliers",
  "releases",
  "milestones",
  "dependencies",
  "raid",
  "decisions",
  "evidence",
  "assessments",
]);
export async function recordProvenance(
  tx: Database,
  actor: string,
  pid: string,
  kind: string,
  id: string,
  before: unknown,
  after: unknown,
  source: ProvenanceSource = { sourceType: "MANUAL" },
) {
  if (!kinds.has(kind) || !after || typeof after !== "object") return;
  const old = (before || {}) as Record<string, unknown>;
  const levels = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
  const classification =
    levels[
      Math.max(
        1,
        levels.indexOf(String(old.classification || "INTERNAL")),
        levels.indexOf(
          String(
            (after as Record<string, unknown>).classification || "INTERNAL",
          ),
        ),
      )
    ];
  const rows: unknown[][] = [];
  for (const [field, value] of Object.entries(after)) {
    if (
      ["id", "program_id", "version", "updated_at", "created_at"].includes(
        field,
      ) ||
      value === undefined
    )
      continue;
    const valueHash = hashPayload(value);
    if (old[field] !== undefined && hashPayload(old[field]) === valueHash)
      continue;
    rows.push([
      pid,
      kind,
      id,
      field,
      valueHash,
      source.sourceType,
      source.sourceUrl || null,
      source.namespace || null,
      source.externalId || null,
      source.version || null,
      source.updatedAt || null,
      actor,
      source.jobId || null,
      classification,
    ]);
  }
  if (rows.length)
    await tx.query(
      `INSERT INTO integration.field_provenance(program_id,entity_type,entity_id,field_name,value_hash,source_type,source_url,source_namespace,external_id,source_version,source_updated_at,actor_id,job_id,classification) VALUES ${rows.map((row, r) => `(${row.map((_, c) => `$${r * 14 + c + 1}`).join(",")})`).join(",")}`,
      rows.flat(),
    );
}
