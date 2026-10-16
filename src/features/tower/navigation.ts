/** One URL contract for the rail, search, bookmarks and browser history. */
export const VIEWS = [
  "overview",
  "projects",
  "fronts",
  "capabilities",
  "architecture",
  "deliverables",
  "delivery",
  "priorities",
  "scope",
  "dependencies",
  "readiness",
  "evidence",
  "reports",
  "intelligence",
  "agents",
  "integrations",
  "audit",
  "settings",
] as const;
export function workspaceLocation(search: string) {
  const params = new URLSearchParams(search);
  const raw = params.get("view") || "overview";
  const aliases: Record<string, [string, string]> = {
    raid: ["dependencies", "raid"],
    decisions: ["dependencies", "decisions"],
    contracts: ["settings", "contracts"],
    suppliers: ["settings", "suppliers"],
  };
  const alias = aliases[raw];
  return {
    view: alias?.[0] || (raw === "orange" ? "overview" : raw),
    program: params.get("program") || "",
    section: alias?.[1] || params.get("section") || "",
    orange: raw === "orange",
  };
}
export function workspaceURL(
  href: string,
  view: string,
  program?: string,
  section?: string,
) {
  const url = new URL(href);
  url.searchParams.set("view", view);
  if (program) url.searchParams.set("program", program);
  if (section) url.searchParams.set("section", section);
  else url.searchParams.delete("section");
  return url;
}

export const PROJECT_TABS = [
  { id: "overview", name: "Resumo", views: ["overview", "intelligence"] },
  { id: "fronts", name: "Frentes", views: ["fronts"] },
  {
    id: "capabilities",
    name: "Features",
    views: ["capabilities", "architecture"],
  },
  { id: "deliverables", name: "Entregas", views: ["deliverables"] },
  {
    id: "delivery",
    name: "Planejamento",
    views: ["delivery", "priorities", "dependencies"],
  },
  {
    id: "readiness",
    name: "Prontidão",
    views: ["readiness", "evidence", "scope"],
  },
  { id: "audit", name: "Atividade", views: ["audit", "reports"] },
];
