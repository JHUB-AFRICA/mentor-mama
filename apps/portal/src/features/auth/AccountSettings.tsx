import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  Bell,
  CheckCircle2,
  CircleHelp,
  CircleUserRound,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import {
  ApiError,
  getMfaDevices,
  getSessions,
  submitMfaRecoveryRequest,
  updateProfile,
} from "../../services/api";
import type { CurrentUser, StudentProfile, UserSession } from "../../services/api";
import { AccountSecurity } from "./AccountSecurity";
import { NotificationPreferences } from "./NotificationPreferences";
import { useToast } from "../../components/ToastProvider";
import { StudentProfileSettings } from "./StudentProfileSettings";
import { MentorProfileSettings } from "./MentorProfileSettings";
import { PrivacyAndData } from "./PrivacyAndData";
import { Field, FieldRow, SelectInput, TextArea, TextInput } from "../../components/kit";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  ListRow,
  StatusPill,
} from "../programme-admin/ui/AdminKit";
import "./account-settings.css";

type SettingsTab =
  | "overview"
  | "security"
  | "profile"
  | "notifications"
  | "preferences"
  | "devices"
  | "support"
  | "privacy"
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
    value === "privacy" ||
    value === "security" ||
    value === "profile" ||
    value === "notifications" ||
    value === "recovery"
  );
}

const navItems: Array<{
  value: SettingsTab;
  label: string;
  description: string;
  Icon: typeof Bell;
}> = [
  { value: "overview", label: "Account overview", description: "Your identity and access", Icon: CircleUserRound },
  { value: "profile", label: "Profile", description: "Name and contact details", Icon: UserRound },
  { value: "security", label: "Security", description: "Password, authenticator, codes", Icon: KeyRound },
  { value: "devices", label: "Connected devices", description: "Where you’re signed in", Icon: MonitorSmartphone },
  { value: "notifications", label: "Notifications", description: "Choose what reaches you", Icon: Bell },
  { value: "preferences", label: "Preferences", description: "Language, zone and theme", Icon: SlidersHorizontal },
  { value: "privacy", label: "Privacy and data", description: "Correct or ask about your information", Icon: ShieldCheck },
  { value: "support", label: "Support", description: "Help and account recovery", Icon: CircleHelp },
];

/** Recovery is a deep-link alias of the Support section. */
function navTabFor(tab: SettingsTab): SettingsTab {
  return tab === "recovery" ? "support" : tab;
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
  const reduceMotion = useReducedMotion() ?? false;
  useEffect(() => setTab(safeInitialTab), [safeInitialTab]);
  function selectTab(next: SettingsTab) {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  }
  if (profileOnly) {
    return (
      <AdminPage className="acct">
        <section aria-label="Student profile" className="acct-stack">
          <AdminPageHeader
            eyebrow="Personal learning record"
            title="Your student profile"
            description="Keep your identity, programme details, and emergency contact ready so your institution can support you throughout placement."
          />
          <div className="acct-content">
            <ProfileSettings user={user} onUserUpdated={onUserUpdated} onError={onError} />
            <StudentProfileSettings onError={onError} onComplete={onStudentProfileComplete} />
          </div>
        </section>
      </AdminPage>
    );
  }
  const activeNav = navTabFor(tab);
  return (
    <AdminPage className="acct">
      <section aria-label="Account settings" className="settings-page acct-stack">
        <StickyHeader>
          <AdminPageHeader
            eyebrow="Account"
            title="Settings"
            description="Manage your profile, sign-in security, notifications, and preferences in one place."
          />
        </StickyHeader>
        <div className="acct-layout">
          <nav className="acct-nav" aria-label="Settings sections">
            {navItems.filter((item) => item.value !== "privacy" || user.capabilities?.submit_data_request).map(({ value, label, description, Icon }) => (
              <button
                key={value}
                type="button"
                className={`acct-nav__item${activeNav === value ? " is-active" : ""}`}
                aria-current={activeNav === value ? "page" : undefined}
                onClick={() => selectTab(value)}
              >
                <span className="acct-nav__icon" aria-hidden="true"><Icon /></span>
                <span>
                  <span className="acct-nav__label">{label}</span>
                  <span className="acct-nav__desc">{description}</span>
                </span>
              </button>
            ))}
          </nav>
            <motion.div
              key={activeNav}
              className="acct-content"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
            >
              {tab === "overview" && <SettingsOverview user={user} onEdit={() => selectTab("profile")} onSelect={selectTab} />}
              {tab === "security" && <AccountSecurity user={user} onSignedOut={onSignedOut} onError={onError} />}
              {tab === "devices" && <AccountSecurity user={user} onSignedOut={onSignedOut} onError={onError} view="devices" />}
              {tab === "profile" && (
                <>
                  <ProfileSettings user={user} onUserUpdated={onUserUpdated} onError={onError} />
                  {user.role === "student" && <StudentProfileSettings onError={onError} onComplete={onStudentProfileComplete} />}
                  {user.role === "mentor" && <MentorProfileSettings onError={onError} />}
                </>
              )}
              {tab === "notifications" && <NotificationPreferences onError={onError} />}
              {tab === "preferences" && <PreferencesPanel />}
              {tab === "privacy" && <PrivacyAndData onError={onError} />}
              {(tab === "support" || tab === "recovery") && <MfaRecovery onError={onError} />}
            </motion.div>
        </div>
      </section>
    </AdminPage>
  );
}

