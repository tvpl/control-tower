import { z } from "zod";
import { DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { normalizeImportFile } from "../infrastructure/import-files";
import { getDb, type Row } from "../infrastructure/database";
import { enqueueJob, getJob } from "./jobs";
import { previewImport, commitImport, type ImportOptions } from "./imports";
export async function queueImportPreview(
  userId: string,
  pid: string,
  input: unknown,
  key: string,
) {
  const p = z
    .object({
      filename: z.string().min(1).max(300),
      contentBase64: z.string().max(6700000),
      sheet: z.string().max(100).optional(),
      sourceUrl: z
        .url()
        .refine((u) => {
          const url = new URL(u);
          return url.protocol === "https:" && !url.username && !url.password;
        })
        .optional(),
      namespace: z.string().trim().min(3).max(100).optional(),
    })
    .strict()
    .parse(input);
  const roles = await memberships(userId, pid);
  if (
    !roles.some((r) =>
      ["PROGRAM_ADMIN", "CHIEF_ARCHITECT", "WORKSTREAM_LEAD"].includes(r.role),
    )
  )
    throw new DomainError(403, "Importação requer editor de entregáveis.");
  const file = await normalizeImportFile(p.filename, p.contentBase64, p.sheet);
  if (file.csv.length > 5000000)
    throw new DomainError(413, "Conteúdo normalizado excede 5 MB.");
  return enqueueJob(
    userId,
    pid,
    "IMPORT_PREVIEW",
    { ...file, sourceUrl: p.sourceUrl, namespace: p.namespace },
    key,
  );
}
export async function queueImportCommit(
  userId: string,
  pid: string,
  id: string,
  input: unknown,
  key: string,
) {
  z.uuid().parse(id);
  const p = z
      .object({ expectedHash: z.string().length(64) })
      .strict()
      .parse(input),
    metadata = await getJob(userId, pid, id);
  if (
    metadata.kind !== "IMPORT_PREVIEW" ||
    metadata.status !== "SUCCEEDED" ||
    !metadata.output?.valid ||
    metadata.output.expired ||
    metadata.output.hash !== p.expectedHash ||
    !metadata.output.count
  )
    throw new DomainError(409, "Prévia não está válida para confirmação.");
  const roles = await memberships(userId, pid);
  if (
    !roles.some((r) =>
      ["PROGRAM_ADMIN", "CHIEF_ARCHITECT", "WORKSTREAM_LEAD"].includes(r.role),
    )
  )
    throw new DomainError(403, "Confirmação exige editor de entregáveis.");
  const [preview] = await getDb().query(
    "SELECT input FROM integration.jobs WHERE id=$1 AND program_id=$2",
    [id, pid],
  );
  return enqueueJob(
    userId,
    pid,
    "IMPORT_COMMIT",
    { ...preview.input, previewJobId: id, expectedHash: p.expectedHash },
    key,
  );
}
export async function processImportJob(job: Row) {
  const options: ImportOptions = {
    maxRows: 10000,
    maxChars: 5000000,
    sourceUrl: job.input.sourceUrl,
    namespace: job.input.namespace,
    digest: job.input.digest,
    filename: job.input.filename,
    jobId: job.id,
    rowNumbers: job.input.rowNumbers,
  };
  if (job.kind === "IMPORT_PREVIEW")
    return previewImport(
      job.actor_id,
      job.program_id,
      job.input.csv,
      getDb(),
      options,
    );
  return commitImport(
    job.actor_id,
    job.program_id,
    job.input.csv,
    job.input.expectedHash,
    `job-import:${job.id}`,
    options,
  );
}
export function importErrorCSV(job: Row) {
  const lines = job.output?.lines || [];
  const cell = (value: unknown) =>
    `"${String(value ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      "linha,codigo,erros",
      ...lines
        .filter((l: Row) => l.errors.length)
        .map((l: Row) =>
          [l.line, l.input.code, l.errors.join("; ")].map(cell).join(","),
        ),
    ].join("\n")
  );
}
