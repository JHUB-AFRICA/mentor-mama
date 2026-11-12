import { isPlacementClosed, placementStateLabel } from "../placements/placementJourney";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  ClipboardCheck,
  FileText,
  ShieldAlert,
  Target,
  TriangleAlert,
  Users,
  X,
  RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Container } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";

import {
  getMentorshipSessions,
  getPlacementProgress,
  getInductionChecklist,
  getPlacement,
  getInductionReadiness,
  openInduction,
  remindOrientationBatch,
  answerInductionItem,
  signInduction,
  type CurrentUser,
  type MentorshipSession,
  type Placement,
  type PlacementProgress,
} from "../../services/api";

import { FeedbackAndSafeguardingPanel } from "../safeguarding/FeedbackAndSafeguardingPanel";
import { InductionChecklist } from "../induction/InductionChecklist";
import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";
import { followUpKeys, listFollowUps } from "../../services/follow-ups";

import "./MentorStudentDetail.css";
import "./mentor-follow-ups.css";

type MentorTab = "overview" | "history" | "safeguarding";

const SESSION_PAGE_SIZE = 6;

export function MentorStudentDetail({
  user,
  placement,
  onError,
  onPlacementUpdated,
}: {
  user: CurrentUser;
  placement: Placement;
  onError: (message: string) => void;
  onPlacementUpdated: (placement: Placement) => void;
}) {
  const { pushToast } = useToast();
  const [progress, setProgress] =
    useState<PlacementProgress | null>(null);

  const [sessions, setSessions] = useState<MentorshipSession[]>(
    [],
  );

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [checklist, setChecklist] = useState<Awaited<ReturnType<typeof getInductionChecklist>>>(null);
  const [inductionBusy, setInductionBusy] = useState(false);
  const [orientationAcknowledged, setOrientationAcknowledged] = useState<boolean | null>(null);
  const [orientationCheckFailed, setOrientationCheckFailed] = useState(false);
  const [orientationRefresh, setOrientationRefresh] = useState(0);
  const [reminderBusy, setReminderBusy] = useState(false);
  const orientationReminderCommand = useRef<string | null>(null);

  const [selectedSession, setSelectedSession] =
    useState<MentorshipSession | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");

  const [activeTab, setActiveTab] =
    useState<MentorTab>(
      requestedTab === "history" || requestedTab === "safeguarding"
        ? requestedTab
        : "overview",
    );

  const [sessionPage, setSessionPage] = useState(1);

  const [safeguardingOpen, setSafeguardingOpen] =
    useState(false);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setFailed(false);

    void Promise.all([
      getPlacementProgress(placement.id),
      getMentorshipSessions(placement.id),
    ])
      .then(([nextProgress, nextSessions]) => {
        if (!active) return;

        setProgress(nextProgress);
        setSessions(nextSessions);
        setSessionPage(1);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [placement.id, refreshKey]);

  useEffect(() => {
    let active = true;
    setChecklist(null);
    if (placement.state !== "induction" && placement.state !== "active") {
      return () => { active = false; };
    }
    void getInductionChecklist(placement.id)
      .then((result) => { if (active) setChecklist(result); })
      .catch(() => { if (active) setChecklist(null); });
    return () => { active = false; };
  }, [placement.id, placement.state]);

  useEffect(() => {
    if (placement.state !== "orientation") {
      setOrientationAcknowledged(null);
      setOrientationCheckFailed(false);
      return;
    }
    let active = true;
    setOrientationAcknowledged(null);
    setOrientationCheckFailed(false);
    void getInductionReadiness([placement.id])
      .then(([row]) => { if (active) setOrientationAcknowledged(Boolean(row?.orientation_acknowledged)); })
      .catch(() => { if (active) setOrientationCheckFailed(true); });
    return () => { active = false; };
  }, [placement.id, placement.state, orientationRefresh]);

  const name =
    placement.student?.name ?? "Assigned student";

  const initials = getInitials(name);

  const status = placementStateLabel(placement.state, "staff");
  const placementClosed = isPlacementClosed(placement.state);

  const lastSession =
    progress?.mentorship.last_session_date;

  const needsSession =
    placement.state === "active" &&
    (!lastSession || daysSince(lastSession) >= 7);
  // Follow-ups still open for this student (the same state as the Follow-ups page).
  const openFollowUpsQuery = useQuery({
    queryKey: [...followUpKeys.all, "placement", placement.id],
    queryFn: () => listFollowUps({ status: "pending", placementId: placement.id, pageSize: 50 }),
    retry: false,
  });
  const openFollowUps = openFollowUpsQuery.data?.data ?? [];
  const followUpDue = needsSession || openFollowUps.length > 0;
  const inductionStep = placement.state === "orientation" || placement.state === "induction";
  const waitingOnStudent = placement.state === "orientation" && orientationAcknowledged !== true;
  const nextStepHref = placement.state === "active"
    ? `/mentor?view=log&placement=${encodeURIComponent(placement.id)}`
    : `/mentor/students/${placement.id}`;

  const totalSessionPages = Math.max(
    1,
    Math.ceil(sessions.length / SESSION_PAGE_SIZE),
  );

  const pageSessions = useMemo(
    () =>
      sessions.slice(
        (sessionPage - 1) * SESSION_PAGE_SIZE,
        sessionPage * SESSION_PAGE_SIZE,
      ),
    [sessions, sessionPage],
  );

  useEffect(() => {
    if (sessionPage > totalSessionPages) {
      setSessionPage(totalSessionPages);
    }
  }, [sessionPage, totalSessionPages]);

  /*
   * Older links used hash anchors for tabs.
   * Clear the hash when arriving so the browser does not
   * jump into a lower section and create a false visual gap.
   */
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);

  function selectTab(tab: MentorTab) {
    setActiveTab(tab);
    setSearchParams(tab === "overview" ? {} : { tab });

    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }

  async function startInduction() {
    if (placement.state === "orientation" && !orientationAcknowledged) return;
    setInductionBusy(true);
    try {
      setChecklist(await openInduction(placement.id));
      onPlacementUpdated(await getPlacement(placement.id));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not open the induction checklist.");
    } finally {
      setInductionBusy(false);
    }
  }

  async function remindOrientation() {
    setReminderBusy(true);
    orientationReminderCommand.current ??= crypto.randomUUID();
    try {
      const count = await remindOrientationBatch([placement.id], orientationReminderCommand.current);
      orientationReminderCommand.current = null;
      pushToast({ kind: "success", title: "Reminder requested", message: `A personal orientation reminder was requested for ${count} student. The student must complete the acknowledgement.` });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not request an orientation reminder.");
    } finally {
      setReminderBusy(false);
    }
  }

  async function answerInduction(
    itemId: string,
    response: "yes" | "no" | "not_applicable",
    comment?: string,
  ) {
    setInductionBusy(true);
    try {
      await answerInductionItem(placement.id, itemId, response, comment);
      setChecklist((current) => current ? { ...current, items: current.items.map((item) => item.id === itemId ? { ...item, response, comment: comment ?? item.comment } : item) } : current);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not save that induction response.");
    } finally {
      setInductionBusy(false);
    }
  }

  async function completeInduction() {
    setInductionBusy(true);
    try {
      setChecklist(await signInduction(placement.id));
      onPlacementUpdated(await getPlacement(placement.id));
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not sign the induction checklist.");
    } finally {
      setInductionBusy(false);
    }
  }

  return (
    <MentorWorkspaceFrame
      user={user}
      title="Student detail"
      active="students"
    >
      <Container
        size="wide"
        className="mentor-student-page"
      >
        {/* ================================================================
            BACK
        ================================================================= */}

        <Link
          to="/mentor?view=students"
          className="mentor-student-back"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to students
        </Link>

        {/* ================================================================
            STUDENT HERO
        ================================================================= */}

        <header className="student-hero">
          <div className="student-hero__main">
            <div className="student-identity">
              <span
                className="student-avatar student-avatar--hero"
                aria-hidden="true"
              >
                {initials}
              </span>

              <div className="student-identity__content">
                <div className="student-identity__heading">
                  <h1>{name}</h1>

                  <StatusBadge
                    state={placement.state}
                    label={status}
                  />
                </div>

                <div className="student-meta">
                  <span>
                    {placement.cohort_name ??
                      "Current placement"}
                  </span>

                  <span className="student-meta__separator">
                    •
                  </span>

                  <span>
                    {placement.ward?.name ??
                      "Ward not listed"}
                  </span>
                </div>

                <div className="student-record-label">
                  <CalendarDays size={14} />
                  Placement participant record
                </div>
              </div>
            </div>

            <Link
              to={`/mentor?view=log&placement=${encodeURIComponent(
                placement.id,
              )}`}
              className="student-primary-action"
            >
              Log a session
              <ArrowRight size={16} />
            </Link>
          </div>

          {/* ============================================================
              TABS
          ============================================================= */}

          <nav
            className="student-tabs"
            aria-label="Student record sections"
          >
            {(
              [
                ["overview", "Overview"],
                ["history", "Mentorship history"],
                [
                  "safeguarding",
                  "Safeguarding & feedback",
                ],
              ] as const
            ).map(([tab, text]) => (
              <button
                key={tab}
                type="button"
                onClick={() => selectTab(tab)}
                className={`student-tab ${
                  activeTab === tab
                    ? "student-tab--active"
                    : ""
                }`}
                aria-current={
                  activeTab === tab ? "page" : undefined
                }
              >
                {text}
              </button>
            ))}
          </nav>
        </header>

        {/* ================================================================
            STATUS STRIP
        ================================================================= */}

        <section className="student-stat-strip">
          <Stat
            label="Induction"
            value={
              loading
                ? "…"
                : progress
                  ? `${progress.induction.completed}/${progress.induction.total}`
                  : "—"
            }
            detail="Completed"
            icon={<ClipboardCheck size={17} />}
          />

          <Stat
            label="Sessions"
            value={
              loading
                ? "…"
                : String(
                    progress?.mentorship.sessions_logged ??
                      0,
                  )
            }
            detail={
              lastSession
                ? `Last: ${formatDate(lastSession)}`
                : "None yet"
            }
            icon={<Users size={17} />}
          />

          <Stat
            label="Placement"
            value={status}
            detail={`${formatDate(
              placement.planned_start,
            )} – ${formatDate(placement.planned_end)}`}
            icon={<CalendarDays size={17} />}
          />

          <Stat
            label="Follow-up"
            value={openFollowUps.length ? `${openFollowUps.length} open` : needsSession ? "Due" : "On track"}
            detail={
              openFollowUps.length
                ? "From earlier sessions"
                : needsSession
                  ? "Needs attention"
                  : "Within rhythm"
            }
            icon={<Target size={17} />}
            warn={followUpDue}
          />
        </section>

        {/* ================================================================
            LOAD ERROR
        ================================================================= */}

        {failed && (
          <div
            className="student-error"
            role="alert"
          >
            <TriangleAlert size={17} />

            <span>
              Latest progress could not be loaded.
              Try again to load the latest record.
            </span>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {/* ================================================================
            OVERVIEW
        ================================================================= */}

        {activeTab === "overview" && (
          <div className="student-content-grid">
            <main className="student-main-column">
              {/* ----------------------------------------------------------
                  FOLLOW-UP SPOTLIGHT
              ----------------------------------------------------------- */}

              <section
                className={`student-spotlight ${
                  followUpDue
                    ? "student-spotlight--warning"
                    : "student-spotlight--normal"
                }`}
              >
                <div className="student-spotlight__icon">
                  {followUpDue ? (
                    <Clock3 size={22} />
                  ) : (
                    <CheckCircle2 size={22} />
                  )}
                </div>

                <div className="student-spotlight__content">
                  <p>
                    {followUpDue
                      ? "Follow-up due"
                      : "Placement update"}
                  </p>

                  <h2>
                    {needsSession
                      ? `No mentorship session has been recorded in ${daysSince(
                          lastSession ??
                            placement.planned_start,
                        )} days.`
                      : openFollowUps.length > 0
                        ? `${openFollowUps.length} ${openFollowUps.length === 1 ? "follow-up from an earlier session is" : "follow-ups from earlier sessions are"} still open.`
                      : placement.state === "orientation"
                        ? "Check the orientation handoff, then start induction."
                      : placement.state === "induction"
                        ? "Complete the induction handoff"
                        : placementClosed
                          ? "This placement is closed"
                          : "Keep the placement moving"}
                  </h2>

                  <span>
                    {needsSession
                      ? "Regular check-ins help keep placements on track."
                      : openFollowUps.length > 0
                        ? "Mark each one done on the Follow-ups page once it is finished."
                      : placementClosed
                        ? "No further sessions can be logged. The record below stays available for reference."
                        : "Use the record below to prepare for the next meaningful conversation."}
                  </span>
                </div>

                {waitingOnStudent ? (
                  <span className="student-spotlight__action" aria-live="polite">
                    {orientationCheckFailed ? "Check acknowledgement" : orientationAcknowledged === false ? "Waiting for student" : "Checking student step"}
                  </span>
                ) : openFollowUps.length > 0 && !needsSession ? (
                  <Link
                    to={`/mentor?view=follow-ups&placement=${encodeURIComponent(placement.id)}`}
                    className="student-spotlight__action"
                  >
                    Review follow-ups
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <Link to={nextStepHref} className="student-spotlight__action">
                    {inductionStep
                      ? placement.state === "orientation" ? "Start induction" : "Continue induction"
                      : placement.state === "active" ? "Open log" : "Review placement"}
                    <ArrowRight size={15} />
                  </Link>
                )}
              </section>

              {/* ----------------------------------------------------------
                  PROGRESS
              ----------------------------------------------------------- */}

              <PlacementTimeline
                progress={progress}
                loading={loading}
                lastSession={lastSession}
              />

              {placement.state === "orientation" && orientationAcknowledged !== true && (
                <section className="student-induction-entry">
                  <div>
                    <span>Next placement step</span>
                    <h2>{orientationAcknowledged === false ? "Waiting for the student’s orientation acknowledgement." : "Checking the student’s orientation step."}</h2>
                    <p>{orientationCheckFailed
                      ? "We could not check the student’s response. Retry the check before starting induction."
                      : "The student reviews the placement and signs their own orientation acknowledgement. You can remind them; you cannot complete this personal step for them."}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {orientationAcknowledged === false && <button type="button" className="student-dark-button" onClick={() => void remindOrientation()} disabled={reminderBusy}>
                      {reminderBusy ? "Requesting reminder…" : "Remind student"}<ArrowRight size={16} />
                    </button>}
                    <button type="button" className="student-dark-button" onClick={() => setOrientationRefresh((value) => value + 1)} disabled={!orientationCheckFailed && orientationAcknowledged === null}>
                      <RefreshCw size={16} />{orientationCheckFailed ? "Retry check" : "Check again"}
                    </button>
                  </div>
                </section>
              )}

              {(placement.state === "orientation" && orientationAcknowledged === true || placement.state === "induction") && !checklist && (
                <section className="student-induction-entry">
                  <div>
                    <span>Next placement step</span>
                    <h2>{placement.state === "orientation" ? "Move from orientation to induction." : "Complete the induction handoff."}</h2>
                    <p>{placement.state === "orientation"
                      ? "Orientation is acknowledged. Open and complete the induction checklist with the student. Signing activates the placement."
                      : "Answer the required checklist items before signing the student’s induction record. Signing activates the placement."}</p>
                  </div>
                  <button type="button" className="student-dark-button" onClick={() => void startInduction()} disabled={inductionBusy || placement.state === "orientation" && orientationAcknowledged !== true}>
                    {inductionBusy ? "Opening…" : placement.state === "orientation" ? "Start induction" : "Open induction"}
                    <ArrowRight size={16} />
                  </button>
                </section>
              )}

              {placement.state === "induction" && checklist && (
                <InductionChecklist checklist={checklist} busy={inductionBusy} onAnswer={answerInduction} onSign={() => void completeInduction()} />
              )}

              {/* ----------------------------------------------------------
                  RECENT HISTORY
              ----------------------------------------------------------- */}

              <MentorshipHistory
                sessions={pageSessions}
                total={sessions.length}
                loading={loading}
                page={sessionPage}
                totalPages={totalSessionPages}
                onPage={setSessionPage}
                onSelect={setSelectedSession}
              />
            </main>

            {/* ----------------------------------------------------------
                SIDEBAR
            ----------------------------------------------------------- */}

            <aside className="student-sidebar">
              <StudentInformation
                placement={placement}
                lastSession={lastSession}
              />

              <RecordGuidance />

              <SafeguardingCard
                onOpen={() =>
                  setSafeguardingOpen(true)
                }
              />
            </aside>
          </div>
        )}

        {/* ================================================================
            HISTORY TAB
        ================================================================= */}

        {activeTab === "history" && (
          <div className="student-tab-page">
            <MentorshipHistory
              sessions={pageSessions}
              total={sessions.length}
              loading={loading}
              page={sessionPage}
              totalPages={totalSessionPages}
              onPage={setSessionPage}
              onSelect={setSelectedSession}
              fullPage
            />
          </div>
        )}

        {/* ================================================================
            SAFEGUARDING TAB
        ================================================================= */}

        {activeTab === "safeguarding" && (
          <div className="student-safeguarding-page">
            <div className="student-safeguarding-page__icon">
              <ShieldAlert size={25} />
            </div>

            <span>Protected workflow</span>

            <h2>Safeguarding &amp; feedback</h2>

            <p>
              Use this private channel to raise a
              concern or share feedback about this
              placement. The narrative is visible only
              to authorised reviewers.
            </p>

            <button
              type="button"
              onClick={() =>
                setSafeguardingOpen(true)
              }
              className="student-dark-button"
            >
              Open protected panel
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ================================================================
            CONFIDENTIALITY NOTICE
        ================================================================= */}

        <div className="student-confidentiality">
          <FileText
            size={19}
            aria-hidden="true"
          />

          <div>
            <strong>Private mentor record</strong>

            <span>
              This information is confidential. Do not
              include patient-identifiable details.
            </span>
          </div>
        </div>

        {/* ================================================================
            SAFEGUARDING MODAL
        ================================================================= */}

        {safeguardingOpen && (
          <SafeguardingModal
            placementId={placement.id}
            onError={onError}
            onClose={() =>
              setSafeguardingOpen(false)
            }
          />
        )}

        {/* ================================================================
            SESSION DETAIL
        ================================================================= */}

        {selectedSession && (
          <SessionDetail
            session={selectedSession}
            onClose={() =>
              setSelectedSession(null)
            }
          />
        )}
      </Container>
    </MentorWorkspaceFrame>
  );
}


/* ==========================================================================
   STATUS BADGE
   ========================================================================== */

function StatusBadge({
  state,
  label,
}: {
  state: string;
  label: string;
}) {
  const isActive = state === "active";
  const isInduction = state === "induction";

  return (
    <span
      className={`student-status ${
        isActive
          ? "student-status--active"
          : isInduction
            ? "student-status--induction"
            : "student-status--default"
      }`}
    >
      <span />
      {label}
    </span>
  );
}


/* ==========================================================================
   STAT
   ========================================================================== */

function Stat({
  label,
  value,
  detail,
  icon,
  warn = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  warn?: boolean;
}) {
  return (
    <div
      className={`student-stat ${
        warn ? "student-stat--warning" : ""
      }`}
    >
      <div className="student-stat__top">
        <span>{icon}</span>

        <p>{label}</p>
      </div>

      <strong>{value}</strong>

      <small>{detail}</small>
    </div>
  );
}


/* ==========================================================================
   PLACEMENT TIMELINE
   ========================================================================== */

function PlacementTimeline({
  progress,
  loading,
  lastSession,
}: {
  progress: PlacementProgress | null;
  loading: boolean;
  lastSession?: string | null;
}) {
  const steps = [
    {
      title: "Orientation",
      value: progress?.orientation?.acknowledged
        ? "Acknowledged"
        : "Awaiting acknowledgement",
      done: Boolean(
        progress?.orientation?.acknowledged,
      ),
    },
    {
      title: "Induction",
      value: progress
        ? `${progress.induction.completed}/${progress.induction.total} complete`
        : "Loading…",
      done: Boolean(
        progress &&
          progress.induction.total > 0 &&
          progress.induction.completed ===
            progress.induction.total,
      ),
    },
    {
      title: "Mentorship",
      value: progress
        ? `${progress.mentorship.sessions_logged} sessions logged`
        : "Loading…",
      done: Boolean(lastSession),
    },
  ];

  return (
    <section className="student-section">
      <div className="student-section-heading">
        <div>
          <span>Placement journey</span>

          <h2>Progress</h2>
        </div>
      </div>

      {loading ? (
        <div className="student-loading-line">
          <span />
          Loading placement progress…
        </div>
      ) : (
        <ol className="placement-timeline">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className={`timeline-step ${
                step.done
                  ? "timeline-step--complete"
                  : ""
              }`}
            >
              {index < steps.length - 1 && (
                <span
                  className={`timeline-connector ${
                    step.done
                      ? "timeline-connector--complete"
                      : ""
                  }`}
                  aria-hidden="true"
                />
              )}

              <span className="timeline-node">
                {step.done ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Circle size={14} />
                )}
              </span>

              <div>
                <strong>{step.title}</strong>
                <span>{step.value}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}


/* ==========================================================================
   MENTORSHIP HISTORY
   ========================================================================== */

function MentorshipHistory({
  sessions,
  total,
  loading,
  page,
  totalPages,
  onPage,
  onSelect,
  fullPage = false,
}: {
  sessions: MentorshipSession[];
  total: number;
  loading: boolean;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  onSelect: (session: MentorshipSession) => void;
  fullPage?: boolean;
}) {
  return (
    <section
      className={`student-history ${
        fullPage
          ? "student-history--full"
          : ""
      }`}
    >
      <div className="student-section-heading">
        <div>
          <span>Session record</span>

          <h2>Mentorship history</h2>

          <p>
            Select a session to read the full notes
            and follow-up.
          </p>
        </div>

        <strong>{total} logged</strong>
      </div>

      {loading ? (
        <div className="student-loading-line">
          <span />
          Loading session history…
        </div>
      ) : sessions.length ? (
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Session</th>
                <th>Topics</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  tabIndex={0}
                  role="button"
                  onClick={() =>
                    onSelect(session)
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === " "
                    ) {
                      event.preventDefault();
                      onSelect(session);
                    }
                  }}
                >
                  <td>
                    <strong>
                      {formatDate(
                        session.session_date,
                      )}
                    </strong>
                  </td>

                  <td>
                    <strong className="capitalize">
                      {session.session_type.replaceAll(
                        "_",
                        " ",
                      )}
                    </strong>

                    <span>
                      {session.duration_minutes
                        ? `${session.duration_minutes} minutes`
                        : "Time not recorded"}
                    </span>
                  </td>

                  <td>
                    {session.topics.length
                      ? session.topics
                          .map((topic) =>
                            topic.replaceAll(
                              "_",
                              " ",
                            ),
                          )
                          .join(", ")
                      : "No topics recorded"}
                  </td>

                  <td>
                    <span className="history-arrow">
                      <ChevronRight size={17} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="history-mobile-list">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() =>
                  onSelect(session)
                }
                className="history-mobile-row"
              >
                <span>
                  <strong>
                    {formatDate(
                      session.session_date,
                    )}
                  </strong>

                  <small>
                    {session.session_type.replaceAll(
                      "_",
                      " ",
                    )}
                    {" · "}
                    {session.duration_minutes
                      ? `${session.duration_minutes} min`
                      : "Time not recorded"}
                  </small>

                  <small>
                    {session.topics.length
                      ? session.topics
                          .map((topic) =>
                            topic.replaceAll(
                              "_",
                              " ",
                            ),
                          )
                          .join(", ")
                      : "No topics recorded"}
                  </small>
                </span>

                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="history-empty">
          <FileText size={22} />

          <strong>
            No mentorship sessions yet.
          </strong>

          <span>
            Logged sessions will appear here.
          </span>
        </div>
      )}

      {total > 0 && (
        <div className="history-pagination">
          <span>
            Page {page} of {totalPages}
          </span>

          <div>
            <button
              type="button"
              disabled={page === 1}
              onClick={() =>
                onPage(page - 1)
              }
              aria-label="Previous sessions"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              disabled={page === totalPages}
              onClick={() =>
                onPage(page + 1)
              }
              aria-label="Next sessions"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}


/* ==========================================================================
   STUDENT INFORMATION
   ========================================================================== */

function StudentInformation({
  placement,
  lastSession,
}: {
  placement: Placement;
  lastSession?: string | null;
}) {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section__heading">
        <span>Profile</span>
        <h2>Student information</h2>
      </div>

      <dl className="student-details">
        <Detail
          title="Registration"
          value={
            placement.student
              ?.registration_number ??
            "Not listed"
          }
        />

        <Detail
          title="Ward"
          value={
            placement.ward?.name ??
            "Not listed"
          }
        />

        <Detail
          title="Placement window"
          value={`${formatDate(
            placement.planned_start,
          )} – ${formatDate(
            placement.planned_end,
          )}`}
          icon={
            <CalendarDays
              size={13}
              aria-hidden="true"
            />
          }
        />

        <Detail
          title="Last session"
          value={
            lastSession
              ? formatDate(lastSession)
              : "No session yet"
          }
        />
      </dl>
    </section>
  );
}


/* ==========================================================================
   RECORD GUIDANCE
   ========================================================================== */

function RecordGuidance() {
  return (
    <section className="guidance-section">
      <span>Mentor guidance</span>

      <h2>Keep records useful.</h2>

      <ul>
        <li>
          Record the learning focus, not patient
          details.
        </li>

        <li>
          Use follow-up to make the next action
          explicit.
        </li>

        <li>
          Open a private concern when safety needs
          attention.
        </li>
      </ul>
    </section>
  );
}


/* ==========================================================================
   SAFEGUARDING CARD
   ========================================================================== */

function SafeguardingCard({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <section className="safeguarding-card">
      <div className="safeguarding-card__icon">
        <ShieldAlert size={19} />
      </div>

      <span>Protected channel</span>

      <h2>Safeguarding &amp; feedback</h2>

      <p>
        Share a private concern or feedback about
        this placement.
      </p>

      <button
        type="button"
        onClick={onOpen}
      >
        Open panel
        <ArrowRight size={15} />
      </button>
    </section>
  );
}


/* ==========================================================================
   SESSION DETAIL
   ========================================================================== */

function SessionDetail({
  session,
  onClose,
}: {
  session: MentorshipSession;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () =>
      document.removeEventListener(
        "keydown",
        closeOnEscape,
      );
  }, [onClose]);

  return (
    <div
      className="record-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-detail-title"
        className="record-modal"
      >
        <div className="record-modal__header">
          <div>
            <span>Mentorship session</span>

            <h2 id="session-detail-title">
              {session.session_type.replaceAll(
                "_",
                " ",
              )}
            </h2>

            <p>
              {formatDate(session.session_date)}

              {session.duration_minutes
                ? ` · ${session.duration_minutes} minutes`
                : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close session details"
          >
            <X size={19} />
          </button>
        </div>

        <div className="record-modal__details">
          <Detail
            title="Topics covered"
            value={
              session.topics.length
                ? session.topics
                    .map((topic) =>
                      topic.replaceAll(
                        "_",
                        " ",
                      ),
                    )
                    .join(", ")
                : "Not recorded"
            }
          />

          <Detail
            title="Submitted"
            value={formatSubmitted(
              session.submitted_at,
            )}
          />
        </div>

        <Note
          title="What was covered"
          value={session.what_was_covered}
        />

        <Note
          title="Feedback given"
          value={session.feedback_given}
        />

        <Note
          title="Follow-up"
          value={
            session.follow_up_action &&
            session.follow_up_action !== "none"
              ? session.follow_up_action.replaceAll(
                  "_",
                  " ",
                )
              : undefined
          }
        />

        <div className="record-modal__notice">
          <Clock3 size={14} />

          Private mentor record. Do not add
          patient-identifiable information.
        </div>
      </section>
    </div>
  );
}


/* ==========================================================================
   SAFEGUARDING MODAL
   ========================================================================== */

function SafeguardingModal({
  placementId,
  onError,
  onClose,
}: {
  placementId: string;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () =>
      document.removeEventListener(
        "keydown",
        closeOnEscape,
      );
  }, [onClose]);

  return (
    <div
      className="record-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="safeguarding-modal-title"
        className="record-modal record-modal--safeguarding"
      >
        <div className="record-modal__header">
          <div className="record-modal__title-group">
            <div className="record-modal__warning-icon">
              <ShieldAlert size={20} />
            </div>

            <div>
              <span>Protected workflow</span>

              <h2 id="safeguarding-modal-title">
                Raise a private concern
              </h2>

              <p>
                Only authorised safeguarding
                reviewers can read the narrative.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close safeguarding dialog"
          >
            <X size={19} />
          </button>
        </div>

        <FeedbackAndSafeguardingPanel
          placementId={placementId}
          role="mentor"
          surface="plain"
          onError={onError}
        />
      </section>
    </div>
  );
}


/* ==========================================================================
   DETAIL
   ========================================================================== */

function Detail({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="detail-item">
      <dt>{title}</dt>

      <dd>
        {icon}
        {value}
      </dd>
    </div>
  );
}


/* ==========================================================================
   NOTE
   ========================================================================== */

function Note({
  title,
  value,
}: {
  title: string;
  value?: string | null;
}) {
  return (
    <div className="record-note">
      <p>{title}</p>

      <span>
        {value?.trim() || "Not recorded"}
      </span>
    </div>
  );
}


/* ==========================================================================
   HELPERS
   ========================================================================== */

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AS"
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatSubmitted(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function daysSince(value: string) {
  return Math.floor(
    (Date.now() -
      new Date(`${value}T00:00:00`).getTime()) /
      86400000,
  );
}
