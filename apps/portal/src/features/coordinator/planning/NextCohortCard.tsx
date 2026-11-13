import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { getPlanningOverview } from "../../../services/placement-planning";
import { AdminButton, AdminCard, StatusPill } from "../../programme-admin/ui/AdminKit";
import { dateRange, sumStatuses, PIPELINE_STEPS } from "./planningUi";

/** Dashboard entry to placement planning: the next cohort and how far along its placements are. */
export function NextCohortCard({ onOpen }: { onOpen: () => void }) {
  const overview = useQuery({ queryKey: ["planning-overview"], queryFn: getPlanningOverview, staleTime: 15_000 });
  if (overview.isPending) return <Skeleton className="h-28" />;
  if (overview.isError) return null; // The rest of the dashboard still works; planning has its own error state.
  const next = overview.data.cohorts.find((item) => item.id === overview.data.next_cohort_id);
  return (
    <AdminCard
      title="Next cohort"
      description={next ? `${next.name} · ${dateRange(next.start_date, next.end_date)}` : "No upcoming cohort to plan yet."}
      action={<AdminButton size="sm" icon={<CalendarClock />} onClick={onOpen}>{next ? "Plan placements" : "Open planning"}</AdminButton>}
    >
      {next ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatusPill tone="neutral">{next.counts.total} {next.counts.total === 1 ? "student" : "students"}</StatusPill>
          {PIPELINE_STEPS.map((step) => {
            const value = sumStatuses(next.counts, step.statuses);
            return value > 0 ? <StatusPill key={step.id} tone="teal">{value} {step.label.toLowerCase()}</StatusPill> : null;
          })}
          {next.counts.ready_to_release > 0 && <StatusPill tone="success">{next.counts.ready_to_release} ready to release</StatusPill>}
        </div>
      ) : (
        <p className="pa-muted" style={{ margin: 0 }}>Create a cohort with its dates, then place its students here.</p>
      )}
    </AdminCard>
  );
}
