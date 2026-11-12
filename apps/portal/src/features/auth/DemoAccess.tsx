import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, KeyRound, LogIn, type LucideIcon } from "lucide-react";
import { BookOpenCheck, Building2, GraduationCap, Hospital, Stethoscope } from "lucide-react";
import { ApiError, demoLogin, getDemoAccounts } from "../../services/api";
import type { CurrentUser, DemoAccount } from "../../services/api";

const ROLE_INFO: Record<string, { icon: LucideIcon; short: string; sees: string }> = {
  program_admin: { icon: Building2, short: "Admin", sees: "Sets up the programme: people, content, placements and exports." },
  coordinator: { icon: BookOpenCheck, short: "Coordinator", sees: "Places students, follows cohorts and reviews approved feedback." },
  nurse_manager: { icon: Hospital, short: "Manager", sees: "Assigns mentors and wards, watches capacity and reviews concerns." },
  mentor: { icon: Stethoscope, short: "Mentor", sees: "Signs off induction and logs mentorship sessions in minutes." },
  student: { icon: GraduationCap, short: "Student", sees: "Follows the placement, sessions, feedback and concerns." },
};

/**
 * Presentation shortcut, in the style of a "demo accounts" card: pick a role, see who you will be, press "Use this
 * account" and the form fills in and signs you in. Only appears when the server is in demo mode and a demo programme is
 * seeded, so on a normal deployment this renders nothing.
 *
 * No real password is ever shown or sent: the server signs the chosen demo account in directly, and the password box is
 * filled with dots only so the audience can follow what is happening.
 */
const OPEN_KEY = "mentormama:demo-access-open";

/** Open by default (fastest for a presentation); the choice is remembered for this browser tab only. */
function initialOpen(): boolean {
  try {
    return window.sessionStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

export function DemoAccess({ onAuthenticated, onFill }: { onAuthenticated: (user: CurrentUser) => void; onFill: (email: string, password: string) => void }) {
  const accounts = useQuery({ queryKey: ["demo-accounts"], queryFn: getDemoAccounts, staleTime: 60_000, retry: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(initialOpen);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const list = accounts.data ?? [];
  if (!list.length) return null;
  const current: DemoAccount = list.find((account) => account.role === selected) ?? list[0];
  const info = ROLE_INFO[current.role] ?? ROLE_INFO.program_admin;
  const Icon = info.icon;

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.sessionStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* private mode: the card still opens and closes, it just is not remembered */
    }
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(current.email);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available: the address is on screen anyway */
    }
  }

  async function useAccount() {
    if (busy) return;
    setBusy(true);
    setError(null);
    onFill(current.email, "••••••••••••"); // visible autofill
    await new Promise((resolve) => window.setTimeout(resolve, 500)); // a beat, so the fields are seen filling in
    try {
      onAuthenticated(await demoLogin(current.role));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We could not open the demo account.");
      setBusy(false);
    }
  }

  return (
    <section className={`auth-demo${open ? "" : " auth-demo--closed"}`} aria-labelledby="auth-demo-title">
      <button type="button" className="auth-demo__toggle" aria-expanded={open} aria-controls="demo-body" onClick={toggle}>
        <span className="auth-demo__head">
          <span id="auth-demo-title" className="auth-demo__title"><KeyRound size={14} aria-hidden="true" />Explore demo accounts</span>
          {open && <span className="auth-demo__hint">Choose a role to see its prepared programme data.</span>}
        </span>
        <span className="auth-demo__chev" aria-hidden="true"><ChevronDown size={18} /></span>
        <span className="sr-only">{open ? "Minimise" : "Show"}</span>
      </button>
      <div id="demo-body" hidden={!open}>
      <div className="auth-demo__tabs" role="tablist" aria-label="Demo role">
        {list.map((account) => {
          const meta = ROLE_INFO[account.role] ?? ROLE_INFO.program_admin;
          const TabIcon = meta.icon;
          const active = account.role === current.role;
          return (
            <button
              key={account.role}
              type="button"
              role="tab"
              id={`demo-tab-${account.role}`}
              aria-selected={active}
              aria-controls="demo-panel"
              tabIndex={active ? 0 : -1}
              disabled={busy}
              className="auth-demo__tab"
              onClick={() => {
                setSelected(account.role);
                setError(null);
              }}
            >
              <TabIcon size={16} aria-hidden="true" />
              <span>{meta.short}</span>
            </button>
          );
        })}
      </div>
      <div className="auth-demo__card" id="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${current.role}`}>
        <div className="auth-demo__who">
          <span className="auth-demo__icon" aria-hidden="true"><Icon size={20} /></span>
          <span className="auth-demo__text">
            <strong>{current.role_label} demo</strong>
            <small>{current.name}</small>
          </span>
          <button type="button" className="auth-demo__copy" onClick={() => void copyEmail()} aria-label={`Copy ${current.email}`}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <p className="auth-demo__sees">{info.sees}</p>
        <dl className="auth-demo__creds">
          <div><dt>Email</dt><dd>{current.email}</dd></div>
          <div><dt>Password</dt><dd>Filled for you</dd></div>
        </dl>
        <button type="button" className="auth-demo__use" disabled={busy} aria-busy={busy} onClick={() => void useAccount()}>
          <LogIn size={17} aria-hidden="true" />
          {busy ? "Signing in…" : "Use this account"}
        </button>
        {error && <p role="alert" className="auth-demo__error">{error}</p>}
      </div>
      </div>
    </section>
  );
}
