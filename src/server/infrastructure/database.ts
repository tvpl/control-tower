import { PGlite } from "@electric-sql/pglite";
import { sql, type SQL } from "drizzle-orm";
import { drizzle as embeddedDrizzle } from "drizzle-orm/pglite";
import { drizzle as serverDrizzle } from "drizzle-orm/postgres-js";
import { mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

export type Row = Record<string, any>; // SQL boundary: validated at application entry.
export interface Database {
  query<T extends Row = Row>(text: string, values?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}
const calendarDates = new Set([
  "forecast_date",
  "baseline_date",
  "planned_date",
  "actual_date",
  "due_date",
  "needed_by",
  "inventory_estimate_as_of",
]);
export function normalizeRow<T extends Row>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date
        ? calendarDates.has(key)
          ? value.toISOString().slice(0, 10)
          : value.toISOString()
        : value,
    ]),
  ) as T;
}
function statement(text: string, values: unknown[]): SQL {
  const fragments: SQL[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\$(\d+)/g)) {
    fragments.push(sql.raw(text.slice(offset, match.index)));
    fragments.push(sql`${values[Number(match[1]) - 1]}`);
    offset = match.index! + match[0].length;
  }
  fragments.push(sql.raw(text.slice(offset)));
  return sql.join(fragments, sql.raw(""));
}
function wrap(client: any): Database {
  return {
    async query<T extends Row>(text: string, values: unknown[] = []) {
      const result = await client.execute(statement(text, values));
      return ((Array.isArray(result) ? result : result.rows) as T[]).map(
        normalizeRow,
      );
    },
    transaction: (fn) => client.transaction((tx: any) => fn(wrap(tx))),
  };
}
const globalDb = globalThis as typeof globalThis & {
  towerDb?: Database;
  towerEmbedded?: PGlite;
};
export function getDb(): Database {
  if (globalDb.towerDb) return globalDb.towerDb;
  if (process.env.DATABASE_URL) {
    globalDb.towerDb = wrap(
      serverDrizzle(postgres(process.env.DATABASE_URL, { max: 10 })),
    );
  } else {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_PREVIEW !== "true"
    )
      throw new Error("DATABASE_URL é obrigatória em produção");
    const dir =
      process.env.PGLITE_DATA_DIR ||
      path.join(process.cwd(), "data/control-tower");
    if (dir !== "memory://")
      mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
    globalDb.towerEmbedded = new PGlite(dir);
    globalDb.towerDb = wrap(embeddedDrizzle(globalDb.towerEmbedded));
  }
  return globalDb.towerDb;
}
