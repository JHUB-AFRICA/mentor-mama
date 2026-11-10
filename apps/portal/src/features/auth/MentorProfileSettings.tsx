import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { ApiError, getMentorProfile, updateMentorProfile, type MentorProfile } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { Field, FieldRow, SelectInput, TextInput } from "../../components/kit";
import { AdminButton, AdminCard, StatusPill } from "../programme-admin/ui/AdminKit";
import "./account-settings.css";

const emptyProfile: MentorProfile = {
  cadre: "",
  department: "",
  years_of_practice: null,
  mentorship_experience_years: null,
  cpd_identifier: "",
  digital_literacy: null,
};

const LITERACY = [
  { value: 1, label: "1 · Basic — I need help with most apps" },
  { value: 2, label: "2 · Developing" },
  { value: 3, label: "3 · Comfortable with everyday apps" },
  { value: 4, label: "4 · Confident" },
  { value: 5, label: "5 · Advanced" },
];

const toNumber = (value: string) => (value === "" ? null : Number(value));

/** Optional professional details for mentors (concept note section 8). */
export function MentorProfileSettings({ onError }: { onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [profile, setProfile] = useState<MentorProfile>(emptyProfile);
  const [baseline, setBaseline] = useState(JSON.stringify(emptyProfile));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(profile) !== baseline;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void getMentorProfile()
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setBaseline(JSON.stringify(result));
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [attempt]);

  function update<K extends keyof MentorProfile>(field: K, value: MentorProfile[K]) {
    setProfile((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await updateMentorProfile(profile);
      setProfile(result);
      setBaseline(JSON.stringify(result));
      setSaved(true);
      pushToast({ kind: "success", title: "Mentor profile saved", message: "Your professional details have been updated." });
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not save your mentor profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCard
      title="Mentor profile"
      description="Optional professional details that help your programme plan support and training. Do not enter patient information."
      titleId="mentor-details-title"
      action={dirty && !loading && !loadError ? <StatusPill tone="warning">Unsaved changes</StatusPill> : undefined}
    >
      {saved && (
        <p role="status" className="acct-message"><CheckCircle2 aria-hidden="true" />Mentor profile saved.</p>
      )}
      {loading ? (
        <p className="acct-muted" role="status">Loading your mentor profile…</p>
      ) : loadError ? (
        <div className="acct-message acct-message--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <p>We couldn’t load your saved details. Your profile has not been changed.</p>
            <AdminButton className="mt-2" size="sm" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Try again</AdminButton>
          </div>
        </div>
      ) : (
        <form className="acct-form mt-4" onSubmit={submit}>
          <FieldRow>
            <Field label="Cadre" optional>
              <TextInput value={profile.cadre} onChange={(event) => update("cadre", event.target.value)} placeholder="e.g. Registered nurse-midwife" maxLength={120} />
            </Field>
            <Field label="Department or unit" optional>
              <TextInput value={profile.department} onChange={(event) => update("department", event.target.value)} placeholder="e.g. Labour ward" maxLength={120} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Years of practice" optional>
              <TextInput type="number" min="0" max="70" value={profile.years_of_practice ?? ""} onChange={(event) => update("years_of_practice", toNumber(event.target.value))} />
            </Field>
            <Field label="Years of mentorship experience" optional>
              <TextInput type="number" min="0" max="70" value={profile.mentorship_experience_years ?? ""} onChange={(event) => update("mentorship_experience_years", toNumber(event.target.value))} />
            </Field>
          </FieldRow>
          <Field label="Comfort with digital tools" optional hint="A self-rating that helps the programme tailor training.">
            <SelectInput value={profile.digital_literacy ?? ""} onChange={(event) => update("digital_literacy", toNumber(event.target.value))}>
              <option value="">Prefer not to say</option>
              {LITERACY.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="CPD identifier" optional hint="Only if your programme asks for it. Leave blank otherwise.">
            <TextInput value={profile.cpd_identifier} onChange={(event) => update("cpd_identifier", event.target.value)} maxLength={64} />
          </Field>
          <div className="acct-form__actions">
            <AdminButton type="submit" disabled={saving || !dirty} aria-busy={saving} icon={saving ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}>
              {saving ? "Saving…" : "Save mentor profile"}
            </AdminButton>
            {dirty && <span className="acct-muted">You have unsaved changes.</span>}
          </div>
        </form>
      )}
    </AdminCard>
  );
}
