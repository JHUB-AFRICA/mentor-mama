import { Check, Pause, XCircle } from "lucide-react";
import { placementJourney, type JourneyAudience } from "./placementJourney";
import "./placement-admin-detail.css";

/** The one placement progress stepper, driven by the shared journey model. */
export function JourneyStepper({ state, audience = "staff" }: { state: string; audience?: JourneyAudience }) {
  const journey = placementJourney(state, audience);
  return (
    <nav aria-label="Placement lifecycle" className="pmd-stepper-wrap">
      <ol className="pmd-stepper">
        {journey.stages.map((step, index) => {
          const done = step.status === "done";
          const current = step.status === "current" || step.status === "attention" || step.status === "stopped";
          const tone = step.status === "stopped" ? "danger" : step.status === "attention" ? "warn" : "ok";
          return (
            <li key={step.key} className={`pmd-step is-${done ? "done" : current ? "current" : "todo"} is-${tone}`} aria-current={current ? "step" : undefined}>
              <span className="pmd-step__dot" aria-hidden="true">
                {done ? <Check /> : step.status === "attention" ? <Pause /> : step.status === "stopped" ? <XCircle /> : index + 1}
              </span>
              <span className="pmd-step__label">
                {step.label}
                <span className="sr-only">{done ? " (complete)" : current ? " (current)" : " (upcoming)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
