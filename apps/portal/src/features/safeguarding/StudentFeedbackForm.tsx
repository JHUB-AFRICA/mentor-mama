import { useState, type FormEvent } from "react";
import { AdminButton } from "../programme-admin/ui/AdminKit";
import "./concerns.css";
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
            className={`flex cursor-pointer items-center justify-center rounded-lg border py-2 font-body text-sm font-bold transition ${value === option.value ? "border-teal bg-teal text-white" : "border-border text-navy-muted hover:border-teal/50"}`}
          >
            <input type="radio" className="sr-only" name={code} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span aria-hidden="true">{option.value}</span>
            <span className="sr-only">{option.value} — {option.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-body text-[0.68rem] text-navy-muted" aria-hidden="true">
        <span>Strongly disagree</span>
        <span>Strongly agree</span>
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
    <section className="sf-card" aria-labelledby={`sf-title-${placementId}`}>
      <p className="pa-eyebrow">Your voice</p>
      <h3 id={`sf-title-${placementId}`} className="sf-card__title">Share placement feedback</h3>
      <p className="sf-card__text">
        It takes about two minutes. Choose how you want your feedback handled. Please do not include patient names or identifiers.
      </p>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-body text-sm font-semibold text-navy">How should this be handled?</legend>
          {([
            ["confidential", "Confidential", "Authorised programme staff can read your answers and follow up with you. Your mentor does not see them.", "Best if something needs to be put right."],
            ["anonymous", "Anonymous", "Ratings only, with no comments. We cannot tell it was you. Results are grouped by cohort, hospital and ward, and are not shown until at least 3 people have answered.", "Best if you want to stay unidentifiable."],
          ] as const).map(([value, title, text, hint]) => (
            <label key={value} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition ${mode === value ? "border-teal bg-teal-light/40" : "border-border hover:border-teal/50"}`}>
              <span className="flex items-center gap-2 font-body text-sm font-bold text-navy">
                <input type="radio" name="feedback-mode" value={value} checked={mode === value} onChange={() => { setMode(value); touch(); }} className="accent-teal" />
                {title}
              </span>
              <span className="font-body text-xs leading-5 text-navy-muted">{text}</span>
              <span className="font-body text-xs font-semibold text-teal">{hint}</span>
            </label>
          ))}
        </fieldset>
        <p className="rounded-xl bg-mist px-4 py-3 font-body text-xs leading-5 text-navy-muted">
          On a small ward even grouped results could point to one person, so we hide them until enough people have answered. If you are worried about your safety or someone else&rsquo;s, raise a safeguarding concern instead. Those are not anonymous, so that they can be investigated.
        </p>
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
          <AdminButton type="submit" disabled={busy || !complete}>{busy ? "Submitting…" : "Submit feedback"}</AdminButton>
          {!complete && <span className="font-body text-xs text-navy-muted">Answer every question to submit.</span>}
        </div>
        {sent && <p role="status" className="rounded-xl bg-teal-light px-3 py-2 font-body text-sm text-teal">Your feedback was submitted safely.</p>}
      </form>
    </section>
  );
}
