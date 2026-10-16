"use client";
import { useEffect, useState } from "react";
import { moveInOrder, reorderVisible } from "@/server/domain/priorities";
import { type Board } from "./types";
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);
export function usePriorityOrder(board: Board) {
  const [session, setSession] = useState({
    source: board,
    order: board.orderedIds,
    history: [] as string[][],
  });
  const edited = !same(session.order, session.source.orderedIds);
  const remoteChanged =
    board.version > session.source.version ||
    (board.version === session.source.version &&
      board.universeHash !== session.source.universeHash);
  const current =
    remoteChanged && !edited
      ? { source: board, order: board.orderedIds, history: [] as string[][] }
      : session;
  const dirty = !same(current.order, current.source.orderedIds);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function change(order: string[]) {
    if (same(order, current.order)) return;
    setSession({
      ...current,
      order,
      history: [...current.history, current.order].slice(-30),
    });
  }
  function move(id: string, index: number, visible: string[]) {
    change(
      reorderVisible(current.order, visible, moveInOrder(visible, id, index)),
    );
  }
  function undo() {
    const previous = current.history.at(-1);
    if (previous)
      setSession({
        ...current,
        order: previous,
        history: current.history.slice(0, -1),
      });
    setAnnouncement("Última alteração desfeita.");
  }
  function reset() {
    setSession({ source: board, order: board.orderedIds, history: [] });
    setAnnouncement("Ordem atual do programa restaurada.");
  }
  function saved(value: Board) {
    setSession({ source: value, order: value.orderedIds, history: [] });
    setAnnouncement("Prioridades salvas no programa.");
  }
  return {
    order: current.order,
    source: current.source,
    dirty,
    conflict: remoteChanged && dirty,
    canUndo: !!current.history.length,
    announcement,
    setAnnouncement,
    move,
    change,
    undo,
    reset,
    saved,
  };
}
