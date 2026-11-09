import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import { ApiError, getStudentProfile, updateStudentProfile, type StudentProfile } from "../../services/api";
import { useToast } from "../../components/ToastProvider";

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void getStudentProfile()
      .then((result) => { if (active) setProfile(result); })
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
      setSaved(true);
      onComplete?.(updatedProfile);
      pushToast({ kind: "success", title: "Student profile saved", message: "Your profile details have been updated." });
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not save your student details.");
    } finally {
      setSaving(false);
    }
  }

  return <Card padding="lg"><div className="max-w-2xl"><p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-teal">Student details</p><h2 className="mt-1 font-display text-h2 text-navy">Complete your programme profile</h2><p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">These details help your institution support you. They are separate from your placement record and are not shown to mentors.</p><p className="mt-3 font-body text-xs text-navy-muted">Fields marked <span className="font-semibold text-error">*</span> are needed before you can open your placement workspace.</p>{formError && <p className="mt-4 rounded-xl border border-error/20 bg-error/5 px-4 py-3 font-body text-sm text-error" role="alert">{formError}</p>}{saved && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-teal-light px-4 py-3 font-body text-caption text-navy"><CheckCircle2 size={16} className="text-teal" />Student details saved.</p>}{loading ? <p className="mt-6 font-body text-sm text-navy-muted" role="status">Loading your student details…</p> : loadError ? <div className="mt-6 rounded-xl border border-error/20 bg-error/5 p-4" role="alert"><p className="font-body text-sm text-error">We couldn’t load your saved details. Your profile has not been changed.</p><Button className="mt-3" size="sm" variant="tertiary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button></div> : <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={submit}><label className="block font-body text-caption font-semibold text-navy sm:col-span-2">Course or programme <span className="text-error" aria-hidden="true">*</span><input required className="auth-control mt-2" value={profile.course_name} onChange={(event) => update("course_name", event.target.value)} placeholder="e.g. Bachelor of Science in Nursing" /></label><label className="block font-body text-caption font-semibold text-navy">Year of study <span className="text-error" aria-hidden="true">*</span><input required className="auth-control mt-2" type="number" min="1" max="20" value={profile.year_of_study ?? ""} onChange={(event) => update("year_of_study", event.target.value ? Number(event.target.value) : null)} placeholder="e.g. 4" /></label><label className="block font-body text-caption font-semibold text-navy">Date of birth<input className="auth-control mt-2" type="date" value={profile.date_of_birth ?? ""} onChange={(event) => update("date_of_birth", event.target.value || null)} /></label><div className="sm:col-span-2"><p className="font-body text-caption font-semibold text-navy">Emergency contact</p><p className="mt-1 font-body text-xs text-navy-muted">Keep this information current for programme support.</p></div><label className="block font-body text-caption font-semibold text-navy">Contact name <span className="text-error" aria-hidden="true">*</span><input required className="auth-control mt-2" value={profile.emergency_contact_name} onChange={(event) => update("emergency_contact_name", event.target.value)} /></label><label className="block font-body text-caption font-semibold text-navy">Relationship <span className="text-error" aria-hidden="true">*</span><input required className="auth-control mt-2" value={profile.emergency_contact_relationship} onChange={(event) => update("emergency_contact_relationship", event.target.value)} placeholder="e.g. Parent" /></label><label className="block font-body text-caption font-semibold text-navy sm:col-span-2">Contact phone <span className="text-error" aria-hidden="true">*</span><input required className="auth-control mt-2" type="tel" value={profile.emergency_contact_phone} onChange={(event) => update("emergency_contact_phone", event.target.value)} /></label><div className="sm:col-span-2"><Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save student details"}</Button></div></form>}</div></Card>;
}
