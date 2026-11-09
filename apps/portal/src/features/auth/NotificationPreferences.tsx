import { useEffect, useState } from "react";
import { Bell, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button, Card, Skeleton } from "@mentormama/ui";
import { ApiError, getNotificationPreferences, updateNotificationPreferences } from "../../services/api";
import type { NotificationPreferences as Preferences } from "../../services/api";
import { useToast } from "../../components/ToastProvider";

const fields: Array<{ key: keyof Omit<Preferences, "security_alerts">; title: string; detail: string }> = [
  { key: "account_activity", title: "Account activity", detail: "Password, sign-in, and access changes." },
  { key: "programme_updates", title: "Programme updates", detail: "Important messages from your programme team." },
  { key: "placement_updates", title: "Placement updates", detail: "Changes to placements, facilities, or assignments." },
  { key: "weekly_digest", title: "Weekly digest", detail: "A short summary of activity and upcoming actions." },
];

export function NotificationPreferences({ onError }: { onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoadError(false);
    void getNotificationPreferences()
      .then((result) => { if (active) setPreferences(result); })
      .catch((cause) => {
        if (!active) return;
        setLoadError(true);
        onError(cause instanceof Error ? cause.message : "Notification preferences could not be loaded.");
      });
    return () => { active = false; };
  }, [loadAttempt, onError]);
  async function toggle(key: keyof Omit<Preferences, "security_alerts">) {
    if (!preferences) return;
    const value = !preferences[key];
    setPreferences({ ...preferences, [key]: value });
    setSaving(key);
    try { const updated = await updateNotificationPreferences({ [key]: value }); setPreferences(updated); pushToast({ kind: "success", title: "Notification preference updated", message: `${fields.find((field) => field.key === key)?.title ?? "Preference"} is now ${value ? "on" : "off"}.` }); }
    catch (cause) { setPreferences({ ...preferences, [key]: !value }); onError(cause instanceof ApiError ? cause.message : "That preference could not be saved."); }
    finally { setSaving(null); }
  }
  return <Card padding="lg"><div className="max-w-2xl"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal"><Bell size={18} /></span><div><p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-navy-muted">Notifications</p><h2 className="mt-1 font-display text-h2 text-navy">Choose what reaches your inbox</h2><p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">Security messages stay enabled. You can tune the operational updates that are useful to you.</p></div></div>{loadError && !preferences ? <div className="mt-7 rounded-xl border border-error/20 bg-error/5 p-4" role="alert"><p className="font-body text-sm text-error">We couldn’t load your notification choices. Your current settings have not been changed.</p><Button className="mt-3" size="sm" variant="tertiary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button></div> : !preferences ? <div className="mt-7 space-y-4" role="status" aria-label="Loading notification preferences"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : <div className="mt-7 space-y-3">{fields.map(({ key, title, detail }) => <PreferenceRow key={key} title={title} detail={detail} checked={preferences[key]} disabled={saving !== null} busy={saving === key} onChange={() => void toggle(key)} />)}<div className="flex items-start gap-3 rounded-2xl border border-teal/20 bg-teal-light/45 p-4"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal" /><div><p className="font-body text-sm font-semibold text-navy">Security alerts are always on</p><p className="mt-1 font-body text-xs leading-5 text-navy-muted">We will always send messages about password, sign-in, and account-access changes.</p></div><CheckCircle2 size={17} className="ml-auto shrink-0 text-teal" /></div></div>}</div></Card>;
}

function PreferenceRow({ title, detail, checked, disabled, busy, onChange }: { title: string; detail: string; checked: boolean; disabled: boolean; busy: boolean; onChange: () => void }) {
  return <label className={`flex cursor-pointer items-center gap-4 rounded-2xl border border-border p-4 transition ${disabled ? "opacity-70" : "hover:border-teal"}`}><span className="min-w-0 flex-1"><span className="block font-body text-sm font-semibold text-navy">{title}</span><span className="mt-1 block font-body text-xs leading-5 text-navy-muted">{detail}</span></span><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-5 w-5 accent-teal" aria-label={title} />{busy && <span className="font-body text-xs text-navy-muted">Saving…</span>}</label>;
}