/** Page title block. It scrolls with the page; only the portal header is sticky. */
function StickyHeader({ children }: { children: ReactNode }) {
  return <div className="acct-sticky">{children}</div>;
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
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
  const [mfa, setMfa] = useState<"loading" | "on" | "off" | "unknown">("loading");
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  useEffect(() => {
    let active = true;
    getMfaDevices()
      .then((devices) => {
        if (active) setMfa(devices.some((device) => device.type === "totp") ? "on" : "off");
      })
      .catch(() => { if (active) setMfa("unknown"); });
    getSessions()
      .then((result) => { if (active) setSessions(result); })
      .catch(() => { if (active) setSessions([]); });
    return () => { active = false; };
  }, [user.id]);
  const current = sessions?.find((session) => session.current);
  const scope = user.scope?.institution_name ?? (user.scope?.program_id ? "Assigned programme" : "Not assigned");
  return (
    <>
      <AdminCard
        title="Account overview"
        description="Your basic information and programme access."
        titleId="overview-title"
        action={<AdminButton variant="secondary" size="sm" onClick={onEdit}>Edit profile</AdminButton>}
      >
        <div className="acct-identity">
          <span className="acct-avatar" aria-hidden="true">{initialsOf(user.name)}</span>
          <div className="min-w-0">
            <p className="acct-identity__name">{user.name}</p>
            <p className="acct-identity__email">{user.email}</p>
          </div>
        </div>
        <dl className="acct-facts">
          <div><dt>Role</dt><dd>{accountRoleLabel(user.role)}</dd></div>
          <div><dt>Scope</dt><dd>{scope}</dd></div>
          <div><dt>Account status</dt><dd><StatusPill tone="success">Active</StatusPill></dd></div>
          <div>
            <dt>Multi-factor authentication</dt>
            <dd>
              {mfa === "loading" ? "Checking…" : mfa === "unknown" ? "Unavailable" : (
                <StatusPill tone={mfa === "on" ? "success" : "neutral"}>{mfa === "on" ? "Authenticator on" : "Not set up"}</StatusPill>
              )}
            </dd>
          </div>
          <div><dt>Phone</dt><dd>{user.phone || "Not added"}</dd></div>
          <div>
            <dt>This session started</dt>
            <dd>{sessions === null ? "Checking…" : current ? new Date(current.created_at).toLocaleString("en-GB") : "Not available"}</dd>
          </div>
        </dl>
      </AdminCard>
      <AdminCard title="Manage your account" description="Jump to the settings you use most." titleId="overview-links-title" flush>
        <ListRow icon={<KeyRound />} title="Security" meta="Password, authenticator app, and backup codes" onClick={() => onSelect("security")} />
        <ListRow icon={<MonitorSmartphone />} tone="blue" title="Connected devices" meta="Review and sign out devices" onClick={() => onSelect("devices")} />
        <ListRow icon={<Bell />} tone="amber" title="Notifications" meta="Email and programme updates" onClick={() => onSelect("notifications")} />
        <ListRow icon={<SlidersHorizontal />} tone="violet" title="Preferences" meta="Language, time zone, and theme" onClick={() => onSelect("preferences")} />
        {user.capabilities?.submit_data_request && <ListRow icon={<ShieldCheck />} tone="green" title="Privacy and data" meta="Correct your information or ask what we hold" onClick={() => onSelect("privacy")} />}
        <ListRow icon={<CircleHelp />} tone="slate" title="Support" meta="Request account recovery" onClick={() => onSelect("support")} />
      </AdminCard>
    </>
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
    <AdminCard
      title="Personalize your experience"
      description="These preferences are saved for this browser and applied to your programme workspace."
      titleId="preferences-title"
    >
      <div className="acct-form">
        <Field label="Language">
          <SelectInput value={language} onChange={(event) => save("mentor-mama-language", event.target.value, setLanguage)}>
            <option>English (UK)</option>
            <option>English (US)</option>
          </SelectInput>
        </Field>
        <Field label="Time zone">
          <SelectInput value={timezone} onChange={(event) => save("mentor-mama-timezone", event.target.value, setTimezone)}>
            <option>(GMT+03:00) Nairobi</option>
            <option>(GMT+00:00) London</option>
            <option>(GMT+01:00) Lagos</option>
          </SelectInput>
        </Field>
        <Field label="Theme">
          <SelectInput value={theme} onChange={(event) => save("mentor-mama-theme", event.target.value, setTheme)}>
            <option>System default</option>
            <option>Light</option>
            <option>Dark</option>
          </SelectInput>
        </Field>
      </div>
    </AdminCard>
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
  const dirty = name !== user.name || phone !== (user.phone ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const [firstName, ...lastNameParts] = name.trim().split(/\s+/);
      const updated = await updateProfile({
        first_name: firstName,
        last_name: lastNameParts.join(" "),
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
    <AdminCard
      title="Your account details"
      description="Keep your contact details current. Your email, role, and programme access are managed by the programme team."
      titleId="profile-title"
      action={dirty ? <StatusPill tone="warning">Unsaved changes</StatusPill> : undefined}
    >
      {saved && !dirty && (
        <p className="acct-message mb-4" role="status">
          <CheckCircle2 aria-hidden="true" />
          Changes saved for this profile.
        </p>
      )}
      <form className="acct-form" onSubmit={submit}>
        <FieldRow>
          <Field label="Full name" required>
            <TextInput
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Email address" hint="Email changes require programme support.">
            <TextInput value={user.email} readOnly className="bg-[#f8fafb]" />
          </Field>
        </FieldRow>
        <Field label="Phone number" optional hint="Used for contact only.">
          <TextInput
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSaved(false);
            }}
            autoComplete="tel"
            placeholder="Optional"
          />
        </Field>
        <div className="acct-form__actions">
          <AdminButton type="submit" disabled={saving} aria-busy={saving} icon={saving ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}>
            {saving ? "Saving…" : "Save changes"}
          </AdminButton>
          {dirty && !saving && (
            <AdminButton variant="ghost" onClick={() => { setName(user.name); setPhone(user.phone ?? ""); }}>
              Discard
            </AdminButton>
          )}
        </div>
      </form>
    </AdminCard>
  );
}

function MfaRecovery({ onError }: { onError: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      await submitMfaRecoveryRequest(reason);
      setSubmitted(true);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not start the recovery request.",
      );
    } finally {
      setSending(false);
    }
  }
  if (submitted)
    return (
      <AdminCard title="Request received." titleId="recovery-title">
        <p className="acct-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          Programme support will review your request. For your protection, access is not restored automatically.
        </p>
        <AdminButton className="mt-4" variant="secondary" size="sm" onClick={() => setSubmitted(false)}>
          Submit another request
        </AdminButton>
      </AdminCard>
    );
  return (
    <AdminCard
      title="Can’t use your authenticator?"
      description="Use a recovery code first if you have one. If you no longer have access, send a request to programme support. They’ll verify your identity before restoring access."
      titleId="recovery-title"
      action={<span className="pa-tile pa-tile--sm pa-tile--amber" aria-hidden="true"><ShieldAlert /></span>}
    >
      <form className="acct-form" onSubmit={submit}>
        <Field label="What happened?" required>
          <TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            placeholder="Tell support why you cannot use your authenticator."
          />
        </Field>
        <div className="acct-form__actions">
          <AdminButton type="submit" disabled={sending} aria-busy={sending} icon={sending ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}>
            {sending ? "Sending…" : "Start recovery request"}
          </AdminButton>
          {reason.trim() && !sending && <StatusPill tone="warning">Not sent yet</StatusPill>}
        </div>
      </form>
    </AdminCard>
  );
}
