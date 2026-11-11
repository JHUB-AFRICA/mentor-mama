/**
 * Raise a private concern. The person raising it chooses who may look into it: the nurse manager, the university
 * coordinator, or both. Nobody they did not choose sees the concern at all (not even its category).
 */
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { Field, FieldRow, SelectInput, TextArea } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { ApiError, raiseSafeguardingConcern, type ConcernAudience } from "../../services/api";
import { AdminButton } from "../programme-admin/ui/AdminKit";
import "./concerns.css";

const AUDIENCES: Array<{ value: ConcernAudience; title: string; text: string; icon: typeof Users }> = [
  { value: "nurse_manager", title: "Nurse manager", text: "The manager at the placement hospital.", icon: Building2 },
  { value: "coordinator", title: "University coordinator", text: "The coordinator at the student's institution.", icon: GraduationCap },
  { value: "both", title: "Both", text: "Either can take it. One of them reviews it.", icon: Users },
];

export const audienceLabel = (value: ConcernAudience) =>
  value === "both" ? "the nurse manager and the university coordinator" : value === "coordinator" ? "the university coordinator" : "the nurse manager";

export function RaiseConcernForm({
  placementId,
  placements,
  onSubmitted,
  onCancel,
  onError,
  relatedEscalationId,
  defaultAudience,
  defaultCategory,
}: {
  /** Links a follow-up to an earlier concern the person raised. */
  relatedEscalationId?: string;
  defaultAudience?: ConcernAudience;
  defaultCategory?: string;
  /** Fixed placement. Omit and pass `placements` to let the person choose. */
  placementId?: string;
  placements?: Array<{ id: string; label: string }>;
  onSubmitted?: () => void;
  onCancel?: () => void;
  onError: (message: string) => void;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [chosenPlacement, setChosenPlacement] = useState(placementId ?? (placements?.length === 1 ? placements[0].id : ""));
  const [category, setCategory] = useState(defaultCategory ?? "Professional conduct");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [audience, setAudience] = useState<ConcernAudience | null>(defaultAudience ?? null);
  const [description, setDescription] = useState("");
  const [commandId, setCommandId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const touch = () => setCommandId(crypto.randomUUID());
  const target = placementId ?? chosenPlacement;
  const ready = Boolean(target && audience && description.trim().length >= 10);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !audience) return;
    setBusy(true);
    try {
      await raiseSafeguardingConcern({ placement_id: target, category, severity, description: description.trim(), routed_to: audience, ...(relatedEscalationId ? { related_escalation_id: relatedEscalationId } : {}) }, commandId);
      pushToast({ kind: "success", title: "Concern submitted", message: `Only ${audienceLabel(audience)} can see it.` });
      setDescription("");
      setAudience(null);
      touch();
      void queryClient.invalidateQueries({ queryKey: ["escalations"] });
      onSubmitted?.();
    } catch (cause) {
      onError(cause instanceof ApiError || cause instanceof Error ? cause.message : "We could not submit your concern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rc-form" onSubmit={submit}>
      <p className="rc-form__intro">
        <ShieldCheck aria-hidden="true" />
        Confidential, not anonymous. Only the people you choose can read it. Do not include patient identifiers.
      </p>
      {!placementId && placements && placements.length > 1 && (
        <Field label="Placement" required>
          <SelectInput value={chosenPlacement} onChange={(event) => { setChosenPlacement(event.target.value); touch(); }} required>
            <option value="">Choose a placement</option>
            {placements.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </SelectInput>
        </Field>
      )}
      <fieldset className="rc-audience">
        <legend>Who should look into this? <span aria-hidden="true">*</span></legend>
        <div className="rc-audience__options">
          {AUDIENCES.map(({ value, title, text, icon: Icon }) => (
            <label key={value} className={`rc-audience__option ${audience === value ? "is-selected" : ""}`}>
              <input type="radio" name="concern-audience" value={value} checked={audience === value} onChange={() => { setAudience(value); touch(); }} required />
              <span className="rc-audience__icon" aria-hidden="true"><Icon /></span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="rc-audience__note">
          {audience ? `Only ${audienceLabel(audience)} will see this concern. Nobody else will.` : "Concerns are never shown to everyone by default. Choose who you trust to review it."}
        </p>
      </fieldset>
      <FieldRow>
        <Field label="Category">
          <SelectInput value={category} onChange={(event) => { setCategory(event.target.value); touch(); }}>
            <option>Professional conduct</option>
            <option>Safety concern</option>
            <option>Harassment or discrimination</option>
            <option>Wellbeing</option>
            <option>Other</option>
          </SelectInput>
        </Field>
        <Field label="Severity">
          <SelectInput value={severity} onChange={(event) => { setSeverity(event.target.value as typeof severity); touch(); }}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High: urgent review</option>
          </SelectInput>
        </Field>
      </FieldRow>
      <Field label="What happened?" required hint="At least 10 characters. Describe what happened without naming a patient.">
        <TextArea rows={5} minLength={10} maxLength={5000} value={description} onChange={(event) => { setDescription(event.target.value); touch(); }} required />
      </Field>
      <div className="rc-form__actions">
        {onCancel && <AdminButton variant="ghost" onClick={onCancel} disabled={busy}>Cancel</AdminButton>}
        <AdminButton type="submit" disabled={busy || !ready}>{busy ? "Submitting…" : "Submit private concern"}</AdminButton>
      </div>
    </form>
  );
}
