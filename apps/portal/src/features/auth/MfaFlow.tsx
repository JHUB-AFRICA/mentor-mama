import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, Copy, Download, KeyRound, Mail, ShieldCheck, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Field, TextArea, TextInput } from "../../components/kit";
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
import { AuthAlert, AuthButton, OtpInput, StepProgress, useCountdown } from "./AuthUi";

type RecoveryContact = "programme_admin" | "another_program_admin" | "support";

const RESEND_SECONDS = 30;

export function MfaFlow({
  setupRequired,
  emailMfaAvailable,
  recoveryContact,
  onComplete,
  onError,
}: {
  setupRequired: boolean;
  emailMfaAvailable: boolean;
  recoveryContact?: RecoveryContact;
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
  const formRef = useRef<HTMLFormElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef<string | null>(null);
  const resend = useCountdown(RESEND_SECONDS);
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

  // Submit automatically once every digit is in. The short delay keeps an
  // explicit click on the button (or a quick correction) from double-submitting.
  const ready = code.length === codeLength && !busy && !setupLoading && !(setupRequired && !setup);
  useEffect(() => {
    if (!ready || submittedRef.current === code) return;
    const timer = window.setTimeout(() => formRef.current?.requestSubmit(), 450);
    return () => window.clearTimeout(timer);
  }, [ready, code]);

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
      window.setTimeout(() => setSetupKeyCopied(false), 2500);
    } catch {
      setError("Your browser could not copy the setup key. You can select and copy it manually.");
    }
  }

  async function sendEmailCode() {
    setError(null);
    try {
      await requestEmailMfaChallenge();
      setEmailSent(true);
      resend.start();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not send the email code.");
    }
  }

  function chooseFactor(next: "totp" | "email") {
    setFactor(next);
    setUsingBackupCode(false);
    setCode("");
    setError(null);
    submittedRef.current = null;
    if (next === "email") void sendEmailCode();
    else setEmailSent(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || code.length !== codeLength) return;
    submittedRef.current = code;
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
      setError(cause instanceof Error ? cause.message : "The verification code was not accepted.");
      // Let the user retype straight away.
      submittedRef.current = null;
      setCode("");
      requestAnimationFrame(() => otpRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  const fieldLabel = usingBackupCode ? "Backup code" : factor === "email" ? "Email sign-in code" : "Authenticator code";

  if (recoveryCodes) {
    return (
      <AuthLayout stepKey="recovery-codes" width="lg">
        <RecoveryCodes codes={recoveryCodes} onContinue={async () => onComplete(await getCurrentUser())} onError={(message) => { setError(message); onError(message); }} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout stepKey={`verify-${setupRequired ? "setup" : "challenge"}`} width={setupRequired ? "lg" : "md"} focus="field">
      <StepProgress
        label="Sign-in progress"
        steps={setupRequired ? ["Password", "Authenticator", "Recovery codes"] : ["Password", "Security check"]}
        current={1}
      />
      <h1 className="auth-title mt-6">{setupRequired ? "Set up your authenticator app." : usingBackupCode ? "Use a backup code." : "Confirm it’s you."}</h1>
      <p className="auth-lede">
        {setupRequired
          ? "Your programme account needs an extra sign-in check. Set it up once, then use the app’s code whenever you sign in."
          : usingBackupCode
            ? "Enter one of the backup codes you saved when setting up your account. Each code works once."
            : factor === "email"
              ? "Enter the sign-in code we sent to your verified email address."
              : "Enter the current sign-in code from your authenticator app to continue."}
      </p>

      {error && <div className="mt-5"><AuthAlert title="We couldn’t complete this step">{error}</AuthAlert></div>}

      {setupRequired && (
        <div className="mt-6">
          <p className="m-0 flex items-center gap-2 text-sm font-semibold text-[#0D1B33]"><Smartphone size={16} className="text-[#157373]" aria-hidden="true" />1. Scan with your authenticator app</p>
          {setup ? (
            <div className="mt-3 space-y-4">
              <div className="flex justify-center rounded-2xl border border-[#dbe4ed] bg-white p-3">
                <QRCodeSVG value={setup.otpauth_uri} size={168} level="H" includeMargin aria-label="MentorMAMA authenticator setup QR code" role="img" imageSettings={{ src: brandMark, width: 30, height: 30, excavate: true }} />
              </div>
              <div>
                <div className="ui-field">
                  <label htmlFor="mfa-setup-key" className="ui-label">Can’t scan? Enter this setup key</label>
                  <div className="flex items-stretch gap-2">
                    <TextInput id="mfa-setup-key" readOnly value={setup.secret} className="font-mono" aria-describedby="mfa-setup-key-hint" onFocus={(event) => event.currentTarget.select()} />
                    <AuthButton type="button" variant="ghost" size="sm" inline onClick={() => void copySetupKey()}>
                      {setupKeyCopied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                      {setupKeyCopied ? "Copied" : "Copy"}
                      <span className="sr-only"> setup key</span>
                    </AuthButton>
                  </div>
                  <p id="mfa-setup-key-hint" className="ui-field__hint">Keep this key private. Anyone who has it could create sign-in codes for your account.</p>
                </div>
                <span className="sr-only" role="status">{setupKeyCopied ? "Setup key copied" : ""}</span>
              </div>
            </div>
          ) : setupLoading ? (
            <div className="mt-3 h-[13rem] animate-pulse rounded-2xl bg-[#eaf0f4]" role="status" aria-label="Preparing your setup code" />
          ) : (
            <button type="button" className="auth-link mt-2" onClick={() => void retrySetup()}>Try authenticator setup again</button>
          )}
          <p className="mb-0 mt-5 flex items-center gap-2 text-sm font-semibold text-[#0D1B33]"><KeyRound size={16} className="text-[#157373]" aria-hidden="true" />2. Enter the six-digit code it shows</p>
        </div>
      )}

      {!setupRequired && emailMfaAvailable && (
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-[#dbe4ed] bg-[#F4F7F8] p-1" role="group" aria-label="Verification method">
          <button type="button" aria-pressed={factor === "totp"} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#157373] ${factor === "totp" ? "bg-white text-[#0D1B33] shadow-sm" : "text-[#4f627d] hover:text-[#157373]"}`} onClick={() => chooseFactor("totp")}><Smartphone size={15} aria-hidden="true" />Authenticator app</button>
          <button type="button" aria-pressed={factor === "email"} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#157373] ${factor === "email" ? "bg-white text-[#0D1B33] shadow-sm" : "text-[#4f627d] hover:text-[#157373]"}`} onClick={() => chooseFactor("email")}><Mail size={15} aria-hidden="true" />Email code</button>
        </div>
      )}
      {factor === "email" && emailSent && <div className="mt-4"><AuthAlert kind="success" title="Email code sent">Check your verified email address and enter the six-digit code below.</AuthAlert></div>}

      <form ref={formRef} className="mt-5 space-y-5" onSubmit={submit}>
        <Field label={fieldLabel} hint={usingBackupCode ? "8 digits. It is used up once accepted." : "It checks automatically when all digits are entered."}>
          <OtpInput ref={otpRef} length={codeLength} value={code} onChange={setCode} disabled={busy} />
        </Field>
        <AuthButton type="submit" disabled={busy || setupLoading || (setupRequired && !setup) || code.length !== codeLength} aria-busy={busy}>
          {busy ? "Checking…" : setupLoading ? "Preparing…" : setupRequired ? "Verify and finish setup" : "Verify and continue"}
          {!busy && !setupLoading && <ArrowRight size={18} aria-hidden="true" />}
        </AuthButton>
      </form>

      {factor === "email" && emailSent && (
        <p className="mb-0 mt-3 text-center text-sm text-[#4f627d]">
          {resend.left > 0 ? `You can request another code in ${resend.left}s.` : (
            <button type="button" className="auth-link" onClick={() => void sendEmailCode()}>Resend email code</button>
          )}
        </p>
      )}

      {!setupRequired && (
        <div className="mt-5 flex flex-col gap-1 border-t border-[#e6edf2] pt-3">
          <button type="button" className="auth-link" onClick={() => { setUsingBackupCode((current) => !current); setFactor("totp"); setEmailSent(false); setCode(""); setError(null); submittedRef.current = null; }}>
            {usingBackupCode ? "Use authenticator app instead" : "Use a backup code"}
          </button>
          {recoveryContact && (
            <button ref={recoveryTriggerRef} type="button" className="auth-link auth-link--muted" onClick={() => setRecoveryOpen(true)}>Still need help signing in?</button>
          )}
        </div>
      )}
      {recoveryOpen && recoveryContact && <RecoveryHelpDialog contact={recoveryContact} returnFocusRef={recoveryTriggerRef} onClose={() => setRecoveryOpen(false)} />}
    </AuthLayout>
  );
}

function RecoveryHelpDialog({
  contact,
  returnFocusRef,
  onClose,
}: {
  contact: RecoveryContact;
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

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0D1B33]/55 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="recovery-help-title" aria-describedby="recovery-help-description" className="auth-shell max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl outline-none sm:rounded-3xl sm:p-8">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="auth-eyebrow">Account recovery</p>
            <h2 id="recovery-help-title" className="mt-2 text-2xl font-bold text-[#0D1B33]">Need help signing in?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close recovery help" className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#4f627d] hover:bg-[#F4F7F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#157373]"><X size={19} /></button>
        </div>
        <p id="recovery-help-description" className="mt-4 text-sm leading-6 text-[#4f627d]">{submitted ? (adminIsTheReviewer ? "Your request is ready for review by another Programme Admin." : "Your request is ready for review by a Programme Admin.") : supportOnly ? "Your programme has no other active Programme Admin to review a request." : adminIsTheReviewer ? "Send a request for another Programme Admin to review. Your sign-in access stays protected until they complete the review." : "Send a request for a Programme Admin to review. Your sign-in access stays protected until they complete the review."}</p>
        {supportOnly ? (
          <div className="auth-note mt-5 flex-col">
            <p className="m-0">There isn’t another active Programme Admin to review an account recovery request. Contact MentorMAMA support for help.</p>
            <AuthButton href="mailto:support@mentormama.org" size="sm" inline>Contact support</AuthButton>
          </div>
        ) : submitted ? (
          <>
            <div className="mt-5"><AuthAlert kind="success" title="Request received">A reviewer will check your request. No changes have been made to your sign-in access.</AuthAlert></div>
            {adminIsTheReviewer && <p className="mt-4 text-sm text-[#4f627d]">Only Programme Admin on your programme? <a className="font-semibold text-[#157373] underline-offset-4 hover:underline" href="mailto:support@mentormama.org">Contact MentorMAMA support</a>.</p>}
            <div className="mt-6 flex justify-end"><AuthButton type="button" inline onClick={onClose}>Done</AuthButton></div>
          </>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="auth-note flex-col">
              <p className="m-0 font-semibold text-[#0D1B33]">Use this if you can’t use your authenticator or any saved backup code.</p>
              <p className="m-0">Do not include passwords, sign-in codes, or backup codes.</p>
              {adminIsTheReviewer && <p className="m-0">If you are the only Programme Admin, <a className="font-semibold text-[#157373] underline-offset-4 hover:underline" href="mailto:support@mentormama.org">contact MentorMAMA support</a>.</p>}
            </div>
            <Field label="What happened?" required>
              <TextArea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={1000} rows={4} placeholder="For example, I changed phones and no longer have my authenticator app." />
            </Field>
            {error && <AuthAlert>{error}</AuthAlert>}
            <div className="flex flex-col-reverse gap-3 border-t border-[#e6edf2] pt-4 sm:flex-row sm:justify-end">
              <AuthButton type="button" variant="ghost" inline onClick={onClose} disabled={busy}>Cancel</AuthButton>
              <AuthButton type="submit" inline disabled={busy || reason.trim().length < 5}>{busy ? "Sending request…" : "Send request"}</AuthButton>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function RecoveryCodes({ codes, onContinue, onError }: { codes: string[]; onContinue: () => Promise<void>; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setCopyError(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(true);
    }
  }
  function downloadCodes() {
    const text = `MentorMAMA recovery codes\nEach code works once. Keep this file somewhere private.\n\n${codes.join("\n")}\n`;
    const blob = new Blob([text], { type: "text/plain" });
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
    <>
      <StepProgress label="Sign-in progress" steps={["Password", "Authenticator", "Recovery codes"]} current={2} />
      <h1 className="auth-title mt-6">Save your recovery codes.</h1>
      <div className="mt-4"><AuthAlert kind="success" title="Authenticator connected">Your account is ready. Save these backup codes in a private place before you continue.</AuthAlert></div>
      <p className="auth-lede">Each code works once if you can’t use your authenticator app. They are shown only here.</p>

      <ul className="auth-codes mt-5" aria-label="Recovery codes">
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <AuthButton type="button" variant="ghost" size="sm" onClick={() => void copyCodes()}>
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? "Copied" : "Copy all"}
        </AuthButton>
        <AuthButton type="button" variant="ghost" size="sm" onClick={downloadCodes}><Download size={15} aria-hidden="true" />Download .txt</AuthButton>
      </div>
      <span className="sr-only" role="status">{copied ? "Recovery codes copied" : ""}</span>
      {copyError && <p className="mb-0 mt-2 text-sm text-[#b42f2f]" role="alert">Your browser could not copy the codes. Download them or select and copy them manually.</p>}

      <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-[#0D1B33]">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#157373]" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        I have saved these codes somewhere private.
      </label>
      <AuthButton type="button" className="mt-4" onClick={() => void continueToWorkspace()} disabled={busy || !saved} aria-busy={busy}>
        {busy ? "Opening workspace…" : "Continue to workspace"}
        {!busy && <ArrowRight size={18} aria-hidden="true" />}
      </AuthButton>
      <p className="mb-0 mt-5 flex items-center gap-2 text-xs text-[#4f627d]"><ShieldCheck size={15} className="shrink-0 text-[#157373]" aria-hidden="true" />MentorMAMA will never email or show these codes to support staff.</p>
    </>
  );
}
