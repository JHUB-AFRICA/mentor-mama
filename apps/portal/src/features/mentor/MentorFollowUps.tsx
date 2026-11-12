import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  HeartHandshake,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";

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
import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";
import "./mentor-follow-ups.css";

type Tab = "pending" | "done";

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

export function MentorFollowUps({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [placementFilter, setPlacementFilter] = useState(() => searchParams.get("placement") ?? "");
  const [tab, setTab] = useState<Tab>("pending");
  const [action, setAction] = useState("");
  const [studentId, setStudentId] = useState("");
  const [page, setPage] = useState(1);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; student: string; label: string } | null>(null);

  const list = useQuery({
    queryKey: [...followUpKeys.all, "list", tab, action, studentId, placementFilter, page],
    queryFn: () => listFollowUps({ status: tab, action, studentId, placementId: placementFilter, page, pageSize: 20 }),
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
      setUndo({ id: item.session_id, student: item.student?.name ?? "the student", label: item.label });
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
  const hasFilters = Boolean(action || studentId || placementFilter);
  const firstLoad = list.isPending;

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
    setOpenNote(null);
    setUndo(null);
  }

  function clearFilters() {
    setAction("");
    setStudentId("");
    setPlacementFilter("");
    setPage(1);
  }

  return (
    <MentorWorkspaceFrame user={user} title="Follow-ups" active="followups">
      <div className="mfu-wrap">
        <AdminPage className="mfu">
          <AdminPageHeader
            eyebrow="Clinical practice"
            title="Follow-ups"
            description="What you agreed to do after a session. Mark each one done when it is finished so the list stays honest."
            actions={
              <Link to="/mentor?view=log" className="pa-btn pa-btn--secondary pa-btn--sm">
                <ClipboardCheck aria-hidden="true" /> Log a session
              </Link>
            }
          />

          {counts && counts.student_support > 0 && tab === "pending" && (
            <div className="mfu-support" role="note">
              <HeartHandshake aria-hidden="true" />
              <div>
                <strong>
                  {counts.student_support === 1
                    ? "1 student may need support"
                    : `${counts.student_support} students may need support`}
                </strong>
                <span>You flagged these as a student support referral. They are worth doing first.</span>
              </div>
              <button
                type="button"
                className="mfu-support__action"
                onClick={() => {
                  setAction(action === "student_referral" ? "" : "student_referral");
                  setPage(1);
                }}
              >
                {action === "student_referral" ? "Show all" : "Show these"}
              </button>
            </div>
          )}

          <AdminTabs<Tab>
            label="Follow-up status"
            value={tab}
            onChange={switchTab}
            tabs={[
              { value: "pending", label: "Pending", count: counts?.pending },
              { value: "done", label: "Done", count: counts?.done },
            ]}
          />

          <Toolbar filters={2}>
            <SelectField
              value={action}
              onChange={(value) => {
                setAction(value);
                setPage(1);
              }}
              label="Filter by follow-up type"
              options={[{ value: "", label: "All follow-up types" }, ...(meta?.kinds ?? [])]}
            />
            <SelectField
              value={studentId}
              onChange={(value) => {
                setStudentId(value);
                setPage(1);
              }}
              label="Filter by student"
              options={[
                { value: "", label: "All students" },
                ...(meta?.students ?? []).map((student) => ({ value: student.id, label: student.name })),
              ]}
            />
          </Toolbar>

          {placementFilter && (
            <p className="mfu-scoped">
              Showing one student’s follow-ups.{" "}
              <button type="button" onClick={() => { setPlacementFilter(""); setPage(1); }}>
                Show everyone
              </button>
            </p>
          )}

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
              <button type="button" onClick={() => setProblem(null)}>
                Dismiss
              </button>
            </div>
          )}

          {firstLoad ? (
            <div className="mfu-skeleton" aria-busy="true" aria-label="Loading follow-ups">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : list.isError && !list.data ? (
            <EmptyState
              icon={<AlertTriangle />}
              title="We could not load your follow-ups"
              text={errorMessage(list.error, "Check your connection and try again.")}
              action={
                <AdminButton variant="secondary" size="sm" onClick={() => void list.refetch()}>
                  Try again
                </AdminButton>
              }
            />
          ) : items.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={<CheckCircle2 />}
                title="No follow-ups match these filters"
                text="Try another type or student."
                action={
                  <AdminButton variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </AdminButton>
                }
              />
            ) : tab === "pending" ? (
              <EmptyState
                icon={<CheckCircle2 />}
                title="You're all caught up"
                text="No follow-ups are waiting. When you log a session with a follow-up, it appears here until you mark it done."
                action={
                  <Link to="/mentor?view=log" className="pa-btn pa-btn--secondary pa-btn--sm">
                    Log a session <ArrowRight aria-hidden="true" />
                  </Link>
                }
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
              <ul className="mfu-list" aria-label={tab === "pending" ? "Pending follow-ups" : "Done follow-ups"}>
                {items.map((item) => (
                  <li key={item.session_id}>
                    <FollowUpCard
                      item={item}
                      noteOpen={openNote === item.session_id}
                      note={note}
                      busy={
                        (done.isPending && done.variables?.id === item.session_id) ||
                        (reopen.isPending && reopen.variables === item.session_id)
                      }
                      onNote={setNote}
                      onOpenNote={() => {
                        setOpenNote(item.session_id);
                        setNote("");
                        setProblem(null);
                      }}
                      onCancelNote={() => setOpenNote(null)}
                      onDone={() => done.mutate({ id: item.session_id, text: note })}
                      onReopen={() => reopen.mutate(item.session_id)}
                    />
                  </li>
                ))}
              </ul>

              {meta && meta.pages > 1 && (
                <nav className="mfu-pager" aria-label="Follow-up pages">
                  <AdminButton variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)}>
                    Previous
                  </AdminButton>
                  <span>
                    Page {meta.page} of {meta.pages}
                  </span>
                  <AdminButton variant="secondary" size="sm" disabled={meta.page >= meta.pages} onClick={() => setPage(meta.page + 1)}>
                    Next
                  </AdminButton>
                </nav>
              )}
            </>
          )}

          <Notice icon={<CalendarDays aria-hidden="true" />}>
            A follow-up counts as overdue after 7 days, or 1 day for “Review on next shift”. This list shows only what you
            agreed to do, never the notes from the session.
          </Notice>
        </AdminPage>
      </div>
    </MentorWorkspaceFrame>
  );
}

