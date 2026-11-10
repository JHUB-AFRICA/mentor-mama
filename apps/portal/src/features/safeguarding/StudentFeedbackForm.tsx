import { useState, type FormEvent } from "react";
import { Button, Card } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import { submitPlacementFeedback, type FeedbackMode } from "../../services/api";

/** Student placement feedback, following the MentorMAMA concept note (Appendix B). */
const RATINGS: Array<{ code: string; label: string }> = [
  { code: "orientation", label: "I was properly oriented to the labour ward/unit." },
  { code: "mentor_availability", label: "My mentor was available when I needed guidance." },
  { code: "constructive_feedback", label: "I received constructive feedback on my learning." },
  { code: "confidence_this_week", label: "I feel more confident in my clinical learning after this week." },
  { code: "respectful_environment", label: "The learning environment was respectful and supportive." },
];
const ANONYMOUS_RATINGS: Array<{ code: string; label: string }> = [
  { code: "support", label: "I felt supported during my placement." },
  { code: "learning_opportunities", label: "I had useful opportunities to learn." },
  { code: "safety_to_speak_up", label: "I felt safe raising a concern or asking for help." },
];
const SCALE = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
];

function RatingRow({ code, label, value, onChange }: { code: string; label: string; value?: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="rounded-xl border border-border bg-white px-4 py-3">
      <legend className="float-left mb-2 w-full px-0 font-body text-sm font-semibold text-navy">{label}</legend>
      <div className="clear-both grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {SCALE.map((option) => (
          <label
            key={option.value}
            title={option.label}
            className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center font-body text-xs transition ${value === option.value ? "border-teal bg-teal-light text-navy" : "border-border text-navy-muted hover:border-teal/50"}`}
          >
            <input type="radio" className="sr-only" name={code} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <strong className="text-sm">{option.value}</strong>
            <span className="hidden leading-tight sm:block">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function YesNoRow({ name, label, value, onChange }: { name: string; label: string; value: boolean | null; onChange: (value: boolean) => void }) {
  return (
    <fieldset className="rounded-xl border border-border bg-white px-4 py-3">
      <legend className="float-left mb-2 w-full px-0 font-body text-sm font-semibold text-navy">{label}</legend>
      <div className="clear-both flex gap-2" role="radiogroup" aria-label={label}>
        {[true, false].map((option) => (
          <label key={String(option)} className={`flex min-w-20 cursor-pointer items-center justify-center rounded-lg border px-4 py-2 font-body text-sm font-semibold transition ${value === option ? "border-teal bg-teal-light text-navy" : "border-border text-navy-muted hover:border-teal/50"}`}>
            <input type="radio" className="sr-only" name={name} checked={value === option} onChange={() => onChange(option)} />
            {option ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StudentFeedbackForm({ placementId, onError }: { placementId: string; onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [mode, setMode] = useState<FeedbackMode>("confidential");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [knowsMentor, setKnowsMentor] = useState<boolean | null>(null);
  const [unresolved, setUnresolved] = useState<boolean | null>(null);
  const [concernDetail, setConcernDetail] = useState("");
  const [improvement, setImprovement] = useState("");
  const [commandId, setCommandId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const questions = mode === "anonymous" ? ANONYMOUS_RATINGS : RATINGS;
  const ratingsDone = questions.every((question) => ratings[question.code]);
  const complete =
    mode === "anonymous"
      ? ratingsDone
      : ratingsDone && knowsMentor !== null && unresolved !== null && (!unresolved || concernDetail.trim().length >= 5);

  function reset() {
    setRatings({});
    setKnowsMentor(null);
    setUnresolved(null);
    setConcernDetail("");
    setImprovement("");
    setCommandId(crypto.randomUUID());
  }
  function touch() {
    setCommandId(crypto.randomUUID());
    setSent(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    try {
      if (mode === "anonymous") {
        await submitPlacementFeedback(
          placementId,
          { mode, comments: "", responses: ANONYMOUS_RATINGS.map(({ code }) => ({ question_code: code, scale: "likert_1_5" as const, value_numeric: ratings[code] })) },
          commandId,
        );
      } else {
        await submitPlacementFeedback(
          placementId,
          {
            mode,
            comments: unresolved ? concernDetail.trim() : "",
            unresolved_concern: Boolean(unresolved),
            improvement: improvement.trim(),
            responses: [
              ...RATINGS.map(({ code }) => ({ question_code: code, scale: "likert_1_5" as const, value_numeric: ratings[code] })),
              { question_code: "knows_mentor", scale: "yes_no" as const, value_boolean: Boolean(knowsMentor) },
            ],
          },
          commandId,
        );
      }
      reset();
      setSent(true);
      pushToast({ kind: "success", title: "Feedback submitted", message: "Thank you. Your placement feedback has been recorded." });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not submit your feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" className="border-teal/20 bg-white">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">Your voice</p>
      <h2 className="mt-1 font-display text-h3 text-navy">Share placement feedback</h2>
      <p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">
        It takes about two minutes. Confidential feedback goes to authorised staff who can follow up. Anonymous feedback is ratings only and is reported in groups of at least three.
        Please do not include patient names or identifiers.
      </p>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="block font-body text-sm font-semibold text-navy">
          How should this be handled?
          <select className="input mt-2" value={mode} onChange={(event) => { setMode(event.target.value as FeedbackMode); touch(); }}>
            <option value="confidential">Confidential — authorised follow-up</option>
            <option value="anonymous">Anonymous — grouped ratings only</option>
          </select>
        </label>
        <p className="font-body text-xs text-navy-muted">Rate each statement from 1 (strongly disagree) to 5 (strongly agree).</p>
        {questions.map((question) => (
          <RatingRow key={question.code} code={question.code} label={question.label} value={ratings[question.code]} onChange={(value) => { setRatings((current) => ({ ...current, [question.code]: value })); touch(); }} />
        ))}
        {mode === "confidential" && (
          <>
            <YesNoRow name="knows_mentor" label="I know who my assigned mentor is." value={knowsMentor} onChange={(value) => { setKnowsMentor(value); touch(); }} />
            <YesNoRow name="unresolved" label="Do you have any unresolved concerns that need follow-up?" value={unresolved} onChange={(value) => { setUnresolved(value); touch(); }} />
            {unresolved && (
              <label className="block font-body text-sm font-semibold text-navy">
                What needs follow-up? <span className="text-error">*</span>
                <textarea className="input mt-2 min-h-24" value={concernDetail} onChange={(event) => { setConcernDetail(event.target.value); touch(); }} maxLength={2000} placeholder="Describe what is unresolved. Do not include patient identifiers." />
                <span className="mt-1 block font-body text-xs font-normal text-navy-muted">
                  For a serious safety or conduct issue, use “Raise a private concern” instead so it reaches the safeguarding reviewer.
                </span>
              </label>
            )}
            <label className="block font-body text-sm font-semibold text-navy">
              What is one thing that would improve your placement experience? <span className="font-normal text-navy-muted">(optional)</span>
              <textarea className="input mt-2 min-h-20" value={improvement} onChange={(event) => { setImprovement(event.target.value); touch(); }} maxLength={1000} />
            </label>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={busy || !complete}>{busy ? "Submitting…" : "Submit feedback"}</Button>
          {!complete && <span className="font-body text-xs text-navy-muted">Answer every question to submit.</span>}
        </div>
        {sent && <p role="status" className="rounded-xl bg-teal-light px-3 py-2 font-body text-sm text-teal">Your feedback was submitted safely.</p>}
      </form>
    </Card>
  );
}
