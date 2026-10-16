import { DomainError } from "./rules";
import { schemas, type Kind } from "./schemas";
const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export function normalizeResourceInput(
  kind: Kind | "gate-assessments",
  value: unknown,
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError(422, "Corpo deve ser um objeto.");
  const input = { ...value } as Record<string, unknown>,
    keys =
      kind === "gate-assessments"
        ? [
            "subject_node_id",
            "gate_id",
            "evidence_ids",
            "expires_at",
            "accepted_risk",
          ]
        : Object.keys(schemas[kind].shape);
  for (const key of keys) {
    const alias = key === "gate_id" ? "gateDefinitionId" : camel(key);
    if (alias === key || !(alias in input)) continue;
    if (key in input)
      throw new DomainError(422, `Envie apenas ${key} ou ${alias}.`);
    input[key] = input[alias];
    delete input[alias];
  }
  delete input.programId;
  return input;
}
/** Aliases are added only at the resource envelope, preserving frozen payloads and hashes. */
export function resourceEnvelope(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const aliases = Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key.includes("_"))
      .map(([key, value]) => [camel(key), value]),
  );
  return {
    ...record,
    ...aliases,
    ...(record.gate_id ? { gateDefinitionId: record.gate_id } : {}),
  };
}
