import { forwardRef, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertCircle, Check, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Link } from "react-router-dom";

/* Small presentational pieces shared by the signed-out auth screens. */

type AlertKind = "error" | "success" | "info" | "warning";

export function AuthAlert({ kind = "error", title, children }: { kind?: AlertKind; title?: string; children: ReactNode }) {
  const Icon = kind === "success" ? CheckCircle2 : kind === "info" ? Info : kind === "warning" ? TriangleAlert : AlertCircle;
  // Errors interrupt; the other kinds are polite status updates.
  const role = kind === "error" ? "alert" : "status";
  return (
    <div className={`auth-alert auth-alert--${kind}`} role={role}>
      <Icon aria-hidden="true" />
      <div className="min-w-0">
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

type AuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
  inline?: boolean;
  /** Client-side route. */
  to?: string;
  /** Full page navigation. */
  href?: string;
};

export function AuthButton({ variant = "primary", size = "md", inline, to, href, className, children, ...props }: AuthButtonProps) {
  const classes = [
    "auth-btn",
    variant === "ghost" ? "auth-btn--ghost" : "",
    size === "sm" ? "auth-btn--sm" : "",
    inline ? "auth-btn--inline" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  if (to) return <Link to={to} className={classes}>{children}</Link>;
  if (href) return <a href={href} className={classes}>{children}</a>;
  return <button className={classes} {...props}>{children}</button>;
}

/**
 * Six (or eight) visual boxes driven by ONE real input. Keeping a single
 * input means paste, backspace, auto-advance, SMS/OTP autofill and
 * `fill()` all work natively, and screen readers see one labelled field.
 */
export const OtpInput = forwardRef<
  HTMLInputElement,
  {
    length: number;
    value: string;
    onChange: (value: string) => void;
    id?: string;
    disabled?: boolean;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }
>(function OtpInput({ length, value, onChange, id, disabled, "aria-describedby": describedBy, "aria-invalid": invalid }, ref) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);
  function caretToEnd(input: HTMLInputElement) {
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  }
  return (
    <div className="auth-otp" data-length={length} data-invalid={invalid ? "true" : undefined} data-disabled={disabled ? "true" : undefined}>
      <input
        ref={ref}
        id={id}
        className="auth-otp__input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`[0-9]{${length}}`}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
        onFocus={(event) => { setFocused(true); caretToEnd(event.currentTarget); }}
        onClick={(event) => caretToEnd(event.currentTarget)}
        onBlur={() => setFocused(false)}
        required
      />
      <div className="auth-otp__boxes" aria-hidden="true">
        {Array.from({ length }, (_, index) => (
          <span key={index} className="auth-otp__box" data-filled={value[index] ? "true" : undefined} data-active={focused && index === activeIndex ? "true" : undefined}>
            {value[index] ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
});

/* ---- Password strength ----------------------------------------- */

export const PASSWORD_MIN_LENGTH = 12;

export function passwordLevel(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  if (password.length < PASSWORD_MIN_LENGTH || /^\d+$/.test(password)) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  const words = password.trim().split(/\s+/).length;
  let score = 2;
  if (password.length >= 16 || words >= 4) score += 1;
  if (classes >= 3 || (password.length >= 20 && classes >= 2)) score += 1;
  return Math.min(score, 4) as 2 | 3 | 4;
}

const levelLabel = ["", "Too weak", "Fair", "Good", "Strong"] as const;

function Rule({ ok, bad, children }: { ok: boolean; bad?: boolean; children: ReactNode }) {
  return (
    <li className="auth-check" data-ok={ok ? "true" : undefined} data-bad={bad ? "true" : undefined}>
      <span className="auth-check__dot" aria-hidden="true">{bad ? <X size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}</span>
      <span>{children}<span className="sr-only">{ok ? " — met" : " — not met yet"}</span></span>
    </li>
  );
}

/** Live strength meter + checklist. Mirrors the server's length and numeric-only rules. */
export function PasswordStrength({ password, id }: { password: string; id: string }) {
  const level = passwordLevel(password);
  return (
    <div id={id} className="space-y-2.5" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="auth-meter flex-1" data-level={level} aria-hidden="true"><span /><span /><span /><span /></div>
        <span className="w-[4.5rem] text-right text-xs font-semibold text-[#4f627d]">{level ? levelLabel[level] : "Strength"}</span>
      </div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        <Rule ok={password.length >= PASSWORD_MIN_LENGTH}>At least {PASSWORD_MIN_LENGTH} characters</Rule>
        <Rule ok={password.length > 0 && !/^\d+$/.test(password)}>Not made up of numbers only</Rule>
      </ul>
      <p className="m-0 text-xs leading-5 text-[#4f627d]">Longer passphrases are stronger. Very common passwords and ones that resemble your name or email are also declined.</p>
    </div>
  );
}

export function MatchIndicator({ password, confirmation, id }: { password: string; confirmation: string; id: string }) {
  if (!confirmation) return <span id={id} aria-live="polite" />;
  const match = password === confirmation;
  return (
    <ul id={id} className="m-0 list-none p-0" aria-live="polite">
      <Rule ok={match} bad={!match}>{match ? "Passwords match" : "Passwords do not match yet"}</Rule>
    </ul>
  );
}

/* ---- Step progress ---------------------------------------------- */

export function StepProgress({ steps, current, label = "Progress" }: { steps: string[]; current: number; label?: string }) {
  return (
    <nav aria-label={label}>
      <ol className="auth-steps">
        {steps.map((step, index) => (
          <li key={step} data-state={index < current ? "done" : index === current ? "current" : "todo"} aria-current={index === current ? "step" : undefined}>
            <div className="auth-steps__bar" aria-hidden="true" />
            <span className="auth-steps__label">
              <span className="sr-only">Step {index + 1} of {steps.length}: </span>
              {step}
              {index < current && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ---- Hooks -------------------------------------------------------- */

/** Counts down once started. `start()` resets it; returns whole seconds left. */
export function useCountdown(seconds: number) {
  const [left, setLeft] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(timer.current), []);
  function start() {
    window.clearInterval(timer.current);
    setLeft(seconds);
    timer.current = window.setInterval(() => {
      setLeft((value) => {
        if (value <= 1) { window.clearInterval(timer.current); return 0; }
        return value - 1;
      });
    }, 1000);
  }
  return { left, start };
}
