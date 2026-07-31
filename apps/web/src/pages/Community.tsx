import { useScrollReveal, useImageReveal } from "../hooks/useScrollReveal";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Users,
  Calendar,
  ArrowRight,
} from "lucide-react";

/* ─── Hero ─── */
function CommunityHero() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative min-h-[50vh] flex items-center overflow-hidden py-20 lg:py-28">
      {/* Immersive background image with online video call */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ 
          backgroundImage: "url('/images/black-young-couple-attending-online-video-call-connection-home.jpg')",
        }}
      />
      {/* Rich deep navy gradient overlay for professional high-contrast aesthetic */}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-navy via-navy/90 to-navy/40" />

      <div ref={ref} className="relative z-20 content-max-width container-padding pt-16 w-full">
        <div className="max-w-2xl">
          <span data-reveal className="text-overline text-sage">Community</span>
          <h1 data-reveal className="text-h1 text-white mt-3">
            Connected by purpose, supported by peers
          </h1>
          <p data-reveal className="mt-6 text-body-large text-white/80">
            A collaborative space for clinical mentors, midwives, and students to share experiences and learn together.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Community Features ─── */
const communityFeatures = [
  {
    icon: MessageSquare,
    overline: "Discussion Forums",
    overlineColor: "text-sage",
    bg: "bg-cream",
    title: "Ask, share, and learn together",
    description:
      "Join moderated forums to discuss clinical cases, study strategies, and career advice with peers and mentors.",
    image: "/images/community-discussion.jpg",
    cta: "Join the discussion",
  },
  {
    icon: Users,
    overline: "Mentorship Matching",
    overlineColor: "text-sage",
    bg: "bg-sage/5",
    title: "Find your perfect mentor",
    description:
      "Our matching system pairs you with experienced mentors based on your specialty, goals, and learning style.",
    image: "/images/teamwork-helping-upstairs.jpg",
    cta: "Find a mentor",
  },
  {
    icon: Calendar,
    overline: "Events & Webinars",
    overlineColor: "text-sage",
    bg: "bg-cream",
    title: "Learn from the best",
    description:
      "Attend live sessions, workshops, and webinars led by industry experts and experienced practitioners.",
    image: "/images/community-events.jpg",
    cta: "Browse events",
  },
];

function CommunityFeatures() {
  return (
    <>
      {communityFeatures.map((f, i) => {
        const ref = useScrollReveal<HTMLDivElement>();
        const imageRef = useImageReveal<HTMLDivElement>();
        const isReversed = i % 2 === 1;

        return (
          <section key={f.overline} className={`${f.bg} relative z-10 border-b border-cream-dark/10`}>
            <div ref={ref} className="content-max-width container-padding py-20 lg:py-28">
              <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
                <div
                  className={`lg:col-span-6 ${isReversed ? "lg:order-2" : ""}`}
                >
                  <div data-reveal>
                    <div className="w-10 h-10 rounded-refined bg-sage/10 flex items-center justify-center mb-5">
                      <f.icon
                        size={18}
                        className="text-sage stroke-[1.5]"
                      />
                    </div>
                    <span className={`text-overline ${f.overlineColor}`}>
                      {f.overline}
                    </span>
                    <h2 className="text-h2 text-navy mt-3 mb-4">
                      {f.title}
                    </h2>
                    <p className="text-body-large text-charcoal-muted mb-6">
                      {f.description}
                    </p>
                    <a
                      href="#"
                      className="inline-flex items-center gap-2 text-body font-medium text-sage hover:gap-3 transition-all"
                    >
                      {f.cta} <ArrowRight size={16} />
                    </a>
                  </div>
                </div>
                <div
                  className={`lg:col-span-6 ${isReversed ? "lg:order-1" : ""}`}
                >
                  <div
                    ref={imageRef}
                    className="overflow-hidden rounded-refined shadow-editorial"
                  >
                    <img 
                      src={f.image} 
                      alt={f.title} 
                      className="w-full h-auto object-cover hover:scale-[1.03] transition-transform duration-700" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

/* ─── Join CTA ─── */
function JoinCTA() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="bg-white relative z-10">
      <div ref={ref} className="content-max-width container-padding py-20 lg:py-28 text-center">
        <div data-reveal className="max-w-xl mx-auto space-y-6">
          <h2 className="text-h2 text-navy">Join our community today</h2>
          <p className="text-body-large text-charcoal-muted">
            Whether you are a student seeking mentorship or a professional looking
            to give back, there is a place for you.
          </p>
          <div className="pt-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 bg-sage text-white px-8 py-3.5 rounded-pill text-body-small font-semibold hover:bg-sage/90 transition-colors shadow-editorial"
            >
              Request Pilot Access <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Community() {
  return (
    <>
      <CommunityHero />
      <CommunityFeatures />
      <JoinCTA />
    </>
  );
}
