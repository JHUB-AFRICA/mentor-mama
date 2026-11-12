import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ClipboardCheck, Lock, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { websiteUrl } from "../../lib/site";

import journeyArtwork from "../../assets/auth/mentor-mama-journey.png";
import logoIcon from "../../assets/brand/logo-icon.svg";
import "./auth.css";

const benefits: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Users, title: "Guided mentorship", text: "Students and mentors connected around every placement." },
  { icon: ClipboardCheck, title: "Progress you can see", text: "Learning, practice and sign-off kept clear in one place." },
  { icon: Lock, title: "Private by design", text: "Role-based access with an extra check for programme accounts." },
];

/**
 * Split-screen shell for every signed-out step.
 *
 * - Desktop: sticky navy brand panel on the left, form card on the right.
 * - Mobile: a sticky compact top bar and a single column.
 * - `stepKey` swaps the card content with a short fade/slide; it is
 *   skipped when the user prefers reduced motion.
 * - On each new step focus moves to the first field (`focus="field"`)
 *   or to the heading, so keyboard and screen-reader users land in context.
 */
export function AuthLayout({
  children,
  stepKey = "default",
  width = "md",
  focus = "heading",
}: {
  children: ReactNode;
  stepKey?: string;
  width?: "md" | "lg";
  focus?: "heading" | "field";
}) {
  const reduce = useReducedMotion();
  // Browser tab names the step ("Sign in · MentorMAMA") from the screen's own heading.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const heading = document.querySelector(".auth-surface h1, .auth-surface h2")?.textContent?.trim();
      document.title = heading ? `${heading} · MentorMAMA` : "MentorMAMA";
    }, 0);
    return () => window.clearTimeout(id);
  }, [stepKey]);
  return (
    <main className="auth-shell min-h-dvh overflow-x-clip bg-[#F4F7F8] lg:grid lg:grid-cols-[minmax(380px,0.82fr)_minmax(0,1.18fr)]">
      <BrandPanel />

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Sticky compact bar for small screens */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#dbe4ed] bg-white/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/75 sm:px-8 lg:hidden">
          <a href={websiteUrl} aria-label="MentorMAMA website" title="Back to the MentorMAMA website" className="inline-flex min-h-11 items-center gap-2.5 rounded-lg text-[#0D1B33] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#157373]">
            <img src={logoIcon} alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
            <span className="font-display text-base font-bold tracking-tight">MentorMAMA</span>
          </a>
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#4f627d]">Secure portal</span>
        </header>

        <section className="auth-surface relative flex overflow-x-clip flex-1 items-start justify-center px-4 py-6 sm:px-8 sm:py-8 lg:items-center lg:px-12">
          <div className="relative z-10 w-full" style={{ maxWidth: width === "lg" ? "30rem" : "26rem" }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={stepKey}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <StepFocus focus={focus}>
                  <div className="auth-card">{children}</div>
                </StepFocus>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  );
}

function StepFocus({ children, focus }: { children: ReactNode; focus: "heading" | "field" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const field = focus === "field" ? root.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([readonly]):not([disabled])") : null;
    const target = field ?? root.querySelector<HTMLElement>("h1");
    if (!target) return;
    if (target.tagName === "H1") target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [focus]);
  return <div ref={ref}>{children}</div>;
}

function BrandPanel() {
  return (
    <aside className="auth-brand auth-brand-pad relative hidden overflow-hidden px-12 py-12 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:flex-col xl:px-16">
      <div className="auth-blob auth-blob--a" aria-hidden="true" />
      <div className="auth-blob auth-blob--b" aria-hidden="true" />
      <div className="auth-lines" aria-hidden="true" />

      {/* Optional artwork: hidden if the asset cannot load. */}
      <img
        src={journeyArtwork}
        alt=""
        aria-hidden="true"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] w-full object-cover object-[55%_center] opacity-60"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[30%] h-40 bg-gradient-to-b from-[#0D1B33] to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-b from-transparent via-[#0D1B33]/50 to-[#0D1B33]/90" aria-hidden="true" />

      <div className="relative z-10 flex h-full flex-col">
        <a href={websiteUrl} aria-label="MentorMAMA website" title="Back to the MentorMAMA website" className="inline-flex w-fit items-center gap-3 rounded-lg text-white no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#45B9B3]">
          <img src={logoIcon} alt="" className="h-10 w-10 object-contain" aria-hidden="true" />
          <span className="font-display text-lg font-bold tracking-[-0.025em]">MentorMAMA</span>
        </a>

        <div className="auth-brand-message mt-14 xl:mt-20">
          <p className="max-w-[26rem] font-display text-[2rem] font-semibold leading-[1.15] tracking-[-0.025em] xl:text-[2.4rem]">
            A calmer way to support better clinical <span className="text-[#45B9B3]">mentorship.</span>
          </p>
          <div className="mt-6 h-[3px] w-14 rounded-full bg-[#45B9B3]" aria-hidden="true" />
          <ul className="auth-brand-benefits m-0 mt-8 grid max-w-[26rem] list-none gap-5 p-0">
            {benefits.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#45B9B3]/40 bg-[#45B9B3]/10 text-[#45B9B3]">
                  <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-5 text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-auto text-xs text-white/70">Secure programme portal</p>
      </div>
    </aside>
  );
}

export function BackLink({ children = "Back to sign in", to = "/" }: { children?: ReactNode; to?: string }) {
  return (
    <Link to={to} className="auth-link auth-link--muted -ml-1 px-1">
      <ArrowLeft size={16} aria-hidden="true" />
      {children}
    </Link>
  );
}
