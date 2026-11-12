import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ClipboardCheck,
  Clock3,
  ListChecks,
  Search,
  Wifi,
  WifiOff,
  Users,
  X,
} from "lucide-react";

import type {
  CurrentUser,
  Placement,
  PlacementProgress,
} from "../../services/api";

import { getPlacementProgress } from "../../services/api";
import { useFollowUpCounts } from "../../services/follow-ups";
import { OfflineSessionQueue } from "../mentorship/OfflineSessionQueue";
import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";
import { MentorFeedbackSummary } from "../assessments/MentorFeedbackSummary";

import "./MentorToday.css";
import { greetingFor } from "../../lib/greeting";

interface MentorTodayProps {
  user: CurrentUser;
  placements: Placement[];
  error: string | null;
  onClearError: () => void;
}

type QueueFilter = "all" | "induction" | "session";

type QueueItem = {
  placement: Placement;
  kind: "induction" | "session";
  label: string;
  detail: string;
};

export function MentorToday({
  user,
  placements,
  error,
  onClearError,
}: MentorTodayProps) {
  const [progress, setProgress] = useState<
    Record<string, PlacementProgress>
  >({});

  const [loading, setLoading] = useState(true);
  const [progressError, setProgressError] = useState(false);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const followUps = useFollowUpCounts(true);

  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] =
    useState<QueueFilter>("all");

  /*
   * ------------------------------------------------------------
   * CONNECTION STATUS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /*
   * ------------------------------------------------------------
   * LOAD PLACEMENT PROGRESS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    let active = true;

    async function loadProgress() {
      if (!placements.length) {
        setProgress({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setProgressError(false);

      try {
        const results = await Promise.allSettled(
          placements.map(async (placement) => {
            const value = await getPlacementProgress(
              placement.id,
            );

            return [placement.id, value] as const;
          }),
        );

        if (!active) return;

        const successful = results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<
              readonly [string, PlacementProgress]
            > => result.status === "fulfilled",
          )
          .map((result) => result.value);

        setProgress(Object.fromEntries(successful));

        const hasFailures = results.some(
          (result) => result.status === "rejected",
        );

        setProgressError(hasFailures);
      } catch {
        if (!active) return;

        setProgressError(true);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProgress();

    return () => {
      active = false;
    };
  }, [placements, progressRefreshKey]);

  /*
   * ------------------------------------------------------------
   * DERIVED DATA
   * ------------------------------------------------------------
   */

  const inductionPlacements = useMemo(
    () =>
      placements.filter(
        (placement) => placement.state === "induction",
      ),
    [placements],
  );

  const orientationPlacements = useMemo(
    () => placements.filter((placement) => placement.state === "orientation"),
    [placements],
  );

  const activePlacements = useMemo(
    () =>
      placements.filter(
        (placement) => placement.state === "active",
      ),
    [placements],
  );

  const attentionPlacements = useMemo(() => {
    return activePlacements
      .filter((placement) => {
        const last =
          progress[placement.id]?.mentorship
            .last_session_date;

        if (!last) {
          return true;
        }

        return daysSince(last) >= 7;
      })
      .sort((left, right) => {
        const leftDate =
          progress[left.id]?.mentorship
            .last_session_date ?? "";

        const rightDate =
          progress[right.id]?.mentorship
            .last_session_date ?? "";

        return leftDate.localeCompare(rightDate);
      });
  }, [activePlacements, progress]);

  const queue = useMemo<QueueItem[]>(() => {
    const orientationItems: QueueItem[] = orientationPlacements.map((placement) => ({
      placement,
      kind: "induction",
      label: "Review orientation",
      detail: "Next: start mentor induction",
    }));

    const inductionItems: QueueItem[] =
      inductionPlacements.map((placement) => ({
        placement,
        kind: "induction",
        label: "Complete induction",
        detail: "Checklist waiting",
      }));

    const sessionItems: QueueItem[] =
      attentionPlacements.map((placement) => ({
        placement,
        kind: "session",
        label: "Log a session",
        detail: sessionDetail(progress[placement.id]),
      }));

    return [...orientationItems, ...inductionItems, ...sessionItems];
  }, [
    attentionPlacements,
    inductionPlacements,
    orientationPlacements,
    progress,
  ]);

  const visibleQueue = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return queue.filter((item) => {
      const matchesFilter =
        queueFilter === "all" ||
        item.kind === queueFilter;

      const haystack = `
        ${item.placement.student?.name ?? ""}
        ${item.placement.ward?.name ?? ""}
        ${item.placement.cohort_name ?? ""}
      `.toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        haystack.includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [queue, queueFilter, search]);

  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  /*
   * ------------------------------------------------------------
   * RENDER
   * ------------------------------------------------------------
   */

  return (
    <MentorWorkspaceFrame
      user={user}
      title="Today's mentorship work"
      active="today"
    >
      <div className="mentor-today">
        <div className="mentor-today__container">
          {/* --------------------------------------------------
              ERROR
          --------------------------------------------------- */}

          {error && (
            <InlineNotice
              message={error}
              onDismiss={onClearError}
            />
          )}

          {/* --------------------------------------------------
              PAGE HEADER
          --------------------------------------------------- */}

          <header className="mentor-page-header">
            <div className="mentor-page-header__content">
              <div className="mentor-eyebrow">
                <span>Clinical practice</span>

                <span
                  className="mentor-eyebrow__separator"
                  aria-hidden="true"
                >
                  /
                </span>

                <span>{todayLabel}</span>
              </div>

              <div className="mentor-page-header__main">
                <div>
                  <h1 className="mentor-page-title">
                    {greetingFor(user.name)}.
                  </h1>

                  <p className="mentor-page-description">
                    Start with what needs you. Your assigned
                    students, induction work and follow-ups are
                    organized here so you can focus on the next
                    useful action.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(orientationPlacements.length > 0 || inductionPlacements.length > 0) && <Link
                    to="/mentor?view=induction-batch"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-teal/25 bg-white px-4 font-body text-sm font-bold text-teal hover:bg-teal-light"
                  >
                    <Users size={17} aria-hidden="true" />
                    <span>Group induction</span>
                  </Link>}
                  <Link to="/mentor?view=log" className="mentor-primary-action">
                    <ClipboardCheck size={18} aria-hidden="true" />
                    <span>Log a session</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>

            <ConnectionStatus online={online} />
          </header>

          {/* --------------------------------------------------
              OFFLINE QUEUE
          --------------------------------------------------- */}

          <div className="mentor-offline-wrapper">
            <OfflineSessionQueue
              actorId={user.id}
              placements={placements}
              refreshToken={queueRefreshKey}
              onChanged={() => setQueueRefreshKey((value) => value + 1)}
            />
          </div>

          <MentorFeedbackSummary />

          {/* --------------------------------------------------
              SUMMARY
          --------------------------------------------------- */}

          <section
            className="mentor-summary"
            aria-label="Mentorship summary"
          >
            <SummaryCard
              icon={<BookOpenCheck size={19} />}
              label="Assigned students"
              value={placements.length}
              detail="Current placement list"
            />

            <SummaryCard
              icon={<ClipboardCheck size={19} />}
              label="Induction due"
              value={inductionPlacements.length}
              detail={
                inductionPlacements.length
                  ? "Students waiting for induction"
                  : "No induction work waiting"
              }
              tone={
                inductionPlacements.length
                  ? "attention"
                  : "default"
              }
            />

            <SummaryCard
              icon={<Clock3 size={19} />}
              label="Needs a session"
              value={
                loading
                  ? null
                  : attentionPlacements.length
              }
              detail={
                attentionPlacements.length
                  ? "No recent session recorded"
                  : "Everyone is within rhythm"
              }
              tone={
                attentionPlacements.length
                  ? "attention"
                  : "default"
              }
            />

            <SummaryCard
              icon={<ListChecks size={19} />}
              label="Follow-ups due"
              href="/mentor?view=follow-ups"
              value={followUps.isPending ? null : followUps.data?.pending ?? 0}
              detail={
                followUps.isError
                  ? "Could not load follow-ups"
                  : !followUps.data?.pending
                    ? "You're all caught up"
                    : followUps.data.student_support
                      ? `${followUps.data.student_support} may need student support`
                      : followUps.data.overdue
                        ? `${followUps.data.overdue} overdue`
                        : "Open to review"
              }
              tone={
                followUps.data?.pending
                  ? "attention"
                  : "default"
              }
            />
          </section>

          {/* --------------------------------------------------
              PROGRESS ERROR
          --------------------------------------------------- */}

          {progressError && (
            <div className="mentor-progress-warning">
              <div>
                <strong>
                  Some progress data is unavailable.
                </strong>

                <span>
                  The queue may not reflect the latest
                  mentorship activity.
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProgressError(false);
                  setProgressRefreshKey((value) => value + 1);
                }}
              >
                  Retry
              </button>
            </div>
          )}

          {/* --------------------------------------------------
              ACTION QUEUE
          --------------------------------------------------- */}

          <section
            className="mentor-queue-section"
            aria-labelledby="mentor-queue-title"
          >
            <div className="mentor-section-header">
              <div>
                <div className="mentor-section-kicker">
                  Your queue
                </div>

                <h2
                  id="mentor-queue-title"
                  className="mentor-section-title"
                >
                  Next useful actions
                </h2>

                <p className="mentor-section-description">
                  A focused register of students who need
                  your next action.
                </p>
              </div>

              <Link
                to="/mentor?view=students"
                className="mentor-section-link"
              >
                View all students
                <ArrowRight
                  size={15}
                  aria-hidden="true"
                />
              </Link>
            </div>

            <div className="mentor-queue">
              {/* Toolbar */}
              <div className="mentor-queue__toolbar">
                <label className="mentor-search">
                  <Search
                    size={17}
                    aria-hidden="true"
                  />

                  <span className="sr-only">
                    Search mentor queue
                  </span>

                  <input
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Search student, ward or cohort"
                    type="search"
                  />

                  {search && (
                    <button
                      type="button"
                      className="mentor-search__clear"
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>

                <div
                  className="mentor-filter"
                  role="group"
                  aria-label="Filter queue"
                >
                  <FilterButton
                    active={queueFilter === "all"}
                    onClick={() =>
                      setQueueFilter("all")
                    }
                  >
                    All
                  </FilterButton>

                  <FilterButton
                    active={queueFilter === "induction"}
                    onClick={() =>
                      setQueueFilter("induction")
                    }
                  >
                    Induction
                    {orientationPlacements.length + inductionPlacements.length > 0 && (
                      <span>
                        {orientationPlacements.length + inductionPlacements.length}
                      </span>
                    )}
                  </FilterButton>

                  <FilterButton
                    active={queueFilter === "session"}
                    onClick={() =>
                      setQueueFilter("session")
                    }
                  >
                    Sessions
                    {attentionPlacements.length > 0 && (
                      <span>
                        {attentionPlacements.length}
                      </span>
                    )}
                  </FilterButton>
                </div>
              </div>

              {/* Results */}
              {loading ? (
                <QueueSkeleton />
              ) : visibleQueue.length ? (
                <>
                  <div className="mentor-queue-table-wrapper">
                    <table className="mentor-queue-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Ward</th>
                          <th>Attention</th>
                          <th>Next action</th>
                          <th>
                            <span className="sr-only">
                              Open
                            </span>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {visibleQueue.map((item) => (
                          <QueueTableRow
                            key={`${item.kind}-${item.placement.id}`}
                            item={item}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mentor-mobile-queue">
                    {visibleQueue.map((item) => (
                      <QueueMobileRow
                        key={`${item.kind}-${item.placement.id}`}
                        item={item}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <EmptyQueue
                  hasFilters={
                    Boolean(search) ||
                    queueFilter !== "all"
                  }
                  onClear={() => {
                    setSearch("");
                    setQueueFilter("all");
                  }}
                />
              )}

              {/* Footer */}
              {!loading && visibleQueue.length > 0 && (
                <div className="mentor-queue__footer">
                  <span>
                    Showing{" "}
                    <strong>
                      {visibleQueue.length}
                    </strong>{" "}
                    {visibleQueue.length === 1
                      ? "action"
                      : "actions"}
                  </span>

                  <span>
                    {queue.length} total in queue
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </MentorWorkspaceFrame>
  );
}

/*
|--------------------------------------------------------------------------
| CONNECTION STATUS
|--------------------------------------------------------------------------
*/

function ConnectionStatus({
  online,
}: {
  online: boolean;
}) {
  return (
    <div
      className={`mentor-connection ${
        online
          ? "mentor-connection--online"
          : "mentor-connection--offline"
      }`}
    >
      <span className="mentor-connection__icon">
        {online ? (
          <Wifi size={15} aria-hidden="true" />
        ) : (
          <WifiOff size={15} aria-hidden="true" />
        )}
      </span>

      <span>
        {online ? "Online" : "Offline"}
      </span>

      <span
        className="mentor-connection__dot"
        aria-hidden="true"
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| SUMMARY CARD
|--------------------------------------------------------------------------
*/

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
  href,
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
  detail: string;
  tone?: "default" | "attention";
  href?: string;
}) {
  const card = (
    <article
      className={`mentor-summary-card ${
        tone === "attention"
          ? "mentor-summary-card--attention"
          : ""
      }`}
    >
      <div className="mentor-summary-card__top">
        <span className="mentor-summary-card__icon">
          {icon}
        </span>

        {value === null ? (
          <span className="mentor-summary-card__skeleton" />
        ) : (
          <strong className="mentor-summary-card__value">
            {value}
          </strong>
        )}
      </div>

      <div className="mentor-summary-card__body">
        <h3>{label}</h3>

        <p>{detail}</p>
      </div>
    </article>
  );

  return href ? (
    <Link to={href} className="mentor-summary-link" aria-label={`${label}: ${value ?? "loading"}. ${detail}`}>
      {card}
    </Link>
  ) : (
    card
  );
}

/*
|--------------------------------------------------------------------------
| FILTER BUTTON
|--------------------------------------------------------------------------
*/

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`mentor-filter__button ${
        active ? "is-active" : ""
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/*
|--------------------------------------------------------------------------
| QUEUE TABLE
|--------------------------------------------------------------------------
*/

function QueueTableRow({
  item,
}: {
  item: QueueItem;
}) {
  const destination =
    item.kind === "session"
      ? `/mentor?view=log&placement=${encodeURIComponent(
          item.placement.id,
        )}`
      : `/mentor/students/${item.placement.id}`;

  const studentName =
    item.placement.student?.name ??
    "Assigned student";

  return (
    <tr className="mentor-queue-row">
      <td>
        <div className="mentor-student">
          <StudentAvatar name={studentName} />

          <div className="mentor-student__identity">
            <Link
              to={destination}
              className="mentor-student__name"
            >
              {studentName}
            </Link>

            <span className="mentor-student__meta">
              {item.placement.student
                ?.registration_number ??
                "Registration not listed"}
            </span>
          </div>
        </div>
      </td>

      <td>
        <span className="mentor-table-text">
          {item.placement.ward?.name ??
            "Ward not listed"}
        </span>
      </td>

      <td>
        <AttentionBadge kind={item.kind}>
          {item.detail}
        </AttentionBadge>
      </td>

      <td>
        <Link
          to={destination}
          className="mentor-row-action"
        >
          {item.label}
          <ArrowRight
            size={15}
            aria-hidden="true"
          />
        </Link>
      </td>

      <td>
        <Link
          to={destination}
          className="mentor-row-arrow"
          aria-label={`Open ${studentName}`}
        >
          <ArrowRight
            size={17}
            aria-hidden="true"
          />
        </Link>
      </td>
    </tr>
  );
}

/*
|--------------------------------------------------------------------------
| MOBILE QUEUE
|--------------------------------------------------------------------------
*/

function QueueMobileRow({
  item,
}: {
  item: QueueItem;
}) {
  const destination =
    item.kind === "session"
      ? `/mentor?view=log&placement=${encodeURIComponent(
          item.placement.id,
        )}`
      : `/mentor/students/${item.placement.id}`;

  const studentName =
    item.placement.student?.name ??
    "Assigned student";

  return (
    <Link
      to={destination}
      className="mentor-mobile-queue__item"
    >
      <div className="mentor-mobile-queue__main">
        <StudentAvatar name={studentName} />

        <div className="mentor-mobile-queue__identity">
          <strong>{studentName}</strong>

          <span>
            {item.placement.ward?.name ??
              "Ward not listed"}
          </span>

          <AttentionBadge kind={item.kind}>
            {item.detail}
          </AttentionBadge>
        </div>
      </div>

      <div className="mentor-mobile-queue__action">
        <span>{item.label}</span>

        <ArrowRight
          size={17}
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

/*
|--------------------------------------------------------------------------
| ATTENTION BADGE
|--------------------------------------------------------------------------
*/

function AttentionBadge({
  kind,
  children,
}: {
  kind: QueueItem["kind"];
  children: ReactNode;
}) {
  return (
    <span
      className={`mentor-attention-badge ${
        kind === "induction"
          ? "mentor-attention-badge--induction"
          : "mentor-attention-badge--session"
      }`}
    >
      <span aria-hidden="true" />

      {children}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| AVATAR
|--------------------------------------------------------------------------
*/

function StudentAvatar({
  name,
}: {
  name: string;
}) {
  return (
    <span
      className="mentor-student-avatar"
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| EMPTY STATE
|--------------------------------------------------------------------------
*/

function EmptyQueue({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mentor-empty">
      <div className="mentor-empty__icon">
        <Check size={21} aria-hidden="true" />
      </div>

      <h3>
        {hasFilters
          ? "No matching actions"
          : "You're all caught up"}
      </h3>

      <p>
        {hasFilters
          ? "Try another student, ward, or action filter."
          : "There are no outstanding mentorship actions waiting for you right now."}
      </p>

      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="mentor-empty__clear"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| SKELETON
|--------------------------------------------------------------------------
*/

function QueueSkeleton() {
  return (
    <div className="mentor-skeleton">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="mentor-skeleton__row"
        >
          <span className="mentor-skeleton__avatar" />

          <div className="mentor-skeleton__content">
            <span className="mentor-skeleton__line mentor-skeleton__line--strong" />
            <span className="mentor-skeleton__line" />
          </div>

          <span className="mentor-skeleton__badge" />
        </div>
      ))}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| INLINE NOTICE
|--------------------------------------------------------------------------
*/

function InlineNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mentor-inline-notice"
      role="alert"
    >
      <span>{message}</span>

      <button
        type="button"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${words[0][0]}${
    words[words.length - 1][0]
  }`.toUpperCase();
}

function daysSince(value: string) {
  const date = new Date(
    `${value}T00:00:00`,
  ).getTime();

  return Math.floor(
    (Date.now() - date) / 86400000,
  );
}

function sessionDetail(
  value?: PlacementProgress,
) {
  const date =
    value?.mentorship.last_session_date;

  if (!date) {
    return "No session recorded";
  }

  return `Last session ${new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
    },
  ).format(new Date(`${date}T00:00:00`))}`;
}
