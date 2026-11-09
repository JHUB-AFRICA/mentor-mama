import { useState, type FormEvent } from "react";
import { Button, Card } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import { submitFinalAssessment } from "../../services/api";

interface FinalAssessmentFormProps {
  placementId: string;
  onSubmitted: () => void;
  onError: (message: string) => void;
}

export function FinalAssessmentForm({
  placementId,
  onSubmitted,
  onError,
}: FinalAssessmentFormProps) {
  const { pushToast } = useToast();
  const [confidence, setConfidence] = useState("");
  const [experience, setExperience] = useState("");
  const [commandId, setCommandId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await submitFinalAssessment(placementId, {
        confidence_score: Number(confidence),
        overall_experience: Number(experience),
      }, commandId);
      pushToast({ kind: "success", title: "Final assessment submitted", message: "Your endline confidence and placement experience have been saved." });
      onSubmitted();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not submit your final assessment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" className="mb-7 border-teal/25 bg-teal-light/25">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
        Placement close-out
      </p>
      <h2 className="mt-1 font-display text-h2 text-navy">
        Complete your final assessment
      </h2>
      <p className="mt-2 max-w-reading font-body text-body-sm leading-6 text-navy-muted">
        Share your endline confidence and overall placement experience. This
        helps the programme close your placement safely.
      </p>
      <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={submit}>
        <label className="font-body text-sm font-semibold text-navy">
          Endline confidence (0–100)
          <input
            className="input mt-2"
            type="number"
            min="0"
            max="100"
            value={confidence}
            onChange={(event) => { setConfidence(event.target.value); setCommandId(crypto.randomUUID()); }}
            required
          />
        </label>
        <label className="font-body text-sm font-semibold text-navy">
          Overall experience (1–5)
          <select
            className="input mt-2"
            value={experience}
            onChange={(event) => { setExperience(event.target.value); setCommandId(crypto.randomUUID()); }}
            required
          >
            <option value="" disabled>Choose a rating</option>
            <option value="5">5 — Excellent</option>
            <option value="4">4 — Good</option>
            <option value="3">3 — Okay</option>
            <option value="2">2 — Difficult</option>
            <option value="1">1 — Very difficult</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Submitting…" : "Submit final assessment"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
