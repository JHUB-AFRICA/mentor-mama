import { useEffect, useRef, useState } from "react";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { ApiError, getNotificationPreferences, updateNotificationPreferences } from "../../services/api";
import type { NotificationPreferences as Preferences } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { AdminButton, AdminCard, StatusPill } from "../programme-admin/ui/AdminKit";
import "./account-settings.css";

type PreferenceKey = keyof Omit<Preferences, "security_alerts">;

const groups: Array<{ title: string; fields: Array<{ key: PreferenceKey; title: string; detail: string }> }> = [
  {
    title: "Mentoring",
    fields: [{ key: "account_activity", title: "Session follow-ups", detail: "Reminders when a mentoring session needs a follow-up." }],
  },
  {
    title: "Programme",
    fields: [
      { key: "programme_updates", title: "Feedback and programme messages", detail: "Feedback received, final assessments and messages from your programme team." },
      { key: "placement_updates", title: "Placement updates", detail: "New placements, ward and mentor assignments, pauses, and completion." },
    ],
  },
  {
    title: "Summaries",
    fields: [{ key: "weekly_digest", title: "Weekly digest", detail: "A short summary of activity and upcoming actions." }],
  },
];

const allFields = groups.flatMap((group) => group.fields);

export function NotificationPreferences({ onError }: { onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<PreferenceKey | null>(null);
  const [justSaved, setJustSaved] = useState<PreferenceKey | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
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

  async function toggle(key: PreferenceKey) {
    if (!preferences) return;
    const value = !preferences[key];
    setPreferences({ ...preferences, [key]: value });
    setSaving(key);
    setJustSaved(null);
    try {
      const updated = await updateNotificationPreferences({ [key]: value });
      setPreferences(updated);
      setJustSaved(key);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setJustSaved(null), 2200);
      pushToast({ kind: "success", title: "Notification preference updated", message: `${allFields.find((field) => field.key === key)?.title ?? "Preference"} is now ${value ? "on" : "off"}.` });
    } catch (cause) {
      setPreferences({ ...preferences, [key]: !value });
      onError(cause instanceof ApiError ? cause.message : "That preference could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <AdminCard
      title="Choose which emails you receive"
      description="These switches control email only. Every update still appears in your in-app notifications, and security and safeguarding emails are always sent."
      titleId="notifications-title"
    >
      {loadError && !preferences ? (
        <div className="acct-message acct-message--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <p>We couldn’t load your notification choices. Your current settings have not been changed.</p>
            <AdminButton className="mt-2" size="sm" variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</AdminButton>
          </div>
        </div>
      ) : !preferences ? (
        <div className="acct-stack" role="status" aria-label="Loading notification preferences">
          <div className="acct-skeleton" />
          <div className="acct-skeleton" />
          <div className="acct-skeleton" />
        </div>
      ) : (
        <div className="acct-stack">
          <p className="acct-group-title" style={{ textTransform: "none", letterSpacing: 0 }}>
            <ShieldCheck size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
            Safeguarding updates and sign-in, password and invitation emails are always sent. They cannot be turned off.
          </p>
          {groups.map((group) => (
            <section key={group.title} aria-label={`${group.title} notifications`}>
              <p className="acct-group-title">{group.title}</p>
              <div>
                {group.fields.map(({ key, title, detail }) => (
                  <SwitchRow
                    key={key}
                    id={`pref-${key}`}
                    title={title}
                    detail={detail}
                    checked={preferences[key]}
                    disabled={saving !== null}
                    state={saving === key ? "saving" : justSaved === key ? "saved" : null}
                    onChange={() => void toggle(key)}
                  />
                ))}
              </div>
            </section>
          ))}
          <section aria-label="Security notifications">
            <p className="acct-group-title">Security</p>
            <div className="acct-switch-row">
              <ShieldCheck size={18} className="shrink-0 text-[var(--pa-teal)]" aria-hidden="true" />
              <div className="acct-switch-row__copy">
                <span className="acct-switch-row__title">Security alerts are always on</span>
                <span className="acct-switch-row__detail">We will always send messages about password, sign-in, and account-access changes.</span>
              </div>
              <StatusPill tone="teal">Always on</StatusPill>
            </div>
          </section>
        </div>
      )}
    </AdminCard>
  );
}

function SwitchRow({ id, title, detail, checked, disabled, state, onChange }: { id: string; title: string; detail: string; checked: boolean; disabled: boolean; state: "saving" | "saved" | null; onChange: () => void }) {
  return (
    <div className="acct-switch-row">
      <div className="acct-switch-row__copy">
        <span id={`${id}-label`} className="acct-switch-row__title">{title}</span>
        <span id={`${id}-detail`} className="acct-switch-row__detail">{detail}</span>
      </div>
      <span className={`acct-switch-row__state${state === "saved" ? " is-saved" : ""}`} role="status" aria-live="polite">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-detail`}
        className="acct-switch"
        disabled={disabled}
        onClick={onChange}
      />
    </div>
  );
}
