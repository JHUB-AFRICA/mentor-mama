import { placementJourney, placementStateLabel } from "../placements/placementJourney";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  GraduationCap,
  HeartHandshake,
  History,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Route,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminTabs,
  EmptyState,
  ListRow,
  Notice,
  StatCard,
  StatGrid,
  StatusPill,
  type PillTone,
} from "../programme-admin/ui/AdminKit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { InlineFeedback } from "../../components/InlineFeedback";

import {
  confirmPlacement,
  getPlacementAcknowledgement,
  getFinalAssessmentStatus,
  getInductionChecklist,
  getPlacement,
  getPlacementProgress,
  getMentorshipSessions,
  getTransitions,
  type PlacementAcknowledgement,
  type Placement,
  type TransitionResponse,
} from "../../services/api";

import type { WorkspaceProps } from "../workspaces/WorkspaceTypes";

import { OrientationPanel } from "../induction/OrientationPanel";
import { InductionSummary } from "../induction/InductionSummary";
import { FinalAssessmentForm } from "../assessments/FinalAssessmentForm";
import { BaselineConfidenceCard } from "../assessments/BaselineConfidenceCard";
import { FeedbackAndSafeguardingPanel } from "../safeguarding/FeedbackAndSafeguardingPanel";
import { PlacementHistory } from "../placements/PlacementHistory";

import "./StudentPlacementDetail.css";
import "./student-placement.css";
import { lockScroll } from "../../lib/scrollLock";

type DetailTab =
  | "overview"
  | "journey"
  | "activity"
  | "documents"
  | "support";

type AcknowledgementStep = "document" | "confirm";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatState(value: string) {
  return placementStateLabel(value, "learner");
}

function pillTone(value: string): PillTone {
  if (value === "active" || value === "completed") return "success";
  if (value === "awaiting_student" || value === "paused") return "warning";
  if (value === "withdrawn") return "danger";
  if (value === "orientation" || value === "induction") return "info";
  return "neutral";
}

function stageDescription(state: string) {
  return placementJourney(state, "learner").summary;
}

function getCurrentStep(state: string) {
  switch (state) {
    case "awaiting_student":
      return {
        eyebrow: "Action required",
        title: "Review your placement assignment",
        description:
          "Your placement has been assigned. Review the assignment details before acknowledging it.",
        label: "Review assignment",
        tone: "attention" as const,
      };

    case "orientation":
      return {
        eyebrow: "Current step",
        title: "Complete your orientation",
        description:
          "Complete the required orientation steps before your placement begins.",
        label: "Continue orientation",
        tone: "teal" as const,
      };

    case "induction":
      return {
        eyebrow: "Current step",
        title: "Induction is in progress",
        description:
          "Your mentor is completing the required induction checklist. You will see the placement become active once the required steps are complete.",
        label: null,
        tone: "neutral" as const,
      };

    case "active":
      return {
        eyebrow: "Current step",
        title: "You're on placement",
        description:
          "Your placement is active. Continue your learning, mentor sessions and required activities.",
        label: "View progress",
        tone: "teal" as const,
      };

    case "paused":
      return {
        eyebrow: "Placement status",
        title: "Placement temporarily paused",
        description:
          "Your programme team will provide updates when the placement is ready to continue.",
        label: null,
        tone: "attention" as const,
      };

    case "completed":
    case "archived":
      return {
        eyebrow: "Placement status",
        title: state === "archived" ? "Placement archived" : "Placement completed",
        description: placementJourney(state, "learner").summary,
        label: null,
        tone: "neutral" as const,
      };

    case "withdrawn":
      return {
        eyebrow: "Placement status",
        title: "Placement withdrawn",
        description: placementJourney(state, "learner").summary,
        label: null,
        tone: "attention" as const,
      };

    default:
      return {
        eyebrow: "Placement status",
        title: "Placement being prepared",
        description: placementJourney(state, "learner").summary,
        label: null,
        tone: "neutral" as const,
      };
  }
}

