import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  Laptop,
  Loader2,
  LockKeyhole,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  Circle,
} from "lucide-react";
import { ApiError, beginMfaSetup, changePassword, disableEmailMfa, enableEmailMfa, getMfaDevices, getSessions, logout, resendEmailVerification, revokeOtherSessions, revokeSession, UserSession, verifyEmailCode, verifyMfaSetup } from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { QRCodeSVG } from "qrcode.react";
import brandMark from "../../assets/brand/logo-icon.svg";
import { useToast } from "../../components/ToastProvider";
import { InlineFeedback } from "../../components/InlineFeedback";
import { Field, Modal, PasswordInput, TextInput } from "../../components/kit";
import { AdminButton, AdminCard, EmptyState, ListRow, StatusPill } from "../programme-admin/ui/AdminKit";
import "./account-settings.css";

const strengthLabels = ["", "Too short", "Acceptable", "Good", "Strong"];

/** The server rule is at least 12 characters; mix and symbols only raise the meter. */
function passwordStrength(value: string) {
  const long = value.length >= 12;
  const mixed = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const numberOrSymbol = /[0-9]/.test(value) || /[^A-Za-z0-9]/.test(value);
  const level = value.length === 0 ? 0 : !long ? 1 : 2 + (mixed ? 1 : 0) + (numberOrSymbol ? 1 : 0);
  return { long, mixed, numberOrSymbol, level };
}

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-GB");
}

function deviceIcon(device: string) {
  const value = device.toLowerCase();
  if (/ipad|tablet/.test(value)) return <Tablet />;
  if (/iphone|android|mobile|phone/.test(value)) return <Smartphone />;
  return <Laptop />;
}

