import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Field, PasswordInput, TextInput } from "../../components/kit";
import { login, ApiError } from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { AuthLayout } from "./AuthLayout";
import { AuthAlert, AuthButton } from "./AuthUi";

export function SignInFlow({
  message,
  onAuthenticated,
  onChallenge,
}: {
  message?: string;
  onAuthenticated: (user: CurrentUser) => void;
  onChallenge: (challenge: { setupRequired: boolean; emailMfaAvailable: boolean; recoveryContact?: "programme_admin" | "another_program_admin" | "support" }) => void;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(message ?? null);

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired) onChallenge({ setupRequired: result.mfaSetupRequired, emailMfaAvailable: result.emailMfaAvailable, recoveryContact: result.recoveryContact });
      else if (result.user) onAuthenticated(result.user);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "AccountSuspended") {
        navigate("/account-status?status=suspended", { replace: true });
        return;
      }
      if (cause instanceof ApiError && cause.code === "AccountDeactivated") {
        navigate("/account-status?status=deactivated", { replace: true });
        return;
      }
      if (cause instanceof ApiError && cause.code === "InvitationPending") {
        navigate("/account-status?status=invited", { replace: true });
        return;
      }
      setError(cause instanceof ApiError ? cause.message : "We could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout stepKey="sign-in">
      <p className="auth-eyebrow"><LockKeyhole size={14} aria-hidden="true" />Secure portal access</p>
      <h1 className="auth-title">Welcome back.</h1>
      <p className="auth-lede">Sign in to continue supporting better clinical mentorship.</p>

      {error && <div className="mt-5"><AuthAlert>{error}</AuthAlert></div>}

      <form className="mt-4 space-y-3" onSubmit={submit}>
        <Field label="Email address">
          <TextInput leading={<Mail />} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.org" required autoComplete="email" />
        </Field>
        <div className="space-y-2">
          <Field label="Password">
            <PasswordInput
              leading={<LockKeyhole />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              onBlur={() => setCapsLock(false)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </Field>
          {capsLock && (
            <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] font-medium text-[#8a5a00]" role="status">
              <TriangleAlert size={15} aria-hidden="true" />Caps Lock is on.
            </p>
          )}
          <div className="flex justify-end">
            <Link to="/reset-password" className="auth-link">Forgot password?</Link>
          </div>
        </div>
        <AuthButton type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Signing in…" : "Sign in"}
          {!busy && <ArrowRight size={18} aria-hidden="true" />}
        </AuthButton>
      </form>

      <div className="auth-note mt-4">
        <ShieldCheck aria-hidden="true" />
        <p className="m-0">Some programme accounts ask for a sign-in code from an authenticator app to help keep account information safe.</p>
      </div>
      <p className="mb-0 mt-3 text-center text-sm text-[#4f627d]">
        Need access? <a href="mailto:support@mentormama.org" className="font-semibold text-[#157373] underline-offset-4 hover:underline">Contact your programme team</a>
      </p>
    </AuthLayout>
  );
}
