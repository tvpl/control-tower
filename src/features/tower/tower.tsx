"use client";
import { ProgramPolicy } from "./governance/program-policy";
import { OperationsPanel } from "./governance/operations-panel";
import { IntelligenceWorkspace } from "./governance/intelligence-workspace";
import { IntegrationWorkspace } from "./governance/integration-workspace";
import { NotificationCenter } from "./governance/notification-center";
import { Modal } from "@/components/ui/dialog";
import { canEdit, STAGES } from "@/server/domain/rules";
import { type Kind } from "@/server/domain/schemas";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileBarChart2,
  FileCheck2,
  GitBranch,
  GitPullRequest,
  Grid2X2,
  History,
  Layers3,
  LayoutDashboard,
  Moon,
  Network,
  Package,
  Plug,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, download } from "./client";
import { DataTable } from "./data-table";
import { Detail } from "./detail";
import { ChangeControl, ChangeForm } from "./change-control";
import { type ScopeKind } from "@/server/domain/scope";
import { EntityForm, GateForm } from "./forms";
import { ImportForm } from "./import-form";
import { label, TITLES } from "./metadata";
import { contextualState, filterDeliverables, UNASSIGNED } from "./filtering";
import { ProjectPortfolio } from "./projects/project-portfolio";
import { Overview } from "./overview";
import { DeliveryHorizon } from "./management/delivery-horizon";
import { PriorityWorkspace } from "./priorities/priority-workspace";
import { AccessWorkspace } from "./governance/access-workspace";
import { CatalogWorkspace } from "./governance/catalog-workspace";
import { VIEWS, workspaceLocation, workspaceURL } from "./navigation";
import { AgentWorkspace } from "./governance/agent-workspace";
import { ContextAgent } from "./governance/context-agent";
import {
  DeliverableSelection,
  PlanningWorkspace,
} from "./operations/deliverable-selection";
import { AGENT_FIELDS } from "@/server/domain/agent-template";
import type { AgentContext } from "@/server/domain/agent-context";
import {
  WorkspaceNavigation,
  type NavigationMode,
} from "./workspace-navigation";
import {
  ProjectContext,
  ActiveFilters,
  ViewBreadcrumb,
  type Density,
} from "./projects/project-context";
import { FrontWorkspace } from "./projects/front-workspace";
import type { TowerFilters } from "./filtering";
import { Empty, fullDate, genericColumns, toCSV } from "./presentation";
import {
  Architecture,
  Audit,
  CapabilityMap,
  Delivery,
  DependencyGraph,
  Readiness,
  Reports,
} from "./views";
type Row = Record<string, any>;
type User = { id: string; name: string; email: string };
const NAV = [
  { id: "overview", name: "Visão executiva", icon: LayoutDashboard },
  { id: "projects", name: "Projetos", icon: Layers3 },
  { id: "fronts", name: "Frentes do projeto", icon: Layers3 },
  { id: "capabilities", name: "Mapa de capacidades", icon: Grid2X2 },
  { id: "architecture", name: "Arquitetura", icon: Network },
  { id: "deliverables", name: "Entregáveis", icon: Package },
  { id: "delivery", name: "Delivery & roadmap", icon: Route },
  { id: "priorities", name: "Prioridades", icon: ArrowDownUp },
  { id: "scope", name: "Change control", icon: GitPullRequest },
  { id: "dependencies", name: "Dependências & RAID", icon: GitBranch },
  { id: "readiness", name: "Readiness & gates", icon: ShieldCheck },
  { id: "evidence", name: "Evidências", icon: FileCheck2 },
  { id: "reports", name: "Relatórios", icon: FileBarChart2 },
  { id: "intelligence", name: "Análise e cenários", icon: FileBarChart2 },
  { id: "agents", name: "Trabalhar com IA", icon: FileCheck2 },
  { id: "integrations", name: "Integrações", icon: Plug },
  { id: "audit", name: "Auditoria", icon: History },
  { id: "settings", name: "Administração", icon: Settings2 },
];
export function Tower({ user }: { user: User }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace user={user} />
    </QueryClientProvider>
  );
}
function Workspace({ user }: { user: User }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pid, setPid] = useState(""),
    [page, setPage] = useState("overview"),
    [theme, setTheme] = useState("dark"),
    [themeReady, setThemeReady] = useState(false),
    [navigationMode, setNavigationMode] = useState<NavigationMode>("auto"),
    [density, setDensity] = useState<Density>("compact"),
    [filterControlsOpen, setFilterControlsOpen] = useState(true),
    [domain, setDomain] = useState(""),
    [stream, setStream] = useState(""),
    [release, setRelease] = useState(""),
    [area, setArea] = useState(""),
    [squad, setSquad] = useState(""),
    [layer, setLayer] = useState(""),
    [owner, setOwner] = useState(""),
    [search, setSearch] = useState(""),
    [command, setCommand] = useState(false),
    [commandSearch, setCommandSearch] = useState(""),
    [selected, setSelected] = useState<{
      kind: string;
      record: Row;
      recordIds?: string[];
    } | null>(null),
    [form, setForm] = useState<{ kind: Kind; record?: Row } | null>(null),
    [gateForm, setGateForm] = useState<{
      subject: Row;
      gate: Row;
      assessment?: Row;
    } | null>(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("dependencies"),
    [adminTab, setAdminTab] = useState<Kind>("domains"),
    [settingsSection, setSettingsSection] = useState("inventory"),
    [savedName, setSavedName] = useState(""),
    [saveModal, setSaveModal] = useState(false),
    [reasonAction, setReasonAction] = useState<{
      action: string;
      record: Row;
    } | null>(null),
    [reason, setReason] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [importOpen, setImportOpen] = useState(false);
  const [changeForm, setChangeForm] = useState<
    { kind: ScopeKind; record: Row } | true | null
  >(null);
  const [agentContext, setAgentContext] = useState<{
    pid: string;
    context: AgentContext;
    title: string;
  } | null>(null);
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: () => api("programs"),
  });
  const activeId = pid || programs.data?.items?.[0]?.id;
  const query = useQuery({
    queryKey: ["state", activeId],
    queryFn: () => api("state", activeId),
    enabled: !!activeId,
  });
  const s = query.data;
  useEffect(() => {
    const saved = localStorage.getItem("mct-theme");
    function restoreLocation() {
      const loc = workspaceLocation(location.search);
      setPage(loc.view);
      setPid(loc.program);
      const filters = new URLSearchParams(location.search);
      setDomain(filters.get("domain") || "");
      setStream(filters.get("stream") || "");
      setRelease(filters.get("release") || "");
      setArea(filters.get("area") || "");
      setSquad(filters.get("squad") || "");
      setLayer(filters.get("layer") || "");
      setOwner(filters.get("owner") || "");
      setSearch(filters.get("search") || "");
      setAgentContext(null);
      setSelected(null);
      setForm(null);
      setMobileNav(false);
      if (loc.orange) setTheme("orange");
      if (["dependencies", "raid", "decisions"].includes(loc.section))
        setTab(loc.section);
      if (loc.view === "settings") {
        if (
          ["access", "catalogs", "policy", "operations"].includes(loc.section)
        )
          setSettingsSection(loc.section);
        else {
          setSettingsSection("inventory");
          if (
            [
              "domains",
              "workstreams",
              "areas",
              "squads",
              "programs",
              "components",
              "suppliers",
              "contracts",
            ].includes(loc.section)
          )
            setAdminTab(loc.section as Kind);
        }
      }
    }
    const restore = setTimeout(() => {
      if (saved && ["dark", "light", "orange"].includes(saved)) setTheme(saved);
      const nav = localStorage.getItem("mct-navigation");
      if (nav === "expanded" || nav === "collapsed") setNavigationMode(nav);
      const dens = localStorage.getItem("mct-density");
      if (dens === "compact" || dens === "comfortable") setDensity(dens);
      restoreLocation();
      setThemeReady(true);
    }, 0);
    window.addEventListener("popstate", restoreLocation);
    return () => {
      clearTimeout(restore);
      window.removeEventListener("popstate", restoreLocation);
    };
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mct-theme", theme);
    document.title = "Modernization Control Tower";
  }, [theme, themeReady]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  function navigate(id: string, section?: string) {
    setAgentContext(null);
    if (activeId && !pid) setPid(activeId);
    setPage(id);
    setSelected(null);
    setForm(null);
    setMobileNav(false);
    const targetSection =
      section ||
      (id === "dependencies"
        ? tab
        : id === "settings"
          ? settingsSection === "inventory"
            ? adminTab
            : settingsSection
          : undefined);
    const url = workspaceURL(location.href, id, activeId, targetSection);
    if (url.href !== location.href) history.pushState(null, "", url);
  }
  useEffect(() => {
    if (!themeReady) return;
    const url = new URL(location.href);
    if (workspaceLocation(url.search).view !== page) return;
    for (const [key, value] of Object.entries({
      domain,
      stream,
      release,
      area,
      squad,
      layer,
      owner,
      search,
    })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== location.href) history.replaceState(null, "", url);
  }, [
    themeReady,
    page,
    domain,
    stream,
    release,
    area,
    squad,
    layer,
    owner,
    search,
  ]);
  function changeTheme(value: string) {
    setTheme(value);
  }
  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["state", activeId] });
    queryClient.invalidateQueries({ queryKey: ["programs"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }
  async function operation(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      refresh();
      setToast(message);
    } catch (e) {
      setToast(`Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  const visibleDeliverables = useMemo(
    () =>
      s
        ? filterDeliverables(s, s.deliverables, {
            domain,
            stream,
            release,
            area,
            squad,
            layer,
            owner,
            search,
          })
        : [],
    [s, domain, stream, release, area, squad, layer, owner, search],
  );
  const filterable = [
    "overview",
    "fronts",
    "capabilities",
    "deliverables",
    "priorities",
    "readiness",
    "evidence",
    "architecture",
    "delivery",
    "dependencies",
  ].includes(page);
  const scopedState = s
    ? contextualState(s, visibleDeliverables, {
        domain,
        stream,
        release,
        area,
        squad,
        layer,
        owner,
        search,
      })
    : s;
  const readinessState = s ? { ...s, deliverables: visibleDeliverables } : s;
  const visibleNodeIds = new Set(
    s?.nodes
      .filter((n: Row) => visibleDeliverables.some((d) => d.id === n.entity_id))
      .map((n: Row) => n.id) || [],
  );
  function openProject(
    id: string,
    front = "",
    target = front ? "deliverables" : "overview",
  ) {
    setPid(id);
    setDomain("");
    setStream(front);
    setRelease("");
    setArea("");
    setSquad("");
    setLayer("");
    setOwner("");
    setSearch("");
    setSelected(null);
    setPage(target);
    setMobileNav(false);
    const url = workspaceURL(
      location.href,
      target,
      id,
      target === "settings"
        ? settingsSection === "inventory"
          ? adminTab
          : settingsSection
        : target === "dependencies"
          ? tab
          : undefined,
    );
    for (const key of [
      "domain",
      "stream",
      "release",
      "area",
      "squad",
      "layer",
      "owner",
      "search",
    ])
      url.searchParams.delete(key);
    if (front) url.searchParams.set("stream", front);
    if (url.href !== location.href) history.pushState(null, "", url);
  }
  function select(kind: string, record: Row, records?: Row[]) {
    setSelected({
      kind,
      record,
      ...(records ? { recordIds: records.map((r) => r.id) } : {}),
    });
  }
  const filters = {
    domain,
    stream,
    release,
    area,
    squad,
    layer,
    owner,
    search,
  };
  function removeFilter(key: keyof TowerFilters) {
    const setters = {
      domain: setDomain,
      stream: setStream,
      release: setRelease,
      area: setArea,
      squad: setSquad,
      layer: setLayer,
      owner: setOwner,
      search: setSearch,
    };
    setters[key]("");
    if (key === "area") setSquad("");
  }
  function clearFilters() {
    for (const key of Object.keys(filters) as (keyof TowerFilters)[])
      removeFilter(key);
  }
  function openAgent(
    selection?: string[],
    subject?: { kind: string; id: string; name?: string },
  ) {
    setAgentContext({
      pid: activeId,
      title: subject?.name || title,
      context: {
        view: page,
        intent: "FILL",
        filters: filterable ? filters : {},
        ...(selection ? { selection } : {}),
        ...(subject ? { subject: { kind: subject.kind, id: subject.id } } : {}),
      },
    });
  }
  const detailCandidates: Row[] = selected
    ? (filterable ? scopedState : s)?.[selected.kind] || []
    : [];
  const detailById = new Map(detailCandidates.map((r) => [r.id, r]));
  const detailRecords = selected?.recordIds
    ? selected.recordIds
        .map((id) => detailById.get(id))
        .filter((r): r is Row => !!r)
    : detailCandidates;
  const detailIndex = detailRecords.findIndex(
    (r) => r.id === selected?.record.id,
  );

  const title = NAV.find((n) => n.id === page)?.name || "Tela não encontrada";
  const titleInfo: Record<string, string> = {
    overview: "A visão completa. As decisões que importam.",
    projects: "Projetos, frentes e responsabilidade em uma visão consolidada.",
    fronts:
      "Desenvolvimento, negócio e infraestrutura conectados ao mesmo objetivo.",
    capabilities: "Do escopo à evidência, sem perder o contexto.",
    architecture: "Sistemas conectados. Impactos visíveis.",
    deliverables: "Compromissos verificáveis, dimensões independentes.",
    delivery: "O compromisso original e a previsão de agora.",
    priorities:
      "Uma sequência clara. Decisões conscientes. Trabalho que avança.",
    scope: "Escopo aprovado, impacto conhecido e decisão rastreável.",
    dependencies: "Antecipe os bloqueios. Conecte os responsáveis.",
    readiness: "Desenvolvido não significa pronto para produção.",
    evidence: "Comprovação rastreável, com origem e versão.",
    reports: "Uma observação imutável. Um relato reproduzível.",
    intelligence: "Fontes verificáveis. Hipóteses explícitas.",
    agents: "Exporte contexto, preencha com IA e revise antes de aplicar.",
    integrations: "Múltiplas fontes. Uma governança consistente.",
    audit: "Cada mudança tem uma história.",
    settings: "Estruture o programa e sua responsabilidade.",
  };
  const createKind: Kind =
    page === "fronts"
      ? "workstreams"
      : page === "architecture"
        ? "components"
        : page === "delivery"
          ? "releases"
          : page === "dependencies"
            ? (tab as Kind)
            : page === "integrations"
              ? "connections"
              : page === "settings"
                ? adminTab
                : page === "capabilities"
                  ? "capabilities"
                  : page === "evidence"
                    ? "evidence"
                    : "deliverables";
  function newRecord() {
    setForm({ kind: createKind });
  }
  const current = s?.programs?.[0];
  return (
    <div
      className="app-shell"
      data-navigation={navigationMode}
      data-density={density}
    >
      <WorkspaceNavigation
        items={NAV}
        page={page}
        theme={theme}
        mobileOpen={mobileNav}
        userName={user.name}
        mode={navigationMode}
        onModeChange={(value) => {
          setNavigationMode(value);
          localStorage.setItem("mct-navigation", value);
        }}
        onCloseMobile={() => setMobileNav(false)}
        onNavigate={navigate}
        onThemeChange={() => changeTheme(theme === "dark" ? "light" : "dark")}
        onLogout={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/login");
          router.refresh();
        }}
      />
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-brand">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Abrir navegação"
              aria-expanded={mobileNav}
              aria-controls="mobile-workspace-navigation"
            >
              <Layers3 size={20} />
            </button>
            <span className="wordmark">
              control<span>tower</span>
              <i />
            </span>
            <span className="slash">/</span>
            <div className="program-picker">
              <span className="program-icon">A</span>
              <select
                aria-label="Programa atual"
                value={activeId || ""}
                onChange={(e) => openProject(e.target.value, "", page)}
              >
                {programs.data?.items?.map((p: Row) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <span className="program-label">PROGRAMA</span>
          </div>
          <div className="topbar-actions">
            <select
              className="theme-picker"
              aria-label="Tema visual"
              value={theme}
              onChange={(e) => changeTheme(e.target.value)}
            >
              <option value="dark">Grafite</option>
              <option value="light">Claro</option>
              <option value="orange">Orange</option>
            </select>
            <button
              className="search-trigger"
              aria-label="Buscar ou executar"
              onClick={() => setCommand(true)}
            >
              <Search size={15} />
              <span>Buscar ou executar…</span>
              <kbd>⌘ K</kbd>
            </button>
            {activeId && (
              <NotificationCenter
                pid={activeId}
                timezone={s?.programs[0]?.timezone}
              />
            )}
            <span className="topbar-divider" />
            <span className="workspace-live">
              <i />
              Ambiente local
            </span>
            <button
              className="icon-button"
              onClick={() => refresh()}
              aria-label="Atualizar dados"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        {current?.demo && (
          <div
            className="demo-banner"
            role="region"
            aria-label="Ambiente de demonstração"
          >
            <span>
              <span className="tiny-dot" /> AMBIENTE DE DEMONSTRAÇÃO
            </span>
            <span>
              Base de demonstração · PostgreSQL persistente ·{" "}
              {s?.connections.length || 0}{" "}
              {s?.connections.length === 1
                ? "fonte cadastrada"
                : "fontes cadastradas"}
            </span>
            <span>{s?.roles.map((r: Row) => label(r.role)).join(" · ")}</span>
          </div>
        )}
        <main id="main-content" data-view={page}>
          {s &&
          page !== "projects" &&
          VIEWS.includes(page as (typeof VIEWS)[number]) ? (
            <ProjectContext
              s={s}
              page={page}
              density={density}
              navigate={navigate}
              onDensity={(value) => {
                setDensity(value);
                localStorage.setItem("mct-density", value);
              }}
            />
          ) : (
            <ViewBreadcrumb code={current?.code} title={title} />
          )}
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-dot" />
                {page === "overview"
                  ? "INTELIGÊNCIA DO PROGRAMA"
                  : page === "capabilities"
                    ? "ARQUITETURA & ESCOPO"
                    : "MODERNIZATION CONTROL"}
              </div>
              <h1>{title}</h1>
              <p>{titleInfo[page]}</p>
            </div>
            <div className="page-actions">
              {s &&
                page !== "projects" &&
                VIEWS.includes(page as (typeof VIEWS)[number]) && (
                  <button className="button" onClick={() => openAgent()}>
                    <Sparkles size={15} />
                    IA desta visão
                  </button>
                )}
              {page === "overview" || page === "reports" ? (
                <button
                  className="button"
                  disabled={busy || !s || !canEdit(s.roles, "snapshots")}
                  onClick={() =>
                    operation(
                      () => api("snapshots", activeId, "POST", {}),
                      "Snapshot imutável criado.",
                    )
                  }
                >
                  <FileBarChart2 size={15} />
                  Criar snapshot
                  <ArrowUpRight size={14} />
                </button>
              ) : (
                ![
                  "audit",
                  "scope",
                  "priorities",
                  "projects",
                  "intelligence",
                  "agents",
                  "readiness",
                ].includes(page) &&
                (page !== "settings" || settingsSection === "inventory") && (
                  <button
                    className="button primary"
                    disabled={
                      !s ||
                      !canEdit(
                        s.roles,
                        createKind,
                        stream ||
                          s.roles.find((r: Row) => r.workstream_id)
                            ?.workstream_id,
                      )
                    }
                    onClick={newRecord}
                  >
                    <Plus size={16} />
                    {page === "fronts"
                      ? "Nova frente"
                      : page === "capabilities"
                        ? "Nova capacidade"
                        : page === "integrations"
                          ? "Nova conexão"
                          : "Novo registro"}
                  </button>
                )
              )}
            </div>
          </section>
          <div className={`context-bar ${!filterable ? "context-hidden" : ""}`}>
            <div className="filter-bar-heading">
              <button
                className="button small"
                aria-expanded={filterControlsOpen}
                aria-controls="workspace-filter-controls"
                onClick={() => setFilterControlsOpen((v) => !v)}
              >
                <SlidersHorizontal size={14} />
                {filterControlsOpen ? "Recolher filtros" : "Mostrar filtros"}
              </button>
              <span className="muted">
                Recorte de entregas · {visibleDeliverables.length}/
                {s?.deliverables.length || 0}
              </span>
              <span className="data-asof">
                <Clock size={12} />
                Dados consultados {s ? fullDate(s.asOf) : "…"}
              </span>
            </div>
            {filterControlsOpen && (
              <div className="filter-set" id="workspace-filter-controls">
                <SlidersHorizontal size={15} />
                <select
                  aria-label="Filtrar por domínio"
                  disabled={!filterable && page !== "architecture"}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="">Todos os domínios</option>
                  {s?.domains.map((d: Row) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="filter-divider" />
                <select
                  aria-label="Filtrar por frente"
                  disabled={!filterable}
                  value={stream}
                  onChange={(e) => setStream(e.target.value)}
                >
                  <option value="">Todas as frentes</option>
                  {s?.workstreams.map((d: Row) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="filter-divider" />
                <select
                  aria-label="Filtrar por release"
                  disabled={!filterable && page !== "delivery"}
                  value={release}
                  onChange={(e) => setRelease(e.target.value)}
                >
                  <option value="">Todas as releases</option>
                  {s?.releases.map((d: Row) => (
                    <option key={d.id} value={d.id}>
                      {d.code}
                    </option>
                  ))}
                </select>
                <span className="filter-divider" />
                <select
                  aria-label="Filtrar por área"
                  disabled={!filterable}
                  value={area}
                  onChange={(e) => {
                    setArea(e.target.value);
                    setSquad("");
                  }}
                >
                  <option value="">Todas as áreas</option>
                  <option value={UNASSIGNED}>Sem área</option>
                  {s?.areas.map((a: Row) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar por squad"
                  disabled={!filterable}
                  value={squad}
                  onChange={(e) => setSquad(e.target.value)}
                >
                  <option value="">Todos os squads</option>
                  <option value={UNASSIGNED}>Sem squad</option>
                  {s?.squads
                    .filter(
                      (q: Row) => !area || !q.area_id || q.area_id === area,
                    )
                    .map((q: Row) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="Filtrar por camada"
                  disabled={!filterable}
                  value={layer}
                  onChange={(e) => setLayer(e.target.value)}
                >
                  <option value="">Todas as camadas</option>
                  {[
                    ...new Set<string>(
                      s?.deliverables
                        .map((d: Row) => d.layer)
                        .filter(Boolean) || [],
                    ),
                  ]
                    .sort()
                    .map((l) => (
                      <option key={l} value={l}>
                        {label(l)}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="Filtrar por responsável"
                  disabled={!filterable}
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="">Todos os responsáveis</option>
                  <option value={UNASSIGNED}>Sem responsável</option>
                  {s?.users.map((u: Row) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
                {(domain ||
                  stream ||
                  release ||
                  area ||
                  squad ||
                  layer ||
                  owner ||
                  search) && (
                  <button
                    className="icon-button"
                    aria-label="Limpar filtros"
                    onClick={() => {
                      setDomain("");
                      setStream("");
                      setRelease("");
                      setArea("");
                      setSquad("");
                      setLayer("");
                      setOwner("");
                      setSearch("");
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  className="icon-button"
                  title="Salvar visão"
                  aria-label="Salvar filtros"
                  onClick={() => setSaveModal(true)}
                >
                  <Bookmark size={14} />
                </button>
                {s?.savedViews.length > 0 && (
                  <select
                    aria-label="Visões salvas"
                    defaultValue=""
                    onChange={(e) => {
                      const view = s.savedViews.find(
                        (v: Row) => v.id === e.target.value,
                      );
                      if (view) {
                        setDomain(view.filters.domain || "");
                        setStream(view.filters.stream || "");
                        setRelease(view.filters.release || "");
                        setArea(view.filters.area || "");
                        setSquad(view.filters.squad || "");
                        setLayer(view.filters.layer || "");
                        setOwner(view.filters.owner || "");
                        setSearch(view.filters.search || "");
                        navigate(view.filters.page || page);
                      }
                    }}
                  >
                    <option value="">Visões salvas</option>
                    {s.savedViews.map((v: Row) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
          {s && filterable && (
            <ActiveFilters
              s={s}
              filters={filters}
              visible={visibleDeliverables.length}
              onRemove={removeFilter}
              onClear={clearFilters}
            />
          )}
          {(query.isLoading || programs.isLoading) && (
            <div className="loading" role="status">
              <div className="shimmer" />
              <div className="shimmer" />
              <p>Conectando os pontos do programa…</p>
            </div>
          )}
          {(query.error || programs.error) && (
            <div className="error" role="alert">
              <strong>Não foi possível carregar o programa.</strong>
              <p>{(query.error || programs.error)?.message}</p>
              <button className="button" onClick={refresh}>
                Tentar novamente
              </button>
            </div>
          )}
          {s && (
            <>
              {!VIEWS.includes(page as (typeof VIEWS)[number]) && (
                <div className="ct-panel">
                  <h2>Esta tela não existe</h2>
                  <p>Escolha um módulo na navegação ou na busca.</p>
                  <button
                    className="button"
                    onClick={() => navigate("projects")}
                  >
                    Abrir projetos
                  </button>
                </div>
              )}
              {page === "projects" && (
                <ProjectPortfolio
                  canCreate={canEdit(s.roles, "programs")}
                  onCreate={() => setForm({ kind: "programs" })}
                  onOpen={openProject}
                />
              )}
              {page === "fronts" && (
                <FrontWorkspace
                  s={s}
                  deliverables={visibleDeliverables}
                  stream={stream}
                  select={select}
                  onOpen={(id) => {
                    setStream(id);
                    navigate("deliverables");
                  }}
                />
              )}
              {page === "overview" && (
                <Overview
                  key={activeId}
                  s={s}
                  deliverables={visibleDeliverables}
                  select={select}
                  navigate={navigate}
                  userId={user.id}
                  onSaved={refresh}
                  capabilities={scopedState.capabilities}
                  onProject={openProject}
                />
              )}
              {page === "capabilities" && (
                <CapabilityMap
                  s={s}
                  deliverables={visibleDeliverables}
                  domain={domain}
                  stream={stream}
                  search={search}
                  restrictToDeliverables={
                    !!(stream || release || area || squad || layer || owner)
                  }
                  setSearch={setSearch}
                  select={select}
                />
              )}
              {page === "architecture" && (
                <Architecture
                  s={scopedState}
                  select={select}
                  domain={domain}
                  onCreate={(kind) => setForm({ kind })}
                />
              )}
              {page === "deliverables" && (
                <>
                  <div className="section-toolbar">
                    <button
                      className="button small"
                      disabled={
                        !canEdit(
                          s.roles,
                          "deliverables",
                          stream ||
                            s.roles.find((r: Row) => r.workstream_id)
                              ?.workstream_id,
                        )
                      }
                      onClick={() => setImportOpen(true)}
                    >
                      <Plus size={14} />
                      Importar CSV / XLSX
                    </button>
                    <div className="view-tabs">
                      <button className="selected">
                        Todos os entregáveis{" "}
                        <span>{visibleDeliverables.length}</span>
                      </button>
                    </div>
                    <div className="inline-search">
                      <Search size={14} />
                      <input
                        aria-label="Buscar entregáveis"
                        placeholder="Buscar entregável…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      className="button small"
                      onClick={() =>
                        download(
                          "entregaveis.csv",
                          toCSV(visibleDeliverables),
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      <Download size={14} />
                      Exportar
                    </button>
                  </div>
                  <DeliverableSelection
                    key={`${activeId}:${JSON.stringify(filters)}`}
                    s={s}
                    pid={activeId}
                    items={visibleDeliverables}
                    select={select}
                    onSaved={() => {
                      refresh();
                      setToast("Lote aplicado e auditado.");
                    }}
                    onAI={(ids) => openAgent(ids)}
                  />
                </>
              )}
              <div hidden={page !== "priorities"}>
                <PriorityWorkspace
                  key={activeId}
                  s={s}
                  pid={activeId}
                  domain={domain}
                  stream={stream}
                  release={release}
                  area={area}
                  squad={squad}
                  layer={layer}
                  owner={owner}
                  select={select}
                  onSaved={refresh}
                />
              </div>
              {page === "delivery" && (
                <DeliveryHorizon s={scopedState} select={select} />
              )}
              {page === "delivery" && (
                <Delivery
                  s={scopedState}
                  release={release}
                  select={select}
                  operation={operation}
                  pid={activeId}
                  busy={busy}
                  newMilestone={() => setForm({ kind: "milestones" })}
                  userId={user.id}
                  onRefresh={() => {
                    refresh();
                    setToast("Baseline atualizada e auditada.");
                  }}
                />
              )}
              {page === "delivery" && (
                <PlanningWorkspace
                  key={`${activeId}:${JSON.stringify(filters)}`}
                  s={scopedState}
                  pid={activeId}
                  select={select}
                  onSaved={() => {
                    refresh();
                    setToast("Planejamento atualizado e auditado.");
                  }}
                  onAI={(ids) => openAgent(ids)}
                />
              )}
              {page === "dependencies" && (
                <>
                  <div className="section-toolbar">
                    <div className="view-tabs">
                      {["dependencies", "raid", "decisions"].map((t) => (
                        <button
                          key={t}
                          className={tab === t ? "selected" : ""}
                          onClick={() => {
                            setTab(t);
                            navigate("dependencies", t);
                          }}
                        >
                          {TITLES[t]} <span>{s[t].length}</span>
                        </button>
                      ))}
                    </div>
                    <span className="muted small-text">
                      Dependências conectadas ao recorte · RAID por frente ·
                      decisões do programa
                    </span>
                  </div>
                  <DataTable
                    items={scopedState[tab]}
                    columns={genericColumns(tab, s)}
                    onSelect={(r, records) => select(tab, r, records)}
                  />
                  {tab === "dependencies" && (
                    <DependencyGraph s={scopedState} select={select} />
                  )}
                </>
              )}
              {page === "scope" && (
                <ChangeControl
                  s={s}
                  pid={activeId}
                  userId={user.id}
                  onNew={() => setChangeForm(true)}
                  onSaved={() => {
                    refresh();
                    setToast("Change control atualizado e auditado.");
                  }}
                />
              )}
              {page === "readiness" && (
                <Readiness
                  s={readinessState}
                  release={release}
                  select={select}
                  assessGate={setGateForm}
                />
              )}
              {page === "evidence" && (
                <DataTable
                  items={
                    domain ||
                    stream ||
                    release ||
                    area ||
                    squad ||
                    layer ||
                    owner
                      ? s.evidence.filter((e: Row) =>
                          visibleNodeIds.has(e.subject_node_id),
                        )
                      : s.evidence
                  }
                  columns={genericColumns("evidence", s)}
                  onSelect={(r, records) => select("evidence", r, records)}
                />
              )}
              {page === "reports" && (
                <Reports
                  s={s}
                  select={select}
                  pid={activeId}
                  userId={user.id}
                  onSaved={refresh}
                />
              )}
              {page === "intelligence" && (
                <IntelligenceWorkspace
                  key={activeId}
                  s={s}
                  pid={activeId}
                  select={select}
                />
              )}
              {page === "agents" && (
                <AgentWorkspace
                  key={activeId}
                  s={s}
                  pid={activeId}
                  onSaved={refresh}
                />
              )}
              {page === "integrations" && (
                <IntegrationWorkspace
                  key={activeId}
                  s={s}
                  pid={activeId}
                  select={select}
                  onSaved={refresh}
                />
              )}
              {page === "audit" && (
                <Audit events={s.audit} timezone={s.programs[0]?.timezone} />
              )}
              {page === "settings" && (
                <>
                  <div className="section-toolbar">
                    <div
                      className="view-tabs"
                      aria-label="Seções da administração"
                    >
                      {[
                        ["inventory", "Estrutura"],
                        ["access", "Acessos"],
                        ["catalogs", "Catálogos & DoD"],
                        ["policy", "Políticas"],
                        ["operations", "Operação"],
                      ].map(([id, name]) => (
                        <button
                          key={id}
                          className={settingsSection === id ? "selected" : ""}
                          onClick={() => {
                            setSettingsSection(id);
                            navigate(
                              "settings",
                              id === "inventory" ? adminTab : id,
                            );
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {settingsSection === "inventory" && (
                    <>
                      <div className="section-toolbar">
                        <div className="view-tabs">
                          {[
                            "domains",
                            "workstreams",
                            "areas",
                            "squads",
                            "programs",
                            "components",
                            "suppliers",
                            "contracts",
                          ].map((k) => (
                            <button
                              key={k}
                              className={adminTab === k ? "selected" : ""}
                              onClick={() => {
                                setAdminTab(k as Kind);
                                navigate("settings", k);
                              }}
                            >
                              {TITLES[k]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <DataTable
                        items={s[adminTab]}
                        columns={genericColumns(adminTab, s)}
                        onSelect={(r, records) => select(adminTab, r, records)}
                      />
                    </>
                  )}
                  {settingsSection === "access" && (
                    <AccessWorkspace s={s} pid={activeId} onSaved={refresh} />
                  )}
                  {settingsSection === "catalogs" && (
                    <CatalogWorkspace s={s} pid={activeId} onSaved={refresh} />
                  )}
                  {settingsSection === "policy" && (
                    <ProgramPolicy
                      key={`${activeId}:${s.programs[0].version}`}
                      s={s}
                      pid={activeId}
                      onSaved={refresh}
                    />
                  )}
                  {settingsSection === "operations" && (
                    <OperationsPanel s={s} pid={activeId} />
                  )}
                  <div className="policy-note">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>Governança por contexto</strong>
                      <p>
                        Permissões são verificadas no backend por programa e
                        frente. Administrador não recebe alçada de gate
                        automaticamente. OIDC, retenção e políticas corporativas
                        devem ser validados antes de produção.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          {!programs.isLoading && programs.data?.items.length === 0 && (
            <Empty text="Sua identidade não possui acesso a programas. Solicite atribuição ao administrador." />
          )}
          <footer className="workspace-footer">
            <span>
              <Layers3 size={12} /> MODERNIZATION CONTROL TOWER
            </span>
            <span>
              Fórmulas {s?.formulaVersion || "mct-1.0.0"} · Fonte: PostgreSQL ·{" "}
              {current?.timezone || "America/Sao_Paulo"} · Cobertura do
              universo:{" "}
              {s?.inventoryCoverage?.percentage != null
                ? `${s.inventoryCoverage.percentage}% (${s.inventoryCoverage.numerator}/${s.inventoryCoverage.denominator} estimados)`
                : s?.inventoryCoverage?.status === "ESTIMATE_OUTDATED"
                  ? "estimativa desatualizada"
                  : "desconhecida"}
            </span>
            <span>v0.1 · desenvolvimento</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.startsWith("Erro:") ? "toast-error" : ""}`}
          role="status"
        >
          {toast.startsWith("Erro:") ? (
            <AlertTriangle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {importOpen && (
        <ImportForm
          pid={activeId}
          onClose={() => setImportOpen(false)}
          onSaved={() => {
            refresh();
            setToast("Importação concluída e auditada.");
          }}
        />
      )}
      {form && s && (
        <EntityForm
          key={`${form.kind}-${form.record?.id || "new"}`}
          kind={form.kind}
          record={form.record}
          state={s}
          pid={activeId}
          onClose={() => setForm(null)}
          onSaved={() => {
            refresh();
            setToast("Registro salvo e alteração auditada.");
          }}
        />
      )}
      {gateForm && s && (
        <GateForm
          {...gateForm}
          state={s}
          pid={activeId}
          onClose={() => setGateForm(null)}
          onSaved={() => {
            refresh();
            setToast("Avaliação registrada.");
          }}
        />
      )}
      {selected && s && (
        <Detail
          selected={selected}
          s={s}
          userId={user.id}
          onSaved={refresh}
          onAgent={
            Object.hasOwn(AGENT_FIELDS, selected.kind) ||
            selected.kind === "observations"
              ? (kind, r) =>
                  openAgent(undefined, {
                    kind,
                    id: r.id,
                    name: r.name || r.title || r.code,
                  })
              : undefined
          }
          position={
            detailIndex >= 0
              ? { index: detailIndex, total: detailRecords.length }
              : undefined
          }
          onPrevious={
            detailIndex > 0
              ? () =>
                  setSelected({
                    ...selected,
                    record: detailRecords[detailIndex - 1],
                  })
              : undefined
          }
          onNext={
            detailIndex >= 0 && detailIndex < detailRecords.length - 1
              ? () =>
                  setSelected({
                    ...selected,
                    record: detailRecords[detailIndex + 1],
                  })
              : undefined
          }
          onClose={() => setSelected(null)}
          onEdit={(kind, record) => setForm({ kind: kind as Kind, record })}
          onSelect={select}
          onGate={setGateForm}
          onChangeScope={(kind, record) => {
            setSelected(null);
            setChangeForm({ kind, record });
          }}
          onAction={(action, record) => {
            setReason("");
            setReasonAction({ action, record });
          }}
        />
      )}
      {changeForm && s && (
        <ChangeForm
          s={s}
          pid={activeId}
          initial={changeForm === true ? undefined : changeForm}
          onClose={() => setChangeForm(null)}
          onSaved={() => {
            refresh();
            navigate("scope");
            setToast("Solicitação enviada para revisão.");
          }}
        />
      )}
      {agentContext && s && agentContext.pid === activeId && (
        <ContextAgent
          key={JSON.stringify(agentContext)}
          s={s}
          pid={activeId}
          context={agentContext.context}
          title={agentContext.title}
          onClose={() => setAgentContext(null)}
          onSaved={() => {
            refresh();
            setToast("Preenchimento aplicado e auditado.");
          }}
        />
      )}
      {saveModal && (
        <Modal
          open
          onClose={() => setSaveModal(false)}
          title="Salvar visão"
          description="Guarde os filtros deste programa para sua identidade."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              operation(
                () =>
                  api("saved-views", activeId, "POST", {
                    name: savedName,
                    filters: {
                      domain,
                      stream,
                      release,
                      area,
                      squad,
                      layer,
                      owner,
                      search,
                      page,
                    },
                  }),
                "Visão salva.",
              );
              setSaveModal(false);
            }}
          >
            <label>
              Nome da visão
              <input
                autoFocus
                required
                minLength={2}
                value={savedName}
                onChange={(e) => setSavedName(e.target.value)}
              />
            </label>
            <button className="button primary" style={{ marginTop: 20 }}>
              Salvar filtros
            </button>
          </form>
        </Modal>
      )}
      {reasonAction && (
        <Modal
          open
          onClose={() => setReasonAction(null)}
          title={
            reasonAction.action === "delete"
              ? "Excluir registro"
              : reasonAction.action === "accept"
                ? "Registrar aceite"
                : reasonAction.action === "approve-release"
                  ? "Autorizar release"
                  : "Avançar estágio"
          }
          description="A operação será validada e registrada na trilha de auditoria."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const { action, record } = reasonAction;
              if (action === "delete")
                operation(
                  () =>
                    api(
                      `${selected?.kind}/${record.id}`,
                      activeId,
                      "DELETE",
                      undefined,
                      Number(record.version),
                    ),
                  "Registro excluído.",
                );
              else if (action === "approve-release")
                operation(
                  () =>
                    api(`releases/${record.id}/approve`, activeId, "POST", {
                      reason,
                      expectedVersion: Number(record.version),
                    }),
                  "Release aprovada.",
                );
              else if (action === "accept")
                operation(
                  () =>
                    api(`deliverables/${record.id}/accept`, activeId, "POST", {
                      reason,
                      expectedVersion: Number(record.version),
                    }),
                  "Aceite registrado.",
                );
              else
                operation(
                  () =>
                    api(
                      `deliverables/${record.id}/transitions`,
                      activeId,
                      "POST",
                      {
                        targetStage:
                          STAGES[STAGES.indexOf(record.delivery_stage) + 1],
                        reason,
                        expectedVersion: Number(record.version),
                      },
                    ),
                  "Estágio atualizado.",
                );
              setReasonAction(null);
              setSelected(null);
            }}
          >
            <p>
              {reasonAction.record.code} ·{" "}
              {reasonAction.record.name || reasonAction.record.title}
            </p>
            {reasonAction.action === "delete" ? (
              <p className="warning-text">
                Registros com vínculos serão protegidos contra exclusão.
              </p>
            ) : (
              <label>
                Justificativa *
                <textarea
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setReasonAction(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                Confirmar
              </button>
            </div>
          </form>
        </Modal>
      )}
      <Modal
        open={command}
        onClose={() => setCommand(false)}
        title="Buscar e navegar"
        description="Frentes, capacidades, entregáveis, componentes, releases, dependências e decisões. Atalho ⌘ K."
      >
        <div className="command-search">
          <Search size={18} />
          <input
            autoFocus
            placeholder="O que você procura?"
            value={commandSearch}
            onChange={(e) => setCommandSearch(e.target.value)}
            aria-label="Busca global"
          />
        </div>
        <div className="command-results">
          {NAV.filter((n) =>
            n.name.toLowerCase().includes(commandSearch.toLowerCase()),
          ).map((n) => (
            <button
              key={n.id}
              onClick={() => {
                navigate(n.id);
                setCommand(false);
              }}
            >
              <n.icon size={17} />
              <span>{n.name}</span>
              <ArrowRight size={14} />
            </button>
          ))}
          {s &&
            [
              "workstreams",
              "capabilities",
              "deliverables",
              "releases",
              "components",
              "dependencies",
              "decisions",
            ].flatMap((kind) =>
              s[kind]
                .filter(
                  (r: Row) =>
                    commandSearch &&
                    `${r.code || ""} ${r.name || r.description}`
                      .toLowerCase()
                      .includes(commandSearch.toLowerCase()),
                )
                .slice(0, 8)
                .map((r: Row) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      select(kind, r);
                      setCommand(false);
                    }}
                  >
                    <Search size={15} />
                    <span>
                      <small>
                        {TITLES[kind]} · {r.code}
                      </small>
                      {r.name || r.description}
                    </span>
                    <ChevronRight size={14} />
                  </button>
                )),
            )}
        </div>
      </Modal>
    </div>
  );
}
