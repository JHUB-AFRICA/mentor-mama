import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, RotateCcw, Undo2 } from "lucide-react";
import { Skeleton } from "@mentormama/ui";

import { PortalErrorState } from "../../components/PortalErrorState";
import type { CurrentUser } from "../../services/api";
import {
  followUpKeys,
  listFollowUps,
  markFollowUpDone,
  reopenFollowUp,
  type FollowUp,
} from "../../services/follow-ups";
import {
  AdminButton,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  Notice,
  SelectField,
  Toolbar,
} from "../programme-admin/ui/AdminKit";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import "../mentor/mentor-follow-ups.css";
import "./supervisor-follow-ups.css";

type Tab = "pending" | "done";

const AGE_OPTIONS = [
  { value: "", label: "Any age" },
  { value: "3", label: "3 days or older" },
  { value: "7", label: "A week or older" },
  { value: "14", label: "2 weeks or older" },
];

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function dateLabel(value: string, withYear = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(value.length === 10 ? `${value}T00:00:00` : value));
}

function ageLabel(days: number) {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** One calm sentence on why this is here. Names the mentor, never quotes the session. */
function reasonLine(item: FollowUp) {
  const who = item.mentor?.name ?? "The mentor";
  const kind = item.session_type_label.toLowerCase();
  return `${who} asked for your review after a ${kind} session. A short conversation to agree who acts is usually enough.`;
}

/** The nurse manager's list of sessions where a mentor asked for supervisor review at this facility. */
export function SupervisorFollowUps({ user, onError }: { user: CurrentUser; onError?: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [mentorId, setMentorId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [minAge, setMinAge] = useState("");
  const [page, setPage] = useState(1);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; student: string } | null>(null);

  const list = useQuery({
    queryKey: [...followUpKeys.all, "supervisor", tab, mentorId, studentId, minAge, page],
    queryFn: () =>
      listFollowUps({ status: tab, mentorId, studentId, minAgeDays: minAge ? Number(minAge) : undefined, page, pageSize: 20 }),
    placeholderData: (previous) => previous,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: followUpKeys.all });

  const done = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => markFollowUpDone(id, text),
    onSuccess: (item) => {
      setProblem(null);
      setOpenNote(null);
      setNote("");
      setUndo({ id: item.session_id, student: item.student?.name ?? "the student" });
      void refresh();
    },
    onError: (cause) => setProblem(errorMessage(cause, "We could not mark that done. Try again.")),
  });

  const reopen = useMutation({
    mutationFn: (id: string) => reopenFollowUp(id),
    onSuccess: () => {
      setProblem(null);
      setUndo(null);
      void refresh();
    },
    onError: (cause) => setProblem(errorMessage(cause, "We could not put that back. Try again.")),
  });

  const meta = list.data?.meta;
  const counts = meta?.counts;
  const items = list.data?.data ?? [];
  const hasFilters = Boolean(mentorId || studentId || minAge);

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
    setOpenNote(null);
    setUndo(null);
  }

  function clearFilters() {
    setMentorId("");
    setStudentId("");
    setMinAge("");
    setPage(1);
  }

  return (
    <FacilityWorkspaceFrame user={user} active="follow-ups" title="Supervisor follow-ups" onError={onError}>
      <AdminPage className="mfu sfu">
        <AdminPageHeader
          eyebrow="Review"
          title="Supervisor follow-ups"
          description="Mentors ask for your review after a session when something is worth a conversation. Mark each one done once you have picked it up, so the list shows only what is still waiting."
        />

        <AdminTabs<Tab>
          label="Follow-up status"
          value={tab}
          onChange={switchTab}
          tabs={[
            { value: "pending", label: "Pending", count: counts?.pending },
            { value: "done", label: "Done", count: counts?.done },
          ]}
        />

        <Toolbar filters={3}>
          <SelectField
            value={mentorId}
            onChange={(value) => { setMentorId(value); setPage(1); }}
            label="Filter by mentor"
            options={[{ value: "", label: "All mentors" }, ...(meta?.mentors ?? []).map((m) => ({ value: m.id, label: m.name }))]}
          />
          <SelectField
            value={studentId}
            onChange={(value) => { setStudentId(value); setPage(1); }}
            label="Filter by student"
            options={[{ value: "", label: "All students" }, ...(meta?.students ?? []).map((s) => ({ value: s.id, label: s.name }))]}
          />
          <SelectField
            value={minAge}
            onChange={(value) => { setMinAge(value); setPage(1); }}
            label="Filter by age"
            options={AGE_OPTIONS}
          />
        </Toolbar>

        <div className="mfu-live" role="status" aria-live="polite">
          {undo && (
            <div className="mfu-undo">
              <CheckCircle2 aria-hidden="true" />
              <span>
                Marked done for <strong>{undo.student}</strong>.
              </span>
              <button type="button" onClick={() => reopen.mutate(undo.id)} disabled={reopen.isPending}>
                <Undo2 aria-hidden="true" /> Undo
              </button>
            </div>
          )}
        </div>

        {problem && (
          <div className="mfu-error" role="alert">
            <AlertTriangle aria-hidden="true" />
            <span>{problem}</span>
            <button type="button" onClick={() => setProblem(null)}>Dismiss</button>
          </div>
        )}

        {list.isPending ? (
          <div className="mfu-skeleton" aria-busy="true" aria-label="Loading follow-ups">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : list.isError && !list.data ? (
          <PortalErrorState title="We could not load the follow-ups" onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title="No follow-ups match these filters"
              text="Try another mentor, student or age."
              action={<AdminButton variant="secondary" size="sm" onClick={clearFilters}>Clear filters</AdminButton>}
            />
          ) : tab === "pending" ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title="Nothing waiting for you"
              text="When a mentor asks for supervisor review after a session, it appears here until you mark it done."
            />
          ) : (
            <EmptyState
              icon={<CheckCircle2 />}
              title="Nothing marked done yet"
              text="Follow-ups you finish are kept here, so you can look back or put one back on your list."
            />
          )
        ) : (
          <>
            <ul className="mfu-list" aria-label={tab === "pending" ? "Pending supervisor follow-ups" : "Done supervisor follow-ups"}>
              {items.map((item) => (
                <li key={item.session_id}>
                  <SupervisorCard
                    item={item}
                    noteOpen={openNote === item.session_id}
                    note={note}
                    busy={
                      (done.isPending && done.variables?.id === item.session_id) ||
                      (reopen.isPending && reopen.variables === item.session_id)
                    }
                    onNote={setNote}
                    onOpenNote={() => { setOpenNote(item.session_id); setNote(""); setProblem(null); }}
                    onCancelNote={() => setOpenNote(null)}
                    onDone={() => done.mutate({ id: item.session_id, text: note })}
                    onReopen={() => reopen.mutate(item.session_id)}
                  />
                </li>
              ))}
            </ul>

            {meta && meta.pages > 1 && (
              <nav className="mfu-pager" aria-label="Follow-up pages">
                <AdminButton variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)}>Previous</AdminButton>
                <span>Page {meta.page} of {meta.pages}</span>
                <AdminButton variant="secondary" size="sm" disabled={meta.page >= meta.pages} onClick={() => setPage(meta.page + 1)}>Next</AdminButton>
              </nav>
            )}
          </>
        )}

        <Notice icon={<CalendarDays aria-hidden="true" />}>
          A follow-up counts as overdue after 7 days. This list shows who asked and what kind of session it was, never the notes from the session.
        </Notice>
      </AdminPage>
    </FacilityWorkspaceFrame>
  );
}

