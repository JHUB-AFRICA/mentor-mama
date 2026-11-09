import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { Container } from "@mentormama/ui";
import { Link } from "react-router-dom";

import {
  ApiError,
  getPlacementProgress,
  getPlacements,
  type CurrentUser,
  type Placement,
  type PlacementPage,
  type PlacementProgress,
} from "../../services/api";

import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";

import "./MentorStudents.css";

const pageSize = 5;

type PlacementState =
  | "all"
  | "orientation"
  | "induction"
  | "active"
  | "paused";

export function MentorStudents({
  user,
}: {
  user: CurrentUser;
  placements?: Placement[];
}) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [pagination, setPagination] = useState<
    PlacementPage["pagination"] | null
  >(null);

  const [progress, setProgress] = useState<
    Record<string, PlacementProgress>
  >({});

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState<PlacementState>("all");

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progressFailed, setProgressFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setFailed(false);

    void getPlacements({
      page,
      pageSize,
      search,
      state: state === "all" ? undefined : state,
    })
      .then((result) => {
        if (!mounted) return;

        setPlacements(result.results);
        setPagination(result.pagination);
      })
      .catch((cause) => {
        if (!mounted) return;

        setFailed(true);

        if (cause instanceof ApiError) {
          console.error(cause);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [page, search, state, retryKey]);

  useEffect(() => {
    let mounted = true;

    if (!placements.length) {
      setProgress({});
      setProgressFailed(false);
      return;
    }
    setProgressFailed(false);

    void Promise.all(
      placements.map(async (placement) => {
        try {
          return [
            placement.id,
            await getPlacementProgress(placement.id),
          ] as const;
        } catch {
          return [placement.id, undefined] as const;
        }
      }),
    ).then((entries) => {
      if (!mounted) return;

      setProgress(
        Object.fromEntries(
          entries.filter(
            (
              entry,
            ): entry is readonly [string, PlacementProgress] =>
              entry[1] !== undefined,
          ),
        ),
      );
      setProgressFailed(entries.some((entry) => entry[1] === undefined));
    });

    return () => {
      mounted = false;
    };
  }, [placements]);

  const total = pagination?.total_count ?? 0;

  const activeStudents = useMemo(
    () => placements.filter((placement) => placement.state === "active").length,
    [placements],
  );

  const inductionStudents = useMemo(
    () =>
      placements.filter((placement) => placement.state === "induction").length,
    [placements],
  );

  const attentionStudents = useMemo(
    () =>
      placements.filter((placement) => {
        const studentProgress = progress[placement.id];

        if (!studentProgress) return false;

        const lastSession =
          studentProgress.mentorship.last_session_date;

        return (
          placement.state === "active" &&
          (!lastSession || daysSince(lastSession) >= 7)
        );
      }).length,
    [placements, progress],
  );

  function handleRetry() {
    setRetryKey((value) => value + 1);
  }

  async function handleExport() {
    if (!placements.length || exporting) return;
    setExporting(true);

    try {
      const allPlacements: Placement[] = [];
      let exportPage = 1;
      let hasNext = true;
      while (hasNext) {
        const result = await getPlacements({ page: exportPage, pageSize: 100, search, state: state === "all" ? undefined : state });
        allPlacements.push(...result.results);
        hasNext = result.pagination.has_next;
        exportPage += 1;
      }

      const progressEntries = await Promise.all(allPlacements.map(async (placement) => {
        try { return [placement.id, await getPlacementProgress(placement.id)] as const; }
        catch { return [placement.id, undefined] as const; }
      }));
      const exportProgress = Object.fromEntries(progressEntries.filter((entry): entry is readonly [string, PlacementProgress] => entry[1] !== undefined));
      const headers = [
      "Student",
      "Registration Number",
      "Ward",
      "Placement Start",
      "Placement End",
      "State",
      "Sessions",
      "Last Session",
    ];

      const rows = allPlacements.map((placement) => {
      const studentProgress = exportProgress[placement.id];

      return [
        placement.student?.name ?? "Assigned student",
        placement.student?.registration_number ?? "",
        placement.ward?.name ?? "",
        placement.planned_start,
        placement.planned_end,
        stateLabel(placement.state),
        String(studentProgress?.mentorship.sessions_logged ?? ""),
        studentProgress?.mentorship.last_session_date ?? "",
      ];
      });

      const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = "mentor-students.csv";
      anchor.click();

      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <MentorWorkspaceFrame
      user={user}
      title="Your students"
      active="students"
    >
      <Container size="wide" className="mentor-students-page">
        {/* PAGE HEADER */}
        <header className="students-hero">
          <div className="students-hero__content">
            <div className="eyebrow">
              <span className="eyebrow__dot" />
              Clinical practice
              <span className="eyebrow__separator">/</span>
              Assigned roster
            </div>

            <h1>Students in your care.</h1>

            <p>
              Keep an eye on placement progress, induction milestones,
              mentorship activity, and the next action for every student
              assigned to you.
            </p>
          </div>

          <div className="students-hero__summary">
            <div className="summary-icon">
              <Users size={21} />
            </div>

            <div>
              <strong>{total}</strong>
              <span>Students assigned</span>
            </div>
          </div>
        </header>

        {/* OVERVIEW STATS */}
        <section
          className="student-stat-grid"
          aria-label="Student overview"
        >
          <StatCard
            icon={<Users size={18} />}
            label="Assigned"
            value={total}
            description="Across all placements"
          />

          <StatCard
            icon={<Activity size={18} />}
            label="Active"
            value={activeStudents}
            description="Currently on the ward"
          />

          <StatCard
            icon={<CheckCircle2 size={18} />}
            label="Induction"
            value={inductionStudents}
            description="Completing onboarding"
          />

          <StatCard
            icon={<CalendarDays size={18} />}
            label="Needs attention"
            value={attentionStudents}
            description="No session in 7+ days"
            attention={attentionStudents > 0}
          />
        </section>

        {/* MAIN WORKSPACE */}
        <section className="students-workspace">
          {/* TOOLBAR */}
          <div className="students-toolbar">
            <div className="students-toolbar__heading">
              <div>
                <span className="section-kicker">Assigned roster</span>
                <h2>Students</h2>
              </div>

              {!loading && (
                <span className="result-count">
                  {total} {total === 1 ? "student" : "students"}
                </span>
              )}
            </div>

            <div className="students-toolbar__controls">
              <label className="search-box">
                <Search size={18} />

                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search students..."
                  aria-label="Search assigned students"
                />

                {query && (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </label>

              <div className="filter-control">
                <SlidersHorizontal size={16} />

                <select
                  value={state}
                  onChange={(event) => {
                    setState(
                      event.target.value as PlacementState,
                    );
                    setPage(1);
                  }}
                  aria-label="Filter students by placement state"
                >
                  <option value="all">All states</option>
                  <option value="orientation">Orientation</option>
                  <option value="induction">Induction</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>

                <ChevronDown size={15} />
              </div>

              <button
                type="button"
                className="secondary-action"
                onClick={handleExport}
                disabled={!placements.length || exporting}
              >
                <Download size={16} />
                <span>{exporting ? "Preparing…" : "Export results"}</span>
              </button>

              <Link
                to="/mentor?view=log"
                className="primary-action"
              >
                <span>+</span>
                Log session
              </Link>
              {placements.some((placement) => placement.state === "orientation" || placement.state === "induction") && <Link
                to="/mentor?view=induction-batch"
                className="secondary-action"
              >
                <span>Group induction</span>
                <ArrowRight size={16} />
              </Link>}
            </div>
          </div>

          {/* ACTIVE FILTER */}
          {(query || state !== "all") && (
            <div className="active-filter-bar">
              <span>Showing results for</span>

              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="filter-pill"
                >
                  “{query}”
                  <span>×</span>
                </button>
              )}

              {state !== "all" && (
                <button
                  type="button"
                  onClick={() => setState("all")}
                  className="filter-pill"
                >
                  {stateLabel(state)}
                  <span>×</span>
                </button>
              )}
            </div>
          )}

          {/* CONTENT */}
          {failed ? (
            <EmptyState
              title="We couldn't load your students"
              detail="There was a problem connecting to the placement service. Check your connection and try again."
              action="Try again"
              onAction={handleRetry}
              error
            />
          ) : loading ? (
            <LoadingState />
          ) : placements.length ? (
            <>
              {progressFailed && (
                <div className="students-inline-warning" role="alert">
                  <span>Some induction and session progress could not be loaded.</span>
                  <button type="button" onClick={handleRetry}>Retry</button>
                </div>
              )}
              {/* DESKTOP */}
              <div className="student-table-wrapper">
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Ward</th>
                      <th>Placement</th>
                      <th>Status</th>
                      <th>Induction</th>
                      <th>Mentorship</th>
                      <th>Next action</th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {placements.map((placement) => (
                      <StudentRow
                        key={placement.id}
                        placement={placement}
                        progress={progress[placement.id]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE */}
              <div className="mobile-student-list">
                {placements.map((placement) => (
                  <MobileStudentCard
                    key={placement.id}
                    placement={placement}
                    progress={progress[placement.id]}
                  />
                ))}
              </div>

              <Pagination
                pagination={pagination}
                page={page}
                loading={loading}
                onPage={setPage}
              />
            </>
          ) : (
            <EmptyState
              title={
                search || state !== "all"
                  ? "No matching students"
                  : "No students assigned yet"
              }
              detail={
                search || state !== "all"
                  ? "Try changing your search or placement filter."
                  : "Your nurse manager assigns students when they arrive on the ward."
              }
              action={
                search || state !== "all"
                  ? "Clear filters"
                  : undefined
              }
              onAction={() => {
                setQuery("");
                setState("all");
              }}
            />
          )}
        </section>
      </Container>
    </MentorWorkspaceFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* STAT CARD                                                                  */
/* -------------------------------------------------------------------------- */

function StatCard({
  icon,
  label,
  value,
  description,
  attention = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  description: string;
  attention?: boolean;
}) {
  return (
    <article
      className={`student-stat-card ${
        attention ? "student-stat-card--attention" : ""
      }`}
    >
      <div className="student-stat-card__top">
        <span className="student-stat-card__icon">
          {icon}
        </span>

        {attention && (
          <span className="attention-indicator">
            Attention
          </span>
        )}
      </div>

      <strong>{value}</strong>

      <span className="student-stat-card__label">
        {label}
      </span>

      <p>{description}</p>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* DESKTOP ROW                                                                */
/* -------------------------------------------------------------------------- */

function StudentRow({
  placement,
  progress,
}: {
  placement: Placement;
  progress?: PlacementProgress;
}) {
  const induction = progress?.induction;
  const lastSession =
    progress?.mentorship.last_session_date;

  const action = nextAction(placement, progress);

  return (
    <tr className="student-row">
      <td>
        <Link
          to={`/mentor/students/${placement.id}`}
          className="student-identity"
        >
          <Avatar name={placement.student?.name} />

          <span className="student-identity__copy">
            <strong>
              {placement.student?.name ??
                "Assigned student"}
            </strong>

            <small>
              {placement.student?.registration_number ??
                "Registration not listed"}
            </small>
          </span>
        </Link>
      </td>

      <td>
        <span className="ward-name">
          {placement.ward?.name ?? "Ward not listed"}
        </span>
      </td>

      <td>
        <div className="placement-date">
          <strong>
            {formatDate(placement.planned_start)}
          </strong>

          <span>
            to {formatDate(placement.planned_end)}
          </span>
        </div>
      </td>

      <td>
        <Status state={placement.state} />
      </td>

      <td>
        {induction ? (
          <div className="induction-progress">
            <div className="induction-progress__header">
              <span>Progress</span>

              <strong>
                {induction.completed}/{induction.total}
              </strong>
            </div>

            <ProgressBar
              value={
                induction.total
                  ? induction.completed / induction.total
                  : 0
              }
              tone={
                induction.completed === induction.total
                  ? "teal"
                  : "amber"
              }
            />
          </div>
        ) : (
          <span className="muted-value">
            Loading…
          </span>
        )}
      </td>

      <td>
        <div className="mentorship-cell">
          <strong>
            {progress?.mentorship.sessions_logged ?? "—"}
          </strong>

          <span>
            {lastSession
              ? `Last ${formatDate(lastSession)}`
              : "No sessions yet"}
          </span>
        </div>
      </td>

      <td>
        <Link
          to={action.href}
          className="row-action"
        >
          {action.label}
          <ArrowRight size={14} />
        </Link>
      </td>

      <td>
        <Link
          to={`/mentor/students/${placement.id}`}
          className="row-open"
          aria-label={`Open ${
            placement.student?.name ?? "student"
          }`}
        >
          <ChevronRight size={17} />
        </Link>
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* MOBILE CARD                                                                */
/* -------------------------------------------------------------------------- */

function MobileStudentCard({
  placement,
  progress,
}: {
  placement: Placement;
  progress?: PlacementProgress;
}) {
  const induction = progress?.induction;
  const lastSession =
    progress?.mentorship.last_session_date;

  const action = nextAction(placement, progress);

  return (
    <article className="mobile-student-card">
      <div className="mobile-student-card__header">
        <Link
          to={`/mentor/students/${placement.id}`}
          className="student-identity"
        >
          <Avatar name={placement.student?.name} />

          <span className="student-identity__copy">
            <strong>
              {placement.student?.name ??
                "Assigned student"}
            </strong>

            <small>
              {placement.student?.registration_number ??
                "Registration not listed"}
            </small>
          </span>
        </Link>

        <button
          type="button"
          className="more-button"
          aria-label="More student options"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="mobile-student-card__status">
        <Status state={placement.state} />

        <span className="mobile-ward">
          {placement.ward?.name ?? "Ward not listed"}
        </span>
      </div>

      <div className="mobile-info-grid">
        <div>
          <span>Placement</span>

          <strong>
            {formatDate(placement.planned_start)}
          </strong>

          <small>
            to {formatDate(placement.planned_end)}
          </small>
        </div>

        <div>
          <span>Sessions</span>

          <strong>
            {progress?.mentorship.sessions_logged ?? "—"}
          </strong>

          <small>
            {lastSession
              ? `Last ${formatDate(lastSession)}`
              : "No sessions yet"}
          </small>
        </div>
      </div>

      <div className="mobile-induction">
        {induction ? (
          <>
            <div className="induction-progress__header">
              <span>Induction progress</span>

              <strong>
                {induction.completed}/{induction.total}
              </strong>
            </div>

            <ProgressBar
              value={
                induction.total
                  ? induction.completed / induction.total
                  : 0
              }
              tone={
                induction.completed === induction.total
                  ? "teal"
                  : "amber"
              }
            />
          </>
        ) : (
          <span className="muted-value">
            Loading induction…
          </span>
        )}
      </div>

      <Link
        to={action.href}
        className="mobile-student-card__action"
      >
        <span>{action.label}</span>
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* AVATAR                                                                     */
/* -------------------------------------------------------------------------- */

function Avatar({ name }: { name?: string }) {
  const initials = (name ?? "Assigned")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span className="student-avatar">
      {initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */

function Status({ state }: { state: string }) {
  const config =
    state === "active"
      ? {
          className: "status--active",
          dot: "status-dot--active",
        }
      : state === "induction"
        ? {
            className: "status--induction",
            dot: "status-dot--induction",
          }
        : state === "paused"
          ? {
              className: "status--paused",
              dot: "status-dot--paused",
            }
          : {
              className: "status--default",
              dot: "status-dot--default",
            };

  return (
    <span className={`status ${config.className}`}>
      <span
        className={`status-dot ${config.dot}`}
      />

      {stateLabel(state)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* PROGRESS BAR                                                               */
/* -------------------------------------------------------------------------- */

function ProgressBar({
  value,
  tone,
}: {
  value: number;
  tone: "teal" | "amber";
}) {
  return (
    <span className="progress-track">
      <span
        className={`progress-fill progress-fill--${tone}`}
        style={{
          width: `${Math.min(
            100,
            Math.max(0, value * 100),
          )}%`,
        }}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* PAGINATION                                                                 */
/* -------------------------------------------------------------------------- */

function Pagination({
  pagination,
  page,
  loading,
  onPage,
}: {
  pagination: PlacementPage["pagination"] | null;
  page: number;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  if (
    !pagination ||
    pagination.total_pages <= 1
  ) {
    return null;
  }

  const totalPages = pagination.total_pages;

  const pages = getPaginationPages(
    page,
    totalPages,
  );

  return (
    <div className="pagination">
      <div className="pagination__summary">
        Showing{" "}
        <strong>
          {(pagination.page - 1) *
            pagination.page_size +
            1}
          –
          {Math.min(
            pagination.page *
              pagination.page_size,
            pagination.total_count,
          )}
        </strong>{" "}
        of <strong>{pagination.total_count}</strong>
      </div>

      <div className="pagination__controls">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={17} />
        </button>

        {pages.map((pageNumber, index) =>
          pageNumber === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="pagination__ellipsis"
            >
              …
            </span>
          ) : (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPage(pageNumber)}
              className={
                page === pageNumber
                  ? "pagination__active"
                  : ""
              }
              disabled={loading}
            >
              {pageNumber}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={
            !pagination.has_next || loading
          }
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={17} />
        </button>

        <button
          type="button"
          className="pagination__page-size"
        >
          {pagination.page_size} / page
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EMPTY STATE                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({
  title,
  detail,
  action,
  onAction,
  error = false,
}: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
  error?: boolean;
}) {
  return (
    <div className="students-empty">
      <div
        className={`students-empty__icon ${
          error
            ? "students-empty__icon--error"
            : ""
        }`}
      >
        {error ? (
          <Activity size={21} />
        ) : (
          <Users size={21} />
        )}
      </div>

      <h3>{title}</h3>

      <p>{detail}</p>

      {action && (
        <button
          type="button"
          onClick={onAction}
          className="empty-action"
        >
          {action}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* LOADING                                                                    */
/* -------------------------------------------------------------------------- */

function LoadingState() {
  return (
    <div className="students-loading">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="loading-row"
        >
          <span className="loading-avatar" />

          <span className="loading-content">
            <span />
            <span />
          </span>

          <span className="loading-block" />
          <span className="loading-block" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function nextAction(
  placement: Placement,
  progress?: PlacementProgress,
) {
  const incomplete =
    progress &&
    progress.induction.completed <
      progress.induction.total;

  if (
    incomplete ||
    placement.state === "induction"
  ) {
    return {
      label: "Continue induction",
      href: `/mentor/students/${placement.id}`,
    };
  }

  if (placement.state === "orientation") {
    return {
      label: "Review orientation",
      href: `/mentor/students/${placement.id}`,
    };
  }

  const due =
    placement.state === "active" &&
    (!progress?.mentorship.last_session_date ||
      daysSince(
        progress.mentorship.last_session_date,
      ) >= 7);

  if (placement.state === "active") {
    return {
      label: due ? "Follow up" : "Log session",
      href: `/mentor?view=log&placement=${encodeURIComponent(placement.id)}`,
    };
  }

  return {
    label: placement.state === "paused" ? "Review paused placement" : "Review placement",
    href: `/mentor/students/${placement.id}`,
  };
}

function stateLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function daysSince(value: string) {
  return Math.floor(
    (Date.now() -
      new Date(`${value}T00:00:00`).getTime()) /
      86400000,
  );
}

function getPaginationPages(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from(
      { length: total },
      (_, index) => index + 1,
    );
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", total];
  }

  if (current >= total - 3) {
    return [
      1,
      "ellipsis",
      total - 4,
      total - 3,
      total - 2,
      total - 1,
      total,
    ];
  }

  return [
    1,
    "ellipsis",
    current - 1,
    current,
    current + 1,
    "ellipsis",
    total,
  ];
}
