import {
  externalLinkSchema,
  type ExternalLink,
} from "../domain/workspace-batches";
import { connectorFetch } from "../infrastructure/connector-fetch";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPayload } from "../domain/canonical";
import { assertExecutionChange, canEdit, DomainError } from "../domain/rules";
import { createAdapter, type ExternalItem } from "../infrastructure/adapters";
import { memberships } from "../infrastructure/auth";
import { getDb, type Database, type Row } from "../infrastructure/database";
import { enqueueJob } from "./jobs";
import { audit, idempotent } from "./transactions";
import { mutate } from "./inventory";
export async function queueConnectionSync(
  userId: string,
  pid: string,
  id: string,
  key: string,
) {
  z.uuid().parse(id);
  const roles = await memberships(userId, pid);
  if (!canEdit(roles, "connections"))
    throw new DomainError(
      403,
      "Sincronização exige administrador do programa.",
    );
  const [connection] = await getDb().query(
    "SELECT * FROM integration.connections WHERE id=$1 AND program_id=$2",
    [id, pid],
  );
  if (!connection) throw new DomainError(404, "Conexão não encontrada.");
  if (!process.env[connection.secret_env])
    throw new DomainError(503, "Credencial não configurada no ambiente.");
  if (
    connection.circuit_open_until &&
    new Date(connection.circuit_open_until) > new Date()
  )
    throw new DomainError(
      503,
      "Circuit breaker aberto. Aguarde a próxima tentativa.",
    );
  const [pending] = await getDb().query(
    "SELECT id,kind,status,created_at FROM integration.jobs WHERE program_id=$1 AND kind='SYNC' AND input->>'connectionId'=$2 AND status IN ('QUEUED','RUNNING') LIMIT 1",
    [pid, id],
  );
  if (pending) return pending;
  return enqueueJob(
    userId,
    pid,
    "SYNC",
    { connectionId: id, configVersion: Number(connection.version) },
    key,
  );
}
export async function linkExternal(
  userId: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = externalLinkSchema.parse(input);
  return idempotent(userId, key, { op: "external-link", pid, id, p }, (tx) =>
    applyExternalLink(tx, userId, pid, id, p),
  );
}
export async function applyExternalLink(
  tx: Database,
  userId: string,
  pid: string,
  id: string,
  p: ExternalLink,
) {
  await tx.query("SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE", [
    pid,
  ]);
  const roles = await memberships(userId, pid, tx);
  if (!canEdit(roles, "connections"))
    throw new DomainError(403, "Vinculação exige administrador.");
  const [connection] = await tx.query(
      "SELECT id FROM integration.connections WHERE id=$1 AND program_id=$2",
      [id, pid],
    ),
    [node] = await tx.query(
      "SELECT * FROM portfolio.program_nodes WHERE id=$1 AND program_id=$2",
      [p.subjectNodeId, pid],
    );
  if (!connection || !node)
    throw new DomainError(
      422,
      "Conexão e registro devem pertencer ao programa.",
    );
  if (p.mode === "EXECUTION" && node.entity_type !== "deliverables")
    throw new DomainError(422, "Atualização de execução exige entregável.");
  const [before] = await tx.query(
    "SELECT * FROM integration.external_references WHERE connection_id=$1 AND external_id=$2",
    [id, p.externalId],
  );
  if (
    before &&
    (before.subject_node_id !== node.id || before.program_id !== pid)
  )
    throw new DomainError(
      409,
      "ID externo já vinculado. Preserve a origem e reconcilie o vínculo existente.",
    );
  const [after] = await tx.query(
    "INSERT INTO integration.external_references(program_id,subject_node_id,connection_id,external_id,sync_mode) VALUES($1,$2,$3,$4,$5) ON CONFLICT(connection_id,external_id) DO UPDATE SET sync_mode=excluded.sync_mode,version=integration.external_references.version+1 RETURNING *",
    [pid, node.id, id, p.externalId, p.mode],
  );
  await tx.query(
    "UPDATE integration.inbox SET status='NEW' WHERE connection_id=$1 AND external_id=$2 AND status='UNMAPPED'",
    [id, p.externalId],
  );
  await audit(
    tx,
    userId,
    pid,
    "external_references",
    after.id,
    "Linked",
    before || null,
    after,
    p.reason,
    randomUUID(),
  );
  return after;
}

