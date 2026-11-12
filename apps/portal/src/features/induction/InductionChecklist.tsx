import { Fragment, useState } from "react";
import { Button, Card } from "@mentormama/ui";
import type { InductionChecklist as Checklist } from "../../services/api";
import { agreedDateText, itemExtras } from "../../services/induction-templates";
import "./InductionChecklist.css";

export function InductionChecklist({
  checklist,
  busy,
  onAnswer,
  onSign,
}: {
  checklist: Checklist;
  busy: boolean;
  onAnswer: (
    itemId: string,
    response: "yes" | "no" | "not_applicable",
    comment?: string,
  ) => Promise<void>;
  onSign: () => void;
}) {
  const required = checklist.items.filter((item) => item.required);
  const completed = required.filter((item) => item.response).length;
  const ready = completed === required.length && required.length > 0;
  const [comments, setComments] = useState<Record<string, string>>(() => Object.fromEntries(checklist.items.map((item) => [item.id, item.comment ?? ""])));
  return (
    <Card padding="lg" className="mentor-induction-checklist mb-7">
      <div className="mentor-induction-checklist__header">
        <div>
          <p className="mentor-induction-checklist__eyebrow">
            Mentor induction · Checklist v{checklist.template_version}
          </p>
          <h3>Welcome the student to the ward</h3>
          <p>Go through each point together. Choose the answer that matches what happened and note any next action.</p>
        </div>
        <div className="mentor-induction-checklist__progress"><strong>{completed}/{required.length}</strong><span>required items answered</span></div>
      </div>
      <div className="mentor-induction-checklist__items">
        {checklist.items.map((item, index) => {
          const extras = itemExtras(item);
          const scheduled = extras.response_kind === "scheduled_date";
          const previousSection = index > 0 ? itemExtras(checklist.items[index - 1]).section ?? "" : "";
          const heading = extras.section && extras.section !== previousSection ? extras.section : null;
          return (
          <Fragment key={item.id}>
            {heading && <h4 className="mentor-induction-checklist__section">{heading}</h4>}
          <section className="mentor-induction-checklist__item">
            <div className="mentor-induction-checklist__item-title">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h4>{item.label}{item.required && <sup aria-label="Required">*</sup>}</h4>{item.required && <small>Required before the placement can become active.</small>}{extras.guidance && <small className="mentor-induction-checklist__guidance">Guidance: {extras.guidance}</small>}</div>
              {item.response && <span className="mentor-induction-checklist__saved">Saved</span>}
            </div>
            <p className="mentor-induction-checklist__answer-label">What happened?</p>
            <div className="mentor-induction-checklist__answers" role="group" aria-label={`Answer for ${item.label}`}>
              {(["yes", "no", "not_applicable"] as const).map((response) => (
                <button
                  key={response}
                  type="button"
                  disabled={busy || (scheduled && response === "yes" && !comments[item.id]?.trim())}
                  onClick={() => void onAnswer(item.id, response, scheduled ? comments[item.id] : undefined)}
                  aria-pressed={item.response === response}
                  className={item.response === response ? "is-active" : ""}
                >
                  {response === "yes" ? "Done" : response === "no" ? "Not yet" : "Does not apply"}
                </button>
              ))}
            </div>
            {scheduled && <label className="mentor-induction-checklist__note">Agreed date and time <span>(required)</span><input type="datetime-local" value={(comments[item.id] ?? "").replace(" ", "T")} onChange={(event) => setComments((current) => ({ ...current, [item.id]: agreedDateText(event.target.value) }))} /></label>}
            {!scheduled && <label className="mentor-induction-checklist__note">Note or next action <span>(optional)</span><textarea value={comments[item.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="For example, what still needs to happen?" /></label>}
            {item.response && comments[item.id] !== (item.comment ?? "") && <Button type="button" variant="tertiary" size="sm" className="mt-2" disabled={busy} onClick={() => void onAnswer(item.id, item.response as "yes" | "no" | "not_applicable", comments[item.id])}>Save note</Button>}
          </section>
          </Fragment>
          );
        })}
      </div>
      <div className="mentor-induction-checklist__footer">
        <p>
          Signing confirms that you reviewed these items with the student. It activates the placement and saves your name and the time. Do not write patient names or identifiers in notes.
        </p>
        <Button
          size="sm"
          disabled={!ready || busy || Boolean(checklist.completed_at)}
          onClick={onSign}
          className="mentor-induction-checklist__sign"
        >
          {checklist.completed_at
            ? "Induction signed · Placement active"
            : busy
              ? "Saving…"
              : "Sign and activate placement"}
        </Button>
      </div>
    </Card>
  );
}
