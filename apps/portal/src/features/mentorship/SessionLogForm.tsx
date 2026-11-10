import { useEffect, useState, type FormEvent } from "react";
import { Button, Card } from "@mentormama/ui";
import {
  clearSessionDraft,
  getSessionDraft,
  saveSessionDraft,
  submitSession,
  submitSessionBatch,
} from "../../services/offline";
import type { SessionInput } from "../../services/api";

// Concept note Appendix A topic areas first, then the broader mentoring topics.
const topics = [
  "antenatal_care",
  "labour_monitoring",
  "documentation",
  "newborn_care",
  "respectful_maternity_care",
  "emergency_preparedness",
  "communication",
  "clinical_skills",
  "safeguarding",
  "feedback",
  "reflection",
  "professionalism",
];
const durations = [5, 10, 15, 30, 45];

function initialInput(): SessionInput {
  return {
    session_date: new Date().toISOString().slice(0, 10),
    session_type: "debrief",
    topics: [],
    what_was_covered: "",
  };
}

interface SessionLogFormProps {
  actorId: string;
  placementId: string;
  placementIds?: string[];
  draftKey?: string;
  onError: (message: string) => void;
  onQueued: () => void;
  onSaved: (summary?: { createdCount: number; duplicateCount: number }) => void;
  onOutcome?: (status: "queued" | "synced", summary?: { createdCount: number; duplicateCount: number }) => void;
  embedded?: boolean;
}

