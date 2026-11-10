import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, KeyRound, LockKeyhole, Mail, MailCheck, ShieldCheck } from "lucide-react";
import { Field, PasswordInput, TextInput } from "../../components/kit";
import { ApiError, confirmPasswordReset, requestPasswordReset } from "../../services/api";
import { AuthLayout, BackLink } from "./AuthLayout";
import { AuthAlert, AuthButton, MatchIndicator, PASSWORD_MIN_LENGTH, PasswordStrength } from "./AuthUi";

export function PasswordResetFlow({ uid, token }: { uid: string; token: string }) {
  const setting = Boolean(uid && token);
  const [stage, setStage] = useState<"form" | "done">("form");
  return (
    <AuthLayout stepKey={`${setting ? "set" : "request"}-${stage}`} focus="field">
      {setting ? (
        stage === "done" ? <ResetSuccess /> : <SetNewPassword uid={uid} token={token} onDone={() => setStage("done")} />
      ) : stage === "done" ? (
        <Confirmation />
      ) : (
        <ResetRequest onSent={() => setStage("done")} />
      )}
    </AuthLayout>
  );
}

function ResetRequest({ onSent }: { onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      onSent();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We could not process that request.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <BackLink />
      <p className="auth-eyebrow mt-5"><Mail size={14} aria-hidden="true" />Account recovery</p>
      <h1 className="auth-title">Reset your password.</h1>
      <p className="auth-lede">Enter your account email and we’ll send instructions if it is associated with MentorMAMA.</p>
      {error && <div className="mt-5"><AuthAlert>{error}</AuthAlert></div>}
      <form className="mt-6 space-y-5" onSubmit={submit}>
        <Field label="Email address">
          <TextInput leading={<Mail />} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.org" />
        </Field>
        <AuthButton type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Sending…" : "Send reset instructions"}
          {!busy && <ArrowRight size={18} aria-hidden="true" />}
        </AuthButton>
      </form>
    </>
  );
}

function Confirmation() {
  return (
    <div className="text-center">
      <div className="auth-badge mx-auto"><MailCheck aria-hidden="true" strokeWidth={1.6} /></div>
      <h1 className="auth-title mt-7">Check your inbox.</h1>
      <p className="auth-lede">If the email belongs to an active account, reset instructions are on their way. The link will expire for your protection.</p>
      <div className="auth-note mt-6 text-left">
        <ShieldCheck aria-hidden="true" />
        <p className="m-0">Nothing arrived after a few minutes? Check your spam folder, or go back and try again.</p>
      </div>
      <AuthButton to="/" className="mt-6">Back to sign in</AuthButton>
    </div>
  );
}

function SetNewPassword({ uid, token, onDone }: { uid: string; token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) { setError("Use at least 12 characters."); return; }
    if (password !== confirmation) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      await confirmPasswordReset(uid, token, password);
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "This reset link is invalid or expired.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="auth-eyebrow"><KeyRound size={14} aria-hidden="true" />Account recovery</p>
      <h1 className="auth-title">Choose a new password.</h1>
      <p className="auth-lede">Use a memorable passphrase with at least {PASSWORD_MIN_LENGTH} characters.</p>
      {error && <div className="mt-5"><AuthAlert>{error}</AuthAlert></div>}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label="New password">
          <PasswordInput leading={<LockKeyhole />} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
        </Field>
        <PasswordStrength password={password} id="reset-password-rules" />
        <Field label="Confirm password">
          <PasswordInput leading={<LockKeyhole />} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
        </Field>
        <MatchIndicator password={password} confirmation={confirmation} id="reset-password-match" />
        <AuthButton type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Updating…" : "Set new password"}
          {!busy && <ArrowRight size={18} aria-hidden="true" />}
        </AuthButton>
      </form>
    </>
  );
}

function ResetSuccess() {
  return (
    <div className="text-center">
      <div className="auth-badge mx-auto"><ShieldCheck aria-hidden="true" strokeWidth={1.6} /></div>
      <p className="auth-eyebrow mt-7 justify-center"><LockKeyhole size={14} aria-hidden="true" />Account secured</p>
      <h1 className="auth-title mt-2">Your password is updated.</h1>
      <p className="auth-lede">Your password has been changed and previous active sessions have been signed out. Sign in again with your new password.</p>
      <AuthButton to="/" className="mt-6">Back to sign in</AuthButton>
    </div>
  );
}
