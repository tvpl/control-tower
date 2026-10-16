import { DomainError } from "./rules";
export const SCOPE_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "CHANGED",
  "EXCLUDED",
] as const;
export const SCOPE_FIELDS = {
  capabilities: [
    "name",
    "description",
    "domain_id",
    "parent_id",
    "acceptance_criteria",
    "scope_status",
    "criticality",
  ],
  deliverables: [
    "name",
    "layer",
    "deliverable_type",
    "criticality",
    "capability_ids",
    "capability_roles",
    "weight",
    "transverse_obligation",
    "acceptance_criteria",
    "scope_status",
  ],
} as const;
export type ScopeKind = keyof typeof SCOPE_FIELDS;
export function assertScopeTransition(before: string, after: string) {
  const transitions: Record<string, string[]> = {
    PROPOSED: ["APPROVED", "EXCLUDED"],
    APPROVED: ["CHANGED", "EXCLUDED"],
    CHANGED: ["CHANGED", "EXCLUDED"],
    EXCLUDED: ["CHANGED"],
  };
  if (!transitions[before]?.includes(after))
    throw new DomainError(
      409,
      "Transição de escopo inválida. Aprove a proposta inicial ou registre alteração/exclusão do escopo vigente.",
    );
}
