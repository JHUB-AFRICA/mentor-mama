import { ChevronLeft, ChevronRight } from "lucide-react";

export function TablePagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <nav
      aria-label="Table pagination"
      className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="font-body text-xs text-navy-muted">
        Showing {start}-{end} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 font-body text-xs font-bold text-navy transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={15} aria-hidden="true" /> Previous
        </button>
        <span className="min-w-20 text-center font-body text-xs font-semibold text-navy-muted">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 font-body text-xs font-bold text-navy transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
