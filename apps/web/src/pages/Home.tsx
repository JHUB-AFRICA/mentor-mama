import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BookOpen,
  Users,
  FolderOpen,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useScrollReveal, useImageReveal } from "../hooks/useScrollReveal";

gsap.registerPlugin(ScrollTrigger);

/* ─── Hero ─── */
function Hero() {
  const heroRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlineRef = useRef<HTMLSpanElement>(null);
  const h1aRef = useRef<HTMLSpanElement>(null);
  const h1bRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useImageReveal<HTMLDivElement>();

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });
    tl.to(overlineRef.current, {
      opacity: 1,
      y: 0,
      duration: 0.6,
      ease: "power3.out",
    })
      .to(
        h1aRef.current,
        { opacity: 1, y: 0, skewY: 0, duration: 0.9, ease: "power3.out" },
        "-=0.2",
      )
      .to(
        h1bRef.current,
        { opacity: 1, y: 0, skewY: 0, duration: 0.9, ease: "power3.out" },
        "-=0.6",
      )
      .to(
        subRef.current,
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" },
        "-=0.5",
      )
      .to(
        ctaRef.current,
        { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" },
        "-=0.3",
      );

    if (heroRef.current && contentRef.current) {
      gsap.to(contentRef.current, {
        y: -40,
        opacity: 0,
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-[100dvh] flex items-center bg-cream overflow-hidden"
    >
      <div
        ref={contentRef}
        className="content-max-width container-padding w-full pt-28 pb-16"
      >
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left: Text */}
          <div className="lg:col-span-7 xl:col-span-6">
            <span
              ref={overlineRef}
              className="text-overline text-sage inline-block opacity-0 translate-y-3"
            >
              Digital Mentorship Platform
            </span>

            <h1 className="mt-6">
              <span
                ref={h1aRef}
                className="block text-display text-navy opacity-0 translate-y-8"
                style={{ transform: "skewY(3deg)" }}
              >
                Better
              </span>
              <span
                ref={h1bRef}
                className="block text-display text-navy opacity-0 translate-y-8"
                style={{ transform: "skewY(3deg)" }}
              >
                mentorship.
              </span>
            </h1>

            <p
              ref={subRef}
              className="mt-8 text-body-large text-charcoal-muted max-w-[460px] opacity-0 translate-y-4"
            >
              MentorMAMA helps maternity clinical mentors guide students better by combining short digital mentor training, a labour ward induction checklist, mentorship session logs, student feedback, and real-time dashboards.
            </p>

            <div
              ref={ctaRef}
              className="mt-10 opacity-0 translate-y-4"
            >
              <Link
                to="/contact"
                className="inline-block bg-sage text-white px-8 py-3.5 rounded-pill text-[14px] font-semibold hover:scale-[1.02] transition-transform shadow-editorial"
              >
                Request Pilot Access
              </Link>
            </div>
          </div>

          {/* Right: Image */}
          <div className="lg:col-span-5 xl:col-span-6 hidden lg:block">
            <div
              ref={imageContainerRef}
              className="relative overflow-hidden rounded-refined border border-gold/15 shadow-editorial-hover"
            >
              <img
                src="/images/two-african-american-pharmacist-working-drugstore-hospital-pharmacy-african-healthcare.jpg"
                alt="Medical professionals collaborating"
                className="w-full h-auto object-cover hover:scale-[1.03] transition-transform duration-700"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



/* ─── Features Overview ─── */
const featureCards = [
  {
    icon: BookOpen,
    title: "Guided Learning",
    description:
      "Structured modules and real-world case discussions designed by experienced professionals.",
  },
  {
    icon: Users,
    title: "Expert Mentorship",
    description:
      "Connect one-on-one with seasoned mentors who guide your clinical journey.",
  },
  {
    icon: FolderOpen,
    title: "Practical Resources",
    description:
      "Access clinical tools, reference guides, and evidence-based materials.",
  },
  {
    icon: TrendingUp,
    title: "Track Progress",
    description:
      "Monitor your growth with detailed analytics and skill assessments.",
  },
];

function FeaturesOverview() {
  const ref = useScrollReveal<HTMLDivElement>({ stagger: 0.15 });

  return (
    <section className="bg-sage/5 relative z-10">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div data-reveal className="mb-16 max-w-lg">
          <span className="text-overline text-sage">What We Offer</span>
          <h2 className="text-h2 text-navy mt-3">Everything you need to excel</h2>
          <p className="text-body-large text-charcoal-muted mt-4">
            A complete ecosystem for maternal healthcare education.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {featureCards.map((card) => (
            <div
              key={card.title}
              data-reveal
              className="bg-white border border-sage/20 rounded-refined p-8 shadow-editorial transition-all duration-300 hover:border-sage/40 hover:scale-[1.01] hover:shadow-editorial-hover"
            >
              <card.icon size={22} className="text-sage stroke-[1.5] mb-6" />
              <h3 className="text-h3 text-navy mb-3">{card.title}</h3>
              <p className="text-body text-charcoal-muted">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Platform Showcase ─── */
function PlatformShowcase() {
  const ref = useScrollReveal<HTMLDivElement>();
  const imageRef = useImageReveal<HTMLDivElement>();

  return (
    <section className="bg-cream relative z-10">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left: Image */}
          <div className="lg:col-span-6">
            <div
              ref={imageRef}
              className="overflow-hidden rounded-refined shadow-editorial"
            >
              <img
                src="/images/hero-dashboard.jpg"
                alt="MentorMAMA Dashboard"
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Right: Content */}
          <div className="lg:col-span-6">
            <div data-reveal>
              <span className="text-overline text-sage">The Platform</span>
              <h2 className="text-h2 text-navy mt-3 mb-5">
                Your learning journey, visualized
              </h2>
              <p className="text-body-large text-charcoal-muted mb-6">
                From mentorship and modules to discussions and resources—everything
                you need to build confidence, strengthen skills, and make an impact
                in maternal healthcare.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Real-time progress tracking",
                  "Personalized learning paths",
                  "Skill competency assessments",
                  "Certificate generation",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-body text-charcoal-muted"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-sage flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 text-body font-medium text-sage hover:gap-3 transition-all"
              >
                See how it works
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Closing CTA ─── */
function ClosingCTA() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative z-10 overflow-hidden py-24 lg:py-32">
      {/* Immersive background image with parallax/scroll effect */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ 
          backgroundImage: "url('/images/tourists-go-up-hill-sunrise.jpg')",
        }}
      />
      {/* Brand-aligned gradient overlay for readability - blends from sage teal to navy at the bottom */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-sage/95 via-sage/80 to-navy" />

      <div ref={ref} className="relative z-20 content-max-width container-padding text-center">
        <div data-reveal className="max-w-xl mx-auto space-y-6">
          <h2 className="text-h2 text-white">Ready to strengthen mentorship in your unit?</h2>
          <p className="text-body-large text-white/80">
            Support clinical mentors and midwives in logging sessions, tracking onboarding checklists, and driving better clinical outcomes.
          </p>
          <div className="pt-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 bg-white text-sage px-8 py-3.5 rounded-pill text-[14px] font-semibold hover:bg-cream transition-colors shadow-editorial"
            >
              Request Pilot Access <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <FeaturesOverview />
      <PlatformShowcase />
      <ClosingCTA />
    </>
  );
}
