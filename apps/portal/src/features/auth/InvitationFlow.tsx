import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, MailOpen, ShieldCheck, LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Field, PasswordInput } from "../../components/kit";
import { activateAccount, ApiError } from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { AuthLayout } from "./AuthLayout";
import { AuthAlert, AuthButton, MatchIndicator, PASSWORD_MIN_LENGTH, PasswordStrength, StepProgress } from "./AuthUi";

interface InvitationFlowProps {
  uid: string;
  token: string;
  onAuthenticated: (user: CurrentUser) => void;
  onChallenge: (challenge: { setupRequired: boolean; emailMfaAvailable: boolean; recoveryContact?: "programme_admin" | "another_program_admin" | "support" }) => void;
}

// The real activation journey: open invitation -> choose password -> security check
// (authenticator setup and recovery codes, when the account requires them).
const STEPS = ["Invitation", "Password", "Security"];

export function InvitationFlow({ uid, token, onAuthenticated, onChallenge }: InvitationFlowProps) {
  const [stage, setStage] = useState<"landing" | "form" | "unavailable">("landing");

  if (!uid || !token || stage === "unavailable") {
    return (
      <AuthLayout stepKey="unavailable">
        <InvitationUnavailable />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout stepKey={stage} focus="field">
      {stage === "landing" ? (
        <InvitationLanding onStart={() => setStage("form")} />
      ) : (
        <ActivationForm uid={uid} token={token} onAuthenticated={onAuthenticated} onChallenge={onChallenge} onBack={() => setStage("landing")} onUnavailable={() => setStage("unavailable")} />
      )}
    </AuthLayout>
  );
}

function InvitationLanding({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <StepProgress label="Account setup progress" steps={STEPS} current={0} />
      <div className="auth-badge mt-8"><MailOpen aria-hidden="true" strokeWidth={1.6} /></div>
      <p className="auth-eyebrow mt-7">Your invitation is ready</p>
      <h1 className="auth-title">You’re invited to MentorMAMA<span className="text-[#1D8C8C]">.</span></h1>
      <p className="auth-lede">Create your secure account to enter your programme workspace. Your access and role have already been assigned by your programme team.</p>
      <div className="auth-note mt-5">
        <LockKeyhole aria-hidden="true" />
        <p className="m-0">Next you’ll choose a password, then follow the security steps for your programme account.</p>
      </div>
      <AuthButton type="button" className="mt-6" onClick={onStart}>Create your account<ArrowRight size={18} aria-hidden="true" /></AuthButton>
      <p className="mb-0 mt-4 text-center text-sm text-[#4f627d]">
        Already completed setup? <Link className="font-semibold text-[#157373] underline-offset-4 hover:underline" to="/">Sign in</Link>
      </p>
    </div>
  );
}

function ActivationForm({ uid, token, onAuthenticated, onChallenge, onBack, onUnavailable }: InvitationFlowProps & { onBack: () => void; onUnavailable: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordReady = password.length >= PASSWORD_MIN_LENGTH;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await activateAccount(uid, token, password);
      if (result.mfaRequired) {
        onChallenge({ setupRequired: result.mfaSetupRequired, emailMfaAvailable: false });
      } else if (result.user) {
        onAuthenticated(result.user);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "InvalidInvitation") {
        onUnavailable();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : "We could not activate this invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="auth-link auth-link--muted -ml-1 px-1" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back to invitation</button>
      <div className="mt-3"><StepProgress label="Account setup progress" steps={STEPS} current={1} /></div>
      <h1 className="auth-title mt-6">Make your account yours.</h1>
      <p className="auth-lede">Choose a strong password. We’ll then help you secure the account and enter your programme workspace.</p>
      {error && <div className="mt-5"><AuthAlert>{error}</AuthAlert></div>}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label="Password">
          <PasswordInput leading={<LockKeyhole />} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter a strong password" required autoComplete="new-password" />
        </Field>
        <PasswordStrength password={password} id="password-requirements" />
        <Field label="Confirm password">
          <PasswordInput leading={<LockKeyhole />} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Re-enter your password" required autoComplete="new-password" />
        </Field>
        <MatchIndicator password={password} confirmation={confirmation} id="password-match" />
        <AuthButton type="submit" disabled={busy || !passwordReady} aria-busy={busy}>
          {busy ? "Creating account…" : "Create account"}
          {!busy && <ArrowRight size={18} aria-hidden="true" />}
        </AuthButton>
      </form>
      <div className="auth-note mt-5">
        <ShieldCheck aria-hidden="true" />
        <p className="m-0">We use industry-standard encryption to protect your data.</p>
      </div>
    </div>
  );
}

function InvitationUnavailable() {
  return (
    <div>
      <div className="auth-badge auth-badge--warning"><LinkIcon aria-hidden="true" strokeWidth={1.6} /></div>
      <p className="auth-eyebrow mt-7 text-[#8a5a00]">Invitation unavailable</p>
      <h1 className="auth-title">This link can’t be used.</h1>
      <p className="auth-lede">The invitation may be incomplete, expired, or already replaced. Ask your programme team to send you a new invitation.</p>
      <div className="mt-6 grid gap-3">
        <AuthButton to="/">Back to sign in</AuthButton>
        <AuthButton href="mailto:support@mentormama.org" variant="ghost">Contact support</AuthButton>
      </div>
    </div>
  );
}
