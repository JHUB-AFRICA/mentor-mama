import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Download,
  ShieldCheck,
  UsersRound,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import {
  getActivity,
  type ActivityEntry,
  type CurrentUser,
} from "../../services/api";

const labels: Record<string, string> = {
  "cohort.created": "Created a cohort",
  "cohort.student_enrolled": "Enrolled a student",
  "student.invited": "Invited a student",
  "student.invitation_resent": "Resent a student invitation",
  "placement.created": "Created a placement",
  "placement.released": "Released a placement to a student",
  "placement.paused": "Paused a placement",
  "placement.resumed": "Resumed a placement",
  "placement.withdrawn": "Withdrew a placement",
  "safeguarding.reviewed": "Reviewed a safeguarding concern",
  "export.requested": "Requested an institution export",
  "export.download": "Downloaded an institution export",
};

export function CoordinatorActivity({ user }: { user: CurrentUser }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ student_id: "", cohort_id: "", placement_id: "", action: "", date_from: "", date_to: "" });
  const activity = useQuery({
    queryKey: ["coordinator-activity", page, filters],
    queryFn: () => getActivity(page, 15, filters),
    placeholderData: (previous) => previous,
  });
  const { pushToast } = useToast();
  const refreshing = activity.isFetching;
  async function refreshActivity() {
    try {
      await activity.refetch();
      pushToast({
        kind: "success",
        title: "Activity refreshed",
        message: "Your institution record is up to date.",
      });
    } catch (cause) {
      pushToast({
        kind: "error",
        title: "Refresh failed",
        message:
          cause instanceof Error
            ? cause.message
            : "We could not refresh activity.",
      });
    }
  }
  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl bg-navy px-6 py-7 text-white sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full border-[3rem] border-teal/15" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Your institution record
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              What changed recently
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-slate-300">
              Follow the decisions and updates affecting{" "}
              {user.scope?.institution_name ?? "your institution"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshActivity()}
            disabled={refreshing}
            className="inline-flex min-h-10 items-center gap-2 self-start rounded-full border border-white/20 px-4 font-body text-sm font-semibold text-white transition hover:border-teal hover:bg-white/5 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>
      {!activity.isPending && !activity.isError && activity.data && (
        <div className="grid overflow-hidden rounded-2xl border border-border bg-white sm:grid-cols-3">
          <ActivityStat
            label="Events on this page"
            value={activity.data.results.length}
          />
          <ActivityStat
            label="Total recorded"
            value={activity.data.pagination.total_count}
          />
          <ActivityStat
            label="Viewing"
            value={`Page ${activity.data.pagination.page} of ${activity.data.pagination.total_pages}`}
          />
        </div>
      )}
      <section
        aria-label="Institution activity"
        className="overflow-hidden rounded-2xl border border-border bg-white"
      >
        <div className="border-b border-border bg-mist/20 p-4"><div className="flex flex-col gap-3 lg:flex-row"><label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3.5 top-3.5 text-navy-muted" aria-hidden="true" /><input value={filters.student_id} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, student_id: event.target.value })); }} placeholder="Student ID" aria-label="Filter activity by student ID" className="h-10 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" /></label><input value={filters.cohort_id} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, cohort_id: event.target.value })); }} placeholder="Cohort ID" aria-label="Filter activity by cohort ID" className="h-10 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 lg:w-40" /><input value={filters.placement_id} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, placement_id: event.target.value })); }} placeholder="Placement ID" aria-label="Filter activity by placement ID" className="h-10 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 lg:w-40" /><input value={filters.action} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, action: event.target.value })); }} placeholder="Action" aria-label="Filter activity by action" className="h-10 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 lg:w-40" /></div><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"><label className="flex items-center gap-2 text-xs font-semibold text-navy-muted">From<input type="date" value={filters.date_from} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, date_from: event.target.value })); }} className="auth-control h-10" aria-label="Activity date from" /></label><label className="flex items-center gap-2 text-xs font-semibold text-navy-muted">To<input type="date" value={filters.date_to} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, date_to: event.target.value })); }} className="auth-control h-10" aria-label="Activity date to" /></label>{Object.values(filters).some(Boolean) && <Button type="button" size="sm" variant="tertiary" onClick={() => { setPage(1); setFilters({ student_id: "", cohort_id: "", placement_id: "", action: "", date_from: "", date_to: "" }); }}>Clear filters</Button>}</div></div>
        {activity.isError ? (
          <div className="flex flex-col gap-3 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-body text-sm text-error">
              We could not load institution activity.
            </p>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => void activity.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : activity.isPending ? (
          <ActivitySkeleton />
        ) : activity.data.results.length === 0 ? (
          <EmptyActivity />
        ) : (
          <>
            <div className="divide-y divide-border px-5 sm:px-7">
              {activity.data.results.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </div>
            <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="font-body text-xs text-navy-muted">
                Page {activity.data.pagination.page} of{" "}
                {activity.data.pagination.total_pages} ·{" "}
                {activity.data.pagination.total_count} events
                {activity.isFetching ? " · Refreshing…" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={
                    !activity.data.pagination.has_previous ||
                    activity.isFetching
                  }
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={16} className="mr-1" />
                  Previous
                </Button>
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={
                    !activity.data.pagination.has_next || activity.isFetching
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasChanges = Object.keys(entry.changes).length > 0;
  return (
    <article className="flex gap-4 py-5 first:pt-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal">
        <ActivityIcon action={entry.action} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:gap-4">
          <div>
            <p className="font-body text-sm font-semibold text-navy">
              {labels[entry.action] ?? entry.action.replaceAll(".", " · ")}
            </p>
            <p className="mt-1 font-body text-xs text-navy-muted">
              {entry.actor} · {entry.actor_role.replaceAll("_", " ")}
            </p>
          </div>
          <time
            className="shrink-0 font-body text-xs text-navy-muted"
            dateTime={entry.occurred_at}
          >
            {new Date(entry.occurred_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        {hasChanges && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-3 inline-flex min-h-10 items-center gap-1 font-body text-xs font-semibold text-teal"
          >
            {expanded ? "Hide change details" : "View change details"}
            {expanded ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        )}
        {expanded && (
          <dl className="mt-3 grid gap-3 rounded-xl bg-mist p-4 sm:grid-cols-2">
            {Object.entries(entry.changes).map(([key, value]) => (
              <div key={key}>
                <dt className="font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="mt-1 break-words font-body text-xs text-navy">
                  {formatActivityValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}
function formatActivityValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatActivityValue).join(", ");
  try { return JSON.stringify(value); } catch { return "Details recorded"; }
}
function ActivityIcon({ action }: { action: string }) {
  if (action.startsWith("export."))
    return <Download size={18} aria-hidden="true" />;
  if (action.startsWith("cohort.") || action.startsWith("student."))
    return <UsersRound size={18} aria-hidden="true" />;
  if (action.startsWith("safeguarding."))
    return <ShieldCheck size={18} aria-hidden="true" />;
  if (action.startsWith("placement."))
    return <BriefcaseBusiness size={18} aria-hidden="true" />;
  return <Activity size={18} aria-hidden="true" />;
}
function ActivityStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="border-b border-border px-5 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-navy">{value}</p>
    </div>
  );
}
function EmptyActivity() {
  return (
    <div className="px-5 py-14 text-center sm:px-7">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-teal-light text-teal">
        <Activity size={25} aria-hidden="true" />
      </div>
      <h3 className="mt-5 font-display text-2xl font-bold text-navy">
        No institution activity yet
      </h3>
      <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-navy-muted">
        Cohort, enrolment, placement, review, and export changes will appear
        here.
      </p>
    </div>
  );
}
function ActivitySkeleton() {
  return (
    <div
      className="space-y-5 p-5 sm:p-7"
      role="status"
      aria-label="Loading institution activity"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex gap-4 border-b border-border pb-5">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-2 h-3 w-40" />
            <Skeleton className="mt-4 h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
