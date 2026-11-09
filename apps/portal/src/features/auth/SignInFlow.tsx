import { useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, ArrowRight } from "lucide-react";
import { Button } from "@mentormama/ui";
import { login, ApiError } from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { AuthLayout } from "./AuthLayout";
import { Link, useNavigate } from "react-router-dom";

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
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(message ?? null);

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
    <AuthLayout>
      <div className="w-full max-w-[34rem]">
        <div className="flex items-center gap-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-teal"><LockKeyhole size={15} aria-hidden="true" />Secure portal access</div>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.65rem]">Welcome back.</h1>
        <p className="mt-3 max-w-xl font-body text-base leading-6 text-navy-muted">Sign in to continue supporting better clinical mentorship.</p>
        {error && <div className="mt-6 rounded-2xl border border-error/25 bg-error/5 px-4 py-3 font-body text-sm leading-5 text-error" role="alert" aria-live="polite">{error}</div>}
        <form className="mt-7 max-w-[34rem] space-y-5" onSubmit={submit}>
          <label className="block font-body text-sm font-semibold text-navy">Email address
            <span className="relative mt-2 block"><Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-muted" size={17} aria-hidden="true" /><input className="auth-control pl-11" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.org" required autoComplete="email" /></span>
          </label>
          <label className="block font-body text-sm font-semibold text-navy">Password
            <span className="relative mt-2 block"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-muted" size={17} aria-hidden="true" /><input className="auth-control pl-11 pr-12" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password" /><button type="button" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-navy-muted hover:bg-teal-light hover:text-teal" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
          </label>
          <div className="flex items-center justify-between gap-4"><span className="font-body text-xs text-navy-muted">Use your programme account details.</span><Link to="/reset-password" className="shrink-0 font-body text-sm font-semibold text-teal underline-offset-4 hover:underline">Forgot password?</Link></div>
          <Button type="submit" size="lg" className="auth-action w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" /></Button>
        </form>
        <div className="mt-7 flex items-start gap-3 rounded-2xl bg-white/70 px-4 py-3.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal"><LockKeyhole size={15} aria-hidden="true" /></span><p className="font-body text-xs leading-5 text-navy-muted">Some programme accounts ask for a sign-in code from an authenticator app to help keep account information safe.</p></div>
        <p className="mt-6 text-center font-body text-sm text-navy-muted">Need access? <a href="mailto:support@mentormama.org" className="font-semibold text-teal underline-offset-4 hover:underline">Contact your programme team</a></p>
      </div>
    </AuthLayout>
  );
}
