import { useMemo, useState } from "react";
import { ArrowUpRight, Bell, ChevronLeft, ChevronRight, CircleUserRound, FileText, Filter, Mail, RefreshCw, Settings2, UserPlus, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../../components/ToastProvider";
import { getActivity, getPeople, type ActivityEntry } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, IconTile, SearchField, SelectField, Toolbar, type Tone } from "./ui/AdminKit";
import "./people-pages.css";

const actionLabels: Record<string, string> = { "account.invited": "Invited a team member", "account.invitation_resent": "Resent an invitation", "account.status_changed": "Changed account access", "account.activated": "Activated an account", "account.profile_updated": "Updated account details", "account.mfa_recovery_override": "Completed MFA recovery", "programme.settings_updated": "Updated programme settings", "placement.invitation_sent": "Sent placement invitation", "placement.mentor_assigned": "Allocated mentor to placement", "placement.ward_allocated": "Allocated ward" };
const activityTypes = [{ value: "", label: "All activity types" }, { value: "account", label: "Account and access" }, { value: "programme", label: "Programme settings" }, { value: "placement", label: "Placements" }, { value: "content", label: "Content" }];

export function ActivityTimeline() {
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [type, setType] = useState(""); const [actorId, setActorId] = useState(""); const [period, setPeriod] = useState("all"); const [moreFilters, setMoreFilters] = useState(false); const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const dates = useMemo(() => { if (period === "all") return { date_from: dateFrom, date_to: dateTo }; const start = new Date(); if (period === "today") start.setHours(0, 0, 0, 0); if (period === "week") start.setDate(start.getDate() - 7); if (period === "month") start.setDate(start.getDate() - 30); return { date_from: start.toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10) }; }, [dateFrom, dateTo, period]);
  const people = useQuery({ queryKey: ["activity-users"], queryFn: () => getPeople({ page: 1, pageSize: 50 }), staleTime: 60_000 });
  const activity = useQuery({ queryKey: ["programme-activity", page, search, type, actorId, dates], queryFn: () => getActivity(page, 10, { action: search || type, actor_id: actorId || undefined, ...dates }), placeholderData: (previous) => previous });
  const { pushToast } = useToast();
  async function refreshActivity() {
    const result = await activity.refetch();
    pushToast(result.isError
      ? { kind: "error", title: "Activity not refreshed", message: "Try again when your connection is available." }
      : { kind: "success", title: "Activity refreshed", message: "The latest programme activity is shown." });
  }
  function updateFilter<T>(setter: (value: T) => void, value: T) { setPage(1); setter(value); }
  const entries = activity.data?.results ?? [];
  const userOptions = [{ value: "", label: "All users" }, ...(people.data?.results ?? []).map((person) => ({ value: person.id, label: person.name }))];
  const total = activity.data?.pagination.total_count;
  const timeOptions = [{ value: "all", label: "All time" }, { value: "today", label: "Today" }, { value: "week", label: "Last 7 days" }, { value: "month", label: "Last 30 days" }];
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Workspace"
        title="Programme activity"
        description="A clear record of invitations, access changes, placements and other important programme actions."
        meta={<span>{total ?? "—"} events in total</span>}
        actions={<AdminButton variant="secondary" icon={<RefreshCw />} onClick={() => void refreshActivity()} disabled={activity.isFetching}>Refresh</AdminButton>}
      />
      <Toolbar>
        <SearchField value={search} onChange={(value) => updateFilter(setSearch, value)} placeholder="Search activity..." label="Search activity" />
        <SelectField label="Activity type" value={type} options={activityTypes} onChange={(value) => updateFilter(setType, value)} />
        <SelectField label="Users" value={actorId} options={userOptions} onChange={(value) => updateFilter(setActorId, value)} />
        <SelectField label="Time" value={period} options={timeOptions} onChange={(value) => updateFilter(setPeriod, value)} />
        <button type="button" className="pa-filter-btn" aria-pressed={moreFilters} onClick={() => setMoreFilters((open) => !open)}><Filter size={16} />More filters</button>
      </Toolbar>
      {moreFilters && (
        <div className="pa-dates">
          <label>From<input type="date" value={dateFrom} onChange={(event) => updateFilter(setDateFrom, event.target.value)} /></label>
          <label>To<input type="date" value={dateTo} onChange={(event) => updateFilter(setDateTo, event.target.value)} /></label>
          <AdminButton variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); setPeriod("all"); setPage(1); }}>Clear dates</AdminButton>
        </div>
      )}
      {activity.isError ? (
        <AdminCard flush><EmptyState icon={<CircleUserRound size={24} />} title="We could not load programme activity." action={<AdminButton variant="secondary" onClick={() => void activity.refetch()}>Try again</AdminButton>} /></AdminCard>
      ) : activity.isPending ? (
        <ActivitySkeleton />
      ) : entries.length === 0 ? (
        <EmptyActivity />
      ) : (
        <section aria-label="Programme activity events" className="pa-card">
          {groupEntries(entries).map(([label, group]) => (
            <div key={label} className="pa-list">
              <h3 className="pa-activity-group">{label}</h3>
              {group.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
            </div>
          ))}
          <ActivityPagination page={activity.data!.pagination.page} totalPages={activity.data!.pagination.total_pages} hasPrevious={activity.data!.pagination.has_previous} hasNext={activity.data!.pagination.has_next} fetching={activity.isFetching} onChange={setPage} total={activity.data!.pagination.total_count} />
        </section>
      )}
    </AdminPage>
  );
}
function formatChange(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatChange).join(", ");
  try { return JSON.stringify(value); } catch { return "Details recorded"; }
}
function humanizeAction(action: string) {
  const text = action.replaceAll(".", " · ").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasChanges = Object.keys(entry.changes).length > 0;
  const Icon = iconForAction(entry.action);
  return (
    <article className="pa-row pa-activity-row">
      <IconTile tone={iconTone(entry.action)} icon={<Icon />} size="sm" />
      <div className="pa-row__body">
        <p className="pa-row__title">{actionLabels[entry.action] ?? humanizeAction(entry.action)}</p>
        <p className="pa-row__meta">{entry.actor} · {entry.actor_role.replaceAll("_", " ")}</p>
      </div>
      <time className="pa-activity-row__time" dateTime={entry.occurred_at}>{formatTime(entry.occurred_at)}</time>
      <AdminButton variant="ghost" size="sm" onClick={() => hasChanges && setExpanded((open) => !open)} disabled={!hasChanges} aria-expanded={hasChanges ? expanded : undefined}>View details <ArrowUpRight /></AdminButton>
      {expanded && hasChanges && <dl className="pa-changes">{Object.entries(entry.changes).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{formatChange(value)}</dd></div>)}</dl>}
    </article>
  );
}
function ActivityPagination({ page, totalPages, hasPrevious, hasNext, fetching, onChange, total }: { page: number; totalPages: number; hasPrevious: boolean; hasNext: boolean; fetching: boolean; onChange: (page: number) => void; total: number }) {
  const pages = pageWindow(page, totalPages);
  return (
    <footer className="pa-table-footer">
      <p>Showing {total ? (page - 1) * 10 + 1 : 0}–{Math.min(page * 10, total)} of {total} events{fetching ? " · Refreshing…" : ""}</p>
      <nav className="pa-pager" aria-label="Activity pages">
        <AdminButton variant="secondary" size="sm" disabled={!hasPrevious || fetching} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft /></AdminButton>
        {pages.map((item, index) => item === "…" ? <span key={`ellipsis-${index}`}>…</span> : <AdminButton variant="secondary" size="sm" key={item} aria-current={item === page ? "page" : undefined} onClick={() => onChange(item)} disabled={fetching}>{item}</AdminButton>)}
        <AdminButton variant="secondary" size="sm" disabled={!hasNext || fetching} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight /></AdminButton>
      </nav>
    </footer>
  );
}
function groupEntries(entries: ActivityEntry[]) { const groups = new Map<string, ActivityEntry[]>(); entries.forEach((entry) => { const label = dateGroupLabel(entry.occurred_at); groups.set(label, [...(groups.get(label) ?? []), entry]); }); return [...groups.entries()]; }
function dateGroupLabel(value: string) { const date = new Date(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1); const same = (a: Date, b: Date) => a.toDateString() === b.toDateString(); if (same(date, today)) return `Today · ${formatDate(date)}`; if (same(date, yesterday)) return `Yesterday · ${formatDate(date)}`; return formatDate(date); }
function formatDate(date: Date) { return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
function formatTime(value: string) { return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function iconForAction(action: string) { if (action.includes("invitation") || action.includes("invited")) return UserPlus; if (action.includes("setting")) return Settings2; if (action.includes("profile") || action.includes("status")) return Users; if (action.includes("placement")) return Mail; if (action.includes("mfa")) return Bell; return FileText; }
function iconTone(action: string): Tone { if (action.includes("invitation") || action.includes("invited")) return "teal"; if (action.includes("setting")) return "violet"; if (action.includes("placement")) return "amber"; return "blue"; }
function pageWindow(page: number, total: number): Array<number | "…"> { if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1); const pages: Array<number | "…"> = [1]; if (page > 4) pages.push("…"); for (let value = Math.max(2, page - 1); value <= Math.min(total - 1, page + 1); value += 1) pages.push(value); if (page < total - 3) pages.push("…"); pages.push(total); return [...new Set(pages)]; }
function EmptyActivity() { return <AdminCard flush><EmptyState icon={<CircleUserRound size={24} />} title="Activity will appear here" text="Once your team begins working, this space will help you understand what changed and when." /></AdminCard>; }
function ActivitySkeleton() { return <div className="pa-card" role="status" aria-label="Loading activity">{Array.from({ length: 5 }, (_, index) => <div className="pa-row" key={index}><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-56" /><Skeleton className="mt-2 h-3 w-40" /></div></div>)}</div>; }
