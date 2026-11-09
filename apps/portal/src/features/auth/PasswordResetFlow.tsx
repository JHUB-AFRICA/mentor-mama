import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@mentormama/ui";
import { ApiError, confirmPasswordReset, requestPasswordReset } from "../../services/api";
import { AuthLayout } from "./AuthLayout";
import { Link } from "react-router-dom";

export function PasswordResetFlow({ uid, token }: { uid: string; token: string }) {
  return <AuthLayout>{uid && token ? <SetNewPassword uid={uid} token={token} /> : <ResetRequest />}</AuthLayout>;
}

function ResetRequest() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await requestPasswordReset(email); setSent(true); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "We could not process that request."); } finally { setBusy(false); }
  }
  if (sent) return <Confirmation />;
  return <div className="w-full max-w-[34rem]"><Link to="/" className="inline-flex items-center gap-2 font-body text-sm font-semibold text-navy-muted hover:text-teal"><ArrowLeft size={16} />Back to sign in</Link><p className="mt-8 flex items-center gap-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-teal"><Mail size={15} />Account recovery</p><h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.65rem]">Reset your password.</h1><p className="mt-3 max-w-xl font-body text-base leading-6 text-navy-muted">Enter your account email and we’ll send instructions if it is associated with MentorMAMA.</p>{error && <div className="mt-5 rounded-2xl border border-error/25 bg-error/5 px-4 py-3 font-body text-sm text-error" role="alert" aria-live="polite">{error}</div>}<form className="mt-7 max-w-[34rem] space-y-5" onSubmit={submit}><label className="block font-body text-sm font-semibold text-navy">Email address<input className="auth-control mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.org" /></label><Button type="submit" size="lg" className="auth-action w-full" disabled={busy}>{busy ? "Sending…" : "Send reset instructions"}<span aria-hidden="true">→</span></Button></form></div>;
}

function Confirmation() {
  return <div className="w-full max-w-[34rem] text-center"><CheckCircle2 className="mx-auto text-teal" size={52} strokeWidth={1.5} /><h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-navy">Check your inbox.</h1><p className="mx-auto mt-4 max-w-md font-body text-base leading-7 text-navy-muted">If the email belongs to an active account, reset instructions are on their way. The link will expire for your protection.</p><Link to="/" className="mt-8 inline-flex font-body text-sm font-semibold text-teal hover:underline">Return to sign in</Link></div>;
}

function SetNewPassword({ uid, token }: { uid: string; token: string }) {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); if (password.length < 12) { setError("Use at least 12 characters."); return; } if (password !== confirmation) { setError("The passwords do not match."); return; } setBusy(true); try { await confirmPasswordReset(uid, token, password); setDone(true); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "This reset link is invalid or expired."); } finally { setBusy(false); } }
  if (done) return <ResetSuccess />;
  return <div className="w-full max-w-[34rem]"><p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Account recovery</p><h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.65rem]">Choose a new password.</h1><p className="mt-3 font-body text-base leading-6 text-navy-muted">Use a memorable passphrase with at least 12 characters.</p>{error && <div className="mt-5 rounded-2xl border border-error/25 bg-error/5 px-4 py-3 font-body text-sm text-error" role="alert">{error}</div>}<form className="mt-7 max-w-[34rem] space-y-5" onSubmit={submit}><label className="block font-body text-sm font-semibold text-navy">New password<span className="relative mt-2 block"><input className="auth-control pr-12" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /><button type="button" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-navy-muted hover:text-teal" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label><label className="block font-body text-sm font-semibold text-navy">Confirm password<input className="auth-control mt-2" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required /></label><Button type="submit" size="lg" className="auth-action w-full" disabled={busy}>{busy ? "Updating…" : "Set new password"}<span aria-hidden="true">→</span></Button></form></div>;
}

function ResetSuccess() {
  return <div className="w-full max-w-[34rem] text-center"><CheckCircle2 className="mx-auto text-teal" size={52} strokeWidth={1.5} /><p className="mt-6 flex items-center justify-center gap-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-teal"><LockKeyhole size={15} />Account secured</p><h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-navy">Your password is updated.</h1><p className="mx-auto mt-4 max-w-md font-body text-base leading-7 text-navy-muted">Your password has been changed and previous active sessions have been signed out. Sign in again with your new password.</p><Link to="/" className="mt-8 inline-flex font-body text-sm font-semibold text-teal hover:underline">Return to sign in</Link></div>;
}
