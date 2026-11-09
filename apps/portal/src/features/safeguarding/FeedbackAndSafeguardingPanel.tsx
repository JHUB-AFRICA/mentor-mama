import { useState, type FormEvent } from "react";
import { Button, Card } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import { raiseSafeguardingConcern, submitPlacementFeedback, type FeedbackMode } from "../../services/api";

export function FeedbackAndSafeguardingPanel({ placementId, role, onError, surface = "card" }: { placementId: string; role: string; onError: (message: string) => void; surface?: "card" | "plain" }) {
  const { pushToast } = useToast();
  const [mode, setMode] = useState<FeedbackMode>("confidential");
  const [comments, setComments] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("Professional conduct");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [description, setDescription] = useState("");
  const [feedbackCommandId, setFeedbackCommandId] = useState(() => crypto.randomUUID());
  const [concernCommandId, setConcernCommandId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submitFeedback(event: FormEvent) {
    event.preventDefault(); setBusy(true); setSent(null);
    try {
      const responses = mode === "anonymous" ? ["support", "learning_opportunities", "safety_to_speak_up"].map((question_code) => ({ question_code, scale: "likert_1_5" as const, value_numeric: ratings[question_code] })) : undefined;
      await submitPlacementFeedback(placementId, { mode, comments: mode === "anonymous" ? "" : comments, ...(responses ? { responses } : {}) }, feedbackCommandId);
      setComments(""); setRatings({}); setFeedbackCommandId(crypto.randomUUID()); setSent("Your feedback was submitted safely."); pushToast({ kind: "success", title: "Feedback submitted", message: "Your placement feedback has been recorded." });
    }
    catch (cause) { onError(cause instanceof Error ? cause.message : "We could not submit your feedback."); }
    finally { setBusy(false); }
  }
  async function submitConcern(event: FormEvent) {
    event.preventDefault(); setBusy(true); setSent(null);
    try { await raiseSafeguardingConcern({ placement_id: placementId, category, severity, description }, concernCommandId); setDescription(""); setConcernCommandId(crypto.randomUUID()); setSent("Your concern was submitted to the authorised safeguarding reviewers."); pushToast({ kind: "success", title: "Concern submitted", message: "Your message has been sent to the authorised safeguarding reviewers." }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "We could not submit your concern."); }
    finally { setBusy(false); }
  }
  return <div className={role === "student" ? "grid gap-5 lg:grid-cols-2" : "w-full"}>
    {role === "student" && <Card padding="lg" className="border-teal/20 bg-white">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">Your voice</p>
      <h2 className="mt-1 font-display text-h3 text-navy">Share placement feedback</h2>
      <p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">Choose confidential feedback for a private follow-up, or anonymous feedback for grouped reporting. Anonymous responses are reported only when a group has at least three submissions; they cannot be followed up individually.</p>
      <form className="mt-5 space-y-4" onSubmit={submitFeedback}>
        <label className="block font-body text-sm font-semibold text-navy">How should this be handled?
          <select className="input mt-2" value={mode} onChange={(event) => { setMode(event.target.value as FeedbackMode); setFeedbackCommandId(crypto.randomUUID()); }}><option value="confidential">Confidential — authorised follow-up</option><option value="anonymous">Anonymous — group reporting only</option></select>
        </label>
        {mode === "anonymous" ? <>
          <p className="rounded-xl bg-mist px-3 py-2 font-body text-xs leading-5 text-navy-muted">Anonymous feedback uses ratings only. No written comment is collected. Rate each statement from 1 (strongly disagree) to 5 (strongly agree).</p>
          {[["support", "I felt supported during my placement."], ["learning_opportunities", "I had useful opportunities to learn."], ["safety_to_speak_up", "I felt safe raising a concern or asking for help."]].map(([key, label]) => <label key={key} className="block font-body text-sm font-semibold text-navy">{label}<select className="input mt-2" required value={ratings[key] ?? ""} onChange={(event) => { setRatings((current) => ({ ...current, [key]: Number(event.target.value) })); setFeedbackCommandId(crypto.randomUUID()); }}><option value="">Choose a rating</option><option value="1">1 · Strongly disagree</option><option value="2">2 · Disagree</option><option value="3">3 · Neither agree nor disagree</option><option value="4">4 · Agree</option><option value="5">5 · Strongly agree</option></select></label>)}
        </> : <label className="block font-body text-sm font-semibold text-navy">Feedback <textarea className="input mt-2 min-h-28" value={comments} onChange={(event) => { setComments(event.target.value); setFeedbackCommandId(crypto.randomUUID()); }} placeholder="What would help the placement programme improve?" required /></label>}
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Submitting…" : "Submit feedback"}</Button>
      </form>
    </Card>}
    <Card padding="lg" className={`w-full border-warning/25 bg-warning/5 ${surface === "plain" ? "rounded-2xl" : ""}`}>
      {surface !== "plain" && <><p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-warning">Safeguarding</p><h2 className="mt-1 font-display text-h3 text-navy">Raise a private concern</h2></>}
      <p className={`${surface === "plain" ? "mt-0" : "mt-2"} font-body text-body-sm leading-6 text-navy-muted`}>This is confidential, not anonymous. Only the submitter and authorised reviewers can read the narrative. Do not include patient identifiers.</p>
      <form className="mt-5 space-y-4" onSubmit={submitConcern}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="font-body text-sm font-semibold text-navy">Category<select className="input mt-2" value={category} onChange={(event) => { setCategory(event.target.value); setConcernCommandId(crypto.randomUUID()); }}><option>Professional conduct</option><option>Safety concern</option><option>Harassment or discrimination</option><option>Other</option></select></label><label className="font-body text-sm font-semibold text-navy">Severity<select className="input mt-2" value={severity} onChange={(event) => { setSeverity(event.target.value as typeof severity); setConcernCommandId(crypto.randomUUID()); }}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High — urgent review</option></select></label></div>
        <label className="block font-body text-sm font-semibold text-navy">What happened? <textarea className="input mt-2 min-h-28" minLength={10} value={description} onChange={(event) => { setDescription(event.target.value); setConcernCommandId(crypto.randomUUID()); }} placeholder="Describe the concern without naming a patient." required /></label>
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Submitting…" : "Submit private concern"}</Button>
      </form>
      {sent && <p role="status" className="mt-4 rounded-xl bg-white/70 px-3 py-2 font-body text-sm text-teal">{sent}</p>}
    </Card>
  </div>;
}
