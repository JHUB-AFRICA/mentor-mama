import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Mail, MapPin } from "lucide-react";
import Logo from "./Logo";
import { platformSignInUrl, portalUrl } from "../lib/portal";
import { contactEmail, partners } from "../lib/site";

type FooterLink = { label: string; to?: string; href?: string; external?: boolean };

const columns: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Platform",
    links: [
      { label: "About us", to: "/about" },
      { label: "How it works", to: "/how-it-works" },
      { label: "Resources library", to: "/resources" },
      { label: "Community", to: "/community" },
    ],
  },
  {
    title: "Get involved",
    links: [
      { label: "Request pilot access", to: "/contact?type=pilot" },
      { label: "Contact us", to: "/contact" },
      { label: "Support", to: "/support" },
      { label: "Check request status", to: "/status" },
    ],
  },
  {
    title: "Sign in",
    links: [
      { label: "Portal sign in", href: portalUrl },
      { label: "Platform administration", href: platformSignInUrl },
      { label: "Privacy notice", to: "/privacy" },
    ],
  },
];

const linkClass =
  "text-[14px] text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage rounded-sm";

export default function Footer() {
  return (
    <footer className="bg-navy text-white" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        MentorMAMA site footer
      </h2>

      {/* Call to action */}
      <div className="border-b border-white/10">
        <div className="content-max-width container-padding flex flex-col items-start justify-between gap-6 py-12 md:flex-row md:items-center">
          <div className="max-w-xl">
            <p className="font-display text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">Bring better mentorship to your maternity unit.</p>
            <p className="mt-2 text-[14px] text-white/60">Tell us about your unit and cohort. We reply within 2 working days.</p>
          </div>
          <Link
            to="/contact?type=pilot"
            className="group inline-flex shrink-0 items-center gap-2 rounded-pill bg-white px-7 py-3.5 text-[14px] font-semibold text-navy transition-colors hover:bg-sage hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          >
            Request pilot access
            <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      {/* Links */}
      <div className="content-max-width container-padding grid gap-12 py-16 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-4">
          <Link to="/" aria-label="MentorMAMA home" className="inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage">
            <Logo lockup="horizontal" tone="white" height={34} title="" />
          </Link>
          <p className="max-w-xs text-[14px] leading-relaxed text-white/60">
            A digital clinical mentorship toolkit supporting midwives and nursing students for safer maternity care placements.
          </p>
          <ul className="space-y-3 text-[14px]">
            <li>
              <a href={`mailto:${contactEmail}`} className="group inline-flex items-center gap-2.5 text-white/70 transition-colors hover:text-white">
                <Mail size={15} aria-hidden="true" className="text-sage" />
                {contactEmail}
              </a>
            </li>
            <li className="flex items-center gap-2.5 text-white/70">
              <MapPin size={15} aria-hidden="true" className="text-sage" />
              Nairobi, Kenya
            </li>
          </ul>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-5 lg:gap-8">
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{column.title}</h3>
              <ul className="mt-5 space-y-3.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to} className={linkClass}>
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className={`${linkClass} inline-flex items-center gap-1`}>
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="lg:col-span-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Programme partners</h3>
          <ul className="mt-5 space-y-3.5">
            {partners.map((partner) => (
              <li key={partner.name}>
                <a href={partner.href} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-1.5`}>
                  {partner.name.startsWith("Jomo") ? "JKUAT" : partner.name}
                  <ArrowUpRight size={13} aria-hidden="true" className="opacity-50" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="content-max-width container-padding flex flex-col items-center justify-between gap-3 py-6 text-[12px] text-white/40 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} MentorMAMA. All rights reserved.</p>
          <p>
            Built by <a href="https://sinapstechnology.tech" target="_blank" rel="noopener noreferrer" className="text-white/60 transition-colors hover:text-white">Sinaps Technology</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
