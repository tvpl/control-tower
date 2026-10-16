import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import postgres from "postgres";
import {
  backupKey,
  backupDecipher,
  backupSource,
  verifyBackup,
} from "../src/server/infrastructure/backup-crypto";
const filename = process.argv[2],
  target = process.env.RESTORE_DATABASE_URL;
if (!filename || !target)
  throw new Error(
    "Informe backup e RESTORE_DATABASE_URL de banco vazio e isolado.",
  );
if (target === process.env.DATABASE_URL)
  throw new Error(
    "Destino de restore deve ser diferente do banco operacional.",
  );
const url = new URL(target);
if (!["postgres:", "postgresql:"].includes(url.protocol))
  throw new Error("Destino inválido.");
const key = backupKey(process.env.MCT_BACKUP_KEY_HEX);
await verifyBackup(filename, key);
const sql = postgres(target, { max: 1 });
try {
  const [row] =
    await sql`SELECT count(*)::integer AS total FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')`;
  if (row.total !== 0)
    throw new Error(
      "Restore recusado: destino não está vazio. Nenhuma limpeza automática é realizada.",
    );
} finally {
  await sql.end();
}
const child = spawn(
  "pg_restore",
  [
    "--dbname",
    decodeURIComponent(url.pathname.slice(1)),
    "--single-transaction",
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    "--no-password",
  ],
  {
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE:
        url.searchParams.get("sslmode") || process.env.PGSSLMODE || "require",
    },
    stdio: ["pipe", "ignore", "pipe"],
  },
);
child.stderr.resume();
const completion = new Promise<void>((resolve, reject) => {
  child.once("error", () => reject(new Error("pg_restore indisponível.")));
  child.once("close", (code) =>
    code === 0
      ? resolve()
      : reject(
          new Error(
            "pg_restore falhou; a transação deve ser revertida pelo servidor.",
          ),
        ),
  );
});
completion.catch(() => {});
try {
  await pipeline(
    backupSource(filename),
    await backupDecipher(filename, key),
    child.stdin,
  );
  await completion;
  const check = postgres(target, { max: 1 });
  try {
    const migrations =
      await check`SELECT count(*)::integer AS total FROM public.schema_migrations`;
    const [snapshots] =
      await check`SELECT count(*)::integer AS total FROM reporting.snapshots`;
    console.log(
      JSON.stringify({
        status: "RESTORED_ISOLATED",
        migrations: migrations[0].total,
        snapshots: snapshots.total,
        requiresBusinessValidation: true,
      }),
    );
  } finally {
    await check.end();
  }
} catch (error) {
  child.kill();
  throw error;
}
