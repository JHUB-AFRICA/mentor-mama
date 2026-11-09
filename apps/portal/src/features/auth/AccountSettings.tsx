import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  CircleUserRound,
  KeyRound,
  ShieldAlert,
  SlidersHorizontal,
  MonitorSmartphone,
  CircleHelp,
} from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import {
  ApiError,
  submitMfaRecoveryRequest,
  updateProfile,
} from "../../services/api";
import type { CurrentUser, StudentProfile } from "../../services/api";
import { AccountSecurity } from "./AccountSecurity";
import { NotificationPreferences } from "./NotificationPreferences";
import { useToast } from "../../components/ToastProvider";
import { StudentProfileSettings } from "./StudentProfileSettings";

type SettingsTab =
  | "overview"
  | "security"
  | "profile"
  | "notifications"
  | "preferences"
  | "devices"
  | "support"
  | "recovery";

const accountRoleLabels: Record<string, string> = {
  program_admin: "Programme Administrator",
  coordinator: "Coordinator",
  nurse_manager: "Nurse Manager",
  mentor: "Mentor",
  student: "Student",
  platform_admin: "Platform Administrator",
};

function accountRoleLabel(role: string) {
  return accountRoleLabels[role] ?? role.replaceAll("_", " ");
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return (
    value === "overview" ||
    value === "preferences" ||
    value === "devices" ||
    value === "support" ||
    value === "security" ||
    value === "profile" ||
    value === "notifications" ||
    value === "recovery"
  );
}

