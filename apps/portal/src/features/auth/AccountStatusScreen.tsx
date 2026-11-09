import { ArrowLeft, CircleAlert, Mail, ShieldX } from "lucide-react";
import { Button } from "@mentormama/ui";
import { AuthLayout } from "./AuthLayout";

const copy = {
  invited: { eyebrow: "Invitation pending", title: "Your invitation is waiting.", body: "Open the invitation email to finish setting up your MentorMAMA account. If the link no longer works, ask your programme team to send a new one.", action: "Return to sign in" },
  suspended: { eyebrow: "Access paused", title: "Your programme access is paused.", body: "A password reset will not restore access. Contact your Programme Administrator to understand why access was paused and what to do next.", action: "Return to sign in" },
  deactivated: { eyebrow: "Account inactive", title: "This account is no longer active.", body: "A password reset will not restore access. Contact your Programme Administrator if you believe this change was unexpected or need help.", action: "Return to sign in" },
  revoked: { eyebrow: "Access unavailable", title: "You’ve been signed out.", body: "For your protection, this sign-in has ended. Sign in again to continue. If this keeps happening, contact programme support.", action: "Sign in again" },
} as const;

export function AccountStatusScreen({ status }: { status: keyof typeof copy }) {
  const content = copy[status];
  const isSecure = status === "revoked";
  return <AuthLayout><div className="w-full max-w-[34rem]"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-light text-teal">{isSecure ? <ShieldX size={27} strokeWidth={1.6} /> : <CircleAlert size={27} strokeWidth={1.6} />}</div><p className="mt-7 font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">{content.eyebrow}</p><h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.65rem]">{content.title}</h1><p className="mt-4 max-w-xl font-body text-base leading-7 text-navy-muted">{content.body}</p><div className="mt-8 flex items-start gap-3 rounded-2xl bg-white/75 px-4 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal"><Mail size={17} /></span><p className="font-body text-sm leading-6 text-navy-muted">Need help? <a className="font-semibold text-teal underline-offset-4 hover:underline" href="mailto:support@mentormama.org">Contact programme support</a> and they’ll guide you.</p></div><Button to="/" size="lg" className="auth-action mt-8 w-full sm:w-auto">{content.action}<ArrowLeft className="ml-3 rotate-180" size={17} aria-hidden="true" /></Button></div></AuthLayout>;
}
