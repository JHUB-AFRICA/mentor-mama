/**
 * The one data table used by every role: same header, row height, sorting,
 * pagination and empty state. Built on TanStack Table (headless) and styled by
 * the Programme Admin kit (`.pa-table*`).
 */
import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download } from "lucide-react";
import { AdminButton } from "./AdminKit";
import { csvBlob, datedFilename, saveBlob } from "../../../lib/download";

export type { ColumnDef };

export function DataTable<T>({
  data,
  columns,
  caption,
  empty,
  pageSize = 10,
  onRowClick,
  csvName,
  initialSort,
  toolbar,
}: {
  data: T[];
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  caption: string;
  empty?: ReactNode;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  /** When set, shows a "Download CSV" button that exports the visible columns. */
  csvName?: string;
  initialSort?: SortingState;
  toolbar?: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  function downloadCsv() {
    const exportable = table.getVisibleLeafColumns().filter((column) => column.accessorFn !== undefined);
    const header = exportable.map((column) => (typeof column.columnDef.header === "string" ? column.columnDef.header : column.id));
    const body = table.getSortedRowModel().rows.map((row) => exportable.map((column) => row.getValue(column.id)));
    const base = (csvName ?? "table").replace(/^mentormama-/, "");
    saveBlob(csvBlob([header, ...body]), datedFilename(base, "csv"));
  }

  if (data.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="pa-table-wrap">
      {(toolbar || csvName) && (
        <div className="pa-table-toolbar">
          <div>{toolbar}</div>
          {csvName && (
            <AdminButton variant="ghost" size="sm" icon={<Download />} onClick={downloadCsv}>
              Download CSV
            </AdminButton>
          )}
        </div>
      )}
      <div className="pa-table-scroll">
        <table className="pa-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const sortable = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={(header.column.columnDef.meta as { align?: string } | undefined)?.align === "right" ? "is-right" : undefined}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button type="button" className="pa-sort" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? <ArrowUp aria-hidden="true" /> : sorted === "desc" ? <ArrowDown aria-hidden="true" /> : <ChevronsUpDown aria-hidden="true" className="is-idle" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? "is-clickable" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={(cell.column.columnDef.meta as { align?: string } | undefined)?.align === "right" ? "is-right" : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > pageSize && (
        <div className="pa-table-footer">
          <span>
            Showing {from}–{to} of {total}
          </span>
          <div className="pa-pager">
            <button type="button" aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft />
            </button>
            <span aria-live="polite">
              Page {pageIndex + 1} of {table.getPageCount()}
            </span>
            <button type="button" aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Footer for server-paginated tables, matching the DataTable footer. */
export function ServerPager({
  pagination,
  onPage,
  noun = "results",
}: {
  pagination: { page: number; total_pages: number; total_count: number; has_next: boolean; has_previous: boolean };
  onPage: (page: number) => void;
  noun?: string;
}) {
  if (pagination.total_pages <= 1) return null;
  return (
    <div className="pa-table-footer">
      <span>
        {pagination.total_count} {noun}
      </span>
      <div className="pa-pager">
        <button type="button" aria-label="Previous page" onClick={() => onPage(pagination.page - 1)} disabled={!pagination.has_previous}>
          <ChevronLeft />
        </button>
        <span aria-live="polite">
          Page {pagination.page} of {pagination.total_pages}
        </span>
        <button type="button" aria-label="Next page" onClick={() => onPage(pagination.page + 1)} disabled={!pagination.has_next}>
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
