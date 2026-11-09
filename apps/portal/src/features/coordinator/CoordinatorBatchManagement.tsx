import { useQuery } from "@tanstack/react-query";
import { ClipboardList, ExternalLink, RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { getPlacementBatches, type PlacementBatchResult } from "../../services/api";

export function CoordinatorBatchManagement({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const batches = useQuery({ queryKey: ["placement-batches"], queryFn: getPlacementBatches });
  const rows = batches.data ?? [];
  const active = rows.filter((row) => row.status === "queued" || row.status === "processing").length;
  const completed = rows.filter((row) => row.status === "completed").length;
  return (
    <section className="space-y-8" aria-labelledby="batch-management-heading">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">Placement operations</p>
          <h2 id="batch-management-heading" className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">Batch activity</h2>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">Track bulk placement requests and open the full outcome for your institution.</p>
        </div>
        <Button type="button" variant="tertiary" size="sm" onClick={() => void batches.refetch()} disabled={batches.isFetching}>
          <RefreshCw size={16} className={`mr-2 ${batches.isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </Button>
      </header>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3" aria-label="Batch summary">
        <Summary label="Requests shown" value={rows.length} />
        <Summary label="In progress" value={active} />
        <Summary label="Completed" value={completed} />
      </div>
      {batches.isPending ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 rounded-2xl" />)}</div>
      ) : batches.isError ? (
        <InlineRetry message="We could not load batch activity." onRetry={() => void batches.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No batch requests yet" detail="Bulk placement requests will appear here once you create them." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.8fr_auto] gap-4 border-b border-border bg-mist/30 px-5 py-3 font-body text-[11px] font-bold uppercase tracking-[0.12em] text-navy-muted md:grid">
            <span>Batch</span><span>Planned window</span><span>Status</span><span>Outcome</span><span />
          </div>
          {rows.map((row) => <BatchRow key={row.batch_id} row={row} onOpen={() => onOpen(row.batch_id)} />)}
        </div>
      )}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="bg-white px-5 py-4"><p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">{label}</p><p className="mt-1 font-display text-2xl font-bold tabular-nums text-navy">{value}</p></div>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="px-5 py-12 text-center"><p className="font-body text-sm font-bold text-navy">{title}</p><p className="mt-1 font-body text-sm text-navy-muted">{detail}</p></div>; }
function InlineRetry({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6"><p className="text-sm text-navy-muted">{message}</p><Button type="button" size="sm" variant="tertiary" onClick={onRetry}>Try again</Button></div>; }

function BatchRow({ row, onOpen }: { row: PlacementBatchResult; onOpen: () => void }) {
  const status = row.status === "processing" ? "Processing" : row.status === "queued" ? "Queued" : row.status === "failed" ? "Failed" : "Completed";
  return (
    <button type="button" onClick={onOpen} className="grid w-full gap-3 border-b border-border px-5 py-4 text-left transition last:border-0 hover:bg-mist/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal md:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_auto] md:items-center md:gap-4">
      <span className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal"><ClipboardList size={17} aria-hidden="true" /></span><span className="min-w-0"><span className="block truncate font-body text-sm font-bold text-navy">Batch {row.batch_id.slice(0, 8)}</span><span className="block text-xs text-navy-muted">{row.all_eligible ? "All eligible students" : `${row.created.length + row.skipped.length} selected students`}</span></span></span>
      <span className="font-body text-sm text-navy-muted">{row.planned_start ?? "—"} → {row.planned_end ?? "—"}</span>
      <span><span className={`inline-flex rounded-full px-2.5 py-1 font-body text-xs font-semibold ${row.status === "failed" ? "bg-red-50 text-red-700" : row.status === "completed" ? "bg-teal-light text-teal" : "bg-amber-50 text-amber-700"}`}>{status}</span></span>
      <span className="font-body text-sm text-navy-muted">{row.created.length} created · {row.skipped.length} skipped</span>
      <span className="hidden text-teal md:block"><ExternalLink size={16} aria-hidden="true" /></span>
    </button>
  );
}
