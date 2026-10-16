import {
  exportAgentPackage,
  previewAgentTemplate,
  commitAgentTemplate,
} from "@/server/application/agent-workspace";
import { resourceProjection } from "@/server/application/resource-projection";
import {
  previewBulkEdit,
  commitBulkEdit,
} from "@/server/application/bulk-edit";
import {
  previewGitLabLinks,
  commitGitLabLinks,
} from "@/server/application/gitlab-links";
import {
  normalizeResourceInput,
  resourceEnvelope,
} from "@/server/domain/api-contract";
import { intelligence } from "@/server/application/intelligence";
import { operationalMetrics } from "@/server/application/operations";
import { receiveWebhook } from "@/server/application/webhooks";
import {
  notificationPreference,
  notifications,
  readNotification,
} from "@/server/application/notifications";
import {
  queueImportPreview,
  queueImportCommit,
  importErrorCSV,
} from "@/server/application/import-jobs";
import { getJob, kickLocalWorker } from "@/server/application/jobs";
import { queueReportPDF } from "@/server/application/report-pdf";
import {
  queueConnectionSync,
  testConnection,
  linkExternal,
  reconcileConflict,
} from "@/server/application/sync-worker";
import { readableResource } from "@/server/application/authorization";
import {
  accessState,
  saveMembership,
  provisionIdentity,
  issueAPIToken,
  revokeAPIToken,
} from "@/server/application/access-management";
import { assertReadable, readable } from "@/server/domain/access";
import {
  reviewRecord,
  overrideHealth,
} from "@/server/application/governance-actions";
import {
  gateCatalog,
  saveCatalog,
  subjectGateReadiness,
} from "@/server/application/catalogs";
import { reportCommand } from "@/server/application/report-publication";
import { projectPortfolio } from "@/server/application/projects";
import { saveObservation } from "@/server/application/observations";
import { commitImport, previewImport } from "@/server/application/imports";
import {
  priorityBoards,
  reorderPriorities,
} from "@/server/application/priorities";
import {
  previewChange,
  proposeChange,
  reviewChange,
  applyChange,
  cancelChange,
} from "@/server/application/change-control";
import { assertProductionScope } from "@/server/application/scope-policy";
import { revokeException } from "@/server/application/readiness";
import { authorizationScope } from "@/server/application/inventory";
import {
  assess,
  audit,
  baseline,
  reviewBaseline,
  idempotent,
  mutate,
  snapshot,
  state,
  transition,
} from "@/server/application/service";
import { DomainError, canEdit } from "@/server/domain/rules";
import { TABLES, type Kind } from "@/server/domain/schemas";
import {
  assertOrigin,
  memberships,
  requireUser,
} from "@/server/infrastructure/auth";
import { getDb, type Row } from "@/server/infrastructure/database";
import { problem, readJSON } from "@/server/infrastructure/http";
import { z } from "zod";
type Context = { params: Promise<{ path: string[] }> };
async function dispatch(req: Request, ctx: Context, cid: string) {
  try {
    const incomingPath = (await ctx.params).path;
    if (
      incomingPath[0] === "webhooks" &&
      incomingPath.length === 2 &&
      req.method === "POST"
    )
      return Response.json(await receiveWebhook(incomingPath[1], req), {
        status: 202,
      });
    const user = await requireUser(req);
    if (
      user.apiToken &&
      req.method !== "GET" &&
      user.apiToken.access !== "WRITE"
    )
      throw new DomainError(403, "Token permite somente leitura.");
    let { path } = await ctx.params;
    if (
      path[0] === "programs" &&
      path.length === 3 &&
      ["domains", "workstreams"].includes(path[2])
    )
      path = [path[2], "__program_nested__", path[1]];
    const url = new URL(req.url);
    const rawInput =
      req.method === "GET" || req.method === "DELETE"
        ? {}
        : await readJSON(req);
    const nestedPid = path[1] === "__program_nested__" ? path[2] : null;
    if (nestedPid) path = [path[0]];
    let pid =
      url.searchParams.get("programId") ||
      nestedPid ||
      rawInput?.programId ||
      (["programs"].includes(path[0]) ? path[1] : null);
    const db = getDb();
    if (!pid && path[1] && path[0] in TABLES && path[0] !== "programs") {
      z.uuid().parse(path[1]);
      const [resource] = await db.query(
        `SELECT t.program_id FROM ${TABLES[path[0] as Kind]} t JOIN iam.memberships m ON m.program_id=t.program_id WHERE t.id=$1 AND m.user_id=$2 LIMIT 1`,
        [path[1], user.id],
      );
      pid = resource?.program_id;
    }
    if (pid && user.apiToken && !user.apiToken.programIds.includes(pid))
      throw new DomainError(403, "Programa fora do escopo do token.");
    if (req.method === "GET") {
      if (path.join("/") === "projects") {
        const portfolio = await projectPortfolio(user.id);
        return Response.json({
          ...portfolio,
          items: portfolio.items.filter(
            (p: Row) =>
              !user.apiToken || user.apiToken.programIds.includes(p.id),
          ),
        });
      }
      if (path.join("/") === "programs") {
        const programs = await db.query(
          "SELECT DISTINCT p.* FROM portfolio.programs p JOIN iam.memberships m ON m.program_id=p.id WHERE m.user_id=$1 AND (m.expires_at IS NULL OR m.expires_at>now()) ORDER BY p.name",
          [user.id],
        );
        return Response.json({
          items: programs.filter(
            (p: Row) =>
              !user.apiToken || user.apiToken.programIds.includes(p.id),
          ),
        });
      }
      if (!pid) throw new DomainError(422, "programId obrigatório.");
      z.uuid().parse(pid);
      const roles = await memberships(user.id, pid);
      if (path[0] === "jobs" && path[1] && path.length <= 3) {
        z.uuid().parse(path[1]);
        const job = await getJob(user.id, pid, path[1]);
        if (path.length === 2)
          return Response.json(job, {
            headers: { "Cache-Control": "no-store" },
          });
        if (path[2] === "errors.csv" && job.kind === "IMPORT_PREVIEW")
          return new Response(importErrorCSV(job), {
            headers: {
              "Content-Type": "text/csv;charset=utf-8",
              "Content-Disposition": `attachment; filename="erros-${job.id}.csv"`,
              "Cache-Control": "no-store",
            },
          });
        if (path[2] === "artifact") {
          const [artifact] = await db.query(
            "SELECT * FROM integration.job_artifacts WHERE job_id=$1 AND program_id=$2",
            [job.id, pid],
          );
          if (!artifact || job.status !== "SUCCEEDED")
            throw new DomainError(404, "Artefato não está pronto.");
          return new Response(Buffer.from(artifact.payload_base64, "base64"), {
            headers: {
              "Content-Type": artifact.mime_type,
              "Content-Disposition": `attachment; filename="${artifact.filename}"`,
              "Cache-Control": "no-store",
              "X-Content-SHA256": artifact.digest,
            },
          });
        }
        throw new DomainError(404, "Recurso de job não encontrado.");
      }
      if (path[0] === "provenance" && path.length === 3 && path[1] in TABLES) {
        z.uuid().parse(path[2]);
        const [record] = await db.query(
          `SELECT * FROM ${TABLES[path[1] as Kind]} WHERE id=$1 AND ${path[1] === "programs" ? "id" : "program_id"}=$2`,
          [path[2], pid],
        );
        if (!record) throw new DomainError(404, "Registro não encontrado.");
        await readableResource(db, roles, path[1], record);
        const checkpoint = url.searchParams.get("checkpoint");
        if (checkpoint && !/^\d+$/.test(checkpoint))
          throw new DomainError(422, "Checkpoint inválido.");
        const rows = await db.query(
          "SELECT DISTINCT ON(field_name) * FROM integration.field_provenance WHERE program_id=$1 AND entity_type=$2 AND entity_id=$3 AND ($4::bigint IS NULL OR sequence<=$4) ORDER BY field_name,sequence DESC",
          [pid, path[1], path[2], checkpoint],
        );
        return Response.json({ items: rows.filter((r) => readable(r, roles)) });
      }
      if (path.join("/") === "agents/package") {
        const raw = url.searchParams.get("context");
        let focus: unknown;
        if (raw) {
          if (raw.length > 8000)
            throw new DomainError(422, "Contexto de IA excede o limite.");
          try {
            focus = JSON.parse(raw);
          } catch {
            throw new DomainError(422, "Contexto de IA deve ser JSON válido.");
          }
        }
        return Response.json(await exportAgentPackage(user.id, pid, focus), {
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (path.join("/") === "integrations/status") {
        if (!canEdit(roles, "connections"))
          throw new DomainError(
            403,
            "Inbox restrita ao administrador do programa.",
          );
        const data = await state(user.id, pid, "summary");
        return Response.json({
          connections: data.connections,
          runs: await db.query(
            "SELECT * FROM integration.sync_runs WHERE program_id=$1 ORDER BY created_at DESC LIMIT 50",
            [pid],
          ),
          inbox: await db.query(
            "SELECT id,connection_id,external_id,source_updated_at,payload,status FROM integration.inbox WHERE program_id=$1 ORDER BY received_at DESC LIMIT 100",
            [pid],
          ),
          conflicts: await db.query(
            "SELECT * FROM integration.sync_conflicts WHERE program_id=$1 ORDER BY created_at DESC LIMIT 100",
            [pid],
          ),
          references: await db.query(
            "SELECT * FROM integration.external_references WHERE program_id=$1 ORDER BY id",
            [pid],
          ),
        });
      }
      if (path.join("/") === "operations/metrics")
        return Response.json(await operationalMetrics(user.id, pid), {
          headers: { "Cache-Control": "no-store" },
        });
      if (path.join("/") === "notifications")
        return Response.json(await notifications(user.id, pid), {
          headers: { "Cache-Control": "no-store" },
        });
      if (path.join("/") === "access/state")
        return Response.json(await accessState(user.id, pid));
      if (path[0] === "observations") {
        if (path.length > 2) throw new DomainError(404, "Rota não encontrada.");
        if (path[1]) z.uuid().parse(path[1]);
        const rows = await db.query(
          `SELECT * FROM governance.observations WHERE program_id=$1 ${path[1] ? "AND id=$2" : ""} ORDER BY important DESC,created_at DESC`,
          path[1] ? [pid, path[1]] : [pid],
        );
        if (path[1] && !rows[0])
          throw new DomainError(404, "Observação não encontrada.");
        return Response.json(path[1] ? rows[0] : { items: rows });
      }
      if (path[0] === "reports" && path.length <= 2) {
        if (path[1]) z.uuid().parse(path[1]);
        const records = await db.query(
          `SELECT * FROM reporting.reports WHERE program_id=$1 ${path[1] ? "AND id=$2" : ""} ORDER BY created_at DESC`,
          path[1] ? [pid, path[1]] : [pid],
        );
        if (path[1] && !records[0])
          throw new DomainError(404, "Relatório não encontrado.");
        const permitted = [];
        for (const record of records) {
          const refs = await db.query(
            "SELECT * FROM reporting.snapshots WHERE program_id=$1 AND (id=$2 OR id=$3)",
            [pid, record.snapshot_id, record.previous_snapshot_id],
          );
          if (refs.every((ref) => readable(ref, roles))) permitted.push(record);
        }
        if (path[1] && !permitted[0])
          throw new DomainError(
            403,
            "Report contém informação acima da sua alçada de leitura.",
          );
        return Response.json(path[1] ? permitted[0] : { items: permitted });
      }
      if (
        path[0] === "catalogs" &&
        ["layers", "gates", "profiles"].includes(path[1]) &&
        path.length === 2
      ) {
        const catalog = await gateCatalog(db, pid);
        return Response.json({
          items:
            path[1] === "layers"
              ? await db.query(
                  "SELECT * FROM portfolio.layers WHERE program_id=$1 ORDER BY code",
                  [pid],
                )
              : path[1] === "gates"
                ? catalog.gates
                : catalog.profiles,
        });
      }
      if (path[0] === "snapshots" && path.length <= 2) {
        if (path[1]) z.uuid().parse(path[1]);
        const records = await db.query(
          `SELECT * FROM reporting.snapshots WHERE program_id=$1 ${path[1] ? "AND id=$2" : ""} ORDER BY as_of DESC LIMIT 52`,
          path[1] ? [pid, path[1]] : [pid],
        );
        const allowed = records.filter((r) => readable(r, roles));
        if (path[1] && !allowed[0])
          throw new DomainError(
            records.length ? 403 : 404,
            "Snapshot indisponível para esta identidade.",
          );
        return Response.json(path[1] ? allowed[0] : { items: allowed }, {
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (path[0] === "state")
        return Response.json(await state(user.id, pid, "summary"));
      if (path.join("/") === "priorities")
        return Response.json(await priorityBoards(pid));
      if (path[0] === "change-requests") {
        if (path[1]) z.uuid().parse(path[1]);
        const rows = await db.query(
          `SELECT * FROM governance.change_requests WHERE program_id=$1 ${path[1] ? "AND id=$2" : ""} ORDER BY requested_at DESC`,
          path[1] ? [pid, path[1]] : [pid],
        );
        if (path[1] && !rows.length)
          throw new DomainError(404, "Solicitação não encontrada.");
        return Response.json(path[1] ? rows[0] : { items: rows });
      }
      if (path[0] === "programs" && path[2] === "overview") {
        const s = await state(user.id, pid, "summary");
        return Response.json({
          programId: pid,
          asOf: s.asOf,
          formulaVersion: s.formulaVersion,
          metrics: s.metrics,
          dataQuality: { inventory: s.metrics.quality, stale: s.metrics.stale },
        });
      }
      if (path[0] === "programs" && path[2] === "reports") {
        const [snap] = await db.query(
          "SELECT * FROM reporting.snapshots WHERE id=$1 AND program_id=$2",
          [url.searchParams.get("snapshotId"), pid],
        );
        if (!snap) throw new DomainError(404, "Snapshot não encontrado.");
        assertReadable(snap, roles);
        return Response.json({
          snapshotId: snap.id,
          formulaVersion: snap.formula_version,
          summary: `${snap.payload.metrics.accepted} de ${snap.payload.metrics.total} entregáveis aceitos.`,
          risks: snap.payload.raid,
          decisions: snap.payload.decisions,
          payloadHash: snap.payload_hash,
        });
      }
      if (path[0] === "programs" && path[2] === "capability-map") {
        const data = await state(user.id, pid, "summary");
        const releaseId = url.searchParams.get("releaseId");
        if (releaseId) z.uuid().parse(releaseId);
        const includeUnknown = url.searchParams.get("includeUnknown");
        if (includeUnknown && !["true", "false"].includes(includeUnknown))
          throw new DomainError(422, "includeUnknown deve ser booleano.");
        const matrixDeliverables = data.deliverables.filter(
          (d: Row) =>
            (!releaseId ||
              data.releaseLinks.some(
                (l: Row) =>
                  l.deliverable_id === d.id && l.release_id === releaseId,
              )) &&
            (!url.searchParams.get("workstreamId") ||
              d.workstream_id === url.searchParams.get("workstreamId")) &&
            (!url.searchParams.get("ownerId") ||
              d.owner_id === url.searchParams.get("ownerId")) &&
            (!url.searchParams.get("criticality") ||
              d.criticality === url.searchParams.get("criticality")),
        );
        const layers: string[] = data.layers
          .filter((l: Row) => l.active)
          .map((l: Row) => l.code);
        return Response.json({
          programId: pid,
          asOf: data.asOf,
          layers,
          capabilities: data.capabilities
            .filter(
              (c: Row) =>
                !url.searchParams.get("domainId") ||
                c.domain_id === url.searchParams.get("domainId"),
            )
            .map((c: Row) => ({
              id: c.id,
              code: c.code,
              name: c.name,
              cells: layers
                .map((layer) => {
                  const ds = matrixDeliverables.filter(
                    (d: Row) =>
                      d.layer === layer &&
                      data.links.some(
                        (l: Row) =>
                          l.capability_id === c.id && l.deliverable_id === d.id,
                      ),
                  );
                  return {
                    layer,
                    status: !ds.length
                      ? "NOT_ASSESSED"
                      : ds.some((d: Row) => d.execution_status === "BLOCKED")
                        ? "BLOCKED"
                        : ds.every((d: Row) => d.accepted)
                          ? "DONE"
                          : ds.some((d: Row) => d.delivery_stage === "UAT")
                            ? "UAT"
                            : ds.some(
                                  (d: Row) =>
                                    d.execution_status === "IN_PROGRESS",
                                )
                              ? "IN_PROGRESS"
                              : "NOT_STARTED",
                    total: ds.length,
                    accepted: ds.filter((d: Row) => d.accepted).length,
                    blocked: ds.filter(
                      (d: Row) => d.execution_status === "BLOCKED",
                    ).length,
                    unknown: !ds.length ? 1 : 0,
                  };
                })
                .filter(
                  (cell: Row) => includeUnknown !== "false" || cell.total > 0,
                ),
            })),
        });
      }
      if (path[0] === "releases" && path[2] === "readiness") {
        const data = await state(user.id, pid, "summary");
        const release = data.releases.find((r: Row) => r.id === path[1]);
        if (!release) throw new DomainError(404, "Release não encontrada.");
        return Response.json({ ...release.readiness, releaseId: release.id });
      }
      if (path[0] in TABLES) {
        if (path.length > 2)
          throw new DomainError(404, "Rota de recurso não encontrada.");
        const table = TABLES[path[0] as Kind];
        const limit = Math.min(
          200,
          Math.max(1, Number(url.searchParams.get("limit")) || 50),
        );
        const values: unknown[] = [pid];
        let where = "";
        for (const [param, column] of [
          ["cursor", "id"],
          ["workstreamId", "workstream_id"],
          ["deliveryStage", "delivery_stage"],
        ] as const) {
          const value = url.searchParams.get(param);
          if (value && (param === "cursor" || path[0] === "deliverables")) {
            if (param !== "deliveryStage") z.uuid().parse(value);
            values.push(value);
            where += ` AND ${column}${param === "cursor" ? ">" : "="}$${values.length}`;
          }
        }
        if (path[0] === "deliverables") {
          for (const [param, column] of [
            ["ownerId", "owner_id"],
            ["layer", "layer"],
            ["criticality", "criticality"],
            ["executionStatus", "execution_status"],
          ]) {
            const val = url.searchParams.get(param);
            if (!val) continue;
            if (param === "ownerId" && val !== "__unassigned__")
              z.uuid().parse(val);
            if (val === "__unassigned__") where += ` AND ${column} IS NULL`;
            else {
              values.push(val);
              where += ` AND ${column}=$${values.length}`;
            }
          }
          for (const [param, subquery] of [
            [
              "domainId",
              "SELECT 1 FROM delivery.deliverable_capabilities l JOIN portfolio.capabilities c ON c.id=l.capability_id WHERE l.deliverable_id=delivery.deliverables.id AND c.domain_id=",
            ],
            [
              "releaseId",
              "SELECT 1 FROM delivery.release_deliverables l WHERE l.deliverable_id=delivery.deliverables.id AND l.release_id=",
            ],
          ]) {
            const val = url.searchParams.get(param);
            if (val) {
              z.uuid().parse(val);
              values.push(val);
              where += ` AND EXISTS(${subquery}$${values.length})`;
            }
          }
          const q = url.searchParams.get("q");
          if (q) {
            if (q.length > 200)
              throw new DomainError(422, "Busca excede 200 caracteres.");
            values.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
            where += ` AND (code ILIKE $${values.length} OR name ILIKE $${values.length})`;
          }
        }
        if (path[0] === "deliverables") {
          for (const [param, column] of [
            [
              "areaId",
              "COALESCE(area_id,(SELECT sq.area_id FROM portfolio.squads sq WHERE sq.id=delivery.deliverables.squad_id AND sq.program_id=delivery.deliverables.program_id))",
            ],
            ["squadId", "squad_id"],
          ]) {
            const value = url.searchParams.get(param);
            if (!value) continue;
            if (value === "__unassigned__") where += ` AND ${column} IS NULL`;
            else {
              z.uuid().parse(value);
              values.push(value);
              where += ` AND ${column}=$${values.length}`;
            }
          }
        }
        if (path[1]) {
          z.uuid().parse(path[1]);
          values.push(path[1]);
          where += ` AND id=$${values.length}`;
        }
        const rows = await db.query(
          `SELECT * FROM ${table} WHERE ${path[0] === "programs" ? "id" : "program_id"}=$1 ${where} ORDER BY id LIMIT ${limit + 1}`,
          values,
        );
        if (path[1]) {
          if (!rows[0]) throw new DomainError(404, "Registro não encontrado.");
          await readableResource(db, roles, path[0], rows[0]);
          return Response.json(
            resourceEnvelope(
              (await resourceProjection(path[0] as Kind, pid, [rows[0]]))[0],
            ),
            {
              headers: { ETag: `"${rows[0].version}"` },
            },
          );
        }
        const visibleRows = [];
        for (const record of rows.slice(0, limit)) {
          try {
            await readableResource(db, roles, path[0], record);
            visibleRows.push(record);
          } catch (e) {
            if (!(e instanceof DomainError && e.status === 403)) throw e;
          }
        }
        return Response.json({
          items: (
            await resourceProjection(path[0] as Kind, pid, visibleRows)
          ).map(resourceEnvelope),
          nextCursor: rows.length > limit ? rows[limit - 1].id : null,
        });
      }
      throw new DomainError(404, "Rota não implementada.");
    }
    if (!user.apiToken) assertOrigin(req);
    if (user.apiToken && path[0] === "programs" && req.method === "POST")
      throw new DomainError(
        403,
        "Criação de programa exige sessão interativa.",
      );
    if (!pid) throw new DomainError(422, "programId obrigatório.");
    z.uuid().parse(pid);
    const roles = await memberships(user.id, pid);
    if (rawInput?.programId && rawInput.programId !== pid)
      throw new DomainError(422, "programId do corpo difere do contexto.");
    const input =
      (path[0] in TABLES && path.length <= 2) ||
      (path[0] === "gate-assessments" && path.length === 1)
        ? normalizeResourceInput(path[0] as Kind | "gate-assessments", rawInput)
        : rawInput;
    const key = req.headers.get("Idempotency-Key") || "";
    if (
      path[0] === "deliverables" &&
      path[1] === "bulk" &&
      path.length === 3 &&
      req.method === "POST"
    ) {
      if (path[2] === "preview")
        return Response.json(await previewBulkEdit(user.id, pid, input.batch));
      if (path[2] === "commit")
        return Response.json(
          await commitBulkEdit(
            user.id,
            pid,
            input.batch,
            z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(input.expectedHash),
            key,
          ),
        );
      throw new DomainError(404, "Comando de lote não encontrado.");
    }
    if (
      path[0] === "connections" &&
      path[2] === "links" &&
      path.length === 4 &&
      req.method === "POST"
    ) {
      z.uuid().parse(path[1]);
      if (path[3] === "preview")
        return Response.json(
          await previewGitLabLinks(user.id, pid, path[1], input.batch),
        );
      if (path[3] === "commit")
        return Response.json(
          await commitGitLabLinks(
            user.id,
            pid,
            path[1],
            input.batch,
            z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(input.expectedHash),
            key,
          ),
        );
      throw new DomainError(404, "Comando de vínculos não encontrado.");
    }
    if (
      path[0] === "connections" &&
      path.length === 3 &&
      path[2] === "test" &&
      req.method === "POST"
    )
      return Response.json(await testConnection(user.id, pid, path[1]));
    if (path[0] === "agents" && path.length === 2 && req.method === "POST") {
      if (path[1] === "preview")
        return Response.json(
          await previewAgentTemplate(user.id, pid, input.template),
        );
      if (path[1] === "commit")
        return Response.json(
          await commitAgentTemplate(
            user.id,
            pid,
            input.template,
            z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(input.expectedHash),
            key,
          ),
        );
      throw new DomainError(404, "Comando de template não encontrado.");
    }

    if (
      path[0] === "notifications" &&
      path[2] === "read" &&
      path.length === 3 &&
      req.method === "POST"
    )
      return Response.json(await readNotification(user.id, pid, path[1], key));
    if (path.join("/") === "notifications/preferences" && req.method === "POST")
      return Response.json(
        await notificationPreference(user.id, pid, input, key),
      );
    if (
      path.length === 1 &&
      path[0] === "intelligence" &&
      req.method === "POST"
    )
      return Response.json(await intelligence(user.id, pid, input), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path[0] === "import-jobs" && req.method === "POST") {
      if (path.length === 1)
        return Response.json(
          await queueImportPreview(user.id, pid, input, key),
          { status: 202 },
        );
      if (path.length === 3 && path[2] === "commit")
        return Response.json(
          await queueImportCommit(user.id, pid, path[1], input, key),
          { status: 202 },
        );
      throw new DomainError(404, "Comando de importação não encontrado.");
    }
    if (
      path[0] === "reports" &&
      path.length === 3 &&
      path[2] === "pdf" &&
      req.method === "POST"
    )
      return Response.json(
        await queueReportPDF(user.id, pid, z.uuid().parse(path[1]), key),
        { status: 202 },
      );
    if (
      path[0] === "connections" &&
      path.length === 3 &&
      req.method === "POST"
    ) {
      if (path[2] === "sync")
        return Response.json(
          await queueConnectionSync(user.id, pid, path[1], key),
          { status: 202 },
        );
      if (path[2] === "links")
        return Response.json(
          await linkExternal(user.id, pid, path[1], input, key),
        );
    }
    if (
      path[0] === "sync-conflicts" &&
      path.length === 3 &&
      path[2] === "resolve" &&
      req.method === "POST"
    )
      return Response.json(
        await reconcileConflict(user.id, pid, path[1], input, key),
      );
    if (path[0] === "access") {
      if (req.method !== "POST")
        throw new DomainError(405, "Gestão de acesso utiliza POST.");
      if (path.join("/") === "access/tokens") {
        if (user.apiToken)
          throw new DomainError(
            403,
            "Emissão de token exige sessão interativa.",
          );
        return Response.json(await issueAPIToken(user.id, input), {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (path[1] === "tokens" && path[3] === "revoke" && path.length === 4)
        return Response.json(await revokeAPIToken(user.id, pid, path[2]));
      if (path.join("/") === "access/identities")
        return Response.json(
          await provisionIdentity(user.id, pid, input, key),
          { status: 201 },
        );
      if (path[1] === "members" && path.length <= 4)
        return Response.json(
          await saveMembership(
            user.id,
            pid,
            path[2],
            path[3] === "revoke" ? "revoke" : "save",
            input,
            key,
          ),
        );
      throw new DomainError(404, "Comando de acesso não encontrado.");
    }
    if (path[0] === "observations") {
      if (
        path.length > 2 ||
        (path[1] ? req.method !== "PATCH" : req.method !== "POST")
      )
        throw new DomainError(
          405,
          "Use POST para criar ou PATCH para editar uma observação.",
        );
      return Response.json(
        await saveObservation(user.id, pid, path[1], input, key),
        { status: path[1] ? 200 : 201 },
      );
    }
    if (path[0] === "catalogs") {
      if (
        req.method !== "POST" ||
        !["layers", "gates", "profiles"].includes(path[1]) ||
        path.length > 3
      )
        throw new DomainError(
          405,
          "Use POST nos catálogos layers, gates ou profiles.",
        );
      return Response.json(
        await saveCatalog(
          user.id,
          pid,
          path[1] as "layers" | "gates" | "profiles",
          path[2],
          input,
          key,
        ),
        { status: path[2] ? 200 : 201 },
      );
    }
    if (["decisions", "contracts"].includes(path[0]) && path[2] === "review") {
      if (req.method !== "POST" || path.length !== 3)
        throw new DomainError(405, "Revisão utiliza POST.");
      return Response.json(
        await reviewRecord(
          user.id,
          pid,
          path[0] as "decisions" | "contracts",
          path[1],
          input,
          key,
        ),
      );
    }
    if (path[0] === "deliverables" && path[2] === "health-override") {
      if (req.method !== "POST" || path.length !== 3)
        throw new DomainError(405, "Ajuste de saúde utiliza POST.");
      return Response.json(
        await overrideHealth(user.id, pid, path[1], input, key),
        { status: 201 },
      );
    }
    if (path[0] === "reports") {
      if (
        req.method !== "POST" ||
        !(
          path.length === 1 ||
          (path.length === 3 && ["review", "publish"].includes(path[2]))
        )
      )
        throw new DomainError(
          405,
          "Use os comandos POST de submissão, revisão ou publicação.",
        );
      return Response.json(
        await reportCommand(user.id, pid, path[1], path[2], input, key),
        { status: path.length === 1 ? 201 : 200 },
      );
    }
    if (path[0] === "priorities") {
      if (req.method !== "POST")
        throw new DomainError(405, "Reordenar prioridades utiliza POST.");
      if (path.join("/") !== "priorities/reorder")
        throw new DomainError(404, "Comando de priorização não encontrado.");
      return Response.json(await reorderPriorities(user.id, pid, input, key));
    }
    if (path[0] === "change-requests") {
      if (req.method !== "POST")
        throw new DomainError(405, "Mudanças utilizam comandos POST.");
      if (path.length === 1)
        return Response.json(await proposeChange(user.id, pid, input, key), {
          status: 201,
        });
      if (path[1] === "preview" && path.length === 2)
        return Response.json(await previewChange(user.id, pid, input));
      if (path.length === 3 && path[2] === "review")
        return Response.json(
          await reviewChange(user.id, pid, path[1], input, key),
        );
      if (path.length === 3 && path[2] === "apply")
        return Response.json(
          await applyChange(user.id, pid, path[1], input, key),
        );
      if (path.length === 3 && path[2] === "cancel")
        return Response.json(
          await cancelChange(user.id, pid, path[1], input, key),
        );
      throw new DomainError(404, "Comando de change control não encontrado.");
    }
    if (path[0] === "imports") {
      const data = z
        .object({
          csv: z.string().max(1000000),
          expectedHash: z.string().optional(),
        })
        .parse(input);
      return Response.json(
        path[1] === "commit"
          ? await commitImport(
              user.id,
              pid,
              data.csv,
              data.expectedHash || "",
              key,
            )
          : await previewImport(user.id, pid, data.csv),
      );
    }
    if (
      path[0] === "snapshots" ||
      (path[0] === "programs" && path[2] === "snapshots")
    )
      return Response.json(
        resourceEnvelope((await snapshot(user.id, pid, key)) as Row),
        { status: 201 },
      );
    if (path[0] === "baselines") {
      if (req.method !== "POST")
        throw new DomainError(405, "Baseline utiliza comandos POST.");
      if (path.length === 1)
        return Response.json(await baseline(user.id, pid, key, input.reason), {
          status: 201,
        });
      if (path.length === 3 && path[2] === "review")
        return Response.json(
          await reviewBaseline(user.id, pid, path[1], input, key),
        );
      throw new DomainError(404, "Comando de baseline não encontrado.");
    }
    if (path[0] === "gate-assessments") {
      if (req.method !== "POST")
        throw new DomainError(405, "Avaliação e revogação utilizam POST.");
      if (path.length === 1)
        return Response.json(
          resourceEnvelope((await assess(user.id, pid, input, key)) as Row),
          {
            status: 201,
          },
        );
      if (path.length === 3 && path[2] === "revoke")
        return Response.json(
          await revokeException(user.id, pid, path[1], input, key),
        );
      throw new DomainError(404, "Comando de gate não encontrado.");
    }
    if (path[0] === "deliverables" && path[2] === "transitions")
      return Response.json(await transition(user.id, pid, path[1], input, key));
    if (path[0] === "saved-views") {
      const data = z
        .object({
          name: z.string().min(2).max(80),
          filters: z.record(z.string(), z.string()),
        })
        .parse(input);
      const [v] = await db.query(
        "INSERT INTO iam.saved_views(user_id,program_id,name,filters) VALUES($1,$2,$3,$4::jsonb) RETURNING *",
        [user.id, pid, data.name, JSON.stringify(data.filters)],
      );
      return Response.json(v, { status: 201 });
    }
    if (path[0] === "deliverables" && path[2] === "accept") {
      if (
        !roles.some((r) =>
          ["CHIEF_ARCHITECT", "GATE_APPROVER"].includes(r.role),
        )
      )
        throw new DomainError(403, "Aceite requer arquiteto ou aprovador.");
      const reason = z.string().trim().min(3).parse(input.reason);
      const record = await db.transaction(async (tx) => {
        await tx.query(
          "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
          [pid],
        );
        const currentRoles = await memberships(user.id, pid, tx);
        if (
          !currentRoles.some((r) =>
            ["CHIEF_ARCHITECT", "GATE_APPROVER"].includes(r.role),
          )
        )
          throw new DomainError(403, "Alçada de aceite revogada.");
        const [before] = await tx.query(
          "SELECT * FROM delivery.deliverables WHERE id=$1 AND program_id=$2 FOR UPDATE",
          [path[1], pid],
        );
        if (!before) throw new DomainError(404, "Registro não encontrado.");
        if (Number(before.version) !== Number(input.expectedVersion))
          throw new DomainError(409, "Versão obsoleta.");
        const domains = (
          await tx.query(
            "SELECT c.domain_id FROM delivery.deliverable_capabilities l JOIN portfolio.capabilities c ON c.id=l.capability_id WHERE l.deliverable_id=$1",
            [before.id],
          )
        ).map((r) => r.domain_id);
        if (
          !currentRoles.some(
            (r) =>
              r.role === "CHIEF_ARCHITECT" ||
              (r.role === "GATE_APPROVER" &&
                (!r.workstream_id ||
                  r.workstream_id === before.workstream_id) &&
                (!r.domain_ids?.length ||
                  (domains.length > 0 &&
                    domains.every((id) => r.domain_ids!.includes(id))))),
          )
        )
          throw new DomainError(
            403,
            "Aceite fora da frente/domínio autorizado.",
          );
        if (before.execution_status !== "DONE")
          throw new DomainError(409, "Aceite exige execução concluída.");
        if (!before.owner_id || !before.acceptance_criteria?.trim())
          throw new DomainError(
            422,
            "Aceite exige responsável e critério verificável.",
          );
        const excluded = await tx.query(
          "SELECT c.id FROM portfolio.capabilities c JOIN delivery.deliverable_capabilities l ON l.capability_id=c.id WHERE l.deliverable_id=$1 AND l.contribution_type='REQUIRED' AND c.scope_status='EXCLUDED'",
          [before.id],
        );
        if (before.scope_status === "EXCLUDED" || excluded.length)
          throw new DomainError(
            409,
            "Escopo excluído não pode receber aceite.",
          );
        const evidence = await tx.query(
          "SELECT e.* FROM evidence_records e JOIN portfolio.program_nodes n ON n.id=e.subject_node_id WHERE n.entity_id=$1 AND e.program_id=$2",
          [before.id, pid],
        );
        if (evidence.length && !evidence.some((e) => readable(e, currentRoles)))
          throw new DomainError(
            403,
            "Evidência de aceite acima da sua alçada de leitura.",
          );
        if (!evidence.length)
          throw new DomainError(422, "Aceite exige evidência.");
        const [after] = await tx.query(
          "UPDATE delivery.deliverables SET accepted=true,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
          [before.id],
        );
        await audit(
          tx,
          user.id,
          pid,
          "deliverables",
          before.id,
          "Accepted",
          before,
          after,
          reason,
          cid,
        );
        return after;
      });
      return Response.json(record);
    }
    if (path[0] === "releases" && path[2] === "approve") {
      if (!canEdit(roles, "releases"))
        throw new DomainError(403, "Sem alçada de release.");
      return Response.json(
        await idempotent(
          user.id,
          key,
          { op: "release", pid, id: path[1], input },
          async (tx) => {
            await tx.query(
              "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
              [pid],
            );
            if (!canEdit(await memberships(user.id, pid!, tx), "releases"))
              throw new DomainError(403, "Alçada de release revogada.");
            const [r] = await tx.query(
              "SELECT * FROM delivery.releases WHERE id=$1 AND program_id=$2 FOR UPDATE",
              [path[1], pid],
            );
            if (!r) throw new DomainError(404, "Release não encontrada.");
            if (Number(r.version) !== Number(input.expectedVersion))
              throw new DomainError(409, "Versão de release obsoleta.");
            z.string().trim().min(3).parse(input.reason);
            const del = await tx.query(
              "SELECT d.*,n.id AS node_id FROM delivery.deliverables d JOIN delivery.release_deliverables l ON l.deliverable_id=d.id JOIN portfolio.program_nodes n ON n.entity_id=d.id AND n.entity_type='deliverables' WHERE l.release_id=$1 AND l.required=true",
              [r.id],
            );
            if (!del.length)
              throw new DomainError(
                409,
                "Release sem entregáveis obrigatórios.",
              );
            for (const d of del) {
              await assertProductionScope(tx, pid, d.id);
              const gateStatus = await subjectGateReadiness(tx, pid, d.id);
              if (
                !d.accepted ||
                d.execution_status !== "DONE" ||
                !gateStatus.known ||
                gateStatus.blockingGates > 0
              )
                throw new DomainError(
                  409,
                  "Entregáveis não aceitos ou gates impeditivos pendentes.",
                );
            }
            const [after] = await tx.query(
              "UPDATE delivery.releases SET status='APPROVED',version=version+1 WHERE id=$1 RETURNING *",
              [r.id],
            );
            await audit(
              tx,
              user.id,
              pid,
              "releases",
              r.id,
              "Approved",
              r,
              after,
              input.reason,
              cid,
            );
            return after;
          },
        ),
      );
    }
    if (!(path[0] in TABLES))
      throw new DomainError(404, "Ação ainda não implementada.");
    const kind = path[0] as Kind;
    if (
      (req.method === "POST" && path.length !== 1) ||
      (["PATCH", "DELETE"].includes(req.method) && path.length !== 2)
    )
      throw new DomainError(404, "Comando de recurso não encontrado.");
    if (path[1]) z.uuid().parse(path[1]);
    if (req.method === "DELETE") {
      const deleted = await db.transaction(async (tx) => {
        await tx.query(
          "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
          [pid],
        );
        const roles = await memberships(user.id, pid!, tx);
        const [before] = await tx.query(
          `SELECT * FROM ${TABLES[kind]} WHERE id=$1 AND ${kind === "programs" ? "id" : "program_id"}=$2 FOR UPDATE`,
          [path[1], pid],
        );
        if (!before) throw new DomainError(404, "Registro não encontrado.");
        if (
          !canEdit(
            roles,
            kind,
            await authorizationScope(tx, kind, before, pid!),
          )
        )
          throw new DomainError(403, "Sem permissão.");
        if (
          Number(req.headers.get("If-Match")?.replaceAll('"', "")) !==
          Number(before.version)
        )
          throw new DomainError(409, "Versão obsoleta.");
        const nodes = await tx.query(
          "SELECT id FROM portfolio.program_nodes WHERE entity_id=$1 AND program_id=$2",
          [before.id, pid],
        );
        if (nodes.length)
          await tx.query(
            "DELETE FROM portfolio.program_nodes WHERE entity_id=$1 AND program_id=$2",
            [before.id, pid],
          );
        await tx.query(`DELETE FROM ${TABLES[kind]} WHERE id=$1`, [before.id]);
        await audit(
          tx,
          user.id,
          pid,
          kind,
          before.id,
          "Deleted",
          before,
          null,
          "Exclusão solicitada",
          cid,
        );
        return { ok: true };
      });
      return Response.json(deleted);
    }
    if (!["POST", "PATCH"].includes(req.method))
      throw new DomainError(405, "Método não permitido.");
    const { changeReason, expectedVersion, ...data } = input;
    const version = Number(
      req.headers.get("If-Match")?.replaceAll('"', "") || expectedVersion,
    );
    const record = await mutate(
      user.id,
      pid,
      kind,
      data,
      req.method === "PATCH" ? path[1] : undefined,
      version,
      changeReason || "Cadastro",
      cid,
    );
    return Response.json(
      resourceEnvelope((await resourceProjection(kind, pid, [record]))[0]),
      {
        status: req.method === "POST" ? 201 : 200,
        headers: { ETag: `"${record.version}"` },
      },
    );
  } catch (error) {
    return problem(error, req, cid);
  }
}
async function handle(req: Request, ctx: Context) {
  const cid = crypto.randomUUID(),
    start = Date.now();
  const response = await dispatch(req, ctx, cid);
  const durationMs = Date.now() - start;
  response.headers.set("X-Correlation-ID", cid);
  response.headers.set("Server-Timing", `app;dur=${durationMs}`);
  console.info(
    JSON.stringify({
      event: "api.request",
      correlationId: cid,
      method: req.method,
      path: new URL(req.url).pathname,
      status: response.status,
      durationMs,
    }),
  );
  return response;
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
