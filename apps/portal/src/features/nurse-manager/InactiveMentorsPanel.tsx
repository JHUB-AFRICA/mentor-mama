import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { BellRing, CheckCircle2, Download, HeartHandshake } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Modal } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { csvBlob, datedFilename, saveBlob } from "../../lib/download";
import {
  ACTIVITY_DAY_OPTIONS,
  activityCsvRows,
  getMentorActivity,
  remindedLabel,
  remindMentor,
  remindMentors,
  sortActivity,
  type ActivitySort,
  type MentorActivityRow,
} from "../../services/mentor-activity";
import { AdminButton, EmptyState, SelectField, StatusPill } from "../programme-admin/ui/AdminKit";
import "./inactive-mentors.css";

type Focus = "inactive" | "induction";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : null);

function daysAgo(days: number | null) {
  if (days === null) return "Never logged";
  if (days === 0) return "Today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export const inactiveQueryKey = (days: number) => ["facility-inactive-mentors", days] as const;

/** The server caps one bulk send; the confirmation says so when the list is longer. */
const BULK_CAP = 50;

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Mentors who may welcome a check-in. Supportive visibility for the nurse manager, not a performance score. */
export function InactiveMentorsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmAll, setConfirmAll] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "problem"; text: string } | null>(null);
  const [days, setDays] = useState<number>(14);
  const [sort, setSort] = useState<ActivitySort>("quiet_longest");
  const [focus, setFocus] = useState<Focus>("inactive");
  const query = useQuery({ queryKey: inactiveQueryKey(days), queryFn: () => getMentorActivity(days), staleTime: 15_000, placeholderData: (previous) => previous });

  const data = query.data;
  const inactiveRows = (data?.results ?? []).filter((row) => row.inactive);
  const inductionRows = (data?.results ?? []).filter((row) => row.induction_waiting);
  const visible = sortActivity(focus === "inactive" ? inactiveRows : inductionRows, sort);
  const inductionDays = data?.definition.induction_waiting_days ?? 7;

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["facility-inactive-mentors"] });
  const dueNow = inactiveRows.filter((row) => row.can_remind);

  const remindOne = useMutation({
    mutationFn: (row: MentorActivityRow) => remindMentor(row.id, days),
    onSuccess: (_result, row) => {
      setNotice({ tone: "ok", text: `Reminder sent to ${row.name}. They will see it in MentorMAMA and by email.` });
      void refreshList();
    },
    onError: (cause, row) => {
      setNotice({ tone: "problem", text: cause instanceof Error ? cause.message : `We could not remind ${row.name}. Try again.` });
      void refreshList();
    },
  });

  const remindAll = useMutation({
    mutationFn: () => remindMentors(days),
    onSuccess: ({ summary }) => {
      setConfirmAll(false);
      const skipped = summary.already_reminded + summary.not_listed;
      setNotice({
        tone: "ok",
        text:
          `${summary.sent === 0 ? "No new reminders were needed" : `${plural(summary.sent, "reminder")} sent`}.` +
          (skipped ? ` ${plural(skipped, "mentor")} skipped because they were reminded recently or are no longer listed.` : "") +
          (summary.remaining ? ` ${summary.remaining} more can be reminded: send again to continue.` : ""),
      });
      void refreshList();
    },
    onError: (cause) => {
      setConfirmAll(false);
      setNotice({ tone: "problem", text: cause instanceof Error ? cause.message : "We could not send the reminders. Try again." });
      void refreshList();
    },
  });

  function download() {
    saveBlob(csvBlob(activityCsvRows(visible, days)), datedFilename(focus === "inactive" ? "inactive-mentors" : "mentors-inductions-waiting", "csv", [`${days}-days`]));
  }

  return (
    <section className="grid gap-4" aria-labelledby="inactive-mentors-heading">
      <div className="grid gap-2">
        <h2 id="inactive-mentors-heading" className="text-lg font-semibold">Mentors who may need a check-in</h2>
        <p className="im-intro">
          This list is here so you can reach out and support your mentors. It shows when each mentor last logged a session, never what was discussed.
        </p>
      </div>

      <details className="im-definition">
        <summary>How we decide who is listed</summary>
        <ul>
          <li>The mentor is at your facility and is supporting at least one student now (orientation, induction, active or paused), but has logged no session in the last {days} days.</li>
          <li>Or they are supporting students and have never logged a session. Mentors assigned in the last {days} days are given that time first.</li>
          <li>Or their account is still waiting for the invitation to be accepted, or they have not signed in yet.</li>
          <li>Suspended and deactivated accounts are not listed. Mentors with no students are not listed for sessions.</li>
          <li>“Inductions waiting” is a separate list: a mentor with an induction checklist open for more than {inductionDays} days.</li>
        </ul>
      </details>

      <div className="im-controls">
        <div className="im-field">
          <span aria-hidden="true">Show</span>
          <SelectField
            label="Which list to show"
            value={focus}
            onChange={(value) => setFocus(value as Focus)}
            options={[
              { value: "inactive", label: `Quiet mentors${data ? ` (${inactiveRows.length})` : ""}` },
              { value: "induction", label: `Inductions waiting${data ? ` (${inductionRows.length})` : ""}` },
            ]}
          />
        </div>
        <div className="im-field">
          <span aria-hidden="true">No session in the last</span>
          <SelectField
            label="Period without a session"
            value={String(days)}
            onChange={(value) => setDays(Number(value))}
            options={ACTIVITY_DAY_OPTIONS.map((option) => ({ value: String(option), label: `${option} days` }))}
          />
        </div>
        <div className="im-field">
          <span aria-hidden="true">Sort by</span>
          <SelectField
            label="Sort order"
            value={sort}
            onChange={(value) => setSort(value as ActivitySort)}
            options={[
              { value: "quiet_longest", label: "Longest since last session" },
              { value: "quiet_shortest", label: "Most recent session first" },
              { value: "name", label: "Name A to Z" },
            ]}
          />
        </div>
        <span className="im-spacer" />
        {focus === "inactive" && dueNow.length > 0 && (
          <AdminButton variant="secondary" size="sm" icon={<BellRing />} onClick={() => { setNotice(null); setConfirmAll(true); }}>
            Remind all listed ({dueNow.length})
          </AdminButton>
        )}
        <AdminButton variant="secondary" size="sm" icon={<Download />} disabled={visible.length === 0} onClick={download}>
          Download CSV
        </AdminButton>
      </div>

      <div className="im-live" role="status" aria-live="polite">
        {notice && (
          <p className={`im-notice im-notice--${notice.tone}`} role={notice.tone === "problem" ? "alert" : undefined}>
            {notice.tone === "ok" && <CheckCircle2 aria-hidden="true" />}
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
          </p>
        )}
      </div>

      <div aria-live="polite" aria-busy={query.isFetching}>
        {query.isPending ? (
          <div className="grid gap-3" data-testid="inactive-skeleton" aria-label="Loading mentors">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : query.isError ? (
          <PortalErrorState title="We couldn’t load the mentor list" onRetry={() => void query.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<HeartHandshake />}
            title={focus === "inactive" ? "Every mentor with students has logged a session recently" : "No inductions are waiting for sign-off"}
            text={focus === "inactive" ? `Nobody is quiet for more than ${days} days. You can choose a shorter period above.` : `No induction has been open for more than ${inductionDays} days.`}
          />
        ) : (
          <ul className="im-list" aria-label={focus === "inactive" ? "Mentors who may need a check-in" : "Mentors with inductions waiting"}>
            {visible.map((row) => (
              <MentorCard
                key={row.id}
                row={row}
                days={days}
                focus={focus}
                sending={remindOne.isPending && remindOne.variables?.id === row.id}
                onRemind={() => { setNotice(null); remindOne.mutate(row); }}
                onOpen={() => navigate(`/facility/mentors/${row.id}`)}
              />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        dismissible={!remindAll.isPending}
        icon={<BellRing />}
        title={`Remind ${plural(Math.min(dueNow.length, BULK_CAP), "mentor")}?`}
        description="A short, kind reminder in your name."
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setConfirmAll(false)} disabled={remindAll.isPending}>Cancel</AdminButton>
            <AdminButton size="sm" icon={<BellRing />} onClick={() => remindAll.mutate()} disabled={remindAll.isPending || dueNow.length === 0}>
              {remindAll.isPending ? "Sending…" : `Send ${plural(Math.min(dueNow.length, BULK_CAP), "reminder")}`}
            </AdminButton>
          </>
        }
      >
        <p className="im-confirm" data-testid="remind-all-count">
          {plural(dueNow.length, "mentor")} will be reminded{dueNow.length > BULK_CAP ? `. You can send ${BULK_CAP} at a time, so the ${BULK_CAP} quietest go first` : ""}.
        </p>
        <ul className="im-confirm-list">
          <li>Each mentor gets an in-app notice and an email from you. It says how many students they have and that logging takes about a minute and works offline.</li>
          <li>No student names are included.</li>
          <li>Mentors reminded in the last 3 days, and accounts that have not accepted their invitation, are skipped.</li>
        </ul>
      </Modal>
    </section>
  );
}

function MentorCard({
  row, days, focus, sending, onRemind, onOpen,
}: { row: MentorActivityRow; days: number; focus: Focus; sending: boolean; onRemind: () => void; onOpen: () => void }) {
  const reminded = remindedLabel(row.last_reminded_at);
  const noteId = `remind-note-${row.id}`;
  const lastSession = formatDate(row.last_session_date);
  const signedIn = formatDate(row.last_sign_in);
  const chips = focus === "inactive" ? row.reasons : [row.induction_note];
  return (
    <li className="im-card">
      <div className="im-card__head">
        <div className="im-card__who">
          <Link className="im-card__name" to={`/facility/mentors/${row.id}`}>{row.name}</Link>
          <span className="im-card__email">{row.email}</span>
        </div>
        <StatusPill tone={row.status === "active" ? "success" : "warning"}>{row.status === "active" ? "Active" : "Invited"}</StatusPill>
      </div>
      <ul className="im-chips" aria-label="Why this mentor is listed">
        {chips.filter(Boolean).map((reason) => (
          <li key={reason} className={`im-chip${focus === "induction" ? " im-chip--info" : ""}`}>{reason}</li>
        ))}
      </ul>
      <dl className="im-facts">
        <div>
          <dt>Last session</dt>
          <dd>{lastSession ?? "None yet"}<small>{daysAgo(row.days_since_last_session)}</small></dd>
        </div>
        <div>
          <dt>Last {days} days</dt>
          <dd>{row.sessions_in_window} {row.sessions_in_window === 1 ? "session" : "sessions"}</dd>
        </div>
        <div>
          <dt>Students now</dt>
          <dd>{row.live_students}<small>{row.live_students ? `${row.students_without_recent_session} with no recent session` : "None at the moment"}</small></dd>
        </div>
        <div>
          <dt>Required training</dt>
          <dd>{row.training.required_total ? `${row.training.required_completed} of ${row.training.required_total} done` : "None required"}</dd>
        </div>
        <div>
          <dt>Last signed in</dt>
          <dd>{signedIn ?? "Not yet"}</dd>
        </div>
        <div>
          <dt>New students</dt>
          <dd>{row.accepting_students ? "Accepting" : "Not accepting"}</dd>
        </div>
      </dl>
      <div className="im-card__foot">
        {focus === "inactive" && reminded && <span id={noteId} className="im-reminded">{reminded}</span>}
        {focus === "inactive" && row.remindable && (
          <AdminButton
            variant="secondary"
            size="sm"
            icon={<BellRing />}
            onClick={onRemind}
            disabled={!row.can_remind || sending}
            aria-describedby={reminded ? noteId : undefined}
          >
            {sending ? "Sending…" : <>Send reminder<span className="sr-only"> to {row.name}</span></>}
          </AdminButton>
        )}
        <AdminButton variant="secondary" size="sm" onClick={onOpen}>
          View {row.name.split(" ")[0]}
        </AdminButton>
      </div>
    </li>
  );
}
