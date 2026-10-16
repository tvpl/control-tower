"use client";
import { useState, useId } from "react";
/** Fixed-row window with overscan; a paged mode keeps all navigation available without scrolling. */
export function useVirtualWindow(
  total: number,
  rowHeight = 128,
  viewport = 600,
) {
  const id = useId();
  const [scroll, setScroll] = useState(0),
    [paged, setPaged] = useState(false),
    [page, setPage] = useState(0);
  const virtual = total > 100 && !paged,
    rows = paged ? 25 : Math.ceil(viewport / rowHeight) + 8;
  const start =
    total <= 100
      ? 0
      : paged
        ? Math.min(page * 25, Math.max(0, Math.floor((total - 1) / 25) * 25))
        : Math.max(
            0,
            Math.min(Math.floor(scroll / rowHeight) - 4, total - rows),
          );
  const end = total <= 100 ? total : Math.min(total, start + rows);
  return {
    id,
    virtual,
    paged,
    start,
    end,
    top: virtual ? start * rowHeight : 0,
    bottom: virtual ? (total - end) * rowHeight : 0,
    rowHeight,
    onScroll: (e: React.UIEvent<HTMLDivElement>) =>
      setScroll(e.currentTarget.scrollTop),
    show: (index: number) => {
      const element = document.getElementById(id);
      if (paged) setPage(Math.floor(index / 25));
      else if (element) {
        const top = index * rowHeight;
        if (
          top < element.scrollTop ||
          top + rowHeight > element.scrollTop + viewport
        ) {
          element.scrollTo({ top: Math.max(0, top - viewport / 2) });
          setScroll(element.scrollTop);
        }
      }
    },
    controls:
      total > 100 ? (
        <div className="virtual-controls">
          <span>
            {total} registros · exibindo {start + 1}–{end}
          </span>
          <button
            className="button small"
            onClick={() => {
              setPaged(!paged);
              setPage(0);
              setScroll(0);
              document.getElementById(id)?.scrollTo({ top: 0 });
            }}
          >
            {paged ? "Rolagem virtual" : "Modo paginado"}
          </button>
          {paged && (
            <>
              <button
                className="button small"
                disabled={start === 0}
                onClick={() => setPage(Math.max(0, page - 1))}
              >
                Anterior
              </button>
              <button
                className="button small"
                disabled={end >= total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </>
          )}
        </div>
      ) : null,
  };
}
