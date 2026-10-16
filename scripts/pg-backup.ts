import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { writeFile, chmod, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  encryptBackup,
  backupKey,
} from "../src/server/infrastructure/backup-crypto";
import { SCHEMA_MANIFEST } from "../src/server/infrastructure/schema-manifest";
const destination = process.argv[2];
if (!destination || !process.env.DATABASE_URL)
  throw new Error(
    "Informe arquivo de destino novo e DATABASE_URL de PostgreSQL servidor.",
  );
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol))
  throw new Error("DATABASE_URL inválida.");
const key = backupKey(process.env.MCT_BACKUP_KEY_HEX),
  file = resolve(destination);
const child = spawn("pg_dump", ["--format=custom", "--no-password"], {
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
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.resume();
const completion = new Promise<void>((resolve, reject) => {
  child.once("error", () => reject(new Error("pg_dump indisponível.")));
  child.once("close", (code) =>
    code === 0
      ? resolve()
      : reject(
          new Error(
            "pg_dump falhou; consulte a operação sem expor credenciais.",
          ),
        ),
  );
});
completion.catch(() => {});
let archiveOwned = false;
try {
  await encryptBackup(child.stdout, file, key);
  archiveOwned = true;
  await completion;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const digest = hash.digest("hex");
  await writeFile(
    file + ".json",
    JSON.stringify(
      {
        format: "MCTBKP001/AES-256-GCM",
        sha256: digest,
        createdAt: new Date().toISOString(),
        schema: SCHEMA_MANIFEST,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  await chmod(file, 0o600);
  console.log(JSON.stringify({ status: "ENCRYPTED", file, digest }));
} catch (error) {
  child.kill();
  // pg_dump can emit an incomplete stream before failing. Never leave it as a usable archive.
  if (archiveOwned) await unlink(file).catch(() => {});
  throw error;
}
