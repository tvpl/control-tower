import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Database } from "./database";
export async function migrate(db: Database) {
  if (process.env.DATABASE_URL)
    return db.transaction(async (tx) => {
      await tx.query(
        "SELECT pg_advisory_xact_lock(hashtext('mct-schema-migrations'))",
      );
      await migrateLocked(tx);
    });
  return migrateLocked(db);
}
async function migrateLocked(db: Database) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const contents = await readFile(`db/migrations/${name}`, "utf8");
    const hash = createHash("sha256").update(contents).digest("hex");
    const [existing] = await db.query(
      "SELECT hash FROM public.schema_migrations WHERE name=$1",
      [name],
    );
    if (existing) {
      if (existing.hash !== hash)
        throw new Error(`Migration alterada após aplicada: ${name}`);
      continue;
    }
    await db.transaction(async (tx) => {
      for (const statement of splitSql(contents)) await tx.query(statement);
      await tx.query(
        "INSERT INTO public.schema_migrations(name,hash) VALUES($1,$2)",
        [name, hash],
      );
    });
    console.log(`Aplicada ${name}`);
  }
}
export function splitSql(input: string) {
  const parts: string[] = [];
  let start = 0,
    quoted = false,
    dollar = false,
    comment = false;
  for (let i = 0; i < input.length; i++) {
    if (comment) {
      if (input[i] === "\n") comment = false;
      continue;
    }
    if (!quoted && !dollar && input.slice(i, i + 2) === "--") {
      comment = true;
      i++;
      continue;
    }
    if (!quoted && input.slice(i, i + 2) === "$$") {
      dollar = !dollar;
      i++;
      continue;
    }
    if (!dollar && input[i] === "'") {
      if (quoted && input[i + 1] === "'") {
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (input[i] === ";" && !quoted && !dollar) {
      parts.push(input.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (input.slice(start).trim()) parts.push(input.slice(start));
  return parts;
}
