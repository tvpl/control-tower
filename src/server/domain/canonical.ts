import { createHash } from "node:crypto";
/** Canonical JSON for reproducible hashes after PostgreSQL jsonb key reordering. */
export function canonicalJSON(value: unknown): string {
  const normalized = JSON.parse(JSON.stringify(value));
  function sort(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === "object")
      return Object.fromEntries(
        Object.entries(node)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, val]) => [key, sort(val)]),
      );
    return node;
  }
  return JSON.stringify(sort(normalized));
}
export const hashPayload = (value: unknown) =>
  createHash("sha256").update(canonicalJSON(value)).digest("hex");
