import { ArrowRight, LifeBuoy, LogOut, MailOpen, PauseCircle, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { AuthButton } from "./AuthUi";
import { supportEmail } from "../../lib/site";

type Status = "invited" | "suspended" | "deactivated" | "revoked";

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  /** What the person can actually do, in order. */
  steps: string[];
  icon: LucideIcon;
  tone: "" | "warning" | "neutral";
  /** Signing in again only helps when it can change the outcome. */
  primary: "support" | "signin";
  signInLabel: string;
  subject: string;
  ask: string;
}

const copy: Record<Status, Copy> = {
  invited: {
    eyebrow: "Invitation pending", title: "Your invitation is waiting.",
    body: "Open the invitation email to finish setting up your MentorMAMA account.",
    steps: ["Look for the email from MentorMAMA and follow its link.", "If the link no longer works, ask your programme team to send a new one."],
    icon: MailOpen, tone: "", primary: "signin", signInLabel: "Back to sign in",
    subject: "I need a new MentorMAMA invitation", ask: "My invitation link no longer works. Please can you send a new one?",
  },
  suspended: {
    eyebrow: "Access paused", title: "Your access is paused for now.",
    body: "You can’t sign in while your account is paused. Your records are kept safe, and your Programme Administrator can restore access. Resetting your password won’t change this.",
    steps: [
      "Contact your Programme Administrator, the person who runs your programme. They can see why access was paused.",
      "If you can’t reach them, email MentorMAMA support with the button below. Your message is ready to send.",
      "When access is restored we’ll email you, and you can sign in with your usual password.",
    ],
    icon: PauseCircle, tone: "warning", primary: "support", signInLabel: "Back to sign in",
    subject: "My MentorMAMA account is paused", ask: "My account shows as paused and I can’t sign in. Please can you help me understand why and what to do next?",
  },
  deactivated: {
    eyebrow: "Account inactive", title: "This account is no longer active.",
    body: "You can’t sign in with this account. Resetting your password won’t change this.",
    steps: [
      "If you think this is a mistake, contact your Programme Administrator.",
      "If you can’t reach them, email MentorMAMA support with the button below. Your message is ready to send.",
      "If the account is reactivated, we’ll email you.",
    ],
    icon: UserX, tone: "neutral", primary: "support", signInLabel: "Back to sign in",
    subject: "My MentorMAMA account shows as inactive", ask: "My account shows as no longer active. I think this may be a mistake. Please can you help?",
  },
  revoked: {
    eyebrow: "Signed out", title: "You’ve been signed out.",
    body: "For your protection, this sign-in has ended. Sign in again to continue.",
    steps: ["Sign in again with your usual email and password.", "If this keeps happening, contact programme support."],
    icon: LogOut, tone: "neutral", primary: "signin", signInLabel: "Sign in again",
    subject: "I keep being signed out of MentorMAMA", ask: "I keep being signed out of MentorMAMA. Please can you help?",
  },
};

export function AccountStatusScreen({ status, email }: { status: Status; email?: string }) {
  const content = copy[status];
  const Icon = content.icon;
  const body = `Hello,\n\n${content.ask}${email ? `\n\nAccount: ${email}` : ""}\n\nThank you`;
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(body)}`;
  return (
    <AuthLayout stepKey={`status-${status}`}>
      <div className={`auth-badge${content.tone ? ` auth-badge--${content.tone}` : ""}`}><Icon aria-hidden="true" strokeWidth={1.6} /></div>
      <p className={`auth-eyebrow mt-7${content.tone === "warning" ? " text-[#8a5a00]" : ""}`}>{content.eyebrow}</p>
      <h1 className="auth-title">{content.title}</h1>
      <p className="auth-lede">{content.body}</p>
      {email && <p className="auth-account">Account: <strong>{email}</strong></p>}
      <div className="auth-note auth-note--steps mt-5">
        <LifeBuoy aria-hidden="true" />
        <div>
          <p className="m-0 font-semibold text-[#0D1B33]">What to do next</p>
          <ol className="auth-todo">
            {content.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
      </div>
      <div className="auth-actions mt-6">
        {content.primary === "support" ? (
          <>
            <AuthButton href={mailto}>Email MentorMAMA support<ArrowRight size={18} aria-hidden="true" /></AuthButton>
            <AuthButton href="/" variant="ghost">{content.signInLabel}</AuthButton>
          </>
        ) : (
          <>
            <AuthButton href="/">{content.signInLabel}<ArrowRight size={18} aria-hidden="true" /></AuthButton>
            <AuthButton href={mailto} variant="ghost">Email support</AuthButton>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
