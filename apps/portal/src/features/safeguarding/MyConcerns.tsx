/**
 * Shared pieces for a person's own concerns: status wording, who can see it, the progress stepper and the
 * "ask for another review" form. Used by the Concerns table, the concern detail screen and the placement aside.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Field, TextArea } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { ApiError, requestEscalationRereview, type ConcernAudience, type EscalationSummary } from "../../services/api";
import { AdminButton, type PillTone } from "../programme-admin/ui/AdminKit";
import "./concerns.css";

export const CONCERN_STEPS = ["Received", "In review", "Outcome", "Closed"] as const;
const STEP_OF: Record<string, number> = { open: 0, under_review: 1, action_required: 1, resolved: 2, closed: 3 };
export const AUDIENCE_LABEL: Record<ConcernAudience, string> = {
  nurse_manager: "Nurse manager only",
  coordinator: "University coordinator only",
  both: "Nurse manager and coordinator",
};
export const OPEN_STATES = new Set(["open", "under_review", "action_required"]);
export const concernLabel = (value: string) => value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
export const concernDay = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const severityTone = (value: string): PillTone => (value === "high" ? "danger" : value === "medium" ? "warning" : "success");
export const concernStep = (state: string) => STEP_OF[state] ?? 0;
export const canAskAgain = (item: EscalationSummary) => item.state === "resolved" || item.state === "closed";

export function stateLabel(item: EscalationSummary): { text: string; tone: PillTone } {
  if (item.state === "open") return item.rereview_count ? { text: "Re-review requested", tone: "warning" } : { text: "Waiting for a reviewer", tone: "warning" };
  if (item.state === "under_review" || item.state === "action_required") return { text: "In review", tone: "info" };
  if (item.state === "resolved") return { text: "Outcome recorded", tone: "teal" };
  return { text: "Closed", tone: "neutral" };
}

/** One sentence on where the concern is and what happens next. */
export function statusLine(item: EscalationSummary): string {
  const reviewer = item.reviewer ?? "A reviewer";
  switch (item.state) {
    case "open":
      return item.rereview_count
        ? `You asked for another review on ${concernDay(item.rereview_requested_at ?? item.updated_at)}. It is back with the reviewers you chose.`
        : "Received. It is waiting for one of the reviewers you chose to take it.";
    case "under_review":
      return `${reviewer} is looking into your concern.`;
    case "action_required":
      return `${reviewer} has reviewed it and is arranging the next step.`;
    case "resolved":
      return `${reviewer} recorded an outcome. If it does not feel resolved, you can ask for another review.`;
    default:
      return "This concern is closed. You can still ask for another review if something is still not right.";
  }
}

export function ConcernSteps({ state, compact }: { state: string; compact?: boolean }) {
  const step = concernStep(state);
  return (
    <ol className={`mc-steps ${compact ? "mc-steps--compact" : ""}`} aria-label={`Progress: ${CONCERN_STEPS[step]}`}>
      {CONCERN_STEPS.map((name, index) => {
        const done = index < step || (index === step && step === 3);
        return (
          <li key={name} className={done ? "is-done" : index === step ? "is-current" : ""} aria-current={index === step ? "step" : undefined}>
            <span className="mc-steps__dot">{done ? <Check aria-hidden="true" /> : compact ? "" : index + 1}</span>
            {!compact && <span>{name}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function RereviewForm({ id, onDone, onCancel, onError }: { id: string; onDone: () => void; onCancel: () => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [reason, setReason] = useState("");
  const rereview = useMutation({
    mutationFn: () => requestEscalationRereview(id, reason.trim()),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Another review requested", message: "It has gone back to the reviewers you chose." });
      void queryClient.invalidateQueries({ queryKey: ["escalations"] });
      void queryClient.invalidateQueries({ queryKey: ["escalation", id] });
      onDone();
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not request another review."),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length >= 10) rereview.mutate();
  }
  return (
    <form className="mc-rereview" onSubmit={submit}>
      <p className="rc-form__intro">
        It goes back to the same reviewers you chose. The earlier outcome stays on the record.
      </p>
      <Field label="What is still not right?" required hint="At least 10 characters. Tell the reviewer what was missed or what has changed. Do not name a patient.">
        <TextArea rows={5} value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} required />
      </Field>
      <div className="mc-actions">
        <AdminButton variant="ghost" onClick={onCancel} disabled={rereview.isPending}>Cancel</AdminButton>
        <AdminButton type="submit" disabled={rereview.isPending || reason.trim().length < 10}>{rereview.isPending ? "Sending…" : "Send for another review"}</AdminButton>
      </div>
    </form>
  );
}
