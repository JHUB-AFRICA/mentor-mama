import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminButton } from "../programme-admin/ui/AdminKit";
import "./baseline-confidence.css";
import { useToast } from "../../components/ToastProvider";
import { ApiError, getBaselineAssessmentStatus, submitBaselineAssessment } from "../../services/api";

const STATES = new Set(["orientation", "induction", "active", "paused"]);

/** Starting confidence, asked once near the start so growth can be shown at close-out. */
export function BaselineConfidenceCard({
  placementId,
  state,
  onError,
}: {
  placementId: string;
  state: string;
  onError: (message: string) => void;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [score, setScore] = useState(50);
  const [touched, setTouched] = useState(false);
  const [commandId] = useState(() => crypto.randomUUID());
  const status = useQuery({
    queryKey: ["baseline-assessment", placementId],
    queryFn: () => getBaselineAssessmentStatus(placementId),
    enabled: STATES.has(state),
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => submitBaselineAssessment(placementId, score, commandId),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Starting confidence saved", message: "We will show you how it changes by the end of your placement." });
      void queryClient.invalidateQueries({ queryKey: ["baseline-assessment", placementId] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not save your starting confidence."),
  });

  if (!status.data?.can_submit) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (touched && !save.isPending) save.mutate();
  }

  return (
    <section className="bc" aria-labelledby={`bc-title-${placementId}`}>
      <div className="bc__copy">
        <p className="pa-eyebrow">Quick check-in · 30 seconds</p>
        <h3 id={`bc-title-${placementId}`}>How confident do you feel about this placement?</h3>
        <p>From 0 (not at all) to 100 (very confident). We ask again at the end so you can see your growth. There is no right answer.</p>
      </div>
      <form className="bc__form" onSubmit={submit}>
        <label className="bc__label">
          <span>Starting confidence <strong>{touched ? score : "—"}</strong></span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={score}
            style={{ ["--bc-fill" as string]: `${score}%` }}
            aria-valuetext={touched ? `${score} out of 100` : "Not set"}
            onChange={(event) => {
              setScore(Number(event.target.value));
              setTouched(true);
            }}
          />
          <span className="bc__scale" aria-hidden="true"><span>Not confident</span><span>Very confident</span></span>
        </label>
        <AdminButton type="submit" disabled={!touched || save.isPending}>{save.isPending ? "Saving…" : "Save"}</AdminButton>
      </form>
    </section>
  );
}
