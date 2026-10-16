"use client";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  GripVertical,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, fmt } from "../presentation";
import { type QueueItem } from "./types";
export function PriorityRow({
  item,
  windowed = false,
  rank,
  ranked,
  selected,
  editable,
  first,
  last,
  dragged,
  dropTarget,
  onFocus,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onKeyDown,
}: {
  item: QueueItem;
  windowed?: boolean;
  rank: number;
  ranked: boolean;
  selected: boolean;
  editable: boolean;
  first: boolean;
  last: boolean;
  dragged: boolean;
  dropTarget: boolean;
  onFocus: () => void;
  onMove: (action: "up" | "down" | "top") => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <li
      className={`priority-row ${windowed ? "virtual-row" : ""} ${selected ? "is-focused" : ""} ${dragged ? "is-dragging" : ""} ${dropTarget ? "is-drop-target" : ""}`}
      data-priority-id={item.id}
      onDragOver={(e) => {
        if (editable) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOver();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {editable ? (
        <button
          type="button"
          className="priority-grip"
          aria-label={`Reordenar ${item.code}`}
          aria-describedby="priority-instructions"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", item.id);
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={onKeyDown}
        >
          <GripVertical size={17} />
        </button>
      ) : (
        <span className="priority-grip readonly" aria-hidden="true">
          <GripVertical size={17} />
        </span>
      )}
      <span
        className={`priority-rank ${rank === 1 && ranked ? "first" : ""}`}
        aria-label={ranked ? `Posição ${rank}` : "Ainda não priorizado"}
      >
        {ranked ? String(rank).padStart(2, "0") : "—"}
      </span>
      <button
        className="priority-record"
        onClick={onFocus}
        aria-label={`Ver prioridade ${item.code}: ${item.name}`}
        aria-pressed={selected}
      >
        <span className="priority-code">
          {item.code}
          <span>{item.context}</span>
        </span>
        <strong>{item.name}</strong>
        <span className="priority-row-facts">
          <Badge value={item.status} />
          {item.blockers.length > 0 && (
            <span className="priority-blocked">
              {item.blockers.length} bloqueio
              {item.blockers.length === 1 ? "" : "s"}
            </span>
          )}
          {item.impactIds.length > 0 && (
            <span className="priority-impact-label">
              <GitBranch size={12} />
              {item.impactIds.length} dependente
              {item.impactIds.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </button>
      <div className="priority-owner">
        <span className="priority-avatar" title={item.owner}>
          {item.ownerInitials}
        </span>
        <div>
          <span>{item.owner}</span>
          <small>
            {item.forecast
              ? fmt(item.forecast)
              : item.kind === "capabilities"
                ? `${item.relatedDeliverables} entregáveis`
                : "Sem previsão"}
          </small>
        </div>
      </div>
      {editable && (
        <div className="priority-move-controls">
          <Button
            size="icon"
            className="priority-control"
            disabled={first}
            onClick={() => onMove("top")}
            aria-label={`Mover ${item.code} para o topo`}
            title="Mover para o topo"
          >
            <ArrowUpToLine size={15} />
          </Button>
          <Button
            size="icon"
            className="priority-control"
            disabled={first}
            onClick={() => onMove("up")}
            aria-label={`Subir ${item.code}`}
            title="Subir uma posição"
          >
            <ArrowUp size={15} />
          </Button>
          <Button
            size="icon"
            className="priority-control"
            disabled={last}
            onClick={() => onMove("down")}
            aria-label={`Descer ${item.code}`}
            title="Descer uma posição"
          >
            <ArrowDown size={15} />
          </Button>
        </div>
      )}
    </li>
  );
}
