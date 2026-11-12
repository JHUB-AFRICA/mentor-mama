import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { InlineFeedback } from "../../components/InlineFeedback";
import { DetailList, Modal } from "../../components/kit";
import {
  AdminButton,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  SearchField,
  SelectField,
  StatCard,
  StatGrid,
  Toolbar,
} from "../programme-admin/ui/AdminKit";
import {
  getMentorshipSessions,
  type MentorshipSession,
  type Placement,
} from "../../services/api";
import "./student-sessions.css";

type StudentSession = MentorshipSession & {
  placement: Placement;
  /** Read-only state of the mentor's follow-up; the mentor's notes are never sent to students. */
  follow_up_status?: "pending" | "done" | null;
};

function followUpStatusLabel(session: StudentSession) {
  if (!session.follow_up_action || session.follow_up_action === "none") return null;
  if (session.follow_up_status === "done") return "Done";
  if (session.follow_up_status === "pending") return "Pending";
  return null;
}

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

  const [typeFilter, setTypeFilter] = useState("");
  const [placementFilter, setPlacementFilter] = useState("");

  const placementOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const session of sessions) {
      seen.set(session.placement.id, session.placement.facility_name ?? "Placement");
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [sessions]);
  const typeOptions = useMemo(
    () => [...new Set(sessions.map((session) => session.session_type))].map((value) => ({ value, label: formatSessionType(value) })),
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (typeFilter && session.session_type !== typeFilter) return false;
      if (placementFilter && session.placement.id !== placementFilter) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        formatSessionType(session.session_type),
        session.placement.facility_name,
        session.placement.cohort_name,
        session.placement.ward?.name,
        session.session_date,
        ...session.topics.map(formatSessionType),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [query, sessions, typeFilter, placementFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, StudentSession[]>();
    for (const session of filteredSessions) {
      const key = session.session_date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    return [...map.entries()];
  }, [filteredSessions]);

  const latestSession = sessions[0];
  const totalMinutes = sessions.reduce((total, session) => total + (session.duration_minutes ?? 0), 0);
  const uniquePlacements = new Set(sessions.map((session) => session.placement.id)).size;
  const hasFilters = Boolean(query || typeFilter || placementFilter);
  const clearFilters = () => {
    setQuery("");
    setTypeFilter("");
    setPlacementFilter("");
  };
  const nextPlacement =
    placements.find((item) => item.state === "active") ?? placements[0];

  return (
    <div className="student-page-container">
      <AdminPage className="ss">
        <AdminPageHeader
          eyebrow="Learning record"
          title="Mentorship sessions"
          description="The conversations, guidance and learning support your mentor has recorded during your placements."
          actions={
            <span className="ss-private">
              <ShieldCheck aria-hidden="true" /> Private learning record
            </span>
          }
        />

        <StatGrid>
          <StatCard
            icon={<MessageCircle />}
            tone="teal"
            value={sessions.length}
            label="Sessions recorded"
            hint={sessions.length === 0 ? "None yet" : "Across your placements"}
            loading={loading}
          />
          <StatCard
            icon={<Clock3 />}
            tone="violet"
            value={totalMinutes > 0 ? formatDuration(totalMinutes) : "—"}
            label="Mentorship time"
            hint="Recorded session time"
            loading={loading}
          />
          <StatCard
            icon={<CalendarDays />}
            tone="blue"
            value={latestSession ? formatShortDate(latestSession.session_date) : "—"}
            label="Latest session"
            hint={latestSession ? formatMonth(latestSession.session_date) : "No sessions yet"}
            loading={loading}
          />
          <StatCard
            icon={<MapPin />}
            tone="amber"
            value={uniquePlacements}
            label="Placements"
            hint="With recorded sessions"
            loading={loading}
          />
        </StatGrid>

        {!loading && !error && sessions.length > 0 && (
          <Toolbar filters={placementOptions.length > 1 ? 2 : 1}>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search by topic, type or ward"
              label="Search sessions"
            />
            <SelectField
              value={typeFilter}
              onChange={setTypeFilter}
              label="Filter by session type"
              options={[{ value: "", label: "All session types" }, ...typeOptions]}
            />
            {placementOptions.length > 1 && (
              <SelectField
                value={placementFilter}
                onChange={setPlacementFilter}
                label="Filter by placement"
                options={[{ value: "", label: "All placements" }, ...placementOptions]}
              />
            )}
          </Toolbar>
        )}

        {loading ? (
          <div className="ss-loading" aria-busy="true" aria-label="Loading sessions">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<MessageCircle />}
            title="Your session records are unavailable"
            text="Check your connection and try loading your private record again."
            action={
              <AdminButton variant="secondary" size="sm" onClick={() => setReloadToken((value) => value + 1)}>
                Try again
              </AdminButton>
            }
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<MessageCircle />}
            title="No mentorship sessions recorded yet"
            text="When your mentor records a session, it appears here with the topics covered, the feedback you were given and any follow-up."
            action={
              nextPlacement ? (
                <AdminButton variant="secondary" size="sm" onClick={() => onOpen(nextPlacement.id)}>
                  View my placement <ArrowRight />
                </AdminButton>
              ) : undefined
            }
          />
        ) : filteredSessions.length === 0 ? (
          <EmptyState
            icon={<MessageCircle />}
            title="No sessions match these filters"
            text="Try another search term or clear the filters."
            action={
              hasFilters ? (
                <AdminButton variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </AdminButton>
              ) : undefined
            }
          />
        ) : (
          <div className="ss-timeline">
            {groups.map(([month, items]) => (
              <section key={month} className="ss-month" aria-label={formatMonth(`${month}-01`)}>
                <h2 className="ss-month__title">
                  {formatMonth(`${month}-01`)}
                  <span>
                    {items.length} {items.length === 1 ? "session" : "sessions"}
                  </span>
                </h2>
                <ul className="ss-list">
                  {items.map((session) => (
                    <li key={session.id}>
                      <SessionRow session={session} onOpen={setSelectedSession} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {!loading && !error && unavailablePlacementCount > 0 && (
          <InlineFeedback kind="info" title="Some session records are still loading">
            We could not reach {unavailablePlacementCount} {unavailablePlacementCount === 1 ? "placement" : "placements"}. The records shown may be incomplete.
            <button
              type="button"
              className="ml-1 font-semibold text-teal underline underline-offset-2"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Try again
            </button>
          </InlineFeedback>
        )}

        <p className="ss-footnote">
          <ShieldCheck aria-hidden="true" /> Session records are part of your private learning record and are shared only with authorised programme staff.
        </p>
      </AdminPage>

      <SessionDetailModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onOpenPlacement={() => {
          if (!selectedSession) return;
          const id = selectedSession.placement.id;
          setSelectedSession(null);
          onOpen(id);
        }}
      />
    </div>
  );
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`));
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function SessionRow({ session, onOpen }: { session: StudentSession; onOpen: (session: StudentSession) => void }) {
  const date = new Date(`${session.session_date}T00:00:00`);
  const topics = session.topics.map(formatSessionType);
  return (
    <button type="button" className="ss-row" onClick={() => onOpen(session)}>
      <span className="ss-row__date" aria-hidden="true">
        <strong>{date.getDate()}</strong>
        <small>{new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date)}</small>
      </span>
      <span className="ss-row__main">
        <span className="ss-row__title">{formatSessionType(session.session_type)}</span>
        <span className="ss-row__meta">
          {session.placement.facility_name ?? "Placement"}
          {session.placement.ward?.name ? ` · ${session.placement.ward.name}` : ""}
          {" · "}
          {session.duration_minutes ? `${session.duration_minutes} min` : "Duration not recorded"}
          <span className="sr-only">, {formatDate(session.session_date)}</span>
        </span>
        {topics.length > 0 && (
          <span className="ss-row__chips">
            {topics.slice(0, 3).map((topic) => (
              <span key={topic} className="ss-chip">
                {topic}
              </span>
            ))}
            {topics.length > 3 && <span className="ss-chip ss-chip--more">+{topics.length - 3}</span>}
            {followUpStatusLabel(session) && (
              <span className={`ss-chip ss-chip--followup ss-chip--followup-${session.follow_up_status}`}>
                Follow-up {followUpStatusLabel(session)?.toLowerCase()}
              </span>
            )}
          </span>
        )}
      </span>
      <ChevronRight className="ss-row__arrow" aria-hidden="true" />
    </button>
  );
}

function SessionDetailModal({
  session,
  onClose,
  onOpenPlacement,
}: {
  session: StudentSession | null;
  onClose: () => void;
  onOpenPlacement: () => void;
}) {
  const followUpState = session ? followUpStatusLabel(session) : null;
  const followUp =
    session?.follow_up_action && session.follow_up_action !== "none"
      ? `${formatSessionType(session.follow_up_action)}${followUpState ? ` · ${followUpState}` : ""}`
      : "No follow-up recorded";
  return (
    <Modal
      open={Boolean(session)}
      onClose={onClose}
      size="md"
      icon={<MessageCircle />}
      title={session ? formatSessionType(session.session_type) : ""}
      description={
        session
          ? `${formatDate(session.session_date)}${session.duration_minutes ? ` · ${session.duration_minutes} minutes` : ""}`
          : undefined
      }
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </AdminButton>
          <AdminButton size="sm" onClick={onOpenPlacement}>
            View placement <ArrowRight />
          </AdminButton>
        </>
      }
    >
      {session && (
        <>
          <DetailList
            items={[
              { label: "Placement", value: session.placement.facility_name ?? "Placement record", icon: <MapPin /> },
              ...(session.placement.ward?.name ? [{ label: "Ward", value: session.placement.ward.name, icon: <MapPin /> }] : []),
              { label: "Topics", value: session.topics.length ? session.topics.map(formatSessionType).join(", ") : "Not recorded", icon: <MessageCircle /> },
              { label: "Follow-up", value: followUp, icon: <ArrowRight /> },
            ]}
          />
          <div className="ss-notes">
            <section>
              <h3>What was covered</h3>
              <p>{session.what_was_covered || "Not recorded"}</p>
            </section>
            <section>
              <h3>Feedback you were given</h3>
              <p>{session.feedback_given || "Not recorded"}</p>
            </section>
          </div>
          <p className="ss-submitted">Submitted {new Date(session.submitted_at).toLocaleString("en-GB")}</p>
        </>
      )}
    </Modal>
  );
}
