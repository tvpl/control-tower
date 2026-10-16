"use client";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
type Row = Record<string, any>;
export function DataTable({
  items,
  columns,
  onSelect,
  selection,
}: {
  items: Row[];
  columns: ColumnDef<Row>[];
  onSelect: (r: Row, records?: Row[]) => void;
  selection?: {
    ids: Set<string>;
    eligible: (r: Row) => boolean;
    toggle: (ids: string[], checked: boolean) => void;
  };
}) {
  "use no memo"; // TanStack Table exposes mutable instance APIs; opt out of compiler memoization.
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });
  const pageItems = table
    .getRowModel()
    .rows.map((r) => r.original)
    .filter((r) => selection?.eligible(r));
  const checkedCount = pageItems.filter((r) => selection?.ids.has(r.id)).length;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {selection && (
                <th className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label="Selecionar entregáveis da página"
                    checked={
                      pageItems.length > 0 && checkedCount === pageItems.length
                    }
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          checkedCount > 0 && checkedCount < pageItems.length;
                    }}
                    disabled={!pageItems.length}
                    onChange={(e) =>
                      selection.toggle(
                        pageItems.map((r) => r.id),
                        e.target.checked,
                      )
                    }
                  />
                </th>
              )}
              {g.headers.map((h) => (
                <th key={h.id}>
                  {h.isPlaceholder ? null : (
                    <button
                      onClick={h.column.getToggleSortingHandler()}
                      className="table-sort"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort() && <ArrowUpDown size={11} />}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {selection && (
                <td className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${row.original.code || row.original.name}`}
                    checked={selection.ids.has(row.original.id)}
                    disabled={
                      !selection.eligible(row.original) ||
                      (!selection.ids.has(row.original.id) &&
                        selection.ids.size >= 100)
                    }
                    onChange={(e) =>
                      selection.toggle([row.original.id], e.target.checked)
                    }
                  />
                </td>
              )}
              {row.getVisibleCells().map((cell, i) => (
                <td key={cell.id}>
                  {i === 0 ? (
                    <button
                      className="row-link"
                      onClick={() =>
                        onSelect(
                          row.original,
                          table.getSortedRowModel().rows.map((r) => r.original),
                        )
                      }
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </button>
                  ) : (
                    flexRender(cell.column.columnDef.cell, cell.getContext())
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <div className="empty">
          <strong>Nenhum registro encontrado</strong>
          <p>Cadastre um item ou ajuste os filtros para começar.</p>
        </div>
      )}
      <footer className="pagination">
        <span>
          {items.length} registros · Página{" "}
          {table.getState().pagination.pageIndex + 1} de{" "}
          {Math.max(1, table.getPageCount())}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Página anterior"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Próxima página"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
}