function FollowUpCard({
  item,
  noteOpen,
  note,
  busy,
  onNote,
  onOpenNote,
  onCancelNote,
  onDone,
  onReopen,
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
  const closed = ["completed", "archived", "withdrawn"].includes(item.placement_state);
  const noteId = `mfu-note-${item.session_id}`;
  return (
    <article
      className={`mfu-card${item.overdue ? " mfu-card--overdue" : ""}${item.is_student_support && !isDone ? " mfu-card--support" : ""}${isDone ? " mfu-card--done" : ""}`}
      aria-label={`${item.label} for ${student}`}
    >
      <header className="mfu-card__head">
        <div className="mfu-card__who">
          <h3>
            <Link to={`/mentor/students/${item.placement_id}`}>{student}</Link>
          </h3>
          <p>
            {item.ward ? `${item.ward} · ` : ""}
            {item.session_type_label} on {dateLabel(item.session_date, true)}
          </p>
        </div>
        <div className="mfu-card__chips">
          {item.is_student_support && !isDone && (
            <span className="mfu-chip mfu-chip--support">
              <HeartHandshake aria-hidden="true" /> Student support
            </span>
          )}
          {item.overdue && <span className="mfu-chip mfu-chip--overdue">Overdue</span>}
          {isDone ? (
            <span className="mfu-chip mfu-chip--done">
              <CheckCircle2 aria-hidden="true" /> Done
            </span>
          ) : (
            <span className="mfu-chip">{ageLabel(item.age_days)}</span>
          )}
        </div>
      </header>

      <p className="mfu-card__what">{item.label}</p>
      {!isDone && <p className="mfu-card__next">{item.suggested_next_step}</p>}
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
          <label htmlFor={noteId}>
            Add a short note <span>(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            maxLength={280}
            rows={2}
            onChange={(event) => onNote(event.target.value)}
            placeholder="For example: practised twice on shift"
          />
          <p>Keep it brief and leave out patient details. {280 - note.length} characters left.</p>
          <div className="mfu-actions">
            <AdminButton size="sm" onClick={onDone} disabled={busy} icon={<CheckCircle2 aria-hidden="true" />}>
              {busy ? "Saving…" : "Confirm done"}
            </AdminButton>
            <AdminButton variant="ghost" size="sm" onClick={onCancelNote} disabled={busy}>
              Cancel
            </AdminButton>
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
          <Link to={`/mentor/students/${item.placement_id}`} className="pa-btn pa-btn--ghost pa-btn--sm">
            Student record
          </Link>
          {!closed && (
            <Link
              to={`/mentor?view=log&placement=${encodeURIComponent(item.placement_id)}`}
              className="pa-btn pa-btn--ghost pa-btn--sm"
            >
              Log a session
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
