import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  CalendarDays,
  GraduationCap,
  Building2,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
  FileText,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { getActivity, type ActivityEntry } from "../../services/api";
import { AdminButton, AdminPage, AdminPageHeader, EmptyState, IconTile, SelectField, Toolbar, type Tone } from "../programme-admin/ui/AdminKit";
import { ServerPager } from "../programme-admin/ui/DataTable";

const CATEGORIES = [
  { value: "", label: "All activity" },
  { value: "placements", label: "Placements" },
  { value: "sessions", label: "Sessions" },
  { value: "learning", label: "Learning and induction" },
  { value: "cohorts", label: "Cohorts and students" },
  { value: "facility", label: "Facilities and wards" },
  { value: "safeguarding", label: "Safeguarding" },
  { value: "reports", label: "Reports" },
  { value: "account", label: "Account and security" },
];

const VISUAL: Record<string, { icon: ReactNode; tone: Tone }> = {
  placements: { icon: <BriefcaseBusiness />, tone: "teal" },
  sessions: { icon: <CalendarDays />, tone: "blue" },
  learning: { icon: <GraduationCap />, tone: "violet" },
  cohorts: { icon: <UsersRound />, tone: "sky" },
  facility: { icon: <Building2 />, tone: "amber" },
  safeguarding: { icon: <ShieldCheck />, tone: "rose" },
  reports: { icon: <FileText />, tone: "slate" },
  account: { icon: <UserRound />, tone: "slate" },
  library: { icon: <BookOpen />, tone: "green" },
  people: { icon: <UserRound />, tone: "blue" },
};

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * The signed-in person's own activity: what they did and what happened to their records.
 * Used by every role. The server decides what is related to you; nothing technical is shown.
 */
export function MyActivity({ eyebrow = "Your activity" }: { eyebrow?: string }) {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const activity = useQuery({
    queryKey: ["my-activity", page, category, from, to],
    queryFn: () => getActivity(page, 20, { category, date_from: from, date_to: to }),
    placeholderData: (previous) => previous,
  });
  const rows = activity.data?.results ?? [];
  const groups = new Map<string, ActivityEntry[]>();
  rows.forEach((row) => {
    const label = dayLabel(row.occurred_at);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  });

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={eyebrow}
        title="Activity"
        description="What you have done, and what has happened to your placements and records. Only activity linked to you appears here."
        actions={
          <AdminButton variant="secondary" size="sm" icon={<RefreshCw />} disabled={activity.isFetching} onClick={() => void activity.refetch()}>
            {activity.isFetching ? "Refreshing…" : "Refresh"}
          </AdminButton>
        }
      />
      <Toolbar filters={3}>
        <SelectField label="Type" value={category} onChange={(value) => { setCategory(value); setPage(1); }} options={CATEGORIES} />
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
        <EmptyState icon={<Activity />} title="No activity yet" text="Things you do, and changes to your placements, will appear here." />
      ) : (
        <div className="pa-table-wrap" aria-busy={activity.isFetching}>
          {[...groups.entries()].map(([label, entries]) => (
            <section key={label}>
              <h3 className="pa-feed__day">{label}</h3>
              <ul className="pa-feed">
                {entries.map((entry) => (
                  <FeedRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
          {activity.data && <ServerPager pagination={activity.data.pagination} onPage={setPage} noun="events" />}
        </div>
      )}
    </AdminPage>
  );
}

function FeedRow({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const visual = VISUAL[entry.category] ?? { icon: <Activity />, tone: "teal" as Tone };
  return (
    <li className="pa-feed__item">
      <IconTile tone={visual.tone} size="sm" icon={visual.icon} />
      <div className="pa-feed__body">
        <div className="pa-feed__head">
          <div>
            <strong>{entry.title}</strong>
            <small>
              {entry.by_me ? "You" : `${entry.actor}${entry.actor_role ? ` · ${entry.actor_role}` : ""}`}
              {entry.summary ? ` · ${entry.summary}` : ""}
            </small>
          </div>
          <time dateTime={entry.occurred_at}>
            {new Date(entry.occurred_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </time>
        </div>
        {entry.details.length > 0 && (
          <>
            <button type="button" className="pa-feed__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              {open ? "Hide details" : "Show details"}
              <ChevronDown aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />
            </button>
            {open && (
              <dl className="pa-feed__details">
                {entry.details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </div>
    </li>
  );
}
