import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Building2, GraduationCap, Hospital, Stethoscope, type LucideIcon } from "lucide-react";
import { ApiError, demoLogin, getDemoAccounts } from "../../services/api";
import type { CurrentUser, DemoAccount } from "../../services/api";

const ICON: Record<string, LucideIcon> = {
  program_admin: Building2,
  coordinator: BookOpenCheck,
  nurse_manager: Hospital,
  mentor: Stethoscope,
  student: GraduationCap,
};

/**
 * Presentation shortcut: tap a role and you are signed in as that demo person. Only appears when the server is in
 * demo mode and a demo programme is seeded, so on a normal deployment this renders nothing.
 */
export function DemoAccess({ onAuthenticated, onFill }: { onAuthenticated: (user: CurrentUser) => void; onFill: (email: string, password: string) => void }) {
  const accounts = useQuery({ queryKey: ["demo-accounts"], queryFn: getDemoAccounts, staleTime: 5 * 60_000, retry: false });
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!accounts.data?.length) return null;

  async function enter(account: DemoAccount) {
    if (active) return;
    setActive(account.role);
    setError(null);
    onFill(account.email, "••••••••••••");
    try {
      onAuthenticated(await demoLogin(account.role));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We could not open the demo account.");
      setActive(null);
    }
  }

  return (
    <section className="auth-demo" aria-labelledby="auth-demo-title">
      <div className="auth-demo__head">
        <h2 id="auth-demo-title">Demo access</h2>
        <p>Tap a role to open its workspace with prepared programme data.</p>
      </div>
      <ul className="auth-demo__grid">
        {accounts.data.map((account) => {
          const Icon = ICON[account.role] ?? Building2;
          return (
            <li key={account.role}>
              <button type="button" className="auth-demo__tile" disabled={Boolean(active)} aria-busy={active === account.role} onClick={() => void enter(account)}>
                <span className="auth-demo__icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="auth-demo__text">
                  <strong>{account.role_label}</strong>
                  <small>{active === account.role ? "Signing in…" : account.name}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="auth-demo__error">{error}</p>}
    </section>
  );
}