export function SessionLogForm({
  actorId,
  placementId,
  placementIds,
  draftKey = placementId,
  onError,
  onQueued,
  onSaved,
  onOutcome,
  embedded = false,
}: SessionLogFormProps) {
  const [input, setInput] = useState<SessionInput>(initialInput);
  const [draftReady, setDraftReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commandId, setCommandId] = useState(() => crypto.randomUUID());
  const [customTopic, setCustomTopic] = useState("");

  useEffect(() => {
    let active = true;
    void getSessionDraft(actorId, draftKey)
      .then((draft) => {
        if (active && draft) setInput(draft.input);
      })
      .catch(() => onError("We could not restore this saved session draft."))
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [actorId, draftKey, onError]);

  useEffect(() => {
    if (!draftReady) return;
    void saveSessionDraft(actorId, draftKey, input).catch(() =>
      onError("We could not save this session draft on this device."),
    );
  }, [actorId, draftKey, draftReady, input, onError]);

  function toggleTopic(topic: string) {
    setInput((current) => ({
      ...current,
      topics: current.topics.includes(topic)
        ? current.topics.filter((value) => value !== topic)
        : [...current.topics, topic],
    }));
  }

  function addCustomTopic() {
    const topic = customTopic.trim();
    if (!topic || input.topics.includes(topic)) return;
    setInput((current) => ({ ...current, topics: [...current.topics, topic] }));
    setCustomTopic("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.topics.length) {
      onError("Choose at least one topic before saving the session.");
      return;
    }
    setBusy(true);
    try {
      const result = placementIds && placementIds.length > 0
        ? await submitSessionBatch(actorId, { ...input, placement_ids: placementIds }, commandId)
        : await submitSession(actorId, placementIds?.[0] ?? placementId, input, commandId);
      const batchOutcome = result.status === "synced" && placementIds?.length
        ? result as { status: "synced"; createdCount?: number; duplicateCount?: number }
        : null;
      const summary = batchOutcome
        ? {
            createdCount: batchOutcome.createdCount ?? placementIds!.length,
            duplicateCount: batchOutcome.duplicateCount ?? 0,
          }
        : undefined;
      await clearSessionDraft(actorId, draftKey);
      if (result.status === "queued") onQueued();
      onSaved(summary);
      onOutcome?.(result.status, summary);
      setCommandId(crypto.randomUUID());
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The session could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" className={`mentor-session-form ${embedded ? "border-0 !p-0 shadow-none hover:shadow-none" : ""}`}>
      {!embedded && <><p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
        Mentorship session
      </p>
      <h2 className="mt-1 font-display text-h2 text-navy">Record this session</h2>
      <p className="mt-2 font-body text-body-sm text-navy-muted">
        Your draft is saved on this device. If signal drops, we will keep it visible until it syncs.
      </p></>}
      <form className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
        {placementIds && placementIds.length > 0 && <div className="rounded-xl border border-teal/25 bg-teal-light/30 px-4 py-3 sm:col-span-2 lg:col-span-3">
          <p className="font-body text-sm font-semibold text-navy">Shared session for {placementIds.length} students</p>
          <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
            These notes and follow-up details will be copied into every selected student’s private placement history. Keep them relevant to the whole group.
          </p>
        </div>}
        <label className="block font-body text-sm font-semibold text-navy">
          Session date
          <input
            className="input"
            type="date"
            value={input.session_date}
            onChange={(event) => setInput((current) => ({ ...current, session_date: event.target.value }))}
            required
          />
        </label>
        <label className="block font-body text-sm font-semibold text-navy">
          Session type
          <select
            className="input"
            value={input.session_type}
            onChange={(event) => setInput((current) => ({ ...current, session_type: event.target.value }))}
          >
            <option value="orientation">Orientation</option>
            <option value="debrief">Debrief</option>
            <option value="bedside_teaching">Bedside teaching</option>
            <option value="skills_discussion">Skills discussion</option>
            <option value="feedback">Feedback</option>
            <option value="case_reflection">Case reflection</option>
            <option value="case_review">Case review</option>
            <option value="planning">Placement planning</option>
            <option value="wellbeing_support">Wellbeing support</option>
            <option value="career_development">Career development</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block font-body text-sm font-semibold text-navy">
          Duration <span className="font-normal text-navy-muted">(optional)</span>
          <select
            className="input"
            value={input.duration_minutes ?? ""}
            onChange={(event) => setInput((current) => ({ ...current, duration_minutes: event.target.value ? Number(event.target.value) : undefined }))}
          >
            <option value="">Not recorded</option>
            {durations.map((duration) => <option key={duration} value={duration}>{duration === 45 ? "45+ minutes" : `${duration} minutes`}</option>)}
          </select>
        </label>
        <fieldset className="sm:col-span-2 lg:col-span-3">
          <legend className="font-body text-sm font-semibold text-navy">Topics covered</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <label
                key={topic}
                className={`cursor-pointer rounded-full border px-3 py-2 font-body text-xs capitalize transition ${input.topics.includes(topic) ? "border-teal bg-teal text-white" : "border-border bg-white text-navy-muted hover:border-teal hover:text-teal"}`}
              >
                <input
                  className="sr-only"
                  type="checkbox"
                  checked={input.topics.includes(topic)}
                  onChange={() => toggleTopic(topic)}
                />
                {topic.replaceAll("_", " ")}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input min-w-0 flex-1" value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="Add another topic" maxLength={60} />
            <Button type="button" size="sm" variant="secondary" onClick={addCustomTopic} disabled={!customTopic.trim()}>Add</Button>
          </div>
        </fieldset>
        <div className="rounded-xl border border-warm/40 bg-warm/20 px-4 py-3 sm:col-span-2 lg:col-span-3">
          <p className="font-body text-xs font-semibold text-navy">Keep notes safe</p>
          <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
            Do not include patient names, identifiers, diagnoses, or other patient-identifiable information.
          </p>
        </div>
        <label className="block font-body text-sm font-semibold text-navy sm:col-span-2 lg:col-span-3">
          What was covered <span className="text-error">*</span>
          <textarea
            className="input min-h-20 resize-y"
            value={input.what_was_covered ?? ""}
            onChange={(event) => setInput((current) => ({ ...current, what_was_covered: event.target.value }))}
            placeholder="Briefly note the learning focus"
            required
          />
        </label>
        <label className="block font-body text-sm font-semibold text-navy sm:col-span-2 lg:col-span-2">
          Feedback given <span className="font-normal text-navy-muted">(optional)</span>
          <textarea
            className="input min-h-20 resize-y"
            value={input.feedback_given ?? ""}
            onChange={(event) => setInput((current) => ({ ...current, feedback_given: event.target.value }))}
            placeholder="Capture useful feedback for the student"
          />
        </label>
        <label className="block font-body text-sm font-semibold text-navy sm:col-span-2 lg:col-span-1">
          Follow-up <span className="font-normal text-navy-muted">(optional)</span>
          <select
            className="input"
            value={input.follow_up_action ?? "none"}
            onChange={(event) => setInput((current) => ({ ...current, follow_up_action: event.target.value }))}
          >
            <option value="none">None</option>
            <option value="repeat_demonstration">Repeat demonstration</option>
            <option value="review_reading">Review reading</option>
            <option value="practice_skill">Practise a skill</option>
            <option value="review_next_shift">Review on next shift</option>
            <option value="supervisor_follow_up">Supervisor review</option>
            <option value="student_referral">Student support referral</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="flex justify-end border-t border-border pt-5 sm:col-span-2 lg:col-span-3">
          <Button type="submit" size="sm" className="min-w-32" disabled={busy || !draftReady}>
            {busy ? "Saving…" : "Save session"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
