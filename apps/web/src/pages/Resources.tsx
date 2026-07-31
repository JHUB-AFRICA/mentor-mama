import { useState } from "react";
import { useScrollReveal, useImageReveal } from "../hooks/useScrollReveal";
import {
  BookOpen,
  Stethoscope,
  UsersRound,
  Search,
  ArrowRight,
} from "lucide-react";

/* ─── Hero ─── */
function ResourcesHero() {
  return (
    <section className="relative min-h-[45vh] flex items-center overflow-hidden py-20 lg:py-28">
      {/* Immersive background image with pharmacy/healthcare collaboration */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ 
          backgroundImage: "url('/images/two-african-american-pharmacist-working-drugstore-hospital-pharmacy-african-healthcare.jpg')",
        }}
      />
      {/* Deep navy gradient overlay for professional visual hierarchy */}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-navy via-navy/90 to-navy/40" />

      <div className="relative z-20 content-max-width container-padding pt-16 w-full">
        <div className="max-w-2xl">
          <span className="text-overline text-sage">Resources</span>
          <h1 className="text-h1 text-white mt-3">
            Learning resources for every stage
          </h1>
          <p className="mt-6 text-body-large text-white/80">
            From beginner guides to advanced clinical references, find what you
            need to grow your skills.
          </p>
          <div className="mt-8 max-w-md">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-5 top-1/2 -translate-y-1/2 text-charcoal-muted"
              />
              <input
                type="text"
                placeholder="Search resources..."
                className="w-full pl-12 pr-5 py-3.5 rounded-pill bg-cream text-navy placeholder:text-charcoal-muted text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Categories ─── */
const categories = [
  {
    icon: BookOpen,
    title: "Learning Modules",
    description: "Structured courses for midwives and medical students.",
    count: "85+ modules",
  },
  {
    icon: Stethoscope,
    title: "Clinical Tools",
    description: "Practical guides and reference materials.",
    count: "120+ tools",
  },
  {
    icon: UsersRound,
    title: "Community Content",
    description: "Discussions, webinars, and shared experiences.",
    count: "50+ events",
  },
];

function Categories() {
  const ref = useScrollReveal<HTMLDivElement>({ stagger: 0.12 });

  return (
    <section className="bg-cream relative z-10">
      <div ref={ref} className="content-max-width container-padding pt-16 pb-8">
        <div className="grid md:grid-cols-3 gap-8">
          {categories.map((cat) => (
            <div key={cat.title} data-reveal className="group cursor-pointer">
              <cat.icon size={20} className="text-sage stroke-[1.5] mb-4" />
              <h3 className="text-h4 text-navy mb-1">{cat.title}</h3>
              <p className="text-body text-charcoal-muted mb-3">
                {cat.description}
              </p>
              <span className="text-overline text-sage">{cat.count}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Spotlight ─── */
function Spotlight() {
  const ref = useScrollReveal<HTMLDivElement>();
  const imageRef = useImageReveal<HTMLDivElement>();

  return (
    <section className="bg-sage/5 relative z-10 border-b border-cream-dark/10">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div data-reveal className="mb-10">
          <span className="text-overline text-sage">Featured</span>
          <h2 className="text-h2 text-navy mt-2">Resource Spotlight</h2>
        </div>
        <div data-reveal className="bg-white border border-sage/20 rounded-refined overflow-hidden shadow-editorial">
          <div className="grid lg:grid-cols-2">
            <div ref={imageRef} className="aspect-video lg:aspect-auto overflow-hidden">
              <img
                src="/images/resource-thumbnail-1.jpg"
                alt="Maternal Emergency Protocols"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-8 lg:p-10 flex flex-col justify-center">
              <span className="text-overline text-sage">Most Popular</span>
              <h3 className="text-h3 text-navy mt-2 mb-3">
                Maternal Emergency Protocols
              </h3>
              <p className="text-body text-charcoal-muted mb-5">
                Our most comprehensive module covering critical emergency
                procedures every maternal healthcare professional should master.
              </p>
              <ul className="space-y-2 mb-6">
                {[
                  "12 interactive case studies",
                  "8 video demonstrations",
                  "Downloadable checklists",
                  "Certificate on completion",
                ].map((i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-body-small text-charcoal-muted"
                  >
                    <span className="w-1 h-1 rounded-full bg-sage flex-shrink-0" />
                    {i}
                  </li>
                ))}
              </ul>
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-sage text-white px-6 py-3 rounded-pill text-body-small font-semibold hover:bg-sage/90 transition-colors w-fit"
              >
                Start Learning <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Resource List ─── */
const filters = ["All", "Modules", "Tools", "Webinars", "Guides"];
const resources = [
  {
    title: "Maternal Emergency Protocols",
    category: "Modules",
    description: "Comprehensive module covering emergency procedures.",
    author: "Dr. Naomi K.",
    image: "/images/resource-thumbnail-1.jpg",
  },
  {
    title: "Neonatal Care Basics",
    category: "Guides",
    description: "Essential guide for neonatal care and assessment.",
    author: "Sarah M.",
    image: "/images/resource-thumbnail-2.jpg",
  },
  {
    title: "Community Health Training",
    category: "Modules",
    description: "Training for community health workers.",
    author: "Amina Hassan",
    image: "/images/resource-thumbnail-3.jpg",
  },
  {
    title: "Clinical Decision Making",
    category: "Modules",
    description: "Systematic approaches to labor and delivery decisions.",
    author: "Dr. James O.",
    image: "/images/feature-learning.jpg",
  },
  {
    title: "Midwifery Skills Assessment",
    category: "Tools",
    description: "Interactive assessment for core competencies.",
    author: "Grace W.",
    image: "/images/feature-mentorship.jpg",
  },
  {
    title: "Vaccinations in Pregnancy",
    category: "Webinars",
    description: "Recorded webinar on vaccination protocols.",
    author: "Dr. Patricia L.",
    image: "/images/community-events.jpg",
  },
];

function ResourceList() {
  const [activeFilter, setActiveFilter] = useState("All");
  const ref = useScrollReveal<HTMLDivElement>({ stagger: 0.1 });
  const filtered =
    activeFilter === "All"
      ? resources
      : resources.filter((r) => r.category === activeFilter);

  return (
    <section className="bg-cream relative z-10">
      <div ref={ref} className="content-max-width container-padding pb-20 lg:pb-28">
        <div data-reveal className="flex flex-wrap gap-2 mb-10">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-5 py-2 rounded-pill text-body-small font-medium transition-all ${
                activeFilter === f
                  ? "bg-sage text-white"
                  : "bg-cream-dark/50 text-charcoal-muted hover:bg-cream-dark"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((r) => (
            <div
              key={r.title}
              data-reveal
              className="group bg-white border border-cream-dark/50 rounded-refined overflow-hidden shadow-editorial hover:shadow-editorial-hover transition-all duration-300 hover:scale-[1.01]"
            >
              <div className="aspect-video overflow-hidden">
                <img
                  src={r.image}
                  alt={r.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <div className="p-6">
                <span className="text-overline text-sage">{r.category}</span>
                <h3 className="text-h4 text-navy mt-2 mb-1">{r.title}</h3>
                <p className="text-body-small text-charcoal-muted mb-4 line-clamp-2">
                  {r.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-body-small text-charcoal-muted/60">
                    by {r.author}
                  </span>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-body-small font-medium text-sage hover:gap-2 transition-all"
                  >
                    Access <ArrowRight size={12} />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Resources() {
  return (
    <>
      <ResourcesHero />
      <Categories />
      <Spotlight />
      <ResourceList />
    </>
  );
}