export function StudentPlacementDetail({
  user,
  placement,
  onBack,
  onPlacementsUpdated,
  onError,
}: WorkspaceProps & {
  placement: Placement;
  onBack: () => void;
}) {
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(placement);

  const [transitions, setTransitions] =
    useState<TransitionResponse | null>(null);
  const [transitionsLoaded, setTransitionsLoaded] = useState(false);
  const [transitionsError, setTransitionsError] = useState(false);
  const [transitionsAttempt, setTransitionsAttempt] = useState(0);

  const [checklist, setChecklist] = useState<
    Awaited<ReturnType<typeof getInductionChecklist>>
  >(null);

  const [assessment, setAssessment] = useState<
    Awaited<ReturnType<typeof getFinalAssessmentStatus>> | null
  >(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState(false);
  const [assessmentAttempt, setAssessmentAttempt] = useState(0);

  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] =
    useState<DetailTab>("overview");

  const [acknowledgementOpen, setAcknowledgementOpen] =
    useState(false);

  const [acknowledgementStep, setAcknowledgementStep] =
    useState<AcknowledgementStep>("document");

  const [hasReachedEnd, setHasReachedEnd] = useState(false);

  const [hasReadAssignment, setHasReadAssignment] =
    useState(false);

  const [assignmentViewed, setAssignmentViewed] =
    useState(false);

  const [acknowledgementComplete, setAcknowledgementComplete] =
    useState(false);
  const [acknowledgement, setAcknowledgement] =
    useState<PlacementAcknowledgement | null>(null);
  const [acknowledgementLoading, setAcknowledgementLoading] = useState(true);
  const [acknowledgementError, setAcknowledgementError] = useState(false);
  const [acknowledgementAttempt, setAcknowledgementAttempt] = useState(0);
  const [signatureName, setSignatureName] = useState("");

  const documentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.location.hash !== "#feedback") return;
    setActiveTab("support");
    window.setTimeout(() => {
      document.getElementById("feedback")?.scrollIntoView({ block: "start" });
    }, 0);
  }, []);

  useEffect(() => {
    let active = true;
    setTransitionsLoaded(false);
    setTransitionsError(false);
    setTransitions(null);

    void getTransitions(current.id)
      .then((value) => {
        if (active) {
          setTransitions(value);
          setTransitionsLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setTransitions(null);
          setTransitionsLoaded(true);
          setTransitionsError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [current.id, transitionsAttempt]);

  useEffect(() => {
    let active = true;

    if (["induction", "active"].includes(current.state)) {
      void getInductionChecklist(current.id)
        .then((value) => {
          if (active) {
            setChecklist(value);
          }
        })
        .catch(() => {
          if (active) {
            setChecklist(null);
          }
        });
    } else {
      setChecklist(null);
    }

    return () => {
      active = false;
    };
  }, [current.id, current.state]);

  useEffect(() => {
    let active = true;
    setAssessmentLoading(true);
    setAssessment(null);
    setAssessmentError(false);

    void getFinalAssessmentStatus(current.id)
      .then((value) => {
        if (active) {
          setAssessment(value);
        }
      })
      .catch(() => {
        if (active) {
          setAssessment(null);
          setAssessmentError(true);
        }
      })
      .finally(() => { if (active) setAssessmentLoading(false); });

    return () => {
      active = false;
    };
  }, [current.id, current.actual_end, current.planned_end, assessmentAttempt]);

  useEffect(() => {
    let active = true;
    setAcknowledgementLoading(true);
    setAcknowledgementError(false);
    void getPlacementAcknowledgement(current.id)
      .then((record) => { if (active) setAcknowledgement(record); })
      .catch(() => {
        if (active) {
          setAcknowledgement(null);
          setAcknowledgementError(true);
        }
      })
      .finally(() => { if (active) setAcknowledgementLoading(false); });
    return () => { active = false; };
  }, [current.id, acknowledgementAttempt]);

  async function refresh() {
    const next = await getPlacement(current.id);

    setCurrent(next);
    onPlacementsUpdated(next);
  }

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);

    try {
      await action();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not update this placement.",
      );
      setBusy(false);
      return false;
    }

    try {
      await refresh();
    } catch {
      onError("Your confirmation was saved, but we could not refresh the placement. Reload this page to see the latest status.");
    } finally {
      setBusy(false);
    }
    return true;
  }

  function openAcknowledgement() {
    setAcknowledgementStep("document");
    setHasReachedEnd(false);
    setHasReadAssignment(false);
    setSignatureName("");
    setAcknowledgementOpen(true);

    window.setTimeout(() => {
      documentRef.current?.scrollTo({
        top: 0,
      });
    }, 50);
  }

  function closeAcknowledgement() {
    if (busy) {
      return;
    }

    setAcknowledgementOpen(false);
    setAcknowledgementStep("document");
    setHasReachedEnd(false);
    setHasReadAssignment(false);
  }

  function handleDocumentScroll() {
    const element = documentRef.current;

    if (!element) {
      return;
    }

    const remaining =
      element.scrollHeight -
      element.scrollTop -
      element.clientHeight;

    if (remaining <= 24) {
      setHasReachedEnd(true);
    }
  }

  async function acknowledgePlacement() {
    const confirmed = await run(() => confirmPlacement(current.id, signatureName));
    if (confirmed) {
      try {
        setAcknowledgement(await getPlacementAcknowledgement(current.id));
        setAcknowledgementError(false);
      } catch {
        setAcknowledgementError(true);
        onError("Your acknowledgement was saved, but we could not load its signed record. Reload this page to view it.");
      } finally {
        setAcknowledgementLoading(false);
      }
      if (current.state === "awaiting_student") {
        const updated = { ...current, state: "orientation" as const };
        setCurrent(updated);
        onPlacementsUpdated(updated);
      }
      pushToast({ kind: "success", title: "Placement confirmed", message: "Your acknowledgement has been recorded." });
      setAcknowledgementComplete(true);
      setAssignmentViewed(true);
      setAcknowledgementOpen(false);
      setAcknowledgementStep("document");
      setHasReachedEnd(false);
      setHasReadAssignment(false);
      setActiveTab("overview");
    }
  }

  const requiresConfirmation = Boolean(
    transitions?.available.includes("orientation"),
  );

  const showInductionSummary =
    current.state === "active" &&
    Boolean(checklist?.completed_at);

  const closeoutLifecycle = ["active", "paused"].includes(current.state);
  const showAssessment =
    (Boolean(assessment?.can_submit) && closeoutLifecycle) ||
    Boolean(assessment?.submitted) ||
    (["active", "paused", "completed"].includes(current.state) &&
      (assessmentError || (assessmentLoading && assessmentAttempt > 0)));

  const stageLabel = useMemo(() => {
    if (current.state === "active") {
      return "Placement active";
    }

    if (current.state === "completed") {
      return "Placement completed";
    }

    if (current.state === "induction") {
      return "Induction";
    }

    if (current.state === "orientation") {
      return "Orientation";
    }

    if (current.state === "awaiting_student") {
      return "Confirmation";
    }

    return formatState(current.state);
  }, [current.state]);

  const currentStep = getCurrentStep(current.state);
  const journey = placementJourney(current.state, "learner");
  const time = (() => {
    const start = new Date(`${current.planned_start}T00:00:00`).getTime();
    const end = new Date(`${current.planned_end}T00:00:00`).getTime();
    const total = Math.max(1, Math.round((end - start) / 86_400_000));
    const done = Math.min(total, Math.max(0, Math.round((Date.now() - start) / 86_400_000)));
    return { total, pct: current.state === "completed" ? 100 : Math.round((done / total) * 100) };
  })();

  return (
    <>
      <AdminPage className="sp">
        <button type="button" className="sp-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to placements
        </button>

        {/* Identity: who, where, when, with whom. Shown once. */}
        <section className="sp-hero" aria-labelledby="sp-title">
          <div className="sp-hero__top">
            <span className="sp-hero__icon" aria-hidden="true"><MapPin /></span>
            <div className="sp-hero__copy">
              <div className="sp-hero__eyebrow">
                <span className="pa-eyebrow">My placement</span>
                <StatusPill tone={pillTone(current.state)}>{formatState(current.state)}</StatusPill>
              </div>
              <h2 id="sp-title" className="sp-hero__title">{current.facility_name ?? "My placement"}</h2>
              <p className="sp-hero__sub">{current.cohort_name ?? "Clinical placement"}</p>
            </div>
            <span className="sp-chip"><ShieldCheck aria-hidden="true" /> Private learning record</span>
          </div>
          <dl className="sp-facts">
            <div>
              <dt><CalendarDays aria-hidden="true" /> Dates</dt>
              <dd>{formatDate(current.planned_start)} – {formatDate(current.planned_end)}</dd>
            </div>
            <div>
              <dt><Building2 aria-hidden="true" /> Ward</dt>
              <dd>{current.ward?.name ?? "To be confirmed"}</dd>
            </div>
            <div>
              <dt><UserRound aria-hidden="true" /> Mentor</dt>
              <dd>{current.mentor?.name ?? "Assignment pending"}</dd>
            </div>
            <div>
              <dt><Clock3 aria-hidden="true" /> Time on placement</dt>
              <dd>
                <span className="sp-meter" role="img" aria-label={`${time.pct}% of ${time.total} days`}>
                  <span className="sp-meter__bar"><span style={{ width: `${time.pct}%` }} /></span>
                  <span>{time.pct}% · {time.total} days</span>
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Where you are + what to do now, in one card. */}
        <section className={`sp-next sp-next--${currentStep.tone}`} aria-labelledby="sp-next-title">
          <header className="sp-next__head">
            <div>
              <p className="pa-eyebrow">{currentStep.eyebrow}</p>
              <h3 id="sp-next-title">{currentStep.title}</h3>
            </div>
            <span className="sp-next__stage">{journey.progressLabel}</span>
          </header>
          <ol className="sp-steps" aria-label="Placement progress">
            {journey.stages.map((stage, index) => {
              const done = stage.status === "done";
              const now = stage.status === "current" || stage.status === "attention";
              return (
                <li key={stage.key} className={done ? "is-done" : now ? "is-current" : ""} aria-current={now ? "step" : undefined}>
                  <span className="sp-steps__dot">{done ? <Check aria-hidden="true" /> : index + 1}</span>
                  <span className="sp-steps__label">
                    {stage.label}
                    <span className="sr-only">{done ? " (complete)" : now ? " (current)" : " (upcoming)"}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="sp-next__body">
            <div className="sp-next__copy">
              <p>{currentStep.description}</p>
              {current.state === "induction" && checklist && <InductionProgress checklist={checklist} />}
            </div>
            <div className="sp-next__action">
              {current.state === "awaiting_student" && transitionsError && (
                <div role="alert" className="sp-inline-alert">
                  <span>We couldn’t check whether your confirmation is ready.</span>
                  <AdminButton size="sm" variant="ghost" onClick={() => setTransitionsAttempt((attempt) => attempt + 1)}>Try again</AdminButton>
                </div>
              )}
              {current.state === "awaiting_student" && !transitionsLoaded && <p role="status" className="sp-muted">Checking your placement options…</p>}
              {current.state === "awaiting_student" && transitionsLoaded && !transitionsError && !requiresConfirmation && (
                <p role="status" className="sp-muted">Your programme team is still preparing this placement. You’ll be able to confirm when it’s ready.</p>
              )}
              {current.state === "awaiting_student" && transitionsLoaded && requiresConfirmation && (
                <AdminButton disabled={busy} onClick={openAcknowledgement}>Review assignment <ArrowRight aria-hidden="true" /></AdminButton>
              )}
              {current.state === "orientation" && (
                <AdminButton onClick={() => setActiveTab("journey")}>Continue orientation <ArrowRight aria-hidden="true" /></AdminButton>
              )}
              {current.state === "active" && (
                <AdminButton variant="secondary" onClick={() => setActiveTab("journey")}>View my journey <ArrowRight aria-hidden="true" /></AdminButton>
              )}
            </div>
          </div>
        </section>

        <BaselineConfidenceCard placementId={current.id} state={current.state} onError={onError} />

        <AdminTabs
          label="Placement sections"
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: "overview", label: "Overview", icon: <LayoutDashboard aria-hidden="true" /> },
            { value: "journey", label: "Journey", icon: <Route aria-hidden="true" /> },
            { value: "activity", label: "Activity", icon: <History aria-hidden="true" /> },
            { value: "documents", label: "Documents", icon: <FileText aria-hidden="true" /> },
            { value: "support", label: "Support", icon: <LifeBuoy aria-hidden="true" /> },
          ]}
        />

        <AnimatePresence mode="wait" initial={false}>
        {activeTab === "overview" && (
          <TabPanel id="overview">
          <PlacementOverview
            placement={current}
            stageTitle={stageLabel}
            stageText={stageDescription(current.state)}
            onSessions={() => navigate("/student?view=sessions")}
            onConcerns={() => navigate("/student?view=concerns")}
            onSupport={() => setActiveTab("support")}
          />
          </TabPanel>
        )}

        {activeTab === "journey" && (
          <TabPanel id="journey">
          <div className="sp-tab">
            <SectionHeading eyebrow="Placement journey" title="Your placement journey" text="Each stage from assignment through to close-out, and what you need to do in it." />

            {current.state === "orientation" && (
              <OrientationPanel
                placement={current}
                onComplete={() => {
                  void refresh().catch(() => onError("Your orientation is recorded, but we couldn’t refresh the placement. Reload this page to see the latest details."));
                }}
                onError={onError}
              />
            )}

            {current.state === "induction" && (
              <Notice icon={<Clock3 />}>
                <strong>Your mentor is completing the induction checklist.</strong> The placement becomes active once every required item is signed.
              </Notice>
            )}

            {showInductionSummary && checklist && (
              <>
                <SectionHeading eyebrow="Completed" title="Induction record" />
                <InductionSummary placement={current} checklist={checklist} />
              </>
            )}

            {showAssessment && (
              <>
                <SectionHeading eyebrow="Close-out" title="Final assessment" text="Complete your assessment when the placement is ready to close." />
                {assessment?.can_submit && closeoutLifecycle && (
                  <FinalAssessmentForm
                    placementId={current.id}
                    onSubmitted={() => setAssessment((value) => (value ? { ...value, submitted: true, can_submit: false } : value))}
                    onError={onError}
                  />
                )}
                {assessmentLoading && assessmentAttempt > 0 && <p className="sp-muted" role="status">Checking whether your final assessment is ready…</p>}
                {assessmentError && (
                  <InlineFeedback kind="error" title="We couldn’t check your close-out status">
                    Your final assessment availability is unconfirmed. Retry to check whether it is ready; you can submit once the portal confirms it is due.
                    <button type="button" className="mt-2 block font-semibold text-teal underline underline-offset-2" onClick={() => setAssessmentAttempt((attempt) => attempt + 1)}>
                      Try again
                    </button>
                  </InlineFeedback>
                )}
                {assessment?.submitted && (
                  <Notice icon={<CheckCircle2 />}>
                    <strong>Final assessment submitted.</strong> Your close-out response is safely recorded.
                  </Notice>
                )}
              </>
            )}

            {!["orientation", "induction"].includes(current.state) && !showInductionSummary && !showAssessment && (
              <EmptyState icon={<Route />} title="Nothing to do here yet" text={stageDescription(current.state)} />
            )}
          </div>
          </TabPanel>
        )}

        {activeTab === "activity" && (
          <TabPanel id="activity">
          <div className="sp-tab">
            <SectionHeading eyebrow="Record" title="Placement activity" text="Important changes and activity recorded against this placement." />
            <AdminCard>
              <PlacementHistory placementId={current.id} />
            </AdminCard>
          </div>
          </TabPanel>
        )}

        {activeTab === "documents" && (
          <TabPanel id="documents">
          <div className="sp-tab">
            <SectionHeading eyebrow="Documents" title="Your placement documents" text="Official placement records and your signed acknowledgement." />
            <AdminCard flush>
              <ListRow
                icon={<FileText />}
                title="Placement assignment"
                meta="Facility, dates, mentor and placement expectations"
                trailing={
                  acknowledgementComplete || acknowledgement ? (
                    <StatusPill tone="success">Acknowledged</StatusPill>
                  ) : ["awaiting_student", "orientation"].includes(current.state) ? (
                    <StatusPill tone="warning">Acknowledgement needed</StatusPill>
                  ) : (
                    <StatusPill tone="neutral" dot={false}>No signed record</StatusPill>
                  )
                }
                onClick={() => {
                  setAssignmentViewed(true);
                  openAcknowledgement();
                }}
              />
            </AdminCard>
            {assignmentViewed && (
              <p className="sp-footnote"><ShieldCheck aria-hidden="true" /> This document stays available as part of your private learning record.</p>
            )}
          </div>
          </TabPanel>
        )}

        {activeTab === "support" && (
          <TabPanel id="support">
          <div id="feedback" className="sp-tab">
            <SectionHeading eyebrow="Support" title="Feedback & concerns" text="Tell us how the placement is going, or raise something privately." />
            <FeedbackAndSafeguardingPanel placementId={current.id} role="student" onError={onError} />
          </div>
          </TabPanel>
        )}

        </AnimatePresence>

        <p className="sp-footnote">
          <ShieldCheck aria-hidden="true" />
          Your placement information is part of your private learning record and is only shared with authorised programme staff.
        </p>
      </AdminPage>

      {/* ---------------------------------------------------------------- */}
      {/* Placement acknowledgement modal                                 */}
      {/* ---------------------------------------------------------------- */}

      {acknowledgementOpen && (
        <PlacementAcknowledgementModal
          placement={current}
          acknowledgement={acknowledgement}
          acknowledgementLoading={acknowledgementLoading}
          acknowledgementError={acknowledgementError}
          onRetryAcknowledgement={() => setAcknowledgementAttempt((attempt) => attempt + 1)}
          step={acknowledgementStep}
          setStep={setAcknowledgementStep}
          signatureName={signatureName}
          setSignatureName={setSignatureName}
          expectedName={user.name}
          hasReachedEnd={hasReachedEnd}
          hasReadAssignment={hasReadAssignment}
          setHasReadAssignment={setHasReadAssignment}
          documentRef={documentRef}
          onDocumentScroll={handleDocumentScroll}
          busy={busy}
          onClose={closeAcknowledgement}
          onAcknowledge={() =>
            void acknowledgePlacement()
          }
        />
      )}
    </>
  );
}

