import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, Undo2 } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import { getAllocationRuns, retryAllocationRun, undoAllocationRun, type AllocationRunSummary } from "../../services/api";
import { AdminButton, AdminCard, EmptyState, ListRow, StatusPill } from "../programme-admin/ui/AdminKit";

const TONE: Record<AllocationRunSummary["status"], "success" | "warning" | "danger" | "neutral" | "info"> = {
  completed: "success", partial: "warning", failed: "danger", undone: "neutral", running: "info",
};
const LABEL: Record<AllocationRunSummary["status"], string> = {
  completed: "Complete", partial: "Partly placed", failed: "Nobody placed", undone: "Undone", running: "Running",
};

/** The last few automatic arrangements: undo within 24 hours, or retry the students who could not be placed. */
export function RecentArrangements({ onError }: { onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const runs = useQuery({ queryKey: ["allocation-runs"], queryFn: getAllocationRuns, staleTime: 15_000 });
  const refresh = () => void queryClient.invalidateQueries();
  const undo = useMutation({
    mutationFn: (id: string) => undoAllocationRun(id),
    onSuccess: (result) => {
      pushToast({ kind: "success", title: "Arrangement undone", message: `${result.reverted} student${result.reverted === 1 ? "" : "s"} back in the incoming queue${result.kept.length ? `; ${result.kept.length} had already moved on` : ""}.` });
      refresh();
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not undo that arrangement."),
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryAllocationRun(id),
    onSuccess: (result) => {
      pushToast({ kind: "success", title: "Tried again", message: `${result.summary.arranged} more placed, ${result.summary.unplaced} still waiting.` });
      refresh();
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not retry that arrangement."),
  });
  const rows = runs.data ?? [];
  if (!runs.isPending && rows.length === 0) return null;
  const busy = undo.isPending || retry.isPending;

  return (
    <AdminCard title="Recent arrangements" description="Undo within 24 hours, or retry students who could not be placed." flush>
      {runs.isPending ? (
        <div className="p-4"><Skeleton className="h-20" /></div>
      ) : runs.isError ? (
        <EmptyState icon={<History />} title="Could not load history" text="Try refreshing the page." />
      ) : (
        <div className="pa-list">
          {rows.map((run) => (
            <ListRow
              key={run.id}
              icon={<History />}
              tone="slate"
              title={`${run.arranged} placed${run.unplaced ? `, ${run.unplaced} waiting` : ""}`}
              meta={`${new Date(run.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${run.by}`}
              trailing={
                <span className="pa-row-actions" onClick={(event) => event.stopPropagation()}>
                  <StatusPill tone={TONE[run.status]}>{LABEL[run.status]}</StatusPill>
                  {run.can_retry && (
                    <AdminButton variant="secondary" size="sm" icon={<RotateCcw />} disabled={busy} onClick={() => retry.mutate(run.id)}>Retry</AdminButton>
                  )}
                  {run.can_undo && (
                    <AdminButton variant="ghost" size="sm" icon={<Undo2 />} disabled={busy} onClick={() => undo.mutate(run.id)}>Undo</AdminButton>
                  )}
                </span>
              }
            />
          ))}
        </div>
      )}
    </AdminCard>
  );
}