function SupervisorCard({
  item, noteOpen, note, busy, onNote, onOpenNote, onCancelNote, onDone, onReopen,
}: {
  item: FollowUp;
  noteOpen: boolean;
  note: string;
  busy: boolean;
  onNote: (value: string) => void;
  onOpenNote: () => void;
  onCancelNote: () => void;
  onDone: () => void;
  onReopen: () => void;
}) {
  const student = item.student?.name ?? "Assigned student";
  const isDone = item.status === "done";
  const noteId = `sfu-note-${item.session_id}`;
  return (
    <article
      className={`mfu-card${item.overdue ? " mfu-card--overdue" : ""}${isDone ? " mfu-card--done" : ""}`}
      aria-label={`Supervisor review for ${student}`}
    >
      <header className="mfu-card__head">
        <div className="mfu-card__who">
          <h3><Link to={`/placements/${item.placement_id}`}>{student}</Link></h3>
          <p>
            {item.ward ? `${item.ward} · ` : ""}
            {item.session_type_label} on {dateLabel(item.session_date, true)}
          </p>
        </div>
        <div className="mfu-card__chips">
          {item.overdue && !isDone && <span className="mfu-chip mfu-chip--overdue">Overdue</span>}
          {isDone ? (
            <span className="mfu-chip mfu-chip--done"><CheckCircle2 aria-hidden="true" /> Done</span>
          ) : (
            <span className="mfu-chip">{ageLabel(item.age_days)}</span>
          )}
        </div>
      </header>

      <p className="sfu-asked">
        <span className="sfu-asked__label">Asked by</span>{" "}
        {item.mentor ? <Link to={`/facility/mentors/${item.mentor.id}`}>{item.mentor.name}</Link> : "the mentor"}
      </p>
      {!isDone && <p className="mfu-card__next">{reasonLine(item)}</p>}
      {item.topics.length > 0 && (
        <p className="mfu-card__topics">
          <span className="sr-only">Topics: </span>
          {item.topics.join(" · ")}
        </p>
      )}

      {isDone && (
        <p className="mfu-card__resolved">
          Done {item.resolved_at ? dateLabel(item.resolved_at) : ""}
          {item.resolved_by ? ` by ${item.resolved_by}` : ""}
          {item.note ? ` — “${item.note}”` : ""}
        </p>
      )}

      {noteOpen && !isDone && (
        <div className="mfu-note">
          <label htmlFor={noteId}>Add a short note <span>(optional)</span></label>
          <textarea
            id={noteId}
            value={note}
            maxLength={280}
            rows={2}
            onChange={(event) => onNote(event.target.value)}
            placeholder="For example: spoke to the mentor, agreed a plan"
          />
          <p>Keep it brief and leave out patient details. {280 - note.length} characters left.</p>
          <div className="mfu-actions">
            <AdminButton size="sm" onClick={onDone} disabled={busy} icon={<CheckCircle2 aria-hidden="true" />}>
              {busy ? "Saving…" : "Confirm done"}
            </AdminButton>
            <AdminButton variant="ghost" size="sm" onClick={onCancelNote} disabled={busy}>Cancel</AdminButton>
          </div>
        </div>
      )}

      {!noteOpen && (
        <div className="mfu-actions">
          {isDone ? (
            <AdminButton variant="secondary" size="sm" onClick={onReopen} disabled={busy} icon={<RotateCcw aria-hidden="true" />}>
              {busy ? "Putting back…" : "Reopen"}
            </AdminButton>
          ) : (
            <AdminButton size="sm" onClick={onOpenNote} icon={<CheckCircle2 aria-hidden="true" />}>
              Mark done<span className="sr-only"> for {student}</span>
            </AdminButton>
          )}
          <Link to={`/placements/${item.placement_id}`} className="pa-btn pa-btn--ghost pa-btn--sm">Placement</Link>
          {item.mentor && (
            <Link to={`/facility/mentors/${item.mentor.id}`} className="pa-btn pa-btn--ghost pa-btn--sm">Mentor</Link>
          )}
        </div>
      )}
    </article>
  );
}
