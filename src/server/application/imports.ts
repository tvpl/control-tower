import { createHash, randomUUID } from "node:crypto";
import Papa from "papaparse";
import { canEdit, DomainError } from "../domain/rules";
import { schemas } from "../domain/schemas";
import { memberships } from "../infrastructure/auth";
import { getDb, type Database, type Row } from "../infrastructure/database";
import { validateHeaders } from "../infrastructure/import-files";
import { idempotent, mutate } from "./service";
export type ImportOptions = {
  maxRows?: number;
  maxChars?: number;
  sourceUrl?: string;
  namespace?: string;
  digest?: string;
  filename?: string;
  jobId?: string;
  rowNumbers?: number[];
};
function sourceUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    return false;
  }
}
export async function previewImport(
  userId: string,
  pid: string,
  csv: string,
  database: Database = getDb(),
  options: ImportOptions = {},
) {
  if (csv.length > (options.maxChars || 1000000))
    throw new DomainError(413, "Arquivo excede o limite da importação.");
  const parsed = Papa.parse<Row>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length)
    throw new DomainError(422, `CSV inválido: ${parsed.errors[0].message}`);
  validateHeaders(parsed.meta.fields || []);
  if (parsed.data.length > (options.maxRows || 500))
    throw new DomainError(422, `Limite: ${options.maxRows || 500} linhas.`);
  const roles = await memberships(userId, pid, database);
  const domains = await database.query(
      "SELECT * FROM portfolio.domains WHERE program_id=$1",
      [pid],
    ),
    streams = await database.query(
      "SELECT * FROM portfolio.workstreams WHERE program_id=$1",
      [pid],
    ),
    caps = await database.query(
      "SELECT * FROM portfolio.capabilities WHERE program_id=$1",
      [pid],
    ),
    areas = await database.query(
      "SELECT * FROM portfolio.areas WHERE program_id=$1",
      [pid],
    ),
    squads = await database.query(
      "SELECT * FROM portfolio.squads WHERE program_id=$1",
      [pid],
    ),
    layers = await database.query(
      "SELECT * FROM portfolio.layers WHERE program_id=$1",
      [pid],
    );
  const users = await database.query(
    "SELECT DISTINCT u.id,u.email FROM iam.users u JOIN iam.memberships m ON m.user_id=u.id WHERE m.program_id=$1 AND (m.expires_at IS NULL OR m.expires_at>now())",
    [pid],
  );
  const [program] = await database.query(
    "SELECT code FROM portfolio.programs WHERE id=$1",
    [pid],
  );
  const existing = await database.query(
      "SELECT code FROM delivery.deliverables WHERE program_id=$1",
      [pid],
    ),
    seen = new Set(existing.map((r) => r.code));
  const external = await database.query(
      "SELECT external_id FROM integration.import_sources WHERE program_id=$1 AND namespace=$2",
      [pid, options.namespace || ""],
    ),
    seenExternal = new Set(external.map((r) => r.external_id));
  const lines = parsed.data.map((raw, index) => {
    const row = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() : v,
        ]),
      ),
      errors: string[] = [];
    const stream = streams.find((s) => s.code === row.workstream_code),
      cap = caps.find((c) => c.code === row.capability_code),
      domain = domains.find((d) => d.code === row.domain_code),
      owner = users.find(
        (u) => u.email?.toLowerCase() === row.owner_email?.toLowerCase(),
      ),
      area = areas.find((a) => a.code === row.area_code),
      squad = squads.find((q) => q.code === row.squad_code);
    if (row.program_code !== program.code) errors.push("Programa divergente");
    if (!domain || cap?.domain_id !== domain.id)
      errors.push("Domínio/capacidade inválidos");
    if (!stream) errors.push("Frente não encontrada");
    if (!owner) errors.push("Owner não encontrado");
    if (seen.has(row.deliverable_code)) errors.push("Código duplicado");
    seen.add(row.deliverable_code);
    if (row.area_code && !area) errors.push("Área não encontrada");
    if (row.squad_code && !squad) errors.push("Squad não encontrado");
    if (area && squad?.area_id && squad.area_id !== area.id)
      errors.push("Área e squad divergentes");
    if (!layers.some((l) => l.code === row.layer && l.active))
      errors.push("Camada não está ativa no programa");
    const origin = sourceUrl(row.source_url || options.sourceUrl);
    if (origin === false)
      errors.push("source_url deve usar HTTPS sem credenciais");
    if (row.external_id) {
      if (!options.namespace) errors.push("ID externo exige nome da fonte");
      if (seenExternal.has(row.external_id))
        errors.push("ID externo duplicado na fonte");
      seenExternal.add(row.external_id);
    }
    const input = {
      code: row.deliverable_code,
      name: row.name,
      layer: row.layer,
      deliverable_type: row.deliverable_type || "API",
      criticality: row.criticality || "MEDIUM",
      workstream_id: stream?.id,
      area_id: area?.id || null,
      squad_id: squad?.id || null,
      owner_id: owner?.id,
      capability_ids: cap ? [cap.id] : [],
      forecast_date: row.forecast_date || null,
      execution_status: row.execution_status || "NOT_STARTED",
      acceptance_criteria: row.acceptance_criteria || "",
      planning_status: "BACKLOG",
      transverse_obligation: row.transverse_obligation || null,
      weight: row.weight ? Number(row.weight) : null,
    };
    const result = schemas.deliverables.safeParse(input);
    if (!result.success)
      errors.push(
        ...result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
      );
    if (stream && !canEdit(roles, "deliverables", stream.id))
      errors.push("Sem permissão para esta frente");
    if (row.stage && row.stage !== "IDENTIFIED")
      errors.push(
        "Importação inicia em IDENTIFIED; avanço exige workflow protegido.",
      );
    return {
      line: options.rowNumbers?.[index] || index + 2,
      input: result.success ? result.data : input,
      sourceUrl: origin || null,
      externalId: row.external_id || null,
      errors,
    };
  });
  return {
    hash: createHash("sha256").update(csv).digest("hex"),
    lines,
    valid: lines.every((l) => !l.errors.length),
    count: lines.length,
  };
}
export async function commitImport(
  userId: string,
  pid: string,
  csv: string,
  expectedHash: string,
  key: string,
  options: ImportOptions = {},
) {
  return idempotent(
    userId,
    key,
    { op: "import", pid, csv, expectedHash, options },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const preview = await previewImport(userId, pid, csv, tx, options);
      if (!preview.valid || preview.hash !== expectedHash)
        throw new DomainError(
          409,
          "Prévia obsoleta ou linhas inválidas. Faça uma nova validação.",
        );
      const records = [];
      for (const line of preview.lines) {
        const record = await mutate(
          userId,
          pid,
          "deliverables",
          line.input,
          undefined,
          undefined,
          `Importação ${options.filename || "CSV"} linha ${line.line}`,
          randomUUID(),
          tx,
          {
            sourceType: "IMPORT",
            sourceUrl: line.sourceUrl,
            namespace: options.namespace || null,
            externalId: line.externalId,
            version: options.digest || preview.hash,
            jobId: options.jobId || null,
          },
        );
        records.push(record);
        if (line.externalId)
          await tx.query(
            "INSERT INTO integration.import_sources(program_id,namespace,external_id,deliverable_id) VALUES($1,$2,$3,$4)",
            [pid, options.namespace, line.externalId, record.id],
          );
      }
      return {
        imported: records.length,
        hash: preview.hash,
        ids: records.map((r) => r.id),
      };
    },
  );
}
