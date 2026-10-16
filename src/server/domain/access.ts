import { DomainError, type Membership } from "./rules";
export type AccessMembership = Membership & {
  data_clearance?: string;
  domain_ids?: string[];
  expires_at?: string | null;
};
const ranks: Record<string, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};
export function clearance(roles: AccessMembership[]) {
  return roles.some((r) => r.role === "PROGRAM_ADMIN")
    ? 3
    : Math.max(
        0,
        ...roles.map((r) => ranks[r.data_clearance || "INTERNAL"] ?? 1),
      );
}
export function readable(value: unknown, roles: AccessMembership[]): boolean {
  const max = clearance(roles);
  function walk(v: unknown): boolean {
    if (!v || typeof v !== "object") return true;
    if (Array.isArray(v)) return v.every(walk);
    const o = v as Record<string, unknown>;
    if (o.classification && (ranks[String(o.classification)] ?? 3) > max)
      return false;
    return Object.values(o).every(walk);
  }
  return walk(value);
}
export function assertReadable(value: unknown, roles: AccessMembership[]) {
  if (!readable(value, roles))
    throw new DomainError(
      403,
      "Classificação da informação exige alçada de leitura superior.",
    );
}
export function gateAuthority(
  roles: AccessMembership[],
  category: string,
  workstream: string | null,
  domains: string[],
) {
  return roles.some(
    (r) =>
      r.role === "GATE_APPROVER" &&
      r.gate_categories?.includes(category) &&
      (!r.workstream_id || r.workstream_id === workstream) &&
      (!r.domain_ids?.length ||
        (domains.length > 0 &&
          domains.every((id) => r.domain_ids!.includes(id)))),
  );
}
export function redactState(s: Record<string, any>, roles: AccessMembership[]) {
  s.evidence = s.evidence.filter((r: unknown) => readable(r, roles));
  const suppliers = s.suppliers || [],
    allowed = new Set(
      suppliers
        .filter((r: unknown) => readable(r, roles))
        .map((r: any) => r.id),
    );
  s.suppliers = suppliers.filter((r: unknown) => readable(r, roles));
  s.contracts = (s.contracts || []).filter(
    (r: any) => !r.supplier_id || allowed.has(r.supplier_id),
  );
  const redactAssessment = (a: any) =>
    readable(a.evidence_refs, roles)
      ? a
      : { ...a, evidence_refs: [], evidence_redacted: true };
  s.assessments = s.assessments.map(redactAssessment);
  s.effectiveAssessments = s.effectiveAssessments.map(redactAssessment);
  s.restrictedSnapshots = s.snapshots.filter(
    (v: unknown) => !readable(v, roles),
  ).length;
  s.snapshots = s.snapshots.filter((v: unknown) => readable(v, roles));
  const ids = new Set(s.snapshots.map((v: any) => v.id));
  s.reports = (s.reports || []).filter(
    (r: any) =>
      ids.has(r.snapshot_id) &&
      (!r.previous_snapshot_id || ids.has(r.previous_snapshot_id)),
  );
  s.audit = s.audit.map((r: any) =>
    readable(r.before_data, roles) && readable(r.after_data, roles)
      ? r
      : { ...r, before_data: null, after_data: null, redacted: true },
  );
  return s;
}