export function AccountSettings({
  user,
  onSignedOut,
  onError,
  onUserUpdated,
  onStudentProfileComplete,
  initialTab = "security",
  profileOnly = false,
}: {
  user: CurrentUser;
  onSignedOut: () => void;
  onError: (message: string) => void;
  onUserUpdated: (user: CurrentUser) => void;
  onStudentProfileComplete?: (profile: StudentProfile) => void;
  initialTab?: SettingsTab | null;
  workspaceRole?: "standard" | "mentor" | "student";
  profileOnly?: boolean;
}) {
  const safeInitialTab = isSettingsTab(initialTab) ? initialTab : "overview";
  const [, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(safeInitialTab);
  useEffect(() => setTab(safeInitialTab), [safeInitialTab]);
  function selectTab(next: SettingsTab) {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  }
  if (profileOnly) {
    return (
      <section aria-label="Student profile" className="space-y-6">
        <div className="border-b border-border pb-6">
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Personal learning record
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Your student profile
          </h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-navy-muted">
            Keep your identity, programme details, and emergency contact ready
            so your institution can support you throughout placement.
          </p>
        </div>
        <ProfileSettings
          user={user}
          onUserUpdated={onUserUpdated}
          onError={onError}
        />
        <StudentProfileSettings
          onError={onError}
          onComplete={onStudentProfileComplete}
        />
      </section>
    );
  }
  return (
    <section aria-label="Account settings" className="settings-page">
      <div className="settings-breadcrumb">
        Settings <span>›</span> <strong>Account settings</strong>
      </div>
      <div className="settings-page-heading">
        <div>
          <h2>Settings</h2>
          <p>Manage your account, preferences, and security in one place.</p>
        </div>
        <div className="settings-page-secure">
          <ShieldAlert size={21} />
          <span>
            <strong>Account settings</strong>
            <small>Review your profile and sign-in preferences.</small>
          </span>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-sidebar" aria-label="Settings sections">
          {(
            [
              ["overview", "Account overview", CircleUserRound],
              ["security", "Security", KeyRound],
              ["notifications", "Notifications", Bell],
              ["preferences", "Preferences", SlidersHorizontal],
              ["devices", "Connected devices", MonitorSmartphone],
              ["support", "Support", CircleHelp],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={label}
              type="button"
              className={tab === value ? "active" : ""}
              onClick={() => selectTab(value)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <main className="settings-page-main">
          {tab === "overview" && (
            <SettingsOverview
              user={user}
              onEdit={() => selectTab("profile")}
              onSelect={selectTab}
            />
          )}
          {tab === "security" && (
            <div className="settings-tab-panel">
              <AccountSecurity
                user={user}
                onSignedOut={onSignedOut}
                onError={onError}
              />
            </div>
          )}
          {tab === "profile" && (
            <div className="settings-tab-panel">
              <ProfileSettings
                user={user}
                onUserUpdated={onUserUpdated}
                onError={onError}
              />
              {user.role === "student" && (
                <div className="mt-5">
                  <StudentProfileSettings
                    onError={onError}
                    onComplete={onStudentProfileComplete}
                  />
                </div>
              )}
            </div>
          )}
          {tab === "notifications" && (
            <div className="settings-tab-panel">
              <NotificationPreferences onError={onError} />
            </div>
          )}
          {tab === "preferences" && (
            <div className="settings-tab-panel">
              <PreferencesPanel />
            </div>
          )}
          {tab === "devices" && (
            <div className="settings-tab-panel">
              <AccountSecurity
                user={user}
                onSignedOut={onSignedOut}
                onError={onError}
              />
            </div>
          )}
          {tab === "support" && (
            <div className="settings-tab-panel">
              <MfaRecovery onError={onError} />
            </div>
          )}
          {tab === "recovery" && (
            <div className="settings-tab-panel">
              <MfaRecovery onError={onError} />
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function SettingsOverview({
  user,
  onEdit,
  onSelect,
}: {
  user: CurrentUser;
  onEdit: () => void;
  onSelect: (tab: SettingsTab) => void;
}) {
  return (
    <div className="settings-overview">
      <div className="settings-overview-main">
        <Card padding="lg">
          <div className="settings-card-heading">
            <div>
              <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-navy-muted">
                Account overview
              </p>
              <h2 className="mt-1 font-display text-h2 text-navy">
                Your basic information and programme access.
              </h2>
            </div>
            <Button size="sm" variant="tertiary" onClick={onEdit}>
              Edit profile
            </Button>
          </div>
          <div className="settings-profile-summary">
            <span className="settings-avatar">
              {user.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <h3>{user.name}</h3>
              <p>{accountRoleLabel(user.role)}</p>
              <span>{user.email}</span>
            </div>
            <div className="settings-profile-facts">
              <p>
                <small>Email</small>
                <strong>{user.email}</strong>
              </p>
              <p>
                <small>Phone</small>
                <strong>{user.phone || "Optional"}</strong>
              </p>
              <p>
                <small>Programme</small>
                <strong>
                  {user.scope?.program_id
                    ? "Assigned"
                    : "Not assigned"}
                </strong>
              </p>
            </div>
          </div>
        </Card>
        <div className="settings-overview-grid">
          <SettingsSummaryCard
            icon={<KeyRound size={18} />}
            title="Security"
            description="Keep your account safe."
            rows={[
              "Password",
              "Multi-factor authentication",
              "Active sessions",
            ]}
            onClick={() => onSelect("security")}
          />
          <SettingsSummaryCard
            icon={<Bell size={18} />}
            title="Notifications"
            description="Choose what you want to receive."
            rows={[
              "Email notifications",
              "Programme updates",
              "Placement updates",
            ]}
            onClick={() => onSelect("notifications")}
          />
          <SettingsSummaryCard
            icon={<SlidersHorizontal size={18} />}
            title="Preferences"
            description="Personalize your experience."
            rows={["Language", "Time zone", "Theme"]}
            onClick={() => onSelect("preferences")}
          />
          <SettingsSummaryCard
            icon={<CircleHelp size={18} />}
            title="Support"
            description="Get help or manage your account."
            rows={[
              "Help centre",
              "Contact support",
              "Request account recovery",
            ]}
            onClick={() => onSelect("support")}
          />
        </div>
      </div>
    </div>
  );
}

function SettingsSummaryCard({
  icon,
  title,
  description,
  rows,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  rows: string[];
  onClick: () => void;
}) {
  return (
    <Card padding="lg">
      <button type="button" className="settings-summary-card" onClick={onClick}>
        <span className="settings-summary-icon">{icon}</span>
        <span className="settings-summary-copy">
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <span className="settings-summary-rows">
          {rows.map((row) => (
            <span key={row}>
              {row}
              <b>›</b>
            </span>
          ))}
        </span>
      </button>
    </Card>
  );
}

function PreferencesPanel() {
  const { pushToast } = useToast();
  const [language, setLanguage] = useState(
    () => localStorage.getItem("mentor-mama-language") ?? "English (UK)",
  );
  const [timezone, setTimezone] = useState(
    () => localStorage.getItem("mentor-mama-timezone") ?? "(GMT+03:00) Nairobi",
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem("mentor-mama-theme") ?? "System default",
  );
  function save(key: string, value: string, update: (value: string) => void) {
    localStorage.setItem(key, value);
    update(value);
    pushToast({
      kind: "success",
      title: "Preference updated",
      message: "Your workspace preference has been saved.",
    });
  }
  return (
    <Card padding="lg">
      <div className="max-w-2xl">
        <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-navy-muted">
          Preferences
        </p>
        <h2 className="mt-1 font-display text-h2 text-navy">
          Personalize your experience
        </h2>
        <p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">
          These preferences are saved for this browser and applied to your
          programme workspace.
        </p>
        <div className="settings-preferences-list">
          <label>
            Language
            <select
              value={language}
              onChange={(event) =>
                save("mentor-mama-language", event.target.value, setLanguage)
              }
            >
              <option>English (UK)</option>
              <option>English (US)</option>
            </select>
          </label>
          <label>
            Time zone
            <select
              value={timezone}
              onChange={(event) =>
                save("mentor-mama-timezone", event.target.value, setTimezone)
              }
            >
              <option>(GMT+03:00) Nairobi</option>
              <option>(GMT+00:00) London</option>
              <option>(GMT+01:00) Lagos</option>
            </select>
          </label>
          <label>
            Theme
            <select
              value={theme}
              onChange={(event) =>
                save("mentor-mama-theme", event.target.value, setTheme)
              }
            >
              <option>System default</option>
              <option>Light</option>
              <option>Dark</option>
            </select>
          </label>
        </div>
      </div>
    </Card>
  );
}

function ProfileSettings({
  user,
  onUserUpdated,
  onError,
}: {
  user: CurrentUser;
  onUserUpdated: (user: CurrentUser) => void;
  onError: (message: string) => void;
}) {
  const { pushToast } = useToast();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const [firstName, ...lastNameParts] = name.trim().split(/\s+/);
      const updated = await updateProfile({
        first_name: firstName,
        last_name: lastNameParts.join(" ") || firstName,
        phone,
      });
      onUserUpdated(updated);
      setSaved(true);
      pushToast({
        kind: "success",
        title: "Profile updated",
        message: "Your account details have been saved.",
      });
    } catch (cause) {
      setSaved(false);
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save your profile changes.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card padding="lg">
      <div className="max-w-2xl">
        <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-navy-muted">
          Profile
        </p>
        <h2 className="mt-1 font-display text-h2 text-navy">
          Your account details
        </h2>
        <p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">
          Keep your contact details current. Your email, role, and programme
          access are managed by the programme team.
        </p>
        {saved && (
          <p
            className="mt-4 flex items-center gap-2 rounded-xl bg-teal-light px-4 py-3 font-body text-caption text-navy"
            role="status"
          >
            <CheckCircle2 size={16} className="text-teal" />
            Changes saved for this profile.
          </p>
        )}
        <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={submit}>
          <label className="block font-body text-caption font-semibold text-navy">
            Full name
            <input
              className="auth-control mt-2"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              autoComplete="name"
              required
            />
          </label>
          <label className="block font-body text-caption font-semibold text-navy">
            Email address
            <input
              className="auth-control mt-2 bg-mist"
              value={user.email}
              readOnly
              aria-describedby="email-note"
            />
            <span
              id="email-note"
              className="mt-1 block font-body text-xs font-normal text-navy-muted"
            >
              Email changes require programme support.
            </span>
          </label>
          <label className="block font-body text-caption font-semibold text-navy sm:col-span-2">
            Phone number{" "}
            <span className="font-normal text-navy-muted">(contact only)</span>
            <input
              className="auth-control mt-2"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setSaved(false);
              }}
              autoComplete="tel"
              placeholder="Optional"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

function MfaRecovery({ onError }: { onError: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await submitMfaRecoveryRequest(reason);
      setSubmitted(true);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not start the recovery request.",
      );
    }
  }
  if (submitted)
    return (
      <Card padding="lg">
        <div className="max-w-xl">
          <CheckCircle2 className="text-teal" size={34} />
          <h2 className="mt-4 font-display text-h2 text-navy">
            Request received.
          </h2>
          <p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">
            Programme support will review your request. For your protection,
            access is not restored automatically.
          </p>
          <Button
            className="mt-6"
            variant="tertiary"
            size="sm"
            onClick={() => setSubmitted(false)}
          >
            Submit another request
          </Button>
        </div>
      </Card>
    );
  return (
    <Card padding="lg">
      <div className="max-w-xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning">
          <ShieldAlert size={19} />
        </div>
        <h2 className="mt-4 font-display text-h2 text-navy">
          Can’t use your authenticator?
        </h2>
        <p className="mt-2 font-body text-body-sm leading-6 text-navy-muted">
          Use a recovery code first if you have one. If you no longer have
          access, send a request to programme support. They’ll verify your
          identity before restoring access.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block font-body text-caption font-semibold text-navy">
            What happened?
            <textarea
              className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 font-body text-sm text-navy outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/15"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              placeholder="Tell support why you cannot use your authenticator."
            />
          </label>
          <Button type="submit" size="sm">
            Start recovery request
          </Button>
        </form>
      </div>
    </Card>
  );
}