/* ====================================================================== */
/* Induction Progress                                                    */
/* ====================================================================== */

function InductionProgress({
  checklist,
}: {
  checklist: Awaited<
    ReturnType<typeof getInductionChecklist>
  >;
}) {
  if (!checklist) {
    return null;
  }

  const source = checklist as unknown as Record<
    string,
    unknown
  >;

  const items = Array.isArray(source.items)
    ? source.items
    : [];

  const completed = items.filter((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    return Boolean(
      (item as Record<string, unknown>).completed_at,
    );
  }).length;

  const total = items.length;

  if (!total) {
    return null;
  }

  const percentage = Math.round(
    (completed / total) * 100,
  );

  return (
    <div className="induction-progress">
      <div className="induction-progress__top">
        <span>Induction progress</span>
        <strong>{percentage}%</strong>
      </div>

      <div className="induction-progress__track">
        <div
          className="induction-progress__fill"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <span className="induction-progress__caption">
        {completed} of {total} required items completed
      </span>
    </div>
  );
}

/* ====================================================================== */
/* Acknowledgement Modal                                                 */
/* ====================================================================== */

function PlacementAcknowledgementModal({
  placement,
  acknowledgement,
  acknowledgementLoading,
  acknowledgementError,
  onRetryAcknowledgement,
  step,
  setStep,
  signatureName,
  setSignatureName,
  expectedName,
  hasReachedEnd,
  hasReadAssignment,
  setHasReadAssignment,
  documentRef,
  onDocumentScroll,
  busy,
  onClose,
  onAcknowledge,
}: {
  placement: Placement;
  acknowledgement: PlacementAcknowledgement | null;
  acknowledgementLoading: boolean;
  acknowledgementError: boolean;
  onRetryAcknowledgement: () => void;
  step: AcknowledgementStep;
  setStep: (value: AcknowledgementStep) => void;
  signatureName: string;
  setSignatureName: (value: string) => void;
  expectedName: string;
  hasReachedEnd: boolean;
  hasReadAssignment: boolean;
  setHasReadAssignment: (value: boolean) => void;
  documentRef: React.RefObject<HTMLDivElement | null>;
  onDocumentScroll: () => void;
  busy: boolean;
  onClose: () => void;
  onAcknowledge: () => void;
}) {
  useEffect(() => {
    return lockScroll();
  }, []);

  const canContinue =
    hasReachedEnd && hasReadAssignment;
  const readOnly = Boolean(acknowledgement) || !["awaiting_student", "orientation"].includes(placement.state);
  const normalizeName = (value: string) => value.trim().split(/\s+/).join(" ").toLocaleLowerCase();
  const canSign = hasReadAssignment && normalizeName(signatureName) === normalizeName(expectedName);

  return (
    <div
      className="placement-modal-backdrop"
      role="presentation"
    >
      <div
        className="placement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-modal-title"
      >
        <header className="placement-modal__header">
          <div>
            <div className="placement-modal__eyebrow">
              <span>
                {readOnly
                  ? acknowledgement ? "Signed record · View only" : "Assignment · View only"
                  : step === "document"
                  ? "Step 1 of 2"
                  : "Step 2 of 2"}
              </span>

              <span className="placement-modal__secure">
                <ShieldCheck size={13} />
                Private record
              </span>
            </div>

            <h2 id="placement-modal-title">
              {readOnly
                ? "Placement assignment"
                : step === "document"
                ? "Placement assignment"
                : placement.state === "orientation"
                  ? "Sign placement assignment"
                  : "Confirm placement"}
            </h2>

            <p>
              {readOnly
                ? acknowledgement
                  ? "This acknowledgement is saved and can no longer be changed."
                  : acknowledgementLoading
                    ? "Loading the saved acknowledgement record…"
                    : acknowledgementError
                      ? "We couldn’t load the signed acknowledgement record. Try again to view it."
                      : "This placement has moved on, and no signed acknowledgement record is available."
                : step === "document"
                ? "Review your placement details before acknowledging the assignment."
                : placement.state === "orientation"
                  ? "This records your acknowledgement now and does not change your placement stage."
                  : "Review the acknowledgement and record your placement."}
            </p>
          </div>

          <button
            type="button"
            className="placement-modal__close"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <X size={19} />
          </button>
        </header>

        {step === "document" ? (
          <>
            <div
              ref={documentRef}
              className="placement-document-viewer"
              onScroll={onDocumentScroll}
            >
              <AssignmentDocument
                placement={placement}
                acknowledgement={acknowledgement}
              />
            </div>

            {readOnly ? (
              <footer className="placement-modal__footer">
                {acknowledgementError && <button type="button" className="placement-modal-secondary" onClick={onRetryAcknowledgement}>Try again</button>}
                <button type="button" className="placement-modal-primary" onClick={onClose}>Close</button>
              </footer>
            ) : <footer className="placement-modal__footer placement-modal__footer--document">
              <label className="placement-read-checkbox">
                <input
                  type="checkbox"
                  checked={hasReadAssignment}
                  onChange={(event) =>
                    setHasReadAssignment(
                      event.target.checked,
                    )
                  }
                  disabled={!hasReachedEnd}
                />

                <span className="placement-custom-checkbox">
                  {hasReadAssignment && (
                    <Check size={12} />
                  )}
                </span>

                <span>
                  I have read and reviewed the placement
                  assignment.
                </span>
              </label>

              {!hasReachedEnd && (
                <span className="placement-read-hint">
                  Scroll to the end of the assignment to
                  continue.
                </span>
              )}

              <button
                type="button"
                className="placement-modal-primary"
                disabled={!canContinue}
                onClick={() =>
                  setStep("confirm")
                }
              >
                Continue to sign
                <ArrowRight size={16} />
              </button>
            </footer>}
          </>
        ) : readOnly ? (
          <footer className="placement-modal__footer">
            <button type="button" className="placement-modal-primary" onClick={onClose}>Close</button>
          </footer>
        ) : (
          <>
            <div className="placement-confirmation-body">
              <div className="placement-confirmation-intro">
                <div className="placement-confirmation-icon">
                  <FileText size={22} />
                </div>

                <div>
                  <p className="student-kicker">
                    Placement assignment
                  </p>

                  <h3>
                    {placement.facility_name ??
                      "My placement"}
                  </h3>

                  <p>
                    {formatDate(
                      placement.planned_start,
                    )}{" "}
                    –{" "}
                    {formatDate(
                      placement.planned_end,
                    )}
                  </p>
                </div>
              </div>

              <div className="placement-confirmation-summary">
                <div>
                  <span>Facility</span>
                  <strong>
                    {placement.facility_name ??
                      "Not assigned"}
                  </strong>
                </div>

                <div>
                  <span>Ward</span>
                  <strong>
                    {placement.ward?.name ??
                      "Details pending"}
                  </strong>
                </div>

                <div>
                  <span>Mentor</span>
                  <strong>
                    {placement.mentor?.name ??
                      "Assignment pending"}
                  </strong>
                </div>

                <div>
                  <span>Dates</span>
                  <strong>
                    {formatDate(
                      placement.planned_start,
                    )}{" "}
                    –{" "}
                    {formatDate(
                      placement.planned_end,
                    )}
                  </strong>
                </div>
              </div>

              <div className="placement-confirmation-notice">
                <ShieldCheck size={17} />

                <p>
                  By acknowledging this assignment, you
                  confirm that you have reviewed the
                  placement details provided to you.
                </p>
              </div>

              <label className="placement-final-checkbox">
                <input
                  type="checkbox"
                  checked={hasReadAssignment}
                  onChange={(event) =>
                    setHasReadAssignment(
                      event.target.checked,
                    )
                  }
                />

                <span className="placement-custom-checkbox">
                  {hasReadAssignment && (
                    <Check size={12} />
                  )}
                </span>

                <span>
                  I acknowledge that I have reviewed the
                  placement assignment and recognise the
                  placement details provided to me.
                </span>
              </label>
              <label className="placement-signature-field">
                <span>Type your full name to sign</span>
                <input
                  value={signatureName}
                  onChange={(event) => setSignatureName(event.target.value)}
                  autoComplete="name"
                  maxLength={240}
                  placeholder={expectedName}
                  required
                />
                <small>Use the name shown on your account. The signing date is added automatically.</small>
              </label>
            </div>

            <footer className="placement-modal__footer">
              <button
                type="button"
                className="placement-modal-secondary"
                disabled={busy}
                onClick={() =>
                  setStep("document")
                }
              >
                <ArrowLeft size={15} />
                Back
              </button>

              <button
                type="button"
                className="placement-modal-primary"
                disabled={
                  busy || !canSign
                }
                onClick={onAcknowledge}
              >
                {busy
                  ? "Saving…"
                  : "Sign and acknowledge"}

                {!busy && <Check size={16} />}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Assignment Document                                                   */
/* ====================================================================== */

function AssignmentDocument({
  placement,
  acknowledgement,
}: {
  placement: Placement;
  acknowledgement: PlacementAcknowledgement | null;
}) {
  return (
    <article className="assignment-document">
      <header className="assignment-document__masthead">
        <div className="assignment-document__brand">
          <div className="assignment-document__brand-mark">
            M
          </div>

          <div>
            <strong>MentorMAMA</strong>
            <span>Mentorship & placement record</span>
          </div>
        </div>

        <div className="assignment-document__classification">
          STUDENT RECORD
        </div>
      </header>

      <div className="assignment-document__title">
        <span>PLACEMENT ASSIGNMENT</span>

        <h1>
          {placement.facility_name ??
            "Student Placement"}
        </h1>

        <p>
          Official placement assignment and student
          acknowledgement record
        </p>
      </div>

      <DocumentSection
        number="01"
        title="Placement information"
      >
        <DocumentGrid>
          <DocumentField
            label="Facility"
            value={
              placement.facility_name ??
              "Not assigned"
            }
          />

          <DocumentField
            label="Ward"
            value={
              placement.ward?.name ??
              "Details pending"
            }
          />

          <DocumentField
            label="Placement start"
            value={formatDate(
              placement.planned_start,
            )}
          />

          <DocumentField
            label="Placement end"
            value={formatDate(
              placement.planned_end,
            )}
          />
        </DocumentGrid>
      </DocumentSection>

      <DocumentSection
        number="02"
        title="Programme & cohort"
      >
        <DocumentGrid>
          <DocumentField
            label="Cohort"
            value={
              placement.cohort_name ??
              "Programme placement"
            }
          />

          <DocumentField
            label="Placement status"
            value={formatState(placement.state)}
          />
        </DocumentGrid>
      </DocumentSection>

      <DocumentSection
        number="03"
        title="Mentor"
      >
        <DocumentGrid>
          <DocumentField
            label="Assigned mentor"
            value={
              placement.mentor?.name ??
              "Assignment pending"
            }
          />
        </DocumentGrid>
      </DocumentSection>

      <DocumentSection
        number="04"
        title="Placement expectations"
      >
        <DocumentParagraph>
          During the placement period, the student is
          expected to participate responsibly in the
          assigned learning environment and engage with
          the activities and guidance provided by the
          placement and mentorship team.
        </DocumentParagraph>

        <DocumentList
          items={[
            "Attend and participate in scheduled placement activities.",
            "Maintain professional conduct within the placement environment.",
            "Engage with the assigned mentor and respond to relevant guidance.",
            "Complete required learning and placement activities within the assigned period.",
          ]}
        />
      </DocumentSection>

      <DocumentSection
        number="05"
        title="Attendance & participation"
      >
        <DocumentParagraph>
          Students are expected to maintain appropriate
          attendance and communicate promptly with the
          relevant programme or placement team when an
          absence or change affects their participation.
        </DocumentParagraph>
      </DocumentSection>

      <DocumentSection
        number="06"
        title="Learning responsibilities"
      >
        <DocumentParagraph>
          The placement is intended to support structured
          learning and mentorship. Students should use the
          placement period to engage constructively with
          their mentor, reflect on their progress and
          complete the activities assigned to them.
        </DocumentParagraph>
      </DocumentSection>

      <DocumentSection
        number="07"
        title="Safeguarding"
      >
        <DocumentParagraph>
          Students should raise safeguarding concerns,
          inappropriate conduct or issues affecting their
          wellbeing through the appropriate MentorMAMA
          support channels. Concerns can be raised during
          the placement without waiting for the placement
          to end.
        </DocumentParagraph>
      </DocumentSection>

      <DocumentSection
        number="08"
        title="Placement changes"
      >
        <DocumentParagraph>
          Changes to the placement, including changes to
          dates, assignment details or placement status,
          should be communicated through the appropriate
          programme channels and recorded against the
          placement record where applicable.
        </DocumentParagraph>
      </DocumentSection>

      <section className="assignment-document__acknowledgement">
        <div className="assignment-document__acknowledgement-heading">
          <span>09</span>

          <div>
            <p>ACKNOWLEDGEMENT</p>
            <h2>Student acknowledgement</h2>
          </div>
        </div>

        <p>
          I acknowledge that I have reviewed the placement
          assignment and recognise the placement details
          provided to me.
        </p>

        <div className="assignment-document__signature-line">
          <div>
            <span>Student</span>
            <div>{acknowledgement?.signed_name ?? (acknowledgement ? "" : "Acknowledgement record unavailable")}</div>
          </div>

          <div>
            <span>Date</span>
            <div>{acknowledgement ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(acknowledgement.signed_at)) : "No saved signing date"}</div>
          </div>
        </div>
      </section>

      <footer className="assignment-document__footer">
        <span>MentorMAMA</span>
        <span>Private learning record</span>
      </footer>
    </article>
  );
}

/* ====================================================================== */
/* Document Components                                                   */
/* ====================================================================== */

function DocumentSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="assignment-document__section">
      <div className="assignment-document__section-heading">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>

      <div className="assignment-document__section-content">
        {children}
      </div>
    </section>
  );
}

function DocumentGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="assignment-document__grid">
      {children}
    </div>
  );
}

