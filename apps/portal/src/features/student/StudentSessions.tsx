import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Search,
  X,
} from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import { InlineFeedback } from "../../components/InlineFeedback";
import {
  getMentorshipSessions,
  type MentorshipSession,
  type Placement,
} from "../../services/api";
import "./StudentPlacementDetail.css";

type StudentSession = MentorshipSession & {
  placement: Placement;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatSessionType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function StudentSessions({
  placements,
  onOpen,
}: {
  placements: Placement[];
  onOpen: (id: string) => void;
}) {
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailablePlacementCount, setUnavailablePlacementCount] = useState(0);
  const [query, setQuery] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedSession, setSelectedSession] = useState<StudentSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setUnavailablePlacementCount(0);

    void Promise.allSettled(
      placements.map(async (placement) => {
        const placementSessions = await getMentorshipSessions(placement.id);

        return placementSessions.map((session) => ({
          ...session,
          placement,
        }));
      }),
    )
      .then((results) => {
        if (cancelled) return;

        const successfulGroups = results
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);
        const failedCount = results.length - successfulGroups.length;

        if (failedCount === results.length && failedCount > 0) {
          setSessions([]);
          setError("We could not load your session records. Please try again.");
          return;
        }

        setSessions(
          successfulGroups
            .flat()
            .sort((a, b) =>
              b.session_date.localeCompare(a.session_date),
            ),
        );
        setUnavailablePlacementCount(failedCount);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [placements, reloadToken]);

  useEffect(() => {
    if (!selectedSession) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedSession(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedSession]);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return sessions;
    }

    return sessions.filter((session) => {
      const searchable = [
        session.session_type,
        session.placement.facility_name,
        session.placement.cohort_name,
        session.placement.ward?.name,
        session.session_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [query, sessions]);

  const latestSession = sessions[0];

  const totalMinutes = sessions.reduce(
    (total, session) => total + (session.duration_minutes ?? 0),
    0,
  );

  const uniquePlacements = new Set(
    sessions.map((session) => session.placement.id),
  ).size;

  return (
    <div className="student-page-container student-sessions-page">
      {/* Header */}
      <section className="student-sessions-header">
        <div>
          <p className="student-kicker">Learning record</p>

          <h1>Mentorship sessions</h1>

          <p>
            Keep track of the conversations, guidance, and learning
            support recorded during your placements.
          </p>
        </div>

        <div className="student-sessions-header__record">
          <MessageCircle size={17} />
          <span>Private learning record</span>
        </div>
      </section>

      {/* Summary */}
      <section className="student-session-summary">
        <SummaryItem
          icon={<MessageCircle size={18} />}
          value={sessions.length}
          label="Sessions recorded"
          detail={
            sessions.length === 0
              ? "No sessions yet"
              : "Across your placements"
          }
        />

        <SummaryItem
          icon={<Clock3 size={18} />}
          value={totalMinutes > 0 ? `${totalMinutes}m` : "—"}
          label="Mentorship time"
          detail="Recorded session time"
        />

        <SummaryItem
          icon={<CalendarDays size={18} />}
          value={latestSession ? formatMonth(latestSession.session_date) : "—"}
          label="Latest activity"
          detail={
            latestSession
              ? formatDate(latestSession.session_date)
              : "No activity yet"
          }
        />

        <SummaryItem
          icon={<CheckCircle2 size={18} />}
          value={uniquePlacements}
          label="Placements"
          detail="With recorded sessions"
        />
      </section>

      {/* Activity heading */}
      <section className="student-sessions-toolbar">
        <div>
          <p className="student-kicker">Activity</p>

          <h2>Session history</h2>

          <p>
            Your mentor&apos;s submitted session records appear here.
          </p>
        </div>

        {!loading && sessions.length > 0 && (
          <div className="student-session-search">
            <Search size={16} />

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sessions"
              aria-label="Search sessions"
            />
          </div>
        )}
      </section>

      {/* Sessions */}
      <Card className="student-sessions-record">
        {loading ? (
          <SessionLoadingState />
        ) : error ? (
          <SessionErrorState onRetry={() => setReloadToken((value) => value + 1)} />
        ) : filteredSessions.length === 0 ? (
          query ? (
            <SessionSearchEmpty query={query} onClear={() => setQuery("")} />
          ) : (
            <SessionEmptyState />
          )
        ) : (
          <>
            <div className="student-sessions-record__header">
              <span>
                {filteredSessions.length}{" "}
                {filteredSessions.length === 1 ? "session" : "sessions"}
              </span>

              <span>Most recent first</span>
            </div>

            <div className="student-session-list">
              {filteredSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onOpen={setSelectedSession}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {!loading && !error && unavailablePlacementCount > 0 && (
        <InlineFeedback kind="info" title="Some session records are still loading">
          We could not reach {unavailablePlacementCount} {unavailablePlacementCount === 1 ? "placement" : "placements"}. The records shown may be incomplete. Try again to check all of your placements.
          <button
            type="button"
            className="ml-1 font-semibold text-teal underline underline-offset-2"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            Try again
          </button>
        </InlineFeedback>
      )}

      {/* Privacy */}
      <div className="student-sessions-footer">
        <MessageCircle size={15} />

        <p>
          Session records are part of your private learning record and
          are shared only with authorised programme staff.
        </p>
      </div>

      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onOpenPlacement={() => {
            setSelectedSession(null);
            onOpen(selectedSession.placement.id);
          }}
        />
      )}
    </div>
  );
}

function SummaryItem({
  icon,
  value,
  label,
  detail,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  detail: string;
}) {
  return (
    <Card className="student-session-summary__item">
      <span className="student-session-summary__icon">{icon}</span>

      <div className="student-session-summary__value">
        {value}
      </div>

      <div className="student-session-summary__label">{label}</div>

      <div className="student-session-summary__detail">{detail}</div>
    </Card>
  );
}

function SessionRow({
  session,
  onOpen,
}: {
  session: StudentSession;
  onOpen: (session: StudentSession) => void;
}) {
  return (
    <button
      type="button"
      className="student-session-record"
      onClick={() => onOpen(session)}
    >
      <span className="student-session-record__date">
        <strong>
          {new Date(
            `${session.session_date}T00:00:00`,
          ).getDate()}
        </strong>

        <small>
          {new Intl.DateTimeFormat("en-GB", {
            month: "short",
          }).format(
            new Date(`${session.session_date}T00:00:00`),
          )}
        </small>
      </span>

      <span className="student-session-record__main">
        <span className="student-session-record__title">
          {formatSessionType(session.session_type)}
        </span>

        <span className="student-session-record__placement">
          {session.placement.facility_name ?? "Placement record"}
        </span>

        <span className="student-session-record__meta">
          <span>{formatDate(session.session_date)}</span>

          <span className="student-session-record__separator" />

          <span>
            {session.duration_minutes
              ? `${session.duration_minutes} minutes`
              : "Duration not recorded"}
          </span>

          {session.placement.ward?.name && (
            <>
              <span className="student-session-record__separator" />

              <span>{session.placement.ward.name}</span>
            </>
          )}
        </span>
      </span>

      <span className="student-session-record__status">
        <CheckCircle2 size={15} />
        Recorded
      </span>

      <span className="student-session-record__arrow">
        <ArrowRight size={17} />
      </span>
    </button>
  );
}

function SessionLoadingState() {
  return (
    <div className="student-session-loading">
      <div className="student-session-skeleton student-session-skeleton--short" />
      <div className="student-session-skeleton" />
      <div className="student-session-skeleton" />
      <div className="student-session-skeleton" />
    </div>
  );
}

function SessionErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="student-session-empty student-session-empty--error">
      <span className="student-session-empty__icon"><MessageCircle size={22} /></span>
      <div>
        <p className="student-kicker">Something went wrong</p>
        <h3>Your session records are unavailable</h3>
        <p>Check your connection and try loading the private record again.</p>
        <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

function SessionDetailModal({
  session,
  onClose,
  onOpenPlacement,
}: {
  session: StudentSession;
  onClose: () => void;
  onOpenPlacement: () => void;
}) {
  const followUp = session.follow_up_action && session.follow_up_action !== "none"
    ? formatSessionType(session.follow_up_action)
    : "No follow-up recorded";

  return (
    <div
      className="student-session-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="student-session-modal" role="dialog" aria-modal="true" aria-labelledby="student-session-modal-title">
        <header className="student-session-modal__header">
          <div>
            <p className="student-kicker">Mentorship session</p>
            <h2 id="student-session-modal-title">{formatSessionType(session.session_type)}</h2>
            <p>{formatDate(session.session_date)}{session.duration_minutes ? ` · ${session.duration_minutes} minutes` : ""}</p>
          </div>
          <button type="button" className="student-session-modal__close" onClick={onClose} aria-label="Close session details">
            <X size={19} />
          </button>
        </header>

        <div className="student-session-modal__body">
          <div className="student-session-modal__context">
            <span>Placement</span>
            <strong>{session.placement.facility_name ?? "Placement record"}</strong>
            {session.placement.ward?.name && <small>{session.placement.ward.name}</small>}
          </div>
          <DetailNote title="Topics covered" value={session.topics.length ? session.topics.map(formatSessionType).join(", ") : "Not recorded"} />
          <DetailNote title="What was covered" value={session.what_was_covered ?? "Not recorded"} />
          <DetailNote title="Feedback given" value={session.feedback_given ?? "Not recorded"} />
          <DetailNote title="Follow-up" value={followUp} />
          <p className="student-session-modal__submitted">Submitted {new Date(session.submitted_at).toLocaleString("en-GB")}</p>
        </div>

        <footer className="student-session-modal__footer">
          <p><MessageCircle size={14} /> Private learning record. Do not add patient-identifiable information.</p>
          <div>
            <Button variant="tertiary" onClick={onClose}>Close</Button>
            <Button size="sm" onClick={onOpenPlacement}>View placement <ArrowRight size={15} /></Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function DetailNote({ title, value }: { title: string; value: string }) {
  return <div className="student-session-modal__note"><h3>{title}</h3><p>{value}</p></div>;
}

function SessionEmptyState() {
  return (
    <div className="student-session-empty">
      <span className="student-session-empty__icon">
        <MessageCircle size={22} />
      </span>

      <div>
        <p className="student-kicker">No activity yet</p>

        <h3>No mentorship sessions recorded</h3>

        <p>
          Your mentor&apos;s session records will appear here once
          they are submitted.
        </p>
      </div>
    </div>
  );
}

function SessionSearchEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="student-session-empty">
      <span className="student-session-empty__icon">
        <Search size={21} />
      </span>

      <div>
        <p className="student-kicker">No matches</p>

        <h3>No sessions match &quot;{query}&quot;</h3>

        <p>Try another search term or clear the current search.</p>

        <button
          type="button"
          className="student-session-clear"
          onClick={onClear}
        >
          Clear search
        </button>
      </div>
    </div>
  );
}
