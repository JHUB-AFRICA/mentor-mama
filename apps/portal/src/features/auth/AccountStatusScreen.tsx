import { ArrowRight, LogOut, Mail, MailOpen, PauseCircle, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { AuthButton } from "./AuthUi";

type Status = "invited" | "suspended" | "deactivated" | "revoked";

const copy: Record<Status, { eyebrow: string; title: string; body: string; next: string; action: string; icon: LucideIcon; tone: "" | "warning" | "neutral" }> = {
  invited: { eyebrow: "Invitation pending", title: "Your invitation is waiting.", body: "Open the invitation email to finish setting up your MentorMAMA account. If the link no longer works, ask your programme team to send a new one.", next: "Look for the email from MentorMAMA and follow its link.", action: "Return to sign in", icon: MailOpen, tone: "" },
  suspended: { eyebrow: "Access paused", title: "Your programme access is paused.", body: "A password reset will not restore access. Contact your Programme Administrator to understand why access was paused and what to do next.", next: "Contact your Programme Administrator.", action: "Return to sign in", icon: PauseCircle, tone: "warning" },
  deactivated: { eyebrow: "Account inactive", title: "This account is no longer active.", body: "A password reset will not restore access. Contact your Programme Administrator if you believe this change was unexpected or need help.", next: "Contact your Programme Administrator.", action: "Return to sign in", icon: UserX, tone: "neutral" },
  revoked: { eyebrow: "Signed out", title: "You’ve been signed out.", body: "For your protection, this sign-in has ended. Sign in again to continue. If this keeps happening, contact programme support.", next: "Sign in again to continue.", action: "Sign in again", icon: LogOut, tone: "neutral" },
};

export function AccountStatusScreen({ status }: { status: Status }) {
  const content = copy[status];
  const Icon = content.icon;
  return (
    <AuthLayout stepKey={`status-${status}`}>
      <div className={`auth-badge${content.tone ? ` auth-badge--${content.tone}` : ""}`}><Icon aria-hidden="true" strokeWidth={1.6} /></div>
      <p className={`auth-eyebrow mt-7${content.tone === "warning" ? " text-[#8a5a00]" : ""}`}>{content.eyebrow}</p>
      <h1 className="auth-title">{content.title}</h1>
      <p className="auth-lede">{content.body}</p>
      <div className="auth-note mt-5">
        <Mail aria-hidden="true" />
        <div>
          <p className="m-0 font-semibold text-[#0D1B33]">Next step: {content.next}</p>
          <p className="m-0 mt-1">Need help? <a className="font-semibold text-[#157373] underline-offset-4 hover:underline" href="mailto:support@mentormama.org">Contact programme support</a> and they’ll guide you.</p>
        </div>
      </div>
      <AuthButton href="/" className="mt-6">{content.action}<ArrowRight size={18} aria-hidden="true" /></AuthButton>
    </AuthLayout>
  );
}