async function ingest(
  tx: Database,
  job: Row,
  connection: Row,
  item: ExternalItem,
) {
  const date = new Date(item.sourceUpdatedAt),
    url = new URL(item.externalUrl);
  if (
    !Number.isFinite(date.getTime()) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password
  )
    throw new DomainError(422, "Fonte retornou data ou URL inválida.");
  const [inbox] = await tx.query(
    "INSERT INTO integration.inbox(program_id,connection_id,external_id,source_updated_at,payload,payload_hash) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(connection_id,external_id,source_updated_at,payload_hash) DO UPDATE SET external_id=excluded.external_id RETURNING *",
    [
      job.program_id,
      connection.id,
      item.externalId,
      date.toISOString(),
      JSON.stringify(item),
      hashPayload(item),
    ],
  );
  if (inbox.status !== "NEW" && inbox.status !== "UNMAPPED")
    return { status: "SKIPPED" };
  const [ref] = await tx.query(
    "SELECT * FROM integration.external_references WHERE connection_id=$1 AND external_id=$2 AND program_id=$3 FOR UPDATE",
    [connection.id, item.externalId, job.program_id],
  );
  if (!ref) {
    await tx.query(
      "UPDATE integration.inbox SET status='UNMAPPED' WHERE id=$1",
      [inbox.id],
    );
    return { status: "UNMAPPED" };
  }
  if (ref.external_updated_at && new Date(ref.external_updated_at) > date) {
    await tx.query(
      "UPDATE integration.inbox SET status='STALE',processed_at=now() WHERE id=$1",
      [inbox.id],
    );
    return { status: "STALE" };
  }
  const [node] = await tx.query(
    "SELECT * FROM portfolio.program_nodes WHERE id=$1 AND program_id=$2",
    [ref.subject_node_id, job.program_id],
  );
  let status = ref.sync_mode === "REFERENCE" ? "REFERENCE" : "APPLIED",
    conflicts = 0;
  if (ref.sync_mode === "EXECUTION") {
    if (node.entity_type !== "deliverables")
      throw new DomainError(
        422,
        "Referência de execução não aponta para entregável.",
      );
    let [d] = await tx.query(
      "SELECT * FROM delivery.deliverables WHERE id=$1 AND program_id=$2 FOR UPDATE",
      [node.entity_id, job.program_id],
    );
    if (!d) throw new DomainError(422, "Entregável de origem não existe.");
    const incoming: Row = {};
    if (connection.field_mapping.execution_status)
      incoming.execution_status = item.operationalState;
    if (connection.field_mapping.name) incoming.name = item.title;
    for (const [field, value] of Object.entries(incoming)) {
      if (d[field] === value) continue;
      let conflict =
        field !== "execution_status" ||
        connection.execution_owner !== "EXTERNAL" ||
        value === "UNKNOWN" ||
        (d.accepted && value !== "DONE");
      if (!conflict) {
        try {
          assertExecutionChange(
            d.execution_status,
            String(value),
            "Atualização operacional da fonte configurada",
          );
        } catch {
          conflict = true;
        }
      }
      if (conflict) {
        conflicts++;
        status = "CONFLICT";
        await tx.query(
          "INSERT INTO integration.sync_conflicts(program_id,connection_id,inbox_id,subject_node_id,field_name,current_value,incoming_value,expected_entity_version) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) ON CONFLICT(inbox_id,subject_node_id,field_name) DO NOTHING",
          [
            job.program_id,
            connection.id,
            inbox.id,
            node.id,
            field,
            JSON.stringify(d[field] ?? null),
            JSON.stringify(value),
            d.version,
          ],
        );
      } else
        d = await mutate(
          job.actor_id,
          job.program_id,
          "deliverables",
          { [field]: value },
          d.id,
          Number(d.version),
          "Sincronização operacional sem alterar decisão gerencial",
          randomUUID(),
          tx,
          {
            sourceType: "CONNECTOR",
            sourceUrl: item.externalUrl,
            namespace: connection.id,
            externalId: item.externalId,
            version: inbox.payload_hash,
            updatedAt: date.toISOString(),
            jobId: job.id,
          },
        );
    }
  }
  await tx.query(
    "UPDATE integration.external_references SET external_url=$1,external_updated_at=$2,last_synced_at=now(),sync_state=$3,version=version+1 WHERE id=$4",
    [item.externalUrl, date.toISOString(), status, ref.id],
  );
  await tx.query(
    "UPDATE integration.inbox SET status=$1,processed_at=now() WHERE id=$2",
    [status, inbox.id],
  );
  if (conflicts)
    await audit(
      tx,
      job.actor_id,
      job.program_id,
      "sync_conflicts",
      inbox.id,
      "Detected",
      null,
      { connection_id: connection.id, external_id: item.externalId, conflicts },
      "Conflito preservado para revisão humana",
      randomUUID(),
    );
  return { status };
}
export async function processSyncJob(
  job: Row,
  fetcher: typeof fetch = connectorFetch,
) {
  const db = getDb(),
    [connection] = await db.query(
      "SELECT * FROM integration.connections WHERE id=$1 AND program_id=$2",
      [job.input.connectionId, job.program_id],
    );
  if (!connection) throw new DomainError(404, "Conexão não encontrada.");
  if (!canEdit(await memberships(job.actor_id, job.program_id), "connections"))
    throw new DomainError(403, "Alçada da conexão revogada.");
  if (Number(connection.version) !== job.input.configVersion)
    throw new DomainError(
      409,
      "Configuração mudou; solicite nova sincronização.",
    );
  if (
    connection.circuit_open_until &&
    new Date(connection.circuit_open_until) > new Date()
  )
    throw new DomainError(503, "Circuit breaker aberto.");
  await db.query(
    "UPDATE integration.connections SET last_attempt_at=now() WHERE id=$1",
    [connection.id],
  );
  await db.query(
    "INSERT INTO integration.sync_runs(program_id,connection_id,job_id,status) VALUES($1,$2,$3,'RUNNING') ON CONFLICT(job_id) DO UPDATE SET status='RUNNING'",
    [job.program_id, connection.id, job.id],
  );
  try {
    const adapter = createAdapter(
      {
        type: connection.connector_type,
        baseUrl: connection.base_url,
        project: connection.project,
        secretEnv: connection.secret_env,
        jiraEmail: connection.jira_email,
        stateMapping: connection.state_mapping,
        gitlabOptions: connection.gitlab_options,
        deployment: connection.deployment,
      },
      fetcher,
    );
    let cursor = connection.cursor || undefined,
      total = 0,
      pages = 0,
      hasMore = false;
    const seen = new Set<string>();
    do {
      if (cursor && seen.has(cursor))
        throw new DomainError(502, "Fonte retornou cursor repetido.");
      if (cursor) seen.add(cursor);
      const result = await adapter.fetchPage(cursor);
      if (result.items.length > 200)
        throw new DomainError(502, "Página externa excede o limite.");
      await db.transaction(async (tx) => {
        await tx.query(
          "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
          [job.program_id],
        );
        if (
          !canEdit(
            await memberships(job.actor_id, job.program_id, tx),
            "connections",
          )
        )
          throw new DomainError(403, "Alçada da conexão revogada.");
        if (job.lease_token) {
          const [lease] = await tx.query(
            "SELECT id FROM integration.jobs WHERE id=$1 AND lease_token=$2 AND status='RUNNING' AND lease_until>now()",
            [job.id, job.lease_token],
          );
          if (!lease)
            throw new DomainError(
              409,
              "Lease do worker expirou; página não aplicada.",
            );
        }
        const [current] = await tx.query(
          "SELECT version FROM integration.connections WHERE id=$1 FOR UPDATE",
          [connection.id],
        );
        if (Number(current.version) !== job.input.configVersion)
          throw new DomainError(
            409,
            "Mapping alterado durante a sincronização.",
          );
        for (const item of result.items)
          await ingest(tx, job, connection, item);
        await tx.query(
          "UPDATE integration.connections SET cursor=$1 WHERE id=$2",
          [result.nextCursor, connection.id],
        );
      });
      total += result.items.length;
      pages++;
      cursor = result.nextCursor || undefined;
      hasMore = !!cursor;
    } while (cursor && pages < 20);
    const [open] = await db.query(
        "SELECT count(*)::integer AS total FROM integration.sync_conflicts WHERE connection_id=$1 AND status='OPEN'",
        [connection.id],
      ),
      [unmapped] = await db.query(
        "SELECT count(DISTINCT external_id)::integer AS total FROM integration.inbox WHERE connection_id=$1 AND status='UNMAPPED'",
        [connection.id],
      );
    const output = {
      processed: total,
      pages,
      hasMore,
      openConflicts: open.total,
      unmapped: unmapped.total,
    };
    await db.transaction(async (tx) => {
      await tx.query(
        "UPDATE integration.connections SET status=$1,last_synced_at=now(),failures=0,circuit_open_until=NULL,last_error=NULL WHERE id=$2",
        [
          open.total || unmapped.total ? "DEGRADED" : "CONNECTED",
          connection.id,
        ],
      );
      await tx.query(
        "UPDATE integration.sync_runs SET status='SUCCEEDED',detail=$1 WHERE job_id=$2",
        [JSON.stringify(output), job.id],
      );
      await audit(
        tx,
        job.actor_id,
        job.program_id,
        "sync_runs",
        job.id,
        "Completed",
        null,
        output,
        "Consulta da fonte externa concluída",
        randomUUID(),
      );
    });
    return output;
  } catch (error) {
    const message =
      error instanceof DomainError
        ? error.message
        : "Falha ao consultar a fonte externa.";
    await db.query(
      "UPDATE integration.connections SET status=$1,failures=failures+1,circuit_open_until=CASE WHEN failures+1>=3 THEN now()+interval '5 minutes' ELSE circuit_open_until END,last_error=$2 WHERE id=$3",
      [
        process.env[connection.secret_env] ? "ERROR" : "NOT_CONFIGURED",
        message,
        connection.id,
      ],
    );
    await db.query(
      "UPDATE integration.sync_runs SET status='FAILED',detail=$1 WHERE job_id=$2",
      [message, job.id],
    );
    throw error;
  }
}
export async function reconcileConflict(
  userId: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = z
    .object({
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["KEEP", "APPLY"]),
      expectedEntityVersion: z.number().int().positive(),
      reason: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(input);
  return idempotent(
    userId,
    key,
    { op: "reconcile", pid, id, p },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx),
        [conflict] = await tx.query(
          "SELECT * FROM integration.sync_conflicts WHERE id=$1 AND program_id=$2 FOR UPDATE",
          [id, pid],
        );
      if (!conflict) throw new DomainError(404, "Conflito não encontrado.");
      if (
        conflict.status !== "OPEN" ||
        Number(conflict.version) !== p.expectedVersion
      )
        throw new DomainError(409, "Conflito já reconciliado.");
      const [d] = await tx.query(
        "SELECT d.* FROM delivery.deliverables d JOIN portfolio.program_nodes n ON n.entity_id=d.id AND n.entity_type='deliverables' WHERE n.id=$1 AND d.program_id=$2",
        [conflict.subject_node_id, pid],
      );
      if (!d || !canEdit(roles, "deliverables", d.workstream_id))
        throw new DomainError(403, "Sem alçada sobre a frente do entregável.");
      if (p.decision === "APPLY") {
        if (
          Number(d.version) !== p.expectedEntityVersion ||
          Number(d.version) !== Number(conflict.expected_entity_version)
        )
          throw new DomainError(
            409,
            "Entregável mudou. Preserve a versão atual ou solicite nova sincronização.",
          );
        if (
          !["execution_status", "name"].includes(conflict.field_name) ||
          conflict.incoming_value === "UNKNOWN"
        )
          throw new DomainError(
            422,
            "Estado sem mapping ou campo gerencial não pode ser aplicado por este comando.",
          );
        await mutate(
          userId,
          pid,
          "deliverables",
          { [conflict.field_name]: conflict.incoming_value },
          d.id,
          Number(d.version),
          p.reason,
          randomUUID(),
          tx,
        );
      }
      const [after] = await tx.query(
        "UPDATE integration.sync_conflicts SET status=$1,reason=$2,resolved_by=$3,resolved_at=now(),version=version+1 WHERE id=$4 RETURNING *",
        [p.decision === "KEEP" ? "KEPT" : "APPLIED", p.reason, userId, id],
      );
      await audit(
        tx,
        userId,
        pid,
        "sync_conflicts",
        id,
        "Reconciled",
        conflict,
        after,
        p.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
export async function enqueueDueSyncs() {
  const rows = await getDb().query(
    "SELECT * FROM integration.connections WHERE enabled AND created_by IS NOT NULL AND (last_attempt_at IS NULL OR last_attempt_at<now()-(poll_interval_seconds*interval '1 second')) AND (circuit_open_until IS NULL OR circuit_open_until<=now()) ORDER BY last_attempt_at NULLS FIRST LIMIT 20",
  );
  for (const c of rows) {
    try {
      await queueConnectionSync(
        c.created_by,
        c.program_id,
        c.id,
        `poll:${c.id}:${Math.floor(Date.now() / (c.poll_interval_seconds * 1000))}`,
      );
    } catch (error) {
      await getDb().query(
        "UPDATE integration.connections SET status=$1,last_error=$2,last_attempt_at=now() WHERE id=$3",
        [
          process.env[c.secret_env] ? "ERROR" : "NOT_CONFIGURED",
          error instanceof DomainError
            ? error.message
            : "Não foi possível agendar sincronização.",
          c.id,
        ],
      );
    }
  }
}

/** Read-only first-page probe; credentials are never returned or stored in business data. */
export async function testConnection(userId: string, pid: string, id: string) {
  z.uuid().parse(id);
  if (!canEdit(await memberships(userId, pid), "connections"))
    throw new DomainError(403, "Teste exige administrador do projeto.");
  const [c] = await getDb().query(
    "SELECT * FROM integration.connections WHERE id=$1 AND program_id=$2",
    [id, pid],
  );
  if (!c) throw new DomainError(404, "Conexão não encontrada.");
  const page = await createAdapter({
    type: c.connector_type,
    baseUrl: c.base_url,
    project: c.project,
    secretEnv: c.secret_env,
    stateMapping: c.state_mapping,
    gitlabOptions: c.gitlab_options,
    deployment: c.deployment,
    jiraEmail: c.jira_email,
  }).fetchPage();
  return {
    connected: true,
    sampled: page.items.length,
    hasMore: !!page.nextCursor,
    checkedAt: new Date().toISOString(),
  };
}
