"use client";
import { useVirtualWindow } from "../virtual-window";
import { useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Download,
  GitBranch,
  ListOrdered,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canPrioritize,
  reorderVisible,
  type PriorityKind,
} from "@/server/domain/priorities";
import { api, download } from "../client";
import { fullDate } from "../presentation";
import { PriorityFocus } from "./priority-focus";
import { PriorityRow } from "./priority-row";
import {
  PriorityIntro,
  PriorityTabs,
  PrioritySaveBar,
} from "./priority-controls";
import { queueItems, matchesFilters } from "./model";
import { usePriorityOrder } from "./use-priority-order";
import { type Board, type QueueItem, type TowerState } from "./types";

export function PriorityWorkspace(props: {
  s: TowerState;
  pid: string;
  domain: string;
  stream: string;
  release: string;
  area: string;
  squad: string;
  layer: string;
  owner: string;
  select: (kind: string, record: TowerState) => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<PriorityKind>("deliverables");
  return (
    <PriorityBoardPanel
      key={`${props.pid}-${kind}`}
      {...props}
      kind={kind}
      onKindChange={setKind}
    />
  );
}
function PriorityBoardPanel({
  s,
  pid,
  kind,
  domain,
  stream,
  release,
  area,
  squad,
  layer,
  owner,
  select,
  onSaved,
  onKindChange,
}: {
  s: TowerState;
  pid: string;
  kind: PriorityKind;
  domain: string;
  stream: string;
  release: string;
  area: string;
  squad: string;
  layer: string;
  owner: string;
  select: (kind: string, record: TowerState) => void;
  onSaved: () => void;
  onKindChange: (kind: PriorityKind) => void;
}) {
  const board: Board = s.priorityBoards[kind];
  const order = usePriorityOrder(board);
  const items = queueItems(s, kind),
    byId = new Map(items.map((item) => [item.id, item]));
  const [search, setSearch] = useState(""),
    [onlyPending, setOnlyPending] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [dragged, setDragged] = useState<string | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null),
    [keyboardDrag, setKeyboardDrag] = useState<{
      id: string;
      before: string[];
    } | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const editable = canPrioritize(s.roles);
  const visibleIds = order.order.filter((id) => {
    const item = byId.get(id);
    return (
      item &&
      matchesFilters(item, s, {
        domain,
        stream,
        release,
        area,
        squad,
        layer,
        owner,
      }) &&
      (!onlyPending || !item.accepted) &&
      `${item.code} ${item.name} ${item.owner}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const visible = visibleIds.map((id) => byId.get(id)!);
  const windowed = useVirtualWindow(visible.length, 180, 600);
  const focus = byId.get(selected || "") || visible[0];
  const ranked = (id: string) =>
    order.dirty || order.source.savedIds.includes(id);
  function move(id: string, index: number) {
    if (!editable || saving || order.conflict) return;
    order.move(id, index, visibleIds);
    windowed.show(index);
    const changed = reorderVisible(
      order.order,
      visibleIds,
      visibleIds
        .filter((v) => v !== id)
        .toSpliced(Math.max(0, Math.min(index, visibleIds.length - 1)), 0, id),
    );
    order.setAnnouncement(
      `${byId.get(id)?.code} movido para a posição ${changed.indexOf(id) + 1} do programa. Alteração ainda não salva.`,
    );
    setError("");
  }
  function keyboard(e: KeyboardEvent, id: string) {
    if (!editable || saving || order.conflict) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (keyboardDrag) {
        setKeyboardDrag(null);
        order.setAnnouncement("Item solto. Salve a ordem para confirmar.");
      } else {
        setKeyboardDrag({ id, before: order.order });
        order.setAnnouncement(
          `${byId.get(id)?.code} selecionado para reordenar. Use as setas; Enter solta; Escape cancela.`,
        );
      }
    } else if (e.key === "Escape" && keyboardDrag) {
      e.preventDefault();
      order.change(keyboardDrag.before);
      setKeyboardDrag(null);
      order.setAnnouncement("Reordenação por teclado cancelada.");
    } else if (
      (keyboardDrag?.id === id || e.altKey) &&
      ["ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      e.preventDefault();
      const handle = e.currentTarget as HTMLElement;
      move(id, visibleIds.indexOf(id) + (e.key === "ArrowUp" ? -1 : 1));
      requestAnimationFrame(() => handle.focus());
    }
  }
  async function save() {
    if (!editable || saving || order.conflict) return;
    setSaving(true);
    setError("");
    try {
      const result = await api("priorities/reorder", pid, "POST", {
        kind,
        orderedIds: order.order,
        expectedVersion: order.source.version,
        universeHash: order.source.universeHash,
        reason:
          note.trim() ||
          "Ordem de prioridades revista no planejamento do programa.",
      });
      order.saved(result);
      setNote("");
      setKeyboardDrag(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function sortImpact() {
    const positions = new Map(visibleIds.map((id, i) => [id, i]));
    const sorted = [...visible].sort(
      (a, b) =>
        Number(a.accepted) - Number(b.accepted) ||
        b.impactIds.length - a.impactIds.length ||
        positions.get(a.id)! - positions.get(b.id)!,
    );
    order.change(
      reorderVisible(
        order.order,
        visibleIds,
        sorted.map((item) => item.id),
      ),
    );
    order.setAnnouncement(
      "Ordem proposta: pendentes primeiro, depois quantidade de dependentes. Confira antes de salvar.",
    );
  }
  function exportOrder() {
    download(
      `prioridades-${kind}.json`,
      JSON.stringify(
        {
          programId: pid,
          kind,
          version: order.source.version,
          proposed: order.dirty,
          visibleOnly: false,
          items: order.order.map((id, i) => ({
            position: i + 1,
            code: byId.get(id)?.code,
            name: byId.get(id)?.name,
            prioritized: ranked(id),
          })),
        },
        null,
        2,
      ),
    );
  }
  return (
    <div className="priority-workspace">
      <PriorityIntro
        total={items.length}
        blocked={
          items.filter(
            (item) => item.blockers.length || item.status === "BLOCKED",
          ).length
        }
        prioritized={order.source.savedIds.length}
      />
      <div className="priority-toolbar">
        <PriorityTabs
          kind={kind}
          locked={order.dirty || saving}
          onChange={onKindChange}
        />
        <div className="priority-search">
          <Search size={15} />
          <input
            aria-label="Buscar prioridades"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, código ou responsável…"
          />
        </div>
        <Button size="small" onClick={exportOrder}>
          <Download size={14} />
          Exportar ordem
        </Button>
      </div>
      <div
        className="priority-workbench"
        id="priority-board-content"
        role="tabpanel"
        aria-labelledby={`priority-tab-${kind}`}
      >
        <section className="priority-queue" aria-label="Fila de prioridades">
          <header className="priority-queue-header">
            <div>
              <h2>
                <ListOrdered size={17} />
                Ordem de prioridade
              </h2>
              <span>
                {visible.length} de {items.length} itens
                {order.order.length !== visible.length
                  ? " · posições do programa preservadas"
                  : ""}
              </span>
            </div>
            <span
              className={`priority-save-state ${order.dirty ? "draft" : ""}`}
            >
              <i />
              {order.dirty
                ? "Alterações não salvas"
                : board.version
                  ? "Ordem salva"
                  : "Ordem a definir"}
            </span>
          </header>
          <div className="priority-queue-tools">
            <button
              className={`priority-pending-toggle ${onlyPending ? "selected" : ""}`}
              aria-pressed={onlyPending}
              onClick={() => setOnlyPending(!onlyPending)}
            >
              <Check size={13} />
              Focar pendentes
            </button>
            {editable && (
              <Button
                size="small"
                variant="ghost"
                disabled={visible.length < 2 || saving || order.conflict}
                onClick={sortImpact}
                title="Pendentes primeiro; em seguida, maior número de dependentes impeditivos"
              >
                <GitBranch size={13} />
                Ordenar por impacto
              </Button>
            )}
          </div>
          <p className="priority-instructions" id="priority-instructions">
            {editable
              ? "Arraste pelo ícone ou use as setas. No teclado: espaço seleciona, ↑ ↓ movem e Enter solta."
              : "Você pode explorar a ordem. A edição é reservada aos gestores do programa."}
            {!board.version &&
              " A ordem inicial por código ainda não é uma priorização salva."}
          </p>
          {order.conflict && (
            <div className="priority-warning" role="alert">
              A ordem ou o inventário mudou enquanto você editava. Sua proposta
              foi preservada. Restaure a ordem atual antes de salvar.
            </div>
          )}
          {error && (
            <div className="priority-warning" role="alert">
              {error}
              <Button
                size="small"
                onClick={() => {
                  order.reset();
                  setError("");
                  onSaved();
                }}
              >
                Recarregar ordem
              </Button>
            </div>
          )}
          {windowed.controls}
          <div
            id={windowed.id}
            onScroll={windowed.onScroll}
            className={windowed.virtual ? "priority-virtual-scroll" : ""}
          >
            <ol
              className={`priority-list ${visible.length > 100 ? "windowed" : ""}`}
            >
              {windowed.top > 0 && (
                <li aria-hidden="true" style={{ height: windowed.top }} />
              )}
              {visible
                .slice(windowed.start, windowed.end)
                .map((item, offset) => {
                  const i = windowed.start + offset;
                  return (
                    <PriorityRow
                      key={item.id}
                      item={item}
                      windowed={visible.length > 100}
                      rank={order.order.indexOf(item.id) + 1}
                      ranked={ranked(item.id)}
                      selected={focus?.id === item.id}
                      editable={editable && !saving && !order.conflict}
                      first={i === 0}
                      last={i === visible.length - 1}
                      dragged={
                        dragged === item.id || keyboardDrag?.id === item.id
                      }
                      dropTarget={dropTarget === item.id && dragged !== item.id}
                      onFocus={() => setSelected(item.id)}
                      onMove={(action) =>
                        move(
                          item.id,
                          action === "top" ? 0 : i + (action === "up" ? -1 : 1),
                        )
                      }
                      onDragStart={() => setDragged(item.id)}
                      onDragEnd={() => {
                        setDragged(null);
                        setDropTarget(null);
                      }}
                      onDragOver={() => {
                        if (dragged) setDropTarget(item.id);
                      }}
                      onDrop={() => {
                        if (dragged) move(dragged, i);
                        setDragged(null);
                        setDropTarget(null);
                      }}
                      onKeyDown={(e) => keyboard(e, item.id)}
                    />
                  );
                })}
              {windowed.bottom > 0 && (
                <li aria-hidden="true" style={{ height: windowed.bottom }} />
              )}
            </ol>
          </div>
          {!visible.length && (
            <div className="priority-empty">
              <Search size={24} />
              <h3>
                {items.length
                  ? "Nenhum item nesta seleção"
                  : "Sua fila começa com o inventário"}
              </h3>
              <p>
                {items.length
                  ? "Ajuste a busca ou os filtros para encontrar suas prioridades."
                  : "Cadastre entregáveis ou capacidades para definir a sequência de trabalho."}
              </p>
              {(search || onlyPending) && (
                <Button
                  size="small"
                  onClick={() => {
                    setSearch("");
                    setOnlyPending(false);
                  }}
                >
                  Limpar busca e foco
                </Button>
              )}
            </div>
          )}
          <footer className="priority-queue-footer">
            <span>
              <Clock3 size={13} />
              {board.updatedAt
                ? `Atualizada ${fullDate(board.updatedAt, s.programs?.[0]?.timezone)}`
                : "Nenhuma priorização salva neste programa"}
            </span>
            {board.updatedBy && (
              <span>
                {s.users.find((u: TowerState) => u.id === board.updatedBy)
                  ?.display_name || "Gestor do programa"}
              </span>
            )}
          </footer>
        </section>
        <PriorityFocus
          item={focus}
          rank={focus ? order.order.indexOf(focus.id) + 1 : 0}
          ranked={!!focus && ranked(focus.id)}
          s={s}
          editable={
            editable &&
            !saving &&
            !order.conflict &&
            !!focus &&
            visibleIds.includes(focus.id)
          }
          onOpen={(item) => select(item.kind, item.record)}
          onMoveToTop={() => {
            if (focus) move(focus.id, 0);
          }}
        />
      </div>
      {editable && (
        <PrioritySaveBar
          note={note}
          onNoteChange={setNote}
          saving={saving}
          canUndo={order.canUndo}
          dirty={order.dirty}
          pending={order.dirty || !!order.source.unrankedIds.length}
          canSave={
            !order.conflict &&
            !!items.length &&
            (order.dirty || !!order.source.unrankedIds.length) &&
            (!note.trim() || note.trim().length >= 3)
          }
          onUndo={order.undo}
          onReset={() => {
            order.reset();
            setError("");
            setKeyboardDrag(null);
          }}
          onSave={save}
        />
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {order.announcement}
      </span>
      <div className="priority-bottom-note">
        <span className="tiny-dot" />
        Ordem independente da baseline. Pesos, datas e avaliações permanecem
        preservados.
        <ArrowRight size={13} />
      </div>
    </div>
  );
}
