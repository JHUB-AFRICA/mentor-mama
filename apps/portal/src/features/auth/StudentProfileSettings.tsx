import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { ApiError, getStudentProfile, updateStudentProfile, type StudentProfile } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { Field, FieldRow, TextInput } from "../../components/kit";
import { AdminButton, AdminCard, StatusPill } from "../programme-admin/ui/AdminKit";
import "./account-settings.css";

const emptyProfile: StudentProfile = {
  course_name: "",
  year_of_study: null,
  date_of_birth: null,
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
};

export function StudentProfileSettings({ onError, onComplete }: { onError: (message: string) => void; onComplete?: (profile: StudentProfile) => void }) {
  const { pushToast } = useToast();
  const [profile, setProfile] = useState<StudentProfile>(emptyProfile);
  const [baseline, setBaseline] = useState<string>(JSON.stringify(emptyProfile));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(profile) !== baseline;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void getStudentProfile()
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setBaseline(JSON.stringify(result));
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  function update(field: keyof StudentProfile, value: string | number | null) {
    setProfile((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setFormError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !profile.course_name.trim() ||
      !profile.year_of_study ||
      !profile.emergency_contact_name.trim() ||
      !profile.emergency_contact_phone.trim() ||
      !profile.emergency_contact_relationship.trim()
    ) {
      setFormError("Complete the required student and emergency contact details before continuing.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const updatedProfile = await updateStudentProfile(profile);
      setProfile(updatedProfile);
      setBaseline(JSON.stringify(updatedProfile));
      setSaved(true);
      onComplete?.(updatedProfile);
      pushToast({ kind: "success", title: "Student profile saved", message: "Your profile details have been updated." });
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not save your student details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCard
      title="Complete your programme profile"
      description="These details help your institution support you. They are separate from your placement record and are not shown to mentors."
      titleId="student-details-title"
      action={dirty && !loading && !loadError ? <StatusPill tone="warning">Unsaved changes</StatusPill> : undefined}
    >
      <p className="acct-muted">
        Fields marked <span className="font-semibold text-error">*</span> are needed before you can open your placement workspace.
      </p>
      {formError && (
        <p className="acct-message acct-message--error mt-3" role="alert"><CircleAlert aria-hidden="true" />{formError}</p>
      )}
      {saved && (
        <p role="status" className="acct-message mt-3"><CheckCircle2 aria-hidden="true" />Student details saved.</p>
      )}
      {loading ? (
        <p className="acct-muted mt-4" role="status">Loading your student details…</p>
      ) : loadError ? (
        <div className="acct-message acct-message--error mt-4" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <p>We couldn’t load your saved details. Your profile has not been changed.</p>
            <AdminButton className="mt-2" size="sm" variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</AdminButton>
          </div>
        </div>
      ) : (
        <form className="acct-form mt-4" onSubmit={submit}>
          <Field label="Course or programme" required>
            <TextInput required value={profile.course_name} onChange={(event) => update("course_name", event.target.value)} placeholder="e.g. Bachelor of Science in Nursing" />
          </Field>
          <FieldRow>
            <Field label="Year of study" required>
              <TextInput required type="number" min="1" max="20" value={profile.year_of_study ?? ""} onChange={(event) => update("year_of_study", event.target.value ? Number(event.target.value) : null)} placeholder="e.g. 4" />
            </Field>
            <Field label="Date of birth">
              <TextInput type="date" value={profile.date_of_birth ?? ""} onChange={(event) => update("date_of_birth", event.target.value || null)} />
            </Field>
          </FieldRow>
          <div>
            <p className="acct-label">Emergency contact</p>
            <p className="acct-muted">Keep this information current for programme support.</p>
          </div>
          <FieldRow>
            <Field label="Contact name" required>
              <TextInput required value={profile.emergency_contact_name} onChange={(event) => update("emergency_contact_name", event.target.value)} />
            </Field>
            <Field label="Relationship" required>
              <TextInput required value={profile.emergency_contact_relationship} onChange={(event) => update("emergency_contact_relationship", event.target.value)} placeholder="e.g. Parent" />
            </Field>
          </FieldRow>
          <Field label="Contact phone" required>
            <TextInput required type="tel" value={profile.emergency_contact_phone} onChange={(event) => update("emergency_contact_phone", event.target.value)} />
          </Field>
          <div className="acct-form__actions">
            <AdminButton type="submit" disabled={saving} aria-busy={saving} icon={saving ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}>
              {saving ? "Saving…" : "Save student details"}
            </AdminButton>
            {dirty && <span className="acct-muted">You have unsaved changes.</span>}
          </div>
        </form>
      )}
    </AdminCard>
  );
}
