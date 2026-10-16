import {
  gitLabLinksSchema,
  type GitLabLinks,
} from "../domain/workspace-batches";
import { hashPayload } from "../domain/canonical";
import { canEdit, DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import type { Database } from "../infrastructure/database";
import { readableResource } from "./authorization";
import { TABLES, type Kind } from "../domain/schemas";
import { applyExternalLink } from "./sync-worker";
import { batchLines, commitBatch, previewBatch } from "./batches";

async function apply(
  tx: Database,
  userId: string,
  pid: string,
  cid: string,
  p: GitLabLinks,
) {
  await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
    pid,
  ]);
  const roles = await memberships(userId, pid, tx);
  if (!canEdit(roles, "connections"))
    throw new DomainError(403, "Vinculação exige administrador.");
  const [connection] = await tx.query(
    "SELECT * FROM integration.connections WHERE id=$1 AND program_id=$2 FOR UPDATE",
    [cid, pid],
  );
  if (!connection || connection.connector_type !== "GITLAB")
    throw new DomainError(422, "Selecione uma conexão GitLab deste projeto.");
  if (Number(connection.version) !== p.expectedConnectionVersion)
    throw new DomainError(
      409,
      "A conexão mudou. Atualize os vínculos antes de aplicar.",
    );
  const seen = new Set<string>();
  const result = await batchLines(tx, p.items, async (inner, item) => {
    if (seen.has(item.externalId))
      throw new DomainError(422, "ID externo repetido no lote.");
    seen.add(item.externalId);
    const [before] = await inner.query(
      "SELECT * FROM integration.external_references WHERE connection_id=$1 AND external_id=$2 FOR UPDATE",
      [cid, item.externalId],
    );
    if (
      (before ? Number(before.version) : null) !== item.expectedReferenceVersion
    )
      throw new DomainError(
        409,
        "Vínculo alterado desde a seleção. Atualize a lista.",
      );
    const [node] = await inner.query(
      "SELECT * FROM portfolio.program_nodes WHERE id=$1 AND program_id=$2",
      [item.subjectNodeId, pid],
    );
    if (
      !node ||
      ![
        "capabilities",
        "deliverables",
        "components",
        "releases",
        "contracts",
        "suppliers",
      ].includes(node.entity_type)
    )
      throw new DomainError(422, "Registro não encontrado neste projeto.");
    const [record] = await inner.query(
      `SELECT * FROM ${TABLES[node.entity_type as Kind]} WHERE id=$1 AND program_id=$2`,
      [node.entity_id, pid],
    );
    if (!record)
      throw new DomainError(422, "Registro não encontrado neste projeto.");
    await readableResource(inner, roles, node.entity_type, record);
    const after = await applyExternalLink(inner, userId, pid, cid, {
      ...item,
      reason: p.reason,
    });
    return {
      id: after.id,
      code: item.externalId,
      kind: node.entity_type,
      target: record.code || record.name,
      diff: [
        {
          field: "subject_node_id",
          from: before?.subject_node_id ?? null,
          to: node.id,
        },
        { field: "sync_mode", from: before?.sync_mode ?? null, to: item.mode },
      ],
    };
  });
  return { ...result, hash: hashPayload(p) };
}
export function previewGitLabLinks(
  userId: string,
  pid: string,
  cid: string,
  raw: unknown,
) {
  const p = gitLabLinksSchema.parse(raw);
  return previewBatch((tx) => apply(tx, userId, pid, cid, p));
}
export function commitGitLabLinks(
  userId: string,
  pid: string,
  cid: string,
  raw: unknown,
  expectedHash: string,
  key: string,
) {
  const p = gitLabLinksSchema.parse(raw);
  return commitBatch(
    userId,
    key,
    `gitlab-links:${cid}`,
    pid,
    p,
    expectedHash,
    (tx) => apply(tx, userId, pid, cid, p),
  );
}
