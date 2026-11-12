import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowRight, LockKeyhole, Mail, ServerCog, ShieldCheck, TriangleAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Field, PasswordInput, TextInput } from "../../components/kit";
import { login, ApiError } from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { AuthLayout } from "./AuthLayout";
import { AuthAlert, AuthButton } from "./AuthUi";
import { DemoAccess } from "./DemoAccess";
import { supportEmail } from "../../lib/site";

export function SignInFlow({
  message,
  onAuthenticated,
  onChallenge,
  variant = "workspace",
}: {
  message?: string;
  /** "platform" is the separate sign-in for platform administrators at /platform. */
  variant?: "workspace" | "platform";
  onAuthenticated: (user: CurrentUser) => void;
  onChallenge: (challenge: { setupRequired: boolean; emailMfaAvailable: boolean; recoveryContact?: "programme_admin" | "another_program_admin" | "support" }) => void;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(message ?? null);
  const [wrongPage, setWrongPage] = useState<"platform" | "workspace" | null>(null);
  const platform = variant === "platform";

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWrongPage(null);
    setBusy(true);
    try {
      const result = await login(email, password, variant);
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
      if (cause instanceof ApiError && cause.code === "UsePlatformSignIn") setWrongPage("platform");
      if (cause instanceof ApiError && cause.code === "NotPlatformAccount") setWrongPage("workspace");
      setError(cause instanceof ApiError ? cause.message : "We could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout stepKey={platform ? "platform-sign-in" : "sign-in"}>
      {platform ? (
        <>
          <p className="auth-eyebrow"><ServerCog size={14} aria-hidden="true" />Platform administration</p>
          <h1 className="auth-title">Platform sign-in.</h1>
          <p className="auth-lede">For the team that operates MentorMAMA: programmes, accounts, support and system health.</p>
        </>
      ) : (
        <>
          <p className="auth-eyebrow"><LockKeyhole size={14} aria-hidden="true" />Secure portal access</p>
          <h1 className="auth-title">Welcome back.</h1>
          <p className="auth-lede">Sign in to continue supporting better clinical mentorship.</p>
        </>
      )}

      {error && (
        <div className="mt-5">
          <AuthAlert>
            {error}
            {wrongPage === "platform" && (
              <> <a className="auth-link" href="/platform">Go to platform sign-in</a></>
            )}
            {wrongPage === "workspace" && (
              <> <a className="auth-link" href="/">Go to workspace sign-in</a></>
            )}
          </AuthAlert>
        </div>
      )}

      {!platform && (
        <DemoAccess
          onAuthenticated={onAuthenticated}
          onFill={(demoEmail, demoPassword) => {
            setEmail(demoEmail);
            setPassword(demoPassword);
          }}
        />
      )}

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
        <p className="m-0">
          {platform
            ? "Platform accounts always need a sign-in code from an authenticator app. You will set one up the first time you sign in."
            : "Some programme accounts ask for a sign-in code from an authenticator app to help keep account information safe."}
        </p>
      </div>
      <p className="mb-0 mt-3 text-center text-sm text-[#4f627d]">
        {platform ? (
          <>Not a platform administrator? <a href="/" className="font-semibold text-[#157373] underline-offset-4 hover:underline">Go to the workspace sign-in</a></>
        ) : (
          <>Need access? <a href={`mailto:${supportEmail}`} className="font-semibold text-[#157373] underline-offset-4 hover:underline">Contact your programme team</a></>
        )}
      </p>
    </AuthLayout>
  );
}