function DocumentField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="assignment-document__field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DocumentParagraph({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="assignment-document__paragraph">
      {children}
    </p>
  );
}

function DocumentList({
  items,
}: {
  items: string[];
}) {
  return (
    <ul className="assignment-document__list">
      {items.map((item) => (
        <li key={item}>
          <span />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ====================================================================== */
/* Overview tab                                                          */
/* ====================================================================== */

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <header className="sp-section">
      <p className="pa-eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </header>
  );
}

const NEXT_STEPS: Record<string, string[]> = {
  awaiting_student: ["Read your assignment document", "Sign to acknowledge the placement", "Complete orientation before day one"],
  orientation: ["Work through the orientation items", "Acknowledge orientation", "Your mentor then opens induction"],
  induction: ["Meet your mentor on the ward", "Your mentor signs the induction checklist", "The placement becomes active"],
  active: ["Attend mentorship sessions", "Share feedback about how it is going", "Complete the final assessment near the end"],
  paused: ["Wait for an update from your programme team", "You can still share feedback or raise a concern"],
  completed: ["Review your sessions and documents", "Your record stays available to you"],
};

function PlacementOverview({
  placement,
  stageTitle,
  stageText,
  onSessions,
  onConcerns,
  onSupport,
}: {
  placement: Placement;
  stageTitle: string;
  stageText: string;
  onSessions: () => void;
  onConcerns: () => void;
  onSupport: () => void;
}) {
  const progress = useQuery({ queryKey: ["placement-progress", placement.id], queryFn: () => getPlacementProgress(placement.id), staleTime: 30_000 });
  const data = progress.data;
  const shortDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`)) : undefined;
  const steps = NEXT_STEPS[placement.state] ?? [];

  return (
    <div className="sp-tab">
      {progress.isError ? (
        <PortalErrorState onRetry={() => void progress.refetch()} />
      ) : (
        <StatGrid>
          <StatCard icon={<TrendingUp />} tone="teal" value={data?.overall_percentage == null ? "—" : `${data.overall_percentage}%`} label="Overall progress" hint="From completed milestones" loading={progress.isPending} />
          <StatCard
            icon={<ClipboardCheck />}
            tone="violet"
            value={data?.induction.percentage == null ? "—" : `${data.induction.percentage}%`}
            label="Induction"
            hint={data?.induction.available ? `${data.induction.completed} of ${data.induction.total} ${data.induction.total === 1 ? "item" : "items"}` : "Checklist not open yet"}
            loading={progress.isPending}
          />
          <StatCard
            icon={<Activity />}
            tone="blue"
            value={data?.mentorship.sessions_logged ?? 0}
            label="Mentorship sessions"
            hint={data?.mentorship.last_session_date ? `Last on ${shortDate(data.mentorship.last_session_date)}` : "None logged yet"}
            onClick={onSessions}
            loading={progress.isPending}
          />
          <StatCard
            icon={data?.safeguarding.open_concerns ? <ShieldAlert /> : <HeartHandshake />}
            tone={data?.safeguarding.open_concerns ? "amber" : "green"}
            value={data?.safeguarding.open_concerns ?? 0}
            label="Open concerns"
            hint={data?.safeguarding.open_concerns ? "Being followed up" : "Nothing outstanding"}
            onClick={onConcerns}
            loading={progress.isPending}
          />
        </StatGrid>
      )}

      <div className="sp-overview">
        <div className="sp-overview__col">
        <AdminCard title={stageTitle} description={stageText}>
          {steps.length > 0 ? (
            <ol className="sp-checklist">
              {steps.map((step, index) => (
                <li key={step}>
                  <span aria-hidden="true">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          ) : (
            <p className="sp-muted">There is nothing for you to do at this stage.</p>
          )}
        </AdminCard>
        <RecentSessions placementId={placement.id} onAll={onSessions} />
        </div>
        <AdminCard title="Your placement team" description="The people and places behind this placement." flush>
          <ListRow icon={<UserRound />} tone="teal" title={placement.mentor?.name ?? "Mentor not assigned yet"} meta="Clinical mentor" />
          <ListRow icon={<Building2 />} tone="blue" title={placement.ward?.name ?? "Ward to be confirmed"} meta={placement.facility_name ?? "Facility"} />
          <ListRow icon={<GraduationCap />} tone="violet" title={placement.cohort_name ?? "Programme placement"} meta="Cohort" />
          <ListRow icon={<LifeBuoy />} tone="amber" title="Need help or something feels wrong?" meta="Feedback and private concerns" onClick={onSupport} />
        </AdminCard>
      </div>
    </div>
  );
}

function RecentSessions({ placementId, onAll }: { placementId: string; onAll: () => void }) {
  const sessions = useQuery({ queryKey: ["mentorship-sessions", placementId], queryFn: () => getMentorshipSessions(placementId), staleTime: 30_000 });
  const rows = [...(sessions.data ?? [])].sort((a, b) => b.session_date.localeCompare(a.session_date)).slice(0, 3);
  const label = (value: string) => value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
  return (
    <AdminCard
      title="Recent mentorship sessions"
      description="The latest sessions your mentor recorded with you."
      action={rows.length > 0 ? <AdminButton size="sm" variant="ghost" onClick={onAll}>View all <ArrowRight aria-hidden="true" /></AdminButton> : undefined}
      flush
    >
      {sessions.isPending ? (
        <p className="sp-muted sp-pad">Loading sessions…</p>
      ) : sessions.isError ? (
        <p className="sp-muted sp-pad">We couldn’t load your sessions right now.</p>
      ) : rows.length === 0 ? (
        <p className="sp-muted sp-pad">No sessions recorded yet. They appear here once your mentor logs one.</p>
      ) : (
        <ul className="sp-sessions">
          {rows.map((row) => {
            const date = new Date(`${row.session_date}T00:00:00`);
            return (
              <li key={row.id}>
                <button type="button" onClick={onAll}>
                  <span className="sp-sessions__date">
                    <strong>{date.getDate()}</strong>
                    <small>{date.toLocaleDateString("en-GB", { month: "short" })}</small>
                  </span>
                  <span className="sp-sessions__main">
                    <strong>{label(row.session_type)}</strong>
                    <small>{row.topics.length ? row.topics.map(label).join(" · ") : "No topics recorded"}{row.duration_minutes ? ` · ${row.duration_minutes} min` : ""}</small>
                  </span>
                  <ArrowRight aria-hidden="true" className="sp-sessions__arrow" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </AdminCard>
  );
}

/** Fades and lifts tab content in; respects reduced motion. */
function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={id}
      role="tabpanel"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
