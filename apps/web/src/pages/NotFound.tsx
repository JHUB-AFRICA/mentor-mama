import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Compass, LifeBuoy, Mail } from "lucide-react";

const suggestions = [
  { to: "/how-it-works", icon: Compass, title: "How it works", text: "See the mentor and student journey." },
  { to: "/resources", icon: BookOpen, title: "Resources", text: "Guides and tools for mentors." },
  { to: "/support", icon: LifeBuoy, title: "Support", text: "Can’t sign in or something is not working?" },
  { to: "/contact", icon: Mail, title: "Contact us", text: "Ask a question or request pilot access." },
];

/** Any address the website does not have. Marked noindex so search engines do not list it. */
export default function NotFound() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Page not found · MentorMAMA";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      document.title = previous;
      meta.remove();
    };
  }, []);
  return (
    <section className="relative flex min-h-[80vh] items-center bg-cream/30 pt-32 pb-20">
      <div className="content-max-width container-padding w-full">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-[clamp(72px,14vw,140px)] font-extrabold leading-none tracking-tight text-sage/25" aria-hidden="true">404</p>
          <span className="text-overline text-sage">Page not found</span>
          <h1 className="text-h2 text-navy mt-3">We can’t find that page.</h1>
          <p className="mt-5 text-body-large text-charcoal-muted">
            The link may be mistyped or the page may have moved. Here are a few places to continue.
          </p>
          <Link
            to="/"
            className="group mt-8 inline-flex items-center gap-2 rounded-pill bg-navy px-7 py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
          >
            Back to the home page
            <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <ul className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-2">
          {suggestions.map(({ to, icon: Icon, title, text }) => (
            <li key={to}>
              <Link
                to={to}
                className="group flex h-full items-start gap-4 rounded-refined border border-cream-dark/70 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-sage/40 hover:shadow-editorial-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-refined bg-sage/10 text-sage">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-navy">{title}</span>
                  <span className="mt-0.5 block text-body-small text-charcoal-muted">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
