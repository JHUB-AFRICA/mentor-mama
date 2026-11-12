import { partners } from "../lib/site";

/** Programme partners as an even grid of logo tiles. Every logo is a named link to the partner's site. */
export default function Partners({ tone = "light" }: { tone?: "light" | "cream" }) {
  return (
    <section aria-labelledby="partners-heading" className={`${tone === "cream" ? "bg-cream" : "bg-white"} border-t border-cream-dark/30`}>
      <div className="content-max-width container-padding py-16 lg:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <span className="text-overline text-sage">Programme partners</span>
          <h2 id="partners-heading" className="text-h3 text-navy mt-3">
            Built with the people who train and care for mothers
          </h2>
          <p className="mt-4 text-body text-charcoal-muted">
            Universities, innovators and community health organisations working together so every student gets reliable clinical mentorship.
          </p>
        </div>
        <ul className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {partners.map((partner) => (
            <li key={partner.name}>
              <a
                href={partner.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${partner.name} (opens in a new tab)`}
                className="group flex h-full flex-col items-center justify-between gap-4 rounded-refined border border-cream-dark/70 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-sage/40 hover:shadow-editorial-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                <span className="flex h-[72px] w-full items-center justify-center">
                  <img
                    src={partner.logo}
                    alt=""
                    width={partner.width}
                    height={partner.height}
                    loading="lazy"
                    className="max-h-[72px] w-auto max-w-full object-contain transition duration-300 group-hover:scale-[1.04]"
                  />
                </span>
                <span className="text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-charcoal-muted">{partner.role}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
