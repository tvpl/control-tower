"use client";
import { useEffect, useState } from "react";
import {
  Layers3,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/dialog";
type NavItem = { id: string; name: string; icon: LucideIcon };
const GROUPS = [
  {
    name: "Projetos",
    ids: ["projects", "overview", "fronts", "capabilities", "architecture"],
  },
  {
    name: "Execução",
    ids: ["deliverables", "delivery", "priorities", "dependencies"],
  },
  { name: "Governança", ids: ["readiness", "evidence", "scope", "reports"] },
  {
    name: "Ferramentas",
    ids: ["intelligence", "agents", "integrations", "audit", "settings"],
  },
];
export type NavigationMode = "auto" | "expanded" | "collapsed";
export function WorkspaceNavigation({
  items,
  page,
  theme,
  mobileOpen,
  userName,
  mode,
  onModeChange,
  onCloseMobile,
  onNavigate,
  onThemeChange,
  onLogout,
}: {
  items: NavItem[];
  page: string;
  theme: string;
  mobileOpen: boolean;
  userName: string;
  mode: NavigationMode;
  onModeChange: (mode: NavigationMode) => void;
  onCloseMobile: () => void;
  onNavigate: (id: string) => void;
  onThemeChange: () => void;
  onLogout: () => void;
}) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1181px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const expanded = mode === "expanded" || (mode === "auto" && wide);
  function content(mobile: boolean) {
    return (
      <>
        <nav
          aria-label="Navegação principal"
          id={mobile ? "mobile-workspace-navigation" : "workspace-navigation"}
        >
          {GROUPS.map((group) => (
            <div className="nav-group" key={group.name}>
              <div className="nav-group-label">
                <span>{group.name}</span>
                <small>{group.ids.length}</small>
              </div>
              {group.ids.map((id) => {
                const n = items.find((item) => item.id === id);
                if (!n) return null;
                return (
                  <button
                    key={id}
                    data-destination={id}
                    title={n.name}
                    aria-label={n.name}
                    aria-current={page === id ? "page" : undefined}
                    className={`rail-item ${page === id ? "active" : ""}`}
                    onClick={() => onNavigate(id)}
                  >
                    <n.icon size={18} />
                    <span className="nav-item-name">{n.name}</span>
                    {page === id && <i />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="rail-bottom">
          <button
            className="rail-item"
            onClick={onThemeChange}
            aria-label="Alternar tema"
            title="Alternar tema"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span className="nav-item-name">
              {theme === "orange"
                ? "Tema Orange"
                : theme === "dark"
                  ? "Tema Grafite"
                  : "Tema Claro"}
            </span>
          </button>
          <button
            className="nav-account"
            aria-label={`Sair da conta de ${userName}`}
            title="Sair"
            onClick={onLogout}
          >
            <span className="avatar" aria-hidden="true">
              {userName
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="nav-account-copy">
              <strong>{userName}</strong>
              <small>Sair da conta</small>
            </span>
            <LogOut size={15} className="nav-account-logout" />
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <aside className="rail workspace-sidebar">
        <div className="rail-brand">
          <button
            className="brand-symbol"
            onClick={() => onNavigate("overview")}
            aria-label="Início"
          >
            <Layers3 size={24} />
          </button>
          <span className="rail-brand-copy">
            control<strong>tower</strong>
            <small>Workspace de projetos</small>
          </span>
        </div>
        <button
          className="nav-collapse"
          aria-label={expanded ? "Recolher navegação" : "Expandir navegação"}
          aria-expanded={expanded}
          aria-controls="workspace-navigation"
          onClick={() => onModeChange(expanded ? "collapsed" : "expanded")}
        >
          {expanded ? (
            <PanelLeftClose size={17} />
          ) : (
            <PanelLeftOpen size={17} />
          )}
          <span>{expanded ? "Recolher menu" : "Expandir menu"}</span>
        </button>
        {content(false)}
      </aside>
      {mobileOpen && (
        <Modal
          open
          drawer
          className="navigation-dialog"
          title="Navegar pelo workspace"
          description="Escolha uma visão do projeto ou uma ferramenta."
          onClose={onCloseMobile}
        >
          <div className="workspace-sidebar navigation-mobile">
            {content(true)}
          </div>
        </Modal>
      )}
    </>
  );
}
