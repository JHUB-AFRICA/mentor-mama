import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BriefcaseBusiness, ChevronDown, Download, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { getActivity, type ActivityEntry, type CurrentUser } from "../../services/api";
import { AdminButton, AdminPage, AdminPageHeader, EmptyState, IconTile, SelectField, Toolbar } from "../programme-admin/ui/AdminKit";
import { ServerPager } from "../programme-admin/ui/DataTable";

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
const GROUPS = [
  { value: "", label: "All activity" },
  { value: "cohort.", label: "Cohorts" },
  { value: "student.", label: "Students" },
  { value: "placement.", label: "Placements" },
  { value: "safeguarding.", label: "Safeguarding" },
  { value: "export.", label: "Exports" },
];

function iconFor(action: string) {
  if (action.startsWith("export.")) return <Download />;
  if (action.startsWith("cohort.") || action.startsWith("student.")) return <UsersRound />;
  if (action.startsWith("safeguarding.")) return <ShieldCheck />;
  if (action.startsWith("placement.")) return <BriefcaseBusiness />;
  return <Activity />;
}
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return "Details recorded";
  }
}

/** A readable audit trail of what has changed in the institution. */
export function CoordinatorActivity({ user }: { user: CurrentUser }) {
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const activity = useQuery({
    queryKey: ["coordinator-activity", page, from, to],
    queryFn: () => getActivity(page, 20, { date_from: from, date_to: to }),
    placeholderData: (previous) => previous,
  });
  const rows = (activity.data?.results ?? []).filter((entry) => !group || entry.action.startsWith(group));

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={user.scope?.institution_name ?? "Your institution"}
        title="Activity"
        description="Who changed what, and when. Use it to follow decisions across cohorts, placements and reviews."
        actions={
          <AdminButton variant="secondary" size="sm" icon={<RefreshCw />} disabled={activity.isFetching} onClick={() => void activity.refetch()}>
            {activity.isFetching ? "Refreshing…" : "Refresh"}
          </AdminButton>
        }
      />
      <Toolbar filters={3}>
        <SelectField label="Type of activity" value={group} onChange={setGroup} options={GROUPS} />
        <label className="rp-datefield">
          <span className="sr-only">From date</span>
          <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        </label>
        <label className="rp-datefield">
          <span className="sr-only">To date</span>
          <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </label>
      </Toolbar>
      {activity.isPending ? (
        <Skeleton className="h-72" />
      ) : activity.isError ? (
        <PortalErrorState onRetry={() => void activity.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Activity />} title="No activity to show" text="Cohort, enrolment, placement, review and export changes will appear here." />
      ) : (
        <div className="pa-table-wrap" aria-busy={activity.isFetching}>
          <ul className="pa-feed">
            {rows.map((entry) => (
              <FeedRow key={entry.id} entry={entry} />
            ))}
          </ul>
          {activity.data && <ServerPager pagination={activity.data.pagination} onPage={setPage} noun="events" />}
        </div>
      )}
    </AdminPage>
  );
}

function FeedRow({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const details = Object.entries(entry.changes);
  return (
    <li className="pa-feed__item">
      <IconTile tone="teal" size="sm" icon={iconFor(entry.action)} />
      <div className="pa-feed__body">
        <div className="pa-feed__head">
          <div>
            <strong>{labels[entry.action] ?? entry.action.replaceAll(".", " · ")}</strong>
            <small>
              {entry.actor} · {entry.actor_role.replaceAll("_", " ")}
            </small>
          </div>
          <time dateTime={entry.occurred_at}>
            {new Date(entry.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </time>
        </div>
        {details.length > 0 && (
          <button type="button" className="pa-feed__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? "Hide details" : "Show details"}
            <ChevronDown aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />
          </button>
        )}
        {open && (
          <dl className="pa-feed__details">
            {details.map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}
