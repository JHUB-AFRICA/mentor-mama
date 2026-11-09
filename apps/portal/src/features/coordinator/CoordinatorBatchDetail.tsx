import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { getPlacementBatch } from "../../services/api";

export function CoordinatorBatchDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const batch = useQuery({ queryKey: ["placement-batch", id], queryFn: () => getPlacementBatch(id), refetchInterval: (query) => {
    const status = query.state.data?.status;
    return status === "queued" || status === "processing" ? 2500 : false;
  } });
  if (batch.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-48 rounded-2xl" /></div>;
  if (batch.isError || !batch.data) return <InlineRetry message="We could not load this batch." onRetry={() => void batch.refetch()} />;
  const data = batch.data;
  const status = data.status === "processing" ? "Processing" : data.status === "queued" ? "Queued" : data.status === "failed" ? "Failed" : "Completed";
  return (
    <section className="space-y-8" aria-labelledby="batch-detail-heading">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 font-body text-sm font-semibold text-teal hover:text-teal-dark"><ArrowLeft size={16} aria-hidden="true" /> All batch activity</button>
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-7 sm:flex-row sm:items-start"><div><p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">Placement operations</p><h2 id="batch-detail-heading" className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">Batch {data.batch_id.slice(0, 8)}</h2><p className="mt-3 font-body text-sm text-navy-muted">{data.planned_start ?? "—"} → {data.planned_end ?? "—"}</p></div><span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 font-body text-sm font-semibold ${data.status === "failed" ? "bg-red-50 text-red-700" : data.status === "completed" ? "bg-teal-light text-teal" : "bg-amber-50 text-amber-700"}`}>{data.status === "failed" ? <CircleAlert size={16} /> : data.status === "completed" ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}{status}</span></header>
      {(data.status === "queued" || data.status === "processing") && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><RefreshCw size={18} className="mt-0.5 animate-spin" aria-hidden="true" /><p><strong>Your request is being processed.</strong><br />This page will update automatically as placements are created.</p></div>}
      {data.error_message && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Batch could not be completed.</strong><p className="mt-1">{data.error_message}</p></div>}
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Created" value={data.created.length} /><Metric label="Skipped" value={data.skipped.length} /><Metric label="Request type" value={data.all_eligible ? "All eligible" : "Selected students"} /></div>
      <div className="overflow-hidden rounded-2xl border border-border bg-white"><div className="border-b border-border px-5 py-4"><h3 className="font-display text-xl font-bold text-navy">Created placements</h3><p className="mt-1 text-sm text-navy-muted">Placement records created by this request.</p></div>{data.created.length === 0 ? <EmptyState title="No placements created" detail="Created records will appear here when processing completes." /> : <div className="divide-y divide-border">{data.created.map((placement) => <div key={placement.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-body text-sm font-bold text-navy">{placement.student?.name ?? "Student placement"}</p><p className="mt-1 text-xs text-navy-muted">{placement.state} · {placement.planned_start} → {placement.planned_end}</p></div><span className="font-body text-xs text-navy-muted">{placement.id.slice(0, 8)}</span></div>)}</div>}</div>
      {data.skipped.length > 0 && <div className="rounded-2xl border border-border bg-white"><div className="border-b border-border px-5 py-4"><h3 className="font-display text-xl font-bold text-navy">Skipped students</h3><p className="mt-1 text-sm text-navy-muted">These students were not duplicated or created in this batch.</p></div><div className="divide-y divide-border">{data.skipped.map((item) => <div key={item.student_id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm"><span className="font-body text-navy">{item.student_id.slice(0, 8)}</span><span className="text-navy-muted">{item.reason}</span></div>)}</div></div>}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: number | string }) { return <div className="rounded-2xl border border-border bg-white px-5 py-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">{label}</p><p className="mt-2 font-display text-2xl font-bold text-navy">{value}</p></div>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="px-5 py-12 text-center"><p className="font-body text-sm font-bold text-navy">{title}</p><p className="mt-1 text-sm text-navy-muted">{detail}</p></div>; }
function InlineRetry({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6"><p className="text-sm text-navy-muted">{message}</p><Button type="button" size="sm" variant="tertiary" onClick={onRetry}>Try again</Button></div>; }
