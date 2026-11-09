import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Copy, Download, Eye, EyeOff, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import { ApiError, beginMfaSetup, changePassword, disableEmailMfa, enableEmailMfa, getMfaDevices, getSessions, logout, resendEmailVerification, revokeOtherSessions, revokeSession, UserSession, verifyEmailCode, verifyMfaSetup } from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { QRCodeSVG } from "qrcode.react";
import brandMark from "../../assets/brand/logo-icon.svg";
import { useToast } from "../../components/ToastProvider";
import { InlineFeedback } from "../../components/InlineFeedback";

export function AccountSecurity({ user, onSignedOut, onError }: { user: CurrentUser; onSignedOut: () => void; onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
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

  async function loadSessions() {
    setLoading(true);
    setSessionsError(false);
    try { setSessions(await getSessions()); }
    catch (cause) { setSessionsError(true); onError(cause instanceof Error ? cause.message : "Sessions could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadSessions(); }, []);
  useEffect(() => {
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
  }, [mfaStatusAttempt, onError, user.id]);

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
    if (newPassword.length < 12) { setPasswordMessage("Use at least 12 characters for your new password."); return; }
    if (newPassword !== confirmPassword) { setPasswordMessage("The new passwords do not match."); return; }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordMessage("Password changed. Other signed-in devices have been signed out."); pushToast({ kind: "success", title: "Password changed", message: "Other signed-in devices have been signed out." });
      setSessions(await getSessions());
    } catch (cause) {
      setPasswordMessage(cause instanceof ApiError ? cause.message : "The password could not be changed.");
    } finally { setChangingPassword(false); }
  }

  return <div className="mb-8 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <Card padding="lg">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal"><LockKeyhole size={18} /></span><div><p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-navy-muted">Password</p><h2 className="mt-1 font-display text-h2 text-navy">Keep your account secure</h2></div></div>
      <p className="mt-3 font-body text-body-sm leading-6 text-navy-muted">Use a memorable passphrase with at least 12 characters. Changing it signs out other devices.</p>
      {passwordMessage && <p className="mt-4 rounded-xl bg-teal-light px-4 py-3 font-body text-caption text-navy" role="status">{passwordMessage}</p>}
      <form className="mt-5 space-y-4" onSubmit={submitPassword}>
        <label className="block font-body text-caption font-semibold text-navy">Current password<input className="auth-control mt-2" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
        <label className="block font-body text-caption font-semibold text-navy">New password<span className="relative mt-2 block"><input className="auth-control pr-12" type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /><button type="button" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-navy-muted hover:text-teal" onClick={() => setShowNewPassword((value) => !value)} aria-label={showNewPassword ? "Hide new password" : "Show new password"}>{showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        <label className="block font-body text-caption font-semibold text-navy">Confirm new password<input className="auth-control mt-2" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
        <Button type="submit" size="sm" disabled={changingPassword}>{changingPassword ? "Changing…" : "Change password"}</Button>
      </form>
    </Card>
    <Card padding="lg"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-navy-muted">Account security</p><h2 className="mt-1 font-display text-h2 text-navy">Where you’re signed in</h2><p className="mt-2 font-body text-body-sm text-navy-muted">Review devices using your account. Sign out any device you no longer recognise.</p></div><div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-mist/60 p-1"><Button variant="tertiary" size="sm" className="no-underline" onClick={() => void loadSessions()} disabled={busy || loading} aria-label="Refresh signed-in devices"><RefreshCw size={15} className="mr-2" />Refresh</Button><span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" /><Button variant="tertiary" size="sm" className="no-underline text-error hover:text-error" onClick={signOut} disabled={busy}><LogOut size={15} className="mr-2" />Sign out here</Button></div></div>{loading ? <p className="mt-6 font-body text-body-sm text-navy-muted" role="status">Loading signed-in devices…</p> : sessionsError ? <div className="mt-6"><InlineFeedback kind="error" title="Signed-in devices are unavailable"><Button size="sm" variant="tertiary" onClick={() => void loadSessions()}>Try again</Button></InlineFeedback></div> : sessions.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-border p-6"><p className="font-body text-sm font-semibold text-navy">No signed-in devices found.</p><p className="mt-1 font-body text-xs text-navy-muted">Sign in again to add this device.</p></div> : <div className="settings-sessions-list mt-6 space-y-3">{sessions.map((session) => <div key={session.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center"><div><p className="font-body text-body-sm font-semibold text-navy">{session.device}{session.current ? " · This device" : ""}</p><p className="mt-1 font-body text-caption text-navy-muted">Last active {new Date(session.last_seen_at).toLocaleString("en-GB")} · Signs out {new Date(session.expires_at).toLocaleDateString("en-GB")}</p><p className="mt-1 font-body text-[0.68rem] text-navy-muted">{session.ip_address ? `IP ${session.ip_address}` : "IP unavailable"}</p></div>{!session.current && <Button variant="tertiary" size="sm" disabled={busy} onClick={() => setSessionToRevoke(session)}>Sign out this device</Button>}</div>)}</div>}{sessions.filter((session) => !session.current).length > 0 && !sessionsError && <Button className="mt-5" variant="secondary" size="sm" onClick={revokeOthers} disabled={busy}>Sign out all other devices</Button>}{sessionToRevoke && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="revoke-session-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h3 id="revoke-session-title" className="font-display text-xl font-bold text-navy">Sign out this device?</h3><p className="mt-2 font-body text-sm leading-6 text-navy-muted">{sessionToRevoke.device} will be signed out immediately. It can sign in again later.</p><div className="mt-6 flex justify-end gap-3"><Button variant="tertiary" onClick={() => setSessionToRevoke(null)} disabled={busy}>Keep it signed in</Button><Button variant="secondary" onClick={() => void revokeSelected()} disabled={busy}>{busy ? "Signing out…" : "Sign out device"}</Button></div></section></div>}</Card>
    {mfaStatusLoading ? <Card padding="lg" className="xl:col-span-2"><p className="font-body text-sm text-navy-muted" role="status">Checking authenticator settings…</p></Card> : mfaStatusError ? <Card padding="lg" className="xl:col-span-2"><InlineFeedback kind="error" title="Authenticator settings are unavailable"><Button size="sm" variant="tertiary" onClick={() => setMfaStatusAttempt((attempt) => attempt + 1)}>Try again</Button></InlineFeedback></Card> : <MfaSecurityCard user={user} enabled={mfaEnabled} emailEnabled={emailMfaEnabled} emailVerified={emailVerified} setup={mfaSetup} code={mfaCode} recoveryCodes={recoveryCodes} busy={mfaBusy} emailVerificationBusy={emailVerificationBusy} emailVerificationMessage={emailVerificationMessage} emailVerificationCode={emailVerificationCode} onEmailVerificationCodeChange={setEmailVerificationCode} onVerifyEmail={() => void confirmEmailVerification()} onStart={() => void startMfaSetup()} onCodeChange={setMfaCode} onVerify={() => void confirmMfaSetup()} onDownload={downloadRecoveryCodes} onCodesSaved={() => setRecoveryCodes(null)} onToggleEmail={() => void toggleEmailMfa()} onSendEmailVerification={() => void sendEmailVerification()} />}
  </div>;
}

function MfaSecurityCard({ user, enabled, emailEnabled, emailVerified, setup, code, recoveryCodes, busy, emailVerificationBusy, emailVerificationMessage, emailVerificationCode, onEmailVerificationCodeChange, onVerifyEmail, onStart, onCodeChange, onVerify, onDownload, onCodesSaved, onToggleEmail, onSendEmailVerification }: { user: CurrentUser; enabled: boolean; emailEnabled: boolean; emailVerified: boolean; setup: { secret: string; otpauth_uri: string } | null; code: string; recoveryCodes: string[] | null; busy: boolean; emailVerificationBusy: boolean; emailVerificationMessage: string | null; emailVerificationCode: string; onEmailVerificationCodeChange: (value: string) => void; onVerifyEmail: () => void; onStart: () => void; onCodeChange: (value: string) => void; onVerify: () => void; onDownload: () => void; onCodesSaved: () => void; onToggleEmail: () => void; onSendEmailVerification: () => void }) {
  const [codesSaved, setCodesSaved] = useState(false);

  async function copyBackupCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes?.join("\n") ?? "");
    } catch {
      // The download action remains available when clipboard access is blocked.
    }
  }

  return (
    <Card padding="lg" className="xl:col-span-2">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal"><ShieldCheck size={18} /></span>
        <div>
          <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-navy-muted">Authenticator app</p>
          <h2 className="mt-1 font-display text-h2 text-navy">{enabled ? "Authenticator connected" : "Protect sign-in with an authenticator"}</h2>
          <p className="mt-2 max-w-2xl font-body text-body-sm leading-6 text-navy-muted">{enabled ? "Use a code from your authenticator app when you sign in." : `Add an authenticator app for extra sign-in protection. This is optional for your ${user.role === "student" ? "student" : "programme"} role.`}</p>
        </div>
      </div>

      {recoveryCodes ? (
        <section className="mt-5 rounded-xl border border-teal/25 bg-teal-light/40 p-4" aria-labelledby="backup-codes-title">
          <h3 id="backup-codes-title" className="font-body text-sm font-semibold text-navy">Backup codes</h3>
          <p className="mt-1 font-body text-xs leading-5 text-navy-muted">Each code works once. Save these in a private place; they are shown only here and are never sent by email or shown to support staff.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-navy">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="tertiary" onClick={() => void copyBackupCodes()}><Copy size={14} />Copy codes</Button>
            <Button size="sm" variant="tertiary" onClick={onDownload}><Download size={14} />Download codes</Button>
          </div>
          <label className="mt-4 flex items-start gap-3 font-body text-sm text-navy"><input type="checkbox" className="mt-1 h-4 w-4 accent-teal" checked={codesSaved} onChange={(event) => setCodesSaved(event.target.checked)} />I’ve saved these backup codes somewhere private.</label>
          <Button className="mt-4" size="sm" onClick={() => { setCodesSaved(false); onCodesSaved(); }} disabled={!codesSaved}>Done</Button>
        </section>
      ) : setup ? (
        <section className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr]" aria-label="Authenticator setup">
          <div className="rounded-xl border border-border bg-white p-3"><QRCodeSVG value={setup.otpauth_uri} size={176} level="H" includeMargin aria-label="MentorMAMA authenticator setup QR code" imageSettings={{ src: brandMark, width: 32, height: 32, excavate: true }} /></div>
          <div className="min-w-0">
            <p className="font-body text-sm font-semibold text-navy">1. Open your authenticator app and scan this MentorMAMA code.</p>
            <p className="mt-1 font-body text-sm leading-6 text-navy-muted">Keep this page open while you set it up.</p>
            <details className="mt-4 rounded-xl border border-border bg-mist/50 p-3">
              <summary className="cursor-pointer font-body text-sm font-semibold text-teal">Can’t scan? Use a setup key</summary>
              <p className="mt-3 break-all font-mono text-xs text-navy">{setup.secret}</p>
              <p className="mt-2 font-body text-xs leading-5 text-navy-muted">Keep this key private. Anyone who has it could create sign-in codes for your account.</p>
            </details>
            <p className="mt-4 font-body text-sm font-semibold text-navy">2. Enter the six-digit code from your app.</p>
            <label className="mt-3 block max-w-xs font-body text-sm font-semibold text-navy">Authenticator sign-in code<input className="auth-control mt-2 text-center font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
            <Button className="mt-3" size="sm" onClick={onVerify} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Connect authenticator"}</Button>
          </div>
        </section>
      ) : !enabled ? (
        <Button className="mt-5" size="sm" onClick={onStart} disabled={busy}>{busy ? "Starting setup…" : "Set up authenticator app"}</Button>
      ) : null}

      {enabled && (
        <section className="mt-6 rounded-xl border border-border bg-mist/50 p-4" aria-labelledby="email-backup-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 id="email-backup-title" className="font-body text-sm font-semibold text-navy">Email backup</h3><p className="mt-1 font-body text-xs leading-5 text-navy-muted">Use a one-time sign-in code sent to your verified email if your authenticator is unavailable.</p></div>
            {emailVerified ? <Button size="sm" variant="tertiary" onClick={onToggleEmail} disabled={busy}>{emailEnabled ? "Turn off email backup" : "Turn on email backup"}</Button> : <span className="rounded-full bg-amber-50 px-2.5 py-1 font-body text-xs font-semibold text-amber-700">Email not verified</span>}
          </div>
          {!emailVerified && <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"><label className="font-body text-xs font-semibold text-navy">Email verification code<input className="auth-control mt-1" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={emailVerificationCode} onChange={(event) => onEmailVerificationCodeChange(event.target.value.replace(/\D/g, ""))} placeholder="Enter six-digit code" /></label><Button size="sm" variant="tertiary" onClick={onSendEmailVerification} disabled={emailVerificationBusy}>{emailVerificationBusy ? "Sending…" : "Send again"}</Button><Button size="sm" onClick={onVerifyEmail} disabled={emailVerificationBusy || emailVerificationCode.length !== 6}>{emailVerificationBusy ? "Checking…" : "Verify email"}</Button></div>}
          {emailVerificationMessage && <p className="mt-3 font-body text-xs font-semibold text-teal" role="status">{emailVerificationMessage}</p>}
        </section>
      )}
    </Card>
  );
}
