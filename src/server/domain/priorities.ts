import { DomainError, type Membership } from "./rules";
export const PRIORITY_KINDS = ["deliverables", "capabilities"] as const;
export type PriorityKind = (typeof PRIORITY_KINDS)[number];
export function canPrioritize(roles: Membership[]) {
  return roles.some((r) =>
    ["PROGRAM_ADMIN", "CHIEF_ARCHITECT", "PMO", "EXECUTIVE"].includes(r.role),
  );
}
export function moveInOrder(ids: string[], id: string, index: number) {
  if (!ids.includes(id)) return ids;
  const next = ids.filter((value) => value !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
  return next;
}
export function reorderVisible(
  order: string[],
  visible: string[],
  replacement: string[],
) {
  const set = new Set(visible);
  if (
    visible.length !== replacement.length ||
    new Set(replacement).size !== visible.length ||
    replacement.some((id) => !set.has(id))
  )
    throw new DomainError(
      422,
      "A reordenação deve preservar os itens visíveis.",
    );
  let i = 0;
  return order.map((id) => (set.has(id) ? replacement[i++] : id));
}
export function reconcileOrder(order: string[], current: string[]) {
  const set = new Set(current);
  const saved = [...new Set(order)].filter((id) => set.has(id));
  return [...saved, ...current.filter((id) => !saved.includes(id))];
}
