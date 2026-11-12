import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, ChevronRight, LifeBuoy, LogIn, Menu, X } from "lucide-react";
import { portalUrl } from "../lib/portal";
import Logo from "./Logo";

const navLinks = [
  { label: "About", href: "/about" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Resources", href: "/resources" },
  { label: "Community", href: "/community" },
  { label: "Contact", href: "/contact" },
];

const PILOT = "/contact?type=pilot";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobile menu: no background scroll, Escape closes and returns focus to the button.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-pill focus:bg-navy focus:px-5 focus:py-2.5 focus:text-[13px] focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 lg:pt-4">
        <nav
          aria-label="Main"
          className={`pointer-events-auto mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 rounded-2xl border px-4 sm:px-6 backdrop-blur-xl transition-all duration-300 ${
            scrolled || open
              ? "border-cream-dark/70 bg-white/90 shadow-[0_8px_32px_rgba(13,27,51,0.10)]"
              : "border-white/60 bg-white/70 shadow-[0_2px_12px_rgba(13,27,51,0.04)]"
          }`}
        >
          <Link to="/" className="flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage" aria-label="MentorMAMA home">
            <Logo lockup="horizontal" tone="navy" height={30} accentWord title="" />
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <NavLink
                  to={link.href}
                  className={({ isActive }) =>
                    `relative block rounded-pill px-4 py-2 text-[14px] font-medium tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                      isActive ? "bg-sage/10 text-sage" : "text-charcoal hover:bg-cream hover:text-navy"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-2 lg:flex">
            <a
              href={portalUrl}
              className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[14px] font-medium text-charcoal transition-colors hover:bg-cream hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <LogIn size={15} aria-hidden="true" /> Sign in
            </a>
            <Link
              to={PILOT}
              className="group inline-flex items-center gap-2 rounded-pill bg-navy px-5 py-2.5 text-[14px] font-semibold text-white transition-all hover:bg-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
            >
              Request pilot access
              <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <button
            ref={menuButton}
            type="button"
            className="-mr-1 grid h-11 w-11 place-items-center rounded-xl text-navy transition-colors hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>

        {/* Mobile menu: a sheet under the bar */}
        <div
          id="mobile-menu"
          hidden={!open}
          className="pointer-events-auto mx-auto mt-2 max-w-[1240px] overflow-hidden rounded-2xl border border-cream-dark/70 bg-white shadow-[0_16px_48px_rgba(13,27,51,0.16)] lg:hidden"
        >
          <ul className="p-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <NavLink
                  to={link.href}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-4 py-3.5 text-[16px] font-semibold transition-colors ${isActive ? "bg-sage/10 text-sage" : "text-navy hover:bg-cream"}`
                  }
                >
                  {link.label}
                  <ChevronRight size={18} aria-hidden="true" className="opacity-40" />
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 border-t border-cream-dark/60 bg-cream/50 p-4">
            <Link to={PILOT} className="flex items-center justify-center gap-2 rounded-pill bg-navy px-6 py-3.5 text-[15px] font-semibold text-white">
              Request pilot access <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <a href={portalUrl} className="flex items-center justify-center gap-2 rounded-pill border border-cream-dark bg-white px-4 py-3 text-[14px] font-semibold text-navy">
                <LogIn size={15} aria-hidden="true" /> Sign in
              </a>
              <Link to="/support" className="flex items-center justify-center gap-2 rounded-pill border border-cream-dark bg-white px-4 py-3 text-[14px] font-semibold text-navy">
                <LifeBuoy size={15} aria-hidden="true" /> Support
              </Link>
            </div>
          </div>
        </div>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-[2px] lg:hidden" aria-hidden="true" onClick={() => setOpen(false)} />}
    </>
  );
}
