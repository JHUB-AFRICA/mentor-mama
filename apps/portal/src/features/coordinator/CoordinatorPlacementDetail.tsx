import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, X } from "lucide-react";
import { Button, Card, Skeleton } from "@mentormama/ui";
import {
  ApiError,
  getPlacement,
  getTransitions,
  releasePlacement,
  updatePlacementLifecycle,
  type Placement,
  type TransitionResponse,
} from "../../services/api";
import { PlacementProgressSummary } from "../placements/PlacementProgressSummary";
import { useToast } from "../../components/ToastProvider";

export function CoordinatorPlacementDetail({
  id,
  onBack,
  onError,
}: {
  id: string;
  onBack: () => void;
  onError: (message: string) => void;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [transitions, setTransitions] = useState<TransitionResponse | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"pause" | "withdraw" | null>(null);
  const [reason, setReason] = useState("");
  const { pushToast } = useToast();
  useEffect(() => {
    let active = true;
    setFailed(false);
    void Promise.all([getPlacement(id), getTransitions(id)])
      .then(([item, available]) => {
        if (!active) return;
        setPlacement(item);
        setTransitions(available);
      })
      .catch((cause) =>
        {
          if (active) setFailed(true);
          onError(
            cause instanceof ApiError
              ? cause.message
              : "We could not load that placement.",
          );
        },
      );
    return () => {
      active = false;
    };
  }, [id, onError, retryKey]);
  async function run(action: "release" | "pause" | "resume" | "withdraw", selectedReason = "") {
    setBusy(true);
    try {
      const updated =
        action === "release"
          ? await releasePlacement(id)
          : await updatePlacementLifecycle(id, action, selectedReason);
      setPlacement(updated);
      setTransitions(await getTransitions(id));
      pushToast({
        kind: "success",
        title: action === "release" ? "Placement released" : `${action === "withdraw" ? "Placement withdrawn" : action === "pause" ? "Placement paused" : "Placement resumed"}`,
        message: action === "release" ? "The student can now review and confirm this placement." : "The placement record and affected participants have been updated.",
      });
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not update this placement.",
      );
    } finally {
      setBusy(false);
      setConfirming(null);
      setReason("");
    }
  }
  if (failed)
    return (
      <div className="rounded-2xl border border-error/20 bg-error/5 px-5 py-5 font-body text-sm text-error">
        We could not load that placement.
        <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="ml-2 font-bold underline">
          Try again
        </button>
      </div>
    );
  if (!placement)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );
  const can = (action: string) =>
    Boolean(transitions?.available.includes(action as never));
  const blocked =
    transitions?.blocked.flatMap((item) => item.reasons).slice(0, 3) ?? [];
  const lifecycle = [
    "draft",
    "scheduled",
    "awaiting_student",
    "orientation",
    "induction",
    "active",
    "paused",
    "completed",
  ];
  const currentStep = lifecycle.indexOf(placement.state);
  return (
    <section
      className="space-y-8"
      aria-labelledby="coordinator-placement-detail-heading"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-semibold text-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All placements
      </button>
      <header className="border-b border-border pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Placement handoff
            </p>
            <h2
              id="coordinator-placement-detail-heading"
              className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl"
            >
              {placement.student?.name ?? "Student placement"}
            </h2>
            <p className="mt-3 font-body text-sm text-navy-muted">
              {placement.cohort_name ?? "Cohort pending"} ·{" "}
              {placement.facility_name ?? "Facility pending"}
            </p>
          </div>
          <span className="w-fit rounded-full bg-mist px-3 py-1.5 font-body text-sm font-semibold capitalize text-navy-muted">
            {placement.state.replaceAll("_", " ")}
          </span>
        </div>
      </header>
      <section
        aria-label="Placement lifecycle"
        className="rounded-2xl border border-border bg-mist/35 px-3 py-5 sm:px-5"
      >
        <div className="grid grid-cols-7 items-start">
          {lifecycle.map((step, index) => {
            const done = currentStep > index || placement.state === "completed";
            const current = currentStep === index;
            return (
              <div
                key={step}
                className="relative flex min-w-0 flex-col items-center text-center"
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 right-[-50%] top-3 h-px ${index < lifecycle.length - 1 ? (done ? "bg-teal" : "bg-border") : "bg-transparent"}`}
                />
                <span
                  className={`relative z-10 flex size-6 items-center justify-center rounded-full border text-xs font-bold ${done || current ? "border-teal bg-teal text-white" : "border-border bg-white text-navy-muted"}`}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span
                  className={`relative z-10 mt-3 max-w-20 font-body text-[0.62rem] font-semibold capitalize leading-4 sm:text-[0.68rem] ${current ? "text-navy" : "text-navy-muted"}`}
                >
                  {step.replaceAll("_", " ")}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info
          label="Student"
          value={placement.student?.email ?? "Not available"}
        />
        <Info
          label="Planned window"
          value={`${placement.planned_start} → ${placement.planned_end}`}
        />
        <Info
          label="Operational context"
          value={placement.ward?.name ?? "Awaiting facility handoff"}
        />
        <Info
          label="Mentor"
          value={placement.mentor?.name ?? "Awaiting assignment"}
        />
      </div>
      <section aria-labelledby="handoff-heading">
        <div className="mb-4">
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
            Your coordination view
          </p>
          <h3
            id="handoff-heading"
            className="mt-1 font-display text-2xl font-bold text-navy"
          >
            Placement readiness
          </h3>
          <p className="mt-1 font-body text-sm text-navy-muted">
            Safe progress signals for the student handoff. Restricted narratives
            remain with authorised roles.
          </p>
        </div>
        <PlacementProgressSummary placementId={placement.id} audience="admin" />
      </section>
      <Card
        padding="lg"
        className="rounded-2xl border-teal/20 bg-teal-light/20"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white text-teal">
            <Clock3 size={19} aria-hidden="true" />
          </span>
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Next permitted action
            </p>
            <h3 className="mt-1 font-display text-xl font-bold text-navy">
              {can("awaiting_student")
                ? "Release the placement to the student"
                : blocked.length
                  ? "No action is available right now"
                  : "Monitor this placement"}
            </h3>
            <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
              {blocked.length
                ? "This placement is waiting for the next permitted step."
                : "Actions are governed by placement state and your Coordinator permissions."}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {can("awaiting_student") && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run("release")}
            >
              Release to student
            </Button>
          )}
          {can("pause") && (
            <Button
              size="sm"
              variant="tertiary"
              disabled={busy}
              onClick={() => setConfirming("pause")}
            >
              Pause placement
            </Button>
          )}
          {can("resume") && (
            <Button
              size="sm"
              variant="tertiary"
              disabled={busy}
              onClick={() => void run("resume")}
            >
              Resume placement
            </Button>
          )}
          {can("withdraw") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming("withdraw")}
              className="min-h-10 rounded-lg px-3 font-body text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-50"
            >
              Withdraw placement
            </button>
          )}
        </div>
      </Card>
      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/45 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirming(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="placement-action-heading" className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Placement action</p><h3 id="placement-action-heading" className="mt-2 font-display text-2xl font-bold text-navy">{confirming === "pause" ? "Pause this placement?" : "Withdraw this placement?"}</h3></div><button type="button" onClick={() => setConfirming(null)} className="rounded-full p-2 text-navy-muted hover:bg-mist" aria-label="Close action dialog"><X size={18} /></button></div>
            <p className="mt-3 font-body text-sm leading-6 text-navy-muted">{confirming === "pause" ? "The placement will pause and its interruption will be recorded for continuity reporting." : "This ends the placement handoff and preserves its history."}</p>
            <label className="mt-6 block font-body text-sm font-semibold text-navy">Reason<select value={reason} onChange={(event) => setReason(event.target.value)} className="auth-control mt-2 w-full"><option value="">Choose a reason</option>{(confirming === "pause" ? pauseReasons : withdrawalReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="tertiary" onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button><Button type="button" variant={confirming === "withdraw" ? "secondary" : "primary"} onClick={() => void run(confirming, reason)} disabled={busy || !reason}>{busy ? "Saving…" : confirming === "pause" ? "Confirm pause" : "Confirm withdrawal"}</Button></div>
          </section>
        </div>
      )}
      {!blocked.length && (
        <div className="flex items-center gap-3 border-t border-border pt-5 font-body text-sm text-navy-muted">
          <CheckCircle2 size={18} className="text-teal" aria-hidden="true" />
          No additional Coordinator blockers are recorded.
        </div>
      )}
    </section>
  );
}
const pauseReasons = [["student_illness", "Student illness"], ["personal_family", "Personal or family"], ["industrial_action", "Industrial action"], ["facility_closure", "Facility closure"], ["ward_capacity", "Ward capacity"], ["academic_examinations", "Academic or examinations"], ["mentor_unavailability", "Mentor unavailability"], ["safeguarding_investigation", "Safeguarding investigation"], ["public_health_emergency", "Public health emergency"], ["other", "Other"]] as const;
const withdrawalReasons = [["student_withdrew", "Student withdrew"], ["academic_decision", "Academic decision"], ["facility_capacity", "Facility capacity"], ["safeguarding", "Safeguarding"], ["administrative_error", "Administrative error"], ["other", "Other"]] as const;
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-teal/30 pl-4">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </p>
      <p className="mt-1 break-words font-body text-sm font-semibold text-navy">
        {value}
      </p>
    </div>
  );
}
