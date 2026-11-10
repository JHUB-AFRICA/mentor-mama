import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@mentormama/ui";
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
    <Card padding="lg" className="mt-5 border-teal/25 bg-teal-light/25">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">Quick check-in · 30 seconds</p>
      <h2 className="mt-1 font-display text-h3 text-navy">How confident do you feel about this placement?</h2>
      <p className="mt-2 max-w-reading font-body text-body-sm leading-6 text-navy-muted">
        Rate your confidence in your clinical learning right now, from 0 (not at all confident) to 100 (very confident). You will be asked again at the end so you can see your growth. There is no right answer.
      </p>
      <form className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={submit}>
        <label className="block flex-1 font-body text-sm font-semibold text-navy">
          Starting confidence: <span className="text-teal">{touched ? score : "—"}</span>
          <input
            className="mt-3 w-full accent-teal"
            type="range"
            min={0}
            max={100}
            step={5}
            value={score}
            aria-valuetext={touched ? `${score} out of 100` : "Not set"}
            onChange={(event) => {
              setScore(Number(event.target.value));
              setTouched(true);
            }}
          />
          <span className="mt-1 flex justify-between font-body text-xs font-normal text-navy-muted">
            <span>Not confident</span>
            <span>Very confident</span>
          </span>
        </label>
        <Button type="submit" size="sm" disabled={!touched || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Card>
  );
}
