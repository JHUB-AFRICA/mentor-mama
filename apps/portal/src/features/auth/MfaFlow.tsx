import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Copy, Download, ShieldCheck, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@mentormama/ui";
import { InlineFeedback } from "../../components/InlineFeedback";
import brandMark from "../../assets/brand/logo-icon.svg";
import {
  beginMfaSetup,
  getCurrentUser,
  submitMfaRecoveryRequest,
  requestEmailMfaChallenge,
  verifyEmailMfa,
  verifyMfa,
  verifyMfaSetup,
} from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { AuthLayout } from "./AuthLayout";

export function MfaFlow({
  setupRequired,
  emailMfaAvailable,
  recoveryContact,
  onComplete,
  onError,
}: {
  setupRequired: boolean;
  emailMfaAvailable: boolean;
  recoveryContact?: "programme_admin" | "another_program_admin" | "support";
  onComplete: (user: CurrentUser) => void;
  onError: (message: string) => void;
}) {
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupKeyCopied, setSetupKeyCopied] = useState(false);
  const [code, setCode] = useState("");
  const [factor, setFactor] = useState<"totp" | "email">("totp");
  const [usingBackupCode, setUsingBackupCode] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const recoveryTriggerRef = useRef<HTMLButtonElement>(null);
  const codeLength = usingBackupCode ? 8 : 6;

  useEffect(() => {
    if (!setupRequired) return;
    let current = true;
    setSetupLoading(true);
    void beginMfaSetup()
      .then((value) => { if (current) setSetup(value); })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : "MFA setup could not start.";
        if (current) setError(message);
      })
      .finally(() => { if (current) setSetupLoading(false); });
    return () => { current = false; };
  }, [setupRequired]);

  async function retrySetup() {
    setSetupLoading(true);
    setError(null);
    try { setSetup(await beginMfaSetup()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Authenticator setup could not start."); }
    finally { setSetupLoading(false); }
  }

  async function copySetupKey() {
    try {
      await navigator.clipboard.writeText(setup?.secret ?? "");
      setSetupKeyCopied(true);
    } catch {
      setError("Your browser could not copy the setup key. You can select and copy it manually.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (setupRequired) {
        setRecoveryCodes(await verifyMfaSetup(code));
      } else if (factor === "email") {
        onComplete(await verifyEmailMfa(code));
      } else {
        onComplete(await verifyMfa(code));
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The verification code was not accepted.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return <RecoveryCodes codes={recoveryCodes} onContinue={async () => onComplete(await getCurrentUser())} onError={(message) => { setError(message); onError(message); }} />;
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-[34rem]">
        <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Step 2 of 2 · Account security</p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.65rem]">{setupRequired ? "Set up your authenticator app." : usingBackupCode ? "Use a backup code." : "Confirm it’s you."}</h1>
        <p className="mt-3 max-w-xl font-body text-base leading-6 text-navy-muted">{setupRequired ? "Your programme account needs an extra sign-in check. Set up an authenticator app once, then use its code when you sign in." : usingBackupCode ? "Enter one of the backup codes you saved when setting up your account. Each code works once." : factor === "email" ? "Enter the sign-in code we sent to your verified email address." : "Enter the current sign-in code from your authenticator app to continue."}</p>
        {error && <div className="mt-5"><InlineFeedback kind="error" title="We couldn’t complete this step">{error}</InlineFeedback></div>}
        {setupRequired && setup && (
          <div className="mt-7 flex flex-col items-center gap-5 rounded-2xl border border-border bg-white p-5 sm:flex-row sm:items-start">
            <div className="rounded-xl border border-border bg-white p-3"><QRCodeSVG value={setup.otpauth_uri} size={176} level="H" includeMargin aria-label="MentorMAMA authenticator setup QR code" imageSettings={{ src: brandMark, width: 32, height: 32, excavate: true }} /></div>
            <div className="min-w-0 flex-1"><p className="font-body text-sm font-semibold text-navy">1. Open your authenticator app</p><p className="mt-1 font-body text-sm leading-6 text-navy-muted">Choose the option to add an account, then scan this MentorMAMA code. Keep this page open while you set it up.</p><details className="mt-4 rounded-xl border border-border bg-mist/50 p-3"><summary className="cursor-pointer font-body text-sm font-semibold text-teal">Can’t scan? Use a setup key</summary><p className="mt-3 break-all font-mono text-xs text-navy">{setup.secret}</p><button type="button" className="mt-3 inline-flex min-h-10 items-center gap-2 font-body text-sm font-semibold text-teal hover:underline" onClick={() => void copySetupKey()}><Copy size={14} aria-hidden="true" />{setupKeyCopied ? "Copied" : "Copy setup key"}</button><p className="mt-2 font-body text-xs leading-5 text-navy-muted">Keep this key private. Anyone who has it could create sign-in codes for your account.</p></details><p className="mt-4 font-body text-sm font-semibold text-navy">2. Enter the six-digit sign-in code</p></div>
          </div>
        )}
        {!setupRequired && emailMfaAvailable && (
          <div className="mt-5 flex w-full max-w-[26rem] flex-wrap gap-2 rounded-2xl border border-border bg-white p-2">
            <Button type="button" size="sm" variant={factor === "totp" && !usingBackupCode ? "primary" : "tertiary"} onClick={() => { setFactor("totp"); setUsingBackupCode(false); setCode(""); setEmailSent(false); }}>Authenticator app</Button>
            <Button type="button" size="sm" variant={factor === "email" ? "primary" : "tertiary"} onClick={() => { setFactor("email"); setUsingBackupCode(false); setCode(""); setError(null); void requestEmailMfaChallenge().then(() => setEmailSent(true)).catch((cause) => setError(cause instanceof Error ? cause.message : "We could not send the email code.")); }}>Email code</Button>
          </div>
        )}
        {factor === "email" && emailSent && <div className="mt-4 max-w-[26rem]"><InlineFeedback kind="success" title="Email code sent">Check your verified email address and enter the six-digit code below.</InlineFeedback></div>}
        <form className="mt-5 max-w-[26rem] space-y-4" onSubmit={submit}>
          <label className="block font-body text-sm font-semibold text-navy">{usingBackupCode ? "Backup code" : factor === "email" ? "Email sign-in code" : "Authenticator sign-in code"}
            <input className="auth-control mt-2 text-center font-mono text-lg tracking-[0.35em]" inputMode="numeric" pattern={usingBackupCode ? "[0-9]{8}" : "[0-9]{6}"} maxLength={codeLength} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder={usingBackupCode ? "00000000" : "000000"} autoComplete="one-time-code" required />
          </label>
          <Button type="submit" size="lg" className="auth-action w-full" disabled={busy || setupLoading || (setupRequired && !setup) || code.length !== codeLength}>{busy ? "Checking…" : setupLoading ? "Preparing…" : setupRequired ? "Finish setup" : "Continue"}<span className="text-xl font-normal" aria-hidden="true">→</span></Button>
        </form>
        {setupRequired && !setup && !setupLoading && <button type="button" className="mt-4 font-body text-sm font-semibold text-teal underline-offset-4 hover:underline" onClick={() => void retrySetup()}>Try authenticator setup again</button>}
        {!setupRequired && <div className="mt-6 max-w-[26rem] border-t border-border pt-4">
          <button type="button" className="font-body text-sm font-semibold text-teal underline-offset-4 hover:underline" onClick={() => { setUsingBackupCode((current) => !current); setFactor("totp"); setCode(""); setError(null); }}>{usingBackupCode ? "Use authenticator app instead" : "Use a backup code"}</button>
          {recoveryContact && <button ref={recoveryTriggerRef} type="button" className="mt-3 block font-body text-sm font-semibold text-navy-muted underline-offset-4 hover:text-teal hover:underline" onClick={() => setRecoveryOpen(true)}>Still need help signing in?</button>}
        </div>}
        {recoveryOpen && recoveryContact && <RecoveryHelpDialog contact={recoveryContact} returnFocusRef={recoveryTriggerRef} onClose={() => setRecoveryOpen(false)} />}
      </div>
    </AuthLayout>
  );
}

function RecoveryHelpDialog({
  contact,
  returnFocusRef,
  onClose,
}: {
  contact: "programme_admin" | "another_program_admin" | "support";
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const adminIsTheReviewer = contact === "another_program_admin";
  const supportOnly = contact === "support";

  useEffect(() => {
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;
    const root: HTMLElement = dialogElement;
    const focusableSelector = "button:not([disabled]), textarea:not([disabled]), a[href]";
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(focusableSelector));
    (root.querySelector<HTMLElement>("textarea") ?? focusable()[0] ?? root).focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0]; const last = items[items.length - 1];
      if (!first || !last) { event.preventDefault(); root.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, [onClose, returnFocusRef]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await submitMfaRecoveryRequest(reason.trim()); setSubmitted(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We could not send your request."); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="recovery-help-title" aria-describedby="recovery-help-description" className="w-full max-w-lg rounded-3xl border border-white/70 bg-white p-6 shadow-2xl outline-none sm:p-8">
      <div className="flex items-start justify-between gap-5"><div><p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Account recovery</p><h2 id="recovery-help-title" className="mt-2 font-display text-2xl font-bold text-navy">Need help signing in?</h2></div><button type="button" onClick={onClose} aria-label="Close recovery help" className="flex size-10 shrink-0 items-center justify-center rounded-full text-navy-muted hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><X size={19} /></button></div>
      <p id="recovery-help-description" className="mt-4 text-sm leading-6 text-navy-muted">{submitted ? (adminIsTheReviewer ? "Your request is ready for review by another Programme Admin." : "Your request is ready for review by a Programme Admin.") : supportOnly ? "Your programme has no other active Programme Admin to review a request." : adminIsTheReviewer ? "Send a request for another Programme Admin to review. Your sign-in access stays protected until they complete the review." : "Send a request for a Programme Admin to review. Your sign-in access stays protected until they complete the review."}</p>
      {supportOnly ? <div className="mt-5 rounded-2xl bg-mist/55 p-4"><p className="text-sm leading-6 text-navy-muted">There isn’t another active Programme Admin to review an account recovery request. Contact MentorMAMA support for help.</p><a href="mailto:support@mentormama.org" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-teal px-5 font-body text-sm font-semibold text-white hover:bg-teal/90">Contact support</a></div> : submitted ? <><div className="mt-5"><InlineFeedback kind="success" title="Request received">A reviewer will check your request. No changes have been made to your sign-in access.</InlineFeedback></div>{adminIsTheReviewer && <p className="mt-4 text-sm text-navy-muted">Only Programme Admin on your programme? <a className="font-semibold text-teal underline-offset-4 hover:underline" href="mailto:support@mentormama.org">Contact MentorMAMA support</a>.</p>}<div className="mt-6 flex justify-end"><Button onClick={onClose}>Done</Button></div></> : <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="rounded-2xl bg-mist/55 p-4"><p className="text-sm font-semibold text-navy">Use this if you can’t use your authenticator or any saved backup code.</p><p className="mt-1 text-xs leading-5 text-navy-muted">Do not include passwords, sign-in codes, or backup codes.</p>{adminIsTheReviewer && <p className="mt-2 text-xs leading-5 text-navy-muted">If you are the only Programme Admin, <a className="font-semibold text-teal underline-offset-4 hover:underline" href="mailto:support@mentormama.org">contact MentorMAMA support</a>.</p>}</div>
        <label className="block text-sm font-semibold text-navy">What happened?<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={1000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-border bg-white p-3 font-body text-sm font-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" placeholder="For example, I changed phones and no longer have my authenticator app." /></label>
        {error && <p role="alert" className="rounded-xl border border-error/25 bg-error/5 p-3 text-sm text-error">{error}</p>}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="tertiary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || reason.trim().length < 5}>{busy ? "Sending request…" : "Send request"}</Button></div>
      </form>}
    </section>
  </div>;
}

function RecoveryCodes({ codes, onContinue, onError }: { codes: string[]; onContinue: () => Promise<void>; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  function copyCodes() {
    void navigator.clipboard.writeText(codes.join("\n")).then(() => setCopied(true));
  }
  function downloadCodes() {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mentormama-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function continueToWorkspace() {
    setBusy(true);
    try {
      await onContinue();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not open your workspace.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <div className="w-full max-w-[34rem]">
        <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Final security step</p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.65rem]">Save your recovery codes.</h1>
        <div className="mt-5"><InlineFeedback kind="success" title="Authenticator connected">Your account is ready. Save these backup codes in a private place before you continue.</InlineFeedback></div>
        <p className="mt-3 max-w-xl font-body text-base leading-6 text-navy-muted">Each backup code works once if you cannot use your authenticator app. They are shown only here, so save them somewhere private.</p>
        <div className="mt-7 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-white p-5 font-mono text-sm text-navy">{codes.map((code) => <span key={code}>{code}</span>)}</div>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 font-body text-sm font-semibold text-navy transition hover:border-teal hover:text-teal" onClick={copyCodes}><Copy size={15} aria-hidden="true" />{copied ? "Copied" : "Copy codes"}</button><button type="button" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 font-body text-sm font-semibold text-navy transition hover:border-teal hover:text-teal" onClick={downloadCodes}><Download size={15} aria-hidden="true" />Download</button></div>
        <label className="mt-6 flex items-start gap-3 font-body text-sm text-navy"><input type="checkbox" className="mt-1 h-4 w-4 accent-teal" checked={saved} onChange={(event) => setSaved(event.target.checked)} />I’ve saved my backup codes somewhere private.</label>
        <Button size="lg" className="auth-action mt-6 w-full" onClick={() => void continueToWorkspace()} disabled={busy || !saved}>{busy ? "Opening workspace…" : "Continue to workspace"}<span className="text-xl font-normal" aria-hidden="true">→</span></Button>
        <p className="mt-5 flex items-center gap-2 font-body text-xs text-navy-muted"><ShieldCheck size={15} className="text-teal" aria-hidden="true" />MentorMAMA will never email or show these codes to support staff.</p>
      </div>
    </AuthLayout>
  );
}
