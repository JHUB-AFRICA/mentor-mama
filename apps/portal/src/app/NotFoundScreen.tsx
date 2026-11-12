import { useEffect } from "react";
import { ArrowRight, Compass, Home } from "lucide-react";
import { AuthLayout } from "../features/auth/AuthLayout";
import { AuthButton } from "../features/auth/AuthUi";
import { websiteUrl } from "../lib/site";

/** Shown for an address that is not part of the portal (a typo, an old link). Never shown for a deep link that needs sign-in. */
export function NotFoundScreen({ homeHref, signedIn }: { homeHref: string; signedIn: boolean }) {
  useEffect(() => {
    // Search engines and link checkers should treat this as a missing page.
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return (
    <AuthLayout stepKey="not-found" width="lg">
      <p className="auth-eyebrow"><Compass size={14} aria-hidden="true" />Error 404</p>
      <h1 className="auth-title">We can’t find that page.</h1>
      <p className="auth-lede">
        The address may have a typo, or the page may have moved. Nothing is wrong with your account.
      </p>
      <div className="mt-6 grid gap-3">
        <AuthButton href={homeHref}>
          {signedIn ? "Back to my workspace" : "Go to sign in"}
          <ArrowRight size={18} aria-hidden="true" />
        </AuthButton>
        <AuthButton href={websiteUrl} variant="ghost">
          <Home size={16} aria-hidden="true" />Visit the MentorMAMA website
        </AuthButton>
      </div>
    </AuthLayout>
  );
}