export function AccountSecurity({ user, onSignedOut, onError, view = "all" }: { user: CurrentUser; onSignedOut: () => void; onError: (message: string) => void; view?: "all" | "devices" }) {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<UserSession | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaStatusLoading, setMfaStatusLoading] = useState(true);
  const [mfaStatusError, setMfaStatusError] = useState(false);
  const [mfaStatusAttempt, setMfaStatusAttempt] = useState(0);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [emailMfaEnabled, setEmailMfaEnabled] = useState(false);
  const [emailVerificationBusy, setEmailVerificationBusy] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState<string | null>(null);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerified, setEmailVerified] = useState(Boolean(user.email_verified));
  const showSecurity = view === "all";

  async function loadSessions() {
    setLoading(true);
    setSessionsError(false);
    try { setSessions(await getSessions()); }
    catch (cause) { setSessionsError(true); onError(cause instanceof Error ? cause.message : "Sessions could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadSessions(); }, []);
  useEffect(() => {
    if (!showSecurity) return;
    let active = true;
    setMfaStatusLoading(true);
    setMfaStatusError(false);
    void getMfaDevices()
      .then((devices) => {
        if (!active) return;
        setMfaEnabled(devices.some((device) => device.type === "totp"));
        setEmailMfaEnabled(devices.some((device) => device.type === "email"));
      })
      .catch((cause) => {
        if (!active) return;
        setMfaStatusError(true);
        onError(cause instanceof Error ? cause.message : "Authenticator status could not be loaded.");
      })
      .finally(() => { if (active) setMfaStatusLoading(false); });
    return () => { active = false; };
  }, [mfaStatusAttempt, onError, user.id, showSecurity]);

  async function startMfaSetup() {
    setMfaBusy(true);
    try { setMfaSetup(await beginMfaSetup()); setRecoveryCodes(null); pushToast({ kind: "success", title: "Authenticator setup started", message: "Scan the MentorMAMA code and confirm it with a sign-in code." }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Authenticator setup could not start."); }
    finally { setMfaBusy(false); }
  }

  async function confirmMfaSetup() {
    setMfaBusy(true);
    try { setRecoveryCodes(await verifyMfaSetup(mfaCode)); setMfaEnabled(true); setMfaSetup(null); setMfaCode(""); pushToast({ kind: "success", title: "Authenticator connected", message: "Your account is protected by an authenticator app." }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "The authenticator code was not accepted."); }
    finally { setMfaBusy(false); }
  }

  async function toggleEmailMfa() {
    setMfaBusy(true);
    try {
      if (emailMfaEnabled) { await disableEmailMfa(); setEmailMfaEnabled(false); pushToast({ kind: "success", title: "Email backup turned off", message: "Email codes are no longer available as a backup sign-in option." }); }
      else { await enableEmailMfa(); setEmailMfaEnabled(true); pushToast({ kind: "success", title: "Email backup turned on", message: "You can use a one-time email code if your authenticator is unavailable." }); }
    } catch (cause) { onError(cause instanceof Error ? cause.message : "The email backup option could not be updated."); }
    finally { setMfaBusy(false); }
  }

  async function sendEmailVerification() {
    setEmailVerificationBusy(true);
    setEmailVerificationMessage(null);
    try {
      await resendEmailVerification();
      setEmailVerificationMessage(`A verification email has been sent to ${user.email}.`); pushToast({ kind: "success", title: "Verification email sent", message: `Check ${user.email} for your six-digit code.` });
    } catch (cause) {
      setEmailVerificationMessage(cause instanceof Error ? cause.message : "The verification email could not be sent.");
    } finally { setEmailVerificationBusy(false); }
  }

  async function confirmEmailVerification() {
    setEmailVerificationBusy(true);
    setEmailVerificationMessage(null);
    try {
      await verifyEmailCode(emailVerificationCode);
      setEmailVerified(true);
      setEmailVerificationCode("");
      setEmailVerificationMessage("Email verified. You can now turn on email backup."); pushToast({ kind: "success", title: "Email verified", message: "You can now turn on email backup." });
    } catch (cause) {
      setEmailVerificationMessage(cause instanceof Error ? cause.message : "That verification code could not be accepted.");
    } finally { setEmailVerificationBusy(false); }
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes) return;
    const url = URL.createObjectURL(new Blob([recoveryCodes.join("\n")], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = "mentormama-recovery-codes.txt"; link.click(); URL.revokeObjectURL(url);
  }

  async function signOut() {
    setBusy(true);
    try { await logout(); onSignedOut(); } catch (cause) { onError(cause instanceof Error ? cause.message : "We could not sign you out."); } finally { setBusy(false); }
  }

  async function revokeOthers() {
    setBusy(true);
    try { await revokeOtherSessions(); setSessions(await getSessions()); pushToast({ kind: "success", title: "Sessions revoked", message: "All other active sessions have been signed out." }); } catch (cause) { onError(cause instanceof Error ? cause.message : "Other sessions could not be revoked."); } finally { setBusy(false); }
  }

  async function revokeSelected() {
    if (!sessionToRevoke) return;
    setBusy(true);
    try { await revokeSession(sessionToRevoke.id); setSessions((current) => current.filter((item) => item.id !== sessionToRevoke.id)); setSessionToRevoke(null); pushToast({ kind: "success", title: "Session revoked", message: "The selected device has been signed out." }); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "The session could not be revoked."); }
    finally { setBusy(false); }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 12) { setPasswordMessage({ text: "Use at least 12 characters for your new password.", ok: false }); return; }
    if (newPassword !== confirmPassword) { setPasswordMessage({ text: "The new passwords do not match.", ok: false }); return; }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordMessage({ text: "Password changed. Other signed-in devices have been signed out.", ok: true }); pushToast({ kind: "success", title: "Password changed", message: "Other signed-in devices have been signed out." });
      setSessions(await getSessions());
    } catch (cause) {
      setPasswordMessage({ text: cause instanceof ApiError ? cause.message : "The password could not be changed.", ok: false });
    } finally { setChangingPassword(false); }
  }

  const otherSessions = sessions.filter((session) => !session.current);
  const strength = passwordStrength(newPassword);
  const passwordDirty = Boolean(currentPassword || newPassword || confirmPassword);

  return (
    <div className="acct-stack">
      {showSecurity && (
        <AdminCard
          title="Password"
          description="Use a memorable passphrase with at least 12 characters. Changing it signs out other devices."
          titleId="password-title"
          action={<span className="pa-tile pa-tile--sm pa-tile--teal" aria-hidden="true"><LockKeyhole /></span>}
        >
          {passwordMessage && (
            <p className={`acct-message mb-4${passwordMessage.ok ? "" : " acct-message--error"}`} role={passwordMessage.ok ? "status" : "alert"}>
              {passwordMessage.ok ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
              {passwordMessage.text}
            </p>
          )}
          <form className="acct-form" onSubmit={submitPassword}>
            <Field label="Current password" required>
              <PasswordInput value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
            </Field>
            <Field label="New password" required>
              <PasswordInput value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
            </Field>
            <PasswordStrength value={newPassword} confirm={confirmPassword} strength={strength} />
            <Field label="Confirm new password" required>
              <PasswordInput value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </Field>
            <div className="acct-form__actions">
              <AdminButton type="submit" disabled={changingPassword} aria-busy={changingPassword} icon={changingPassword ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}>
                {changingPassword ? "Changing…" : "Change password"}
              </AdminButton>
              {passwordDirty && !changingPassword && <StatusPill tone="warning">Unsaved changes</StatusPill>}
            </div>
          </form>
        </AdminCard>
      )}

      {showSecurity && (mfaStatusLoading ? (
        <AdminCard title="Authenticator app" titleId="mfa-title"><p className="acct-muted" role="status">Checking authenticator settings…</p></AdminCard>
      ) : mfaStatusError ? (
        <AdminCard title="Authenticator app" titleId="mfa-title">
          <InlineFeedback kind="error" title="Authenticator settings are unavailable">
            <AdminButton size="sm" variant="secondary" onClick={() => setMfaStatusAttempt((attempt) => attempt + 1)}>Try again</AdminButton>
          </InlineFeedback>
        </AdminCard>
      ) : (
        <MfaSecurityCard user={user} enabled={mfaEnabled} emailEnabled={emailMfaEnabled} emailVerified={emailVerified} setup={mfaSetup} code={mfaCode} recoveryCodes={recoveryCodes} busy={mfaBusy} emailVerificationBusy={emailVerificationBusy} emailVerificationMessage={emailVerificationMessage} emailVerificationCode={emailVerificationCode} onEmailVerificationCodeChange={setEmailVerificationCode} onVerifyEmail={() => void confirmEmailVerification()} onStart={() => void startMfaSetup()} onCodeChange={setMfaCode} onVerify={() => void confirmMfaSetup()} onDownload={downloadRecoveryCodes} onCodesSaved={() => setRecoveryCodes(null)} onToggleEmail={() => void toggleEmailMfa()} onSendEmailVerification={() => void sendEmailVerification()} />
      ))}

      <AdminCard
        title="Active sessions"
        description="Review devices using your account. Sign out any device you no longer recognise."
        titleId="sessions-title"
        flush
        action={
          <AdminButton variant="ghost" size="sm" onClick={() => void loadSessions()} disabled={busy || loading} aria-label="Refresh signed-in devices" icon={<RefreshCw className={loading ? "acct-spin" : undefined} aria-hidden="true" />}>
            Refresh
          </AdminButton>
        }
        footer={
          otherSessions.length > 0 && !sessionsError ? (
            <>
              <span>{otherSessions.length} other {otherSessions.length === 1 ? "device is" : "devices are"} signed in.</span>
              <AdminButton variant="secondary" size="sm" onClick={() => void revokeOthers()} disabled={busy} aria-busy={busy} icon={busy ? <Loader2 className="acct-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}>
                Sign out all other devices
              </AdminButton>
            </>
          ) : undefined
        }
      >
        {loading ? (
          <div className="acct-stack p-4" role="status" aria-label="Loading signed-in devices"><div className="acct-skeleton" /><div className="acct-skeleton" /></div>
        ) : sessionsError ? (
          <div className="p-4">
            <InlineFeedback kind="error" title="Signed-in devices are unavailable">
              <AdminButton size="sm" variant="secondary" onClick={() => void loadSessions()}>Try again</AdminButton>
            </InlineFeedback>
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState icon={<MonitorSmartphone />} title="No signed-in devices found." text="Sign in again to add this device." />
        ) : (
          <div className="settings-sessions-list">
            {sessions.map((session) => (
              <ListRow
                key={session.id}
                icon={deviceIcon(session.device)}
                tone={session.current ? "teal" : "slate"}
                title={<>{session.device}{session.current && <StatusPill tone="teal">This device</StatusPill>}</>}
                meta={<>{session.ip_address ? `IP ${session.ip_address}` : "IP unavailable"} · Last active <span title={new Date(session.last_seen_at).toLocaleString("en-GB")}>{relativeTime(session.last_seen_at)}</span> · Signs out {new Date(session.expires_at).toLocaleDateString("en-GB")}</>}
                trailing={
                  session.current ? (
                    <AdminButton variant="secondary" size="sm" onClick={() => void signOut()} disabled={busy} icon={<LogOut aria-hidden="true" />}>Sign out here</AdminButton>
                  ) : (
                    <AdminButton variant="secondary" size="sm" disabled={busy} onClick={() => setSessionToRevoke(session)} aria-label={`Sign out ${session.device}`}>Sign out</AdminButton>
                  )
                }
              />
            ))}
          </div>
        )}
      </AdminCard>

      <Modal
        open={sessionToRevoke !== null}
        onClose={() => setSessionToRevoke(null)}
        size="sm"
        title="Sign out this device?"
        description={sessionToRevoke ? `${sessionToRevoke.device} will be signed out immediately. It can sign in again later.` : undefined}
        icon={<LogOut />}
        dismissible={!busy}
        footer={
          <>
            <AdminButton variant="ghost" onClick={() => setSessionToRevoke(null)} disabled={busy}>Keep it signed in</AdminButton>
            <AdminButton variant="primary" onClick={() => void revokeSelected()} disabled={busy} aria-busy={busy} icon={busy ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}>
              {busy ? "Signing out…" : "Sign out device"}
            </AdminButton>
          </>
        }
      >
        <p className="acct-help">You can sign in again from that device at any time.</p>
      </Modal>
    </div>
  );
}

function PasswordStrength({ value, confirm, strength }: { value: string; confirm: string; strength: ReturnType<typeof passwordStrength> }) {
  const matches = confirm.length > 0 && value === confirm;
  return (
    <div className="acct-meter" data-level={strength.level} aria-live="polite">
      <div className="acct-meter__head">
        <span>Password strength</span>
        <span>{strengthLabels[strength.level] || "Not entered"}</span>
      </div>
      <div className="acct-meter__bar" aria-hidden="true"><span className="acct-meter__seg" /><span className="acct-meter__seg" /><span className="acct-meter__seg" /><span className="acct-meter__seg" /></div>
      <ul className="acct-checks" aria-label="Password requirements">
        <Check met={strength.long}>At least 12 characters</Check>
        <Check met={matches}>New passwords match</Check>
        <Check met={strength.mixed} optional>Upper and lowercase letters</Check>
        <Check met={strength.numberOrSymbol} optional>A number or symbol</Check>
      </ul>
    </div>
  );
}

function Check({ met, optional, children }: { met: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <li className={`acct-check${met ? " is-met" : ""}`}>
      {met ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
      <span>{children}<span className="sr-only">{met ? " — met" : " — not met"}</span></span>
      {optional && <span className="acct-check__tag">Recommended</span>}
    </li>
  );
}

function MfaSecurityCard({ user, enabled, emailEnabled, emailVerified, setup, code, recoveryCodes, busy, emailVerificationBusy, emailVerificationMessage, emailVerificationCode, onEmailVerificationCodeChange, onVerifyEmail, onStart, onCodeChange, onVerify, onDownload, onCodesSaved, onToggleEmail, onSendEmailVerification }: { user: CurrentUser; enabled: boolean; emailEnabled: boolean; emailVerified: boolean; setup: { secret: string; otpauth_uri: string } | null; code: string; recoveryCodes: string[] | null; busy: boolean; emailVerificationBusy: boolean; emailVerificationMessage: string | null; emailVerificationCode: string; onEmailVerificationCodeChange: (value: string) => void; onVerifyEmail: () => void; onStart: () => void; onCodeChange: (value: string) => void; onVerify: () => void; onDownload: () => void; onCodesSaved: () => void; onToggleEmail: () => void; onSendEmailVerification: () => void }) {
  const [codesSaved, setCodesSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyBackupCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes?.join("\n") ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The download action remains available when clipboard access is blocked.
    }
  }

  return (
    <AdminCard
      title={enabled ? "Authenticator connected" : "Protect sign-in with an authenticator"}
      description={enabled ? "Use a code from your authenticator app when you sign in." : `Add an authenticator app for extra sign-in protection. This is optional for your ${user.role === "student" ? "student" : "programme"} role.`}
      titleId="mfa-title"
      action={<StatusPill tone={enabled ? "success" : "neutral"}>{enabled ? "Connected" : "Not set up"}</StatusPill>}
    >
      <div className="acct-stack">
        {recoveryCodes ? (
          <section className="acct-panel" aria-labelledby="backup-codes-title">
            <h4 id="backup-codes-title" className="acct-panel__title">Backup codes</h4>
            <p className="acct-muted mt-1">Each code works once. Save these in a private place; they are shown only here and are never sent by email or shown to support staff.</p>
            <div className="acct-codes">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminButton size="sm" variant="secondary" onClick={() => void copyBackupCodes()} icon={copied ? <CheckCircle2 aria-hidden="true" /> : <Copy aria-hidden="true" />}>{copied ? "Copied" : "Copy codes"}</AdminButton>
              <AdminButton size="sm" variant="secondary" onClick={onDownload} icon={<Download aria-hidden="true" />}>Download codes</AdminButton>
            </div>
            <label className="acct-checkbox mt-4"><input type="checkbox" checked={codesSaved} onChange={(event) => setCodesSaved(event.target.checked)} />I’ve saved these backup codes somewhere private.</label>
            <AdminButton className="mt-4" size="sm" onClick={() => { setCodesSaved(false); onCodesSaved(); }} disabled={!codesSaved}>Done</AdminButton>
          </section>
        ) : setup ? (
          <section className="acct-setup" aria-label="Authenticator setup">
            <div className="acct-qr"><QRCodeSVG value={setup.otpauth_uri} size={168} level="H" includeMargin aria-label="MentorMAMA authenticator setup QR code" imageSettings={{ src: brandMark, width: 32, height: 32, excavate: true }} /></div>
            <div className="min-w-0">
              <p className="acct-panel__title">1. Open your authenticator app and scan this MentorMAMA code.</p>
              <p className="acct-muted mt-1">Keep this page open while you set it up.</p>
              <details className="acct-panel acct-details mt-3">
                <summary>Can’t scan? Use a setup key</summary>
                <p className="mt-3 break-all font-mono text-xs text-navy">{setup.secret}</p>
                <p className="acct-muted mt-2">Keep this key private. Anyone who has it could create sign-in codes for your account.</p>
              </details>
              <p className="acct-panel__title mt-4">2. Enter the six-digit code from your app.</p>
              <div className="mt-2">
                <Field label="Authenticator sign-in code">
                  <TextInput className="acct-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, ""))} placeholder="000000" />
                </Field>
              </div>
              <AdminButton className="mt-3" size="sm" onClick={onVerify} disabled={busy || code.length !== 6} aria-busy={busy} icon={busy ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}>{busy ? "Checking…" : "Connect authenticator"}</AdminButton>
            </div>
          </section>
        ) : !enabled ? (
          <div>
            <AdminButton onClick={onStart} disabled={busy} aria-busy={busy} icon={busy ? <Loader2 className="acct-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}>{busy ? "Starting setup…" : "Set up authenticator app"}</AdminButton>
          </div>
        ) : null}

        {enabled && (
          <section className="acct-panel" aria-labelledby="email-backup-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 id="email-backup-title" className="acct-panel__title">Email backup</h4>
                <p className="acct-muted mt-1">Use a one-time sign-in code sent to your verified email if your authenticator is unavailable.</p>
              </div>
              {emailVerified ? <AdminButton size="sm" variant="secondary" onClick={onToggleEmail} disabled={busy}>{emailEnabled ? "Turn off email backup" : "Turn on email backup"}</AdminButton> : <StatusPill tone="warning">Email not verified</StatusPill>}
            </div>
            {!emailVerified && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <Field label="Email verification code">
                  <TextInput inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={emailVerificationCode} onChange={(event) => onEmailVerificationCodeChange(event.target.value.replace(/\D/g, ""))} placeholder="Enter six-digit code" />
                </Field>
                <AdminButton variant="secondary" onClick={onSendEmailVerification} disabled={emailVerificationBusy}>{emailVerificationBusy ? "Sending…" : "Send again"}</AdminButton>
                <AdminButton onClick={onVerifyEmail} disabled={emailVerificationBusy || emailVerificationCode.length !== 6}>{emailVerificationBusy ? "Checking…" : "Verify email"}</AdminButton>
              </div>
            )}
            {emailVerificationMessage && <p className="mt-3 text-xs font-semibold text-[var(--pa-teal-ink)]" role="status">{emailVerificationMessage}</p>}
          </section>
        )}
      </div>
    </AdminCard>
  );
}
