import { placementJourney, placementStateLabel } from "../placements/placementJourney";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  MapPin,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import { Button, Card } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import { InlineFeedback } from "../../components/InlineFeedback";

import {
  confirmPlacement,
  getPlacementAcknowledgement,
  getFinalAssessmentStatus,
  getInductionChecklist,
  getPlacement,
  getTransitions,
  type PlacementAcknowledgement,
  type Placement,
  type TransitionResponse,
} from "../../services/api";

import type { WorkspaceProps } from "../workspaces/WorkspaceTypes";

import { PlacementProgressSummary } from "../placements/PlacementProgressSummary";
import { OrientationPanel } from "../induction/OrientationPanel";
import { InductionSummary } from "../induction/InductionSummary";
import { FinalAssessmentForm } from "../assessments/FinalAssessmentForm";
import { BaselineConfidenceCard } from "../assessments/BaselineConfidenceCard";
import { FeedbackAndSafeguardingPanel } from "../safeguarding/FeedbackAndSafeguardingPanel";
import { PlacementHistory } from "../placements/PlacementHistory";

import "./StudentPlacementDetail.css";
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

function stateTone(value: string) {
  switch (value) {
    case "active":
      return "active";
    case "induction":
      return "induction";
    case "orientation":
      return "orientation";
    case "awaiting_student":
      return "attention";
    case "paused":
      return "paused";
    default:
      return "neutral";
  }
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

  const tone = stateTone(current.state);

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

  return (
    <>
      <div className="student-page-container student-detail">
        <button
          type="button"
          className="student-back-link"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          <span>Back to placements</span>
        </button>

        {/* -------------------------------------------------------------- */}
        {/* Placement identity                                             */}
        {/* -------------------------------------------------------------- */}

        <section className="placement-identity">
          <div className="placement-identity__main">
            <div className="placement-identity__icon">
              <MapPin size={22} />
            </div>

            <div className="placement-identity__copy">
              <div className="placement-identity__eyebrow">
                <span>Placement</span>

                <span
                  className={`student-detail-status student-detail-status--${tone}`}
                >
                  <span />
                  {formatState(current.state)}
                </span>
              </div>

              <h1>
                {current.facility_name ?? "My placement"}
              </h1>

              <div className="placement-identity__meta">
                <span>
                  <CalendarDays size={15} />
                  {formatDate(current.planned_start)} –{" "}
                  {formatDate(current.planned_end)}
                </span>

                <span className="placement-meta-divider" />

                <span>
                  <UserRound size={15} />
                  {current.mentor?.name ??
                    "Assignment pending"}
                </span>
              </div>
            </div>
          </div>

          <div className="placement-privacy">
            <ShieldCheck size={15} />
            <span>Private learning record</span>
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* Journey                                                        */}
        {/* -------------------------------------------------------------- */}

        <PlacementJourney state={current.state} />

        {/* -------------------------------------------------------------- */}
        {/* Current step                                                   */}
        {/* -------------------------------------------------------------- */}

        <section
          className={`placement-current-step placement-current-step--${currentStep.tone}`}
        >
          <div className="placement-current-step__content">
            <p className="student-kicker">
              {currentStep.eyebrow}
            </p>

            <h2>{currentStep.title}</h2>

            <p>{currentStep.description}</p>

            {current.state === "induction" && checklist && (
              <InductionProgress checklist={checklist} />
            )}
          </div>

          <div className="placement-current-step__action">
            {current.state === "awaiting_student" && transitionsError && (
              <div role="alert" className="space-y-2 text-sm text-error">
                <p>We couldn’t check whether your confirmation is ready.</p>
                <Button size="sm" variant="tertiary" onClick={() => setTransitionsAttempt((attempt) => attempt + 1)}>Try again</Button>
              </div>
            )}

            {current.state === "awaiting_student" && !transitionsLoaded && (
              <p role="status" className="text-sm text-navy-muted">Checking your placement options…</p>
            )}

            {current.state === "awaiting_student" && transitionsLoaded && !transitionsError && !requiresConfirmation && (
              <p role="status" className="text-sm text-navy-muted">Your programme team is still preparing this placement. You’ll be able to confirm when it’s ready.</p>
            )}

            {current.state === "awaiting_student" &&
              transitionsLoaded && requiresConfirmation && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={openAcknowledgement}
                  className="placement-primary-button"
                >
                  Review assignment
                  <ArrowRight size={16} />
                </Button>
              )}

            {current.state === "orientation" && (
              <button
                type="button"
                className="placement-outline-button"
                onClick={() => setActiveTab("journey")}
              >
                Continue orientation
                <ArrowRight size={16} />
              </button>
            )}

            {current.state === "active" && (
              <button
                type="button"
                className="placement-outline-button"
                onClick={() => setActiveTab("journey")}
              >
                View progress
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>

        <BaselineConfidenceCard placementId={current.id} state={current.state} onError={onError} />

        {/* -------------------------------------------------------------- */}
        {/* Tabs                                                           */}
        {/* -------------------------------------------------------------- */}

        <nav className="placement-tabs" aria-label="Placement sections">
          <TabButton
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </TabButton>

          <TabButton
            active={activeTab === "journey"}
            onClick={() => setActiveTab("journey")}
          >
            Journey
          </TabButton>

          <TabButton
            active={activeTab === "activity"}
            onClick={() => setActiveTab("activity")}
          >
            Activity
          </TabButton>

          <TabButton
            active={activeTab === "documents"}
            onClick={() => setActiveTab("documents")}
          >
            Documents
          </TabButton>

          <TabButton
            active={activeTab === "support"}
            onClick={() => setActiveTab("support")}
          >
            Support
          </TabButton>
        </nav>

        {/* -------------------------------------------------------------- */}
        {/* Overview                                                       */}
        {/* -------------------------------------------------------------- */}

        {activeTab === "overview" && (
          <div className="placement-tab-content">
            <div className="placement-section-heading">
              <div>
                <p className="student-kicker">Placement overview</p>
                <h2>Your placement at a glance</h2>
                <p>
                  Keep track of your placement details and
                  what happens next.
                </p>
              </div>
            </div>

            <div className="placement-overview-grid">
              <Card className="placement-snapshot">
                <div className="placement-card-heading">
                  <div>
                    <p className="student-kicker">
                      Placement snapshot
                    </p>
                    <h3>Assignment details</h3>
                  </div>

                  <FileText size={18} />
                </div>

                <div className="placement-detail-list">
                  <DetailItem
                    label="Facility"
                    value={
                      current.facility_name ??
                      "Not assigned"
                    }
                  />

                  <DetailItem
                    label="Cohort"
                    value={
                      current.cohort_name ??
                      "Programme placement"
                    }
                  />

                  <DetailItem
                    label="Ward"
                    value={
                      current.ward?.name ??
                      "Ward details pending"
                    }
                  />

                  <DetailItem
                    label="Placement dates"
                    value={`${formatDate(
                      current.planned_start,
                    )} – ${formatDate(
                      current.planned_end,
                    )}`}
                  />

                  <DetailItem
                    label="Mentor"
                    value={
                      current.mentor?.name ??
                      "Assignment pending"
                    }
                  />
                </div>
              </Card>

              <Card className="placement-status-card">
                <div className="placement-card-heading">
                  <div>
                    <p className="student-kicker">
                      Current stage
                    </p>
                    <h3>{stageLabel}</h3>
                  </div>

                  {current.state === "active" || current.state === "completed" ? (
                    <CheckCircle2 size={19} />
                  ) : (
                    <Clock3 size={19} />
                  )}
                </div>

                <p className="placement-status-card__description">
                  {stageDescription(current.state)}
                </p>

                <div className="placement-status-card__line">
                  <span>Placement status</span>
                  <strong>
                    {formatState(current.state)}
                  </strong>
                </div>
              </Card>
            </div>

            <section className="placement-overview-progress">
              <div className="placement-section-heading placement-section-heading--compact">
                <div>
                  <p className="student-kicker">
                    Your journey
                  </p>
                  <h2>Placement progress</h2>
                </div>
              </div>

              <PlacementProgressSummary
                placementId={current.id}
              />
            </section>
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Journey                                                        */}
        {/* -------------------------------------------------------------- */}

        {activeTab === "journey" && (
          <div className="placement-tab-content">
            <div className="placement-section-heading">
              <div>
                <p className="student-kicker">
                  Placement journey
                </p>
                <h2>Your placement journey</h2>
                <p>
                  Follow each stage from assignment through
                  placement close-out.
                </p>
              </div>
            </div>

            {current.state === "orientation" && (
              <section className="placement-flow-section">
                <OrientationPanel
                  placement={current}
                  onComplete={() => {
                    void refresh().catch(() => onError("Your orientation is recorded, but we couldn’t refresh the placement. Reload this page to see the latest details."));
                  }}
                  onError={onError}
                />
              </section>
            )}

            {current.state === "induction" && (
              <Card className="placement-information-panel">
                <div className="placement-information-panel__icon">
                  <Clock3 size={19} />
                </div>

                <div>
                  <p className="student-kicker">
                    Induction in progress
                  </p>

                  <h3>
                    Your mentor is completing the induction
                    checklist.
                  </h3>

                  <p>
                    You’ll see the placement become active
                    once all required items are signed.
                  </p>
                </div>
              </Card>
            )}

            {showInductionSummary && checklist && (
              <section className="placement-flow-section">
                <div className="placement-section-heading placement-section-heading--compact">
                  <div>
                    <p className="student-kicker">
                      Completed
                    </p>
                    <h2>Induction record</h2>
                  </div>
                </div>

                <InductionSummary
                  placement={current}
                  checklist={checklist}
                />
              </section>
            )}

            {showAssessment && (
              <section className="placement-flow-section">
                <div className="placement-section-heading placement-section-heading--compact">
                  <div>
                    <p className="student-kicker">
                      Close-out
                    </p>
                    <h2>Final assessment</h2>
                    <p>
                      Complete your assessment when the
                      placement is ready to close.
                    </p>
                  </div>
                </div>

                {assessment?.can_submit && closeoutLifecycle && (
                  <FinalAssessmentForm
                    placementId={current.id}
                    onSubmitted={() =>
                      setAssessment((value) =>
                        value
                          ? {
                              ...value,
                              submitted: true,
                              can_submit: false,
                            }
                          : value,
                      )
                    }
                    onError={onError}
                  />
                )}

                {assessmentLoading && assessmentAttempt > 0 && (
                  <p className="font-body text-sm text-navy-muted" role="status">
                    Checking whether your final assessment is ready…
                  </p>
                )}

                {assessmentError && (
                  <InlineFeedback
                    kind="error"
                    title="We couldn’t check your close-out status"
                  >
                    Your final assessment availability is unconfirmed. Retry to
                    check whether it is ready; you can submit once the portal
                    confirms it is due.
                    <button
                      type="button"
                      className="mt-2 block font-semibold text-teal underline underline-offset-2"
                      onClick={() => setAssessmentAttempt((attempt) => attempt + 1)}
                    >
                      Try again
                    </button>
                  </InlineFeedback>
                )}

                {assessment?.submitted && (
                  <Card className="placement-success">
                    <div className="placement-success__icon">
                      <CheckCircle2 size={19} />
                    </div>

                    <div>
                      <h3>
                        Final assessment submitted
                      </h3>

                      <p>
                        Your close-out response is safely
                        recorded.
                      </p>
                    </div>
                  </Card>
                )}
              </section>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Activity                                                       */}
        {/* -------------------------------------------------------------- */}

        {activeTab === "activity" && (
          <div className="placement-tab-content">
            <div className="placement-section-heading">
              <div>
                <p className="student-kicker">
                  Record
                </p>

                <h2>Placement activity</h2>

                <p>
                  Review important changes and activity
                  recorded against this placement.
                </p>
              </div>
            </div>

            <PlacementHistory
              placementId={current.id}
            />
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Documents                                                      */}
        {/* -------------------------------------------------------------- */}

        {activeTab === "documents" && (
          <div className="placement-tab-content">
            <div className="placement-section-heading">
              <div>
                <p className="student-kicker">
                  Documents
                </p>

                <h2>Your placement documents</h2>

                <p>
                  Access important placement records and
                  acknowledgement information.
                </p>
              </div>
            </div>

            <Card className="placement-document-row">
              <div className="placement-document-row__icon">
                <FileText size={20} />
              </div>

              <div className="placement-document-row__content">
                <h3>Placement assignment</h3>

                <p>
                  Official placement details including your
                  facility, dates, mentor and placement
                  expectations.
                </p>

                {acknowledgementComplete || acknowledgement ? (
                  <span className="placement-document-status placement-document-status--complete">
                    <Check size={13} />
                    Acknowledged
                  </span>
                ) : ["awaiting_student", "orientation"].includes(current.state) ? (
                  <span className="placement-document-status">
                    Acknowledgement needed
                  </span>
                ) : (
                  <span className="placement-document-status">
                    No signed record available
                  </span>
                )}
              </div>

              <button
                type="button"
                className="placement-document-button"
                onClick={() => {
                  if (acknowledgementComplete || acknowledgement || !["awaiting_student", "orientation"].includes(current.state)) {
                    setAssignmentViewed(true);
                    openAcknowledgement();
                  } else {
                    openAcknowledgement();
                  }
                }}
              >
                View assignment
                <ArrowRight size={15} />
              </button>
            </Card>

            {assignmentViewed && (
              <div className="placement-document-note">
                <ShieldCheck size={15} />
                <span>
                  This document remains available as part
                  of your private learning record.
                </span>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Support                                                        */}
        {/* -------------------------------------------------------------- */}

        {activeTab === "support" && (
          <div id="feedback" className="placement-tab-content">
            <div className="placement-section-heading">
              <div>
                <p className="student-kicker">
                  Support
                </p>

                <h2>Feedback & safeguarding</h2>

                <p>
                  Share feedback or raise a concern about
                  your placement.
                </p>
              </div>
            </div>

            <FeedbackAndSafeguardingPanel
              placementId={current.id}
              role="student"
              onError={onError}
            />
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Privacy                                                        */}
        {/* -------------------------------------------------------------- */}

        <footer className="student-detail-footer">
          <ShieldCheck size={16} />

          <p>
            Your placement information is part of your
            private learning record and is only shared with
            authorised programme staff.
          </p>
        </footer>
      </div>

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
/* Placement Journey                                                     */
/* ====================================================================== */

function PlacementJourney({ state }: { state: string }) {
  const journey = placementJourney(state, "learner");

  return (
    <section className="placement-journey">
      <div className="placement-journey__header">
        <div>
          <p className="student-kicker">
            Placement journey
          </p>

          <h2>Where you are in the process</h2>
        </div>

        <span className="placement-journey__stage">
          {journey.progressLabel}
        </span>
      </div>

      <ol className="placement-timeline" aria-label="Placement progress">
        {journey.stages.map((stage, index) => {
          const completed = stage.status === "done";
          const current =
            stage.status === "current" ||
            stage.status === "attention";

          return (
            <li
              key={stage.key}
              aria-current={current ? "step" : undefined}
              className={`placement-timeline__item ${
                completed
                  ? "placement-timeline__item--complete"
                  : ""
              } ${
                current
                  ? "placement-timeline__item--current"
                  : ""
              }`}
            >
              <div className="placement-timeline__marker">
                {completed ? (
                  <Check size={13} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>

              <div className="placement-timeline__label">
                {stage.label}
                <span className="sr-only">
                  {completed
                    ? " (complete)"
                    : current
                      ? " (current)"
                      : " (upcoming)"}
                </span>
              </div>

              {index < journey.stages.length - 1 && (
                <div className="placement-timeline__connector" />
              )}
            </li>
          );
        })}
      </ol>

    </section>
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
/* Tabs                                                                  */
/* ====================================================================== */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`placement-tab ${
        active ? "placement-tab--active" : ""
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ====================================================================== */
/* Detail Item                                                           */
/* ====================================================================== */

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="placement-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
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
