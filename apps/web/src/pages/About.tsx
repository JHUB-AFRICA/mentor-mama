import { useScrollReveal, useImageReveal } from "../hooks/useScrollReveal";
import {
  Heart,
  Shield,
  Users,
  BookOpen,
  Linkedin,
  Github,
  Twitter
} from "lucide-react";

/* ─── Hero ─── */
function AboutHero() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative min-h-[60vh] flex items-center overflow-hidden py-20 lg:py-28">
      {/* Immersive background image of medical students */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ 
          backgroundImage: "url('/images/group-african-medical-students-posed-outdoor-against-university-door.jpg')",
        }}
      />
      {/* Premium deep navy gradient overlay to keep text highly readable */}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-navy via-navy/90 to-transparent" />

      <div ref={ref} className="relative z-20 content-max-width container-padding pt-16 w-full">
        <div className="max-w-2xl">
          <span data-reveal className="text-overline text-gold">About Us</span>
          <h1 data-reveal className="text-h1 text-white mt-4">
            Our mission is simple
          </h1>
          <p data-reveal className="mt-6 text-body-large text-white/85 max-w-lg">
            We believe every aspiring healthcare professional deserves access to quality mentorship and consistent, structured learning resources.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Story & Core Problem ─── */
function Story() {
  const ref = useScrollReveal<HTMLDivElement>();
  const imageRef = useImageReveal<HTMLDivElement>();

  return (
    <section className="bg-cream relative z-10 border-b border-cream-dark/20">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-6">
            <div data-reveal className="space-y-6">
              <span className="text-overline text-sage">The Challenge</span>
              <h2 className="text-h2 text-navy">Consistency over chance</h2>
              <p className="text-body-large text-charcoal leading-relaxed">
                Clinical mentorship quality in maternity units depends on which mentor a student happens to get — not on any system designed to make that experience consistent. Some students receive excellent guidance. Others receive almost none. The difference is luck, not design.
              </p>
              <p className="text-body text-charcoal-muted leading-relaxed">
                MentorMAMA exists so that good mentorship doesn't depend on which mentor a student happens to get. We build mobile-first frameworks that support mentors and students alike, ensuring clinical standards are taught reliably.
              </p>
              <div className="pt-4 border-t border-cream-dark/50">
                <p className="text-body-small text-charcoal-muted italic">
                  Academic Basis: Derived from a proposal by Dr. Carolyne Kerubo Nyariki, School of Nursing, College of Health Sciences, JKUAT.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div
              ref={imageRef}
              className="overflow-hidden rounded-refined shadow-editorial"
            >
              <img
                src="/images/teamwork-helping-upstairs.jpg"
                alt="MentorMAMA mentorship and teamwork support"
                className="w-full h-auto object-cover hover:scale-[1.03] transition-transform duration-700"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Vision, Mission & Scope ─── */
function VisionMission() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="bg-white relative z-10 py-20 lg:py-24 border-b border-cream-dark/20">
      <div ref={ref} className="content-max-width container-padding">
        <div className="grid md:grid-cols-2 gap-12">
          
          <div data-reveal className="space-y-4">
            <span className="text-overline text-sage">Vision & Purpose</span>
            <h3 className="text-h3 text-navy font-semibold">Our Vision</h3>
            <p className="text-body text-charcoal-muted leading-relaxed">
              A future where the quality of a student's clinical mentorship is determined by the system supporting them, not by chance.
            </p>
          </div>

          <div data-reveal className="space-y-4">
            <span className="text-overline text-sage">Action & Focus</span>
            <h3 className="text-h3 text-navy font-semibold">Our Mission</h3>
            <p className="text-body text-charcoal-muted leading-relaxed">
              To give clinical mentors the structure, training, and tools to mentor well in minutes, not hours — and to give universities and facilities visibility into mentorship quality without adding to mentors' workload.
            </p>
          </div>

        </div>

        {/* Scope Honesty: What We Are Not */}
        <div className="mt-16 bg-cream border border-cream-dark/60 rounded-refined p-8" data-reveal>
          <h4 className="text-overline text-charcoal mb-4 font-semibold">Scope & Clarity: What MentorMAMA Is Not</h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            <div>
              <span className="text-[13px] font-semibold text-navy block mb-1">No EHR / HMS</span>
              <p className="text-body-small text-charcoal-muted">We are not an electronic medical record or hospital management system.</p>
            </div>
            <div>
              <span className="text-[13px] font-semibold text-navy block mb-1">No Surveillance Tool</span>
              <p className="text-body-small text-charcoal-muted">We do not build compliance tools to police, rank, or shame mentors.</p>
            </div>
            <div>
              <span className="text-[13px] font-semibold text-navy block mb-1">No Mentor Replacement</span>
              <p className="text-body-small text-charcoal-muted">We support clinical interactions; we do not replace real human relationship.</p>
            </div>
            <div>
              <span className="text-[13px] font-semibold text-navy block mb-1">No Generic LMS</span>
              <p className="text-body-small text-charcoal-muted">We focus exclusively on maternal healthcare placement workflows.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Values ─── */
const values = [
  {
    icon: Heart,
    title: "Mentor time is sacred",
    description: "If a feature adds more than a few minutes to a mentor's day, it gets redesigned or cut, regardless of reporting utility.",
  },
  {
    icon: Shield,
    title: "Visibility, not surveillance",
    description: "Dashboards exist to help managers support mentors and students, never to rank, shame, or punish individuals.",
  },
  {
    icon: Users,
    title: "Consistency over charisma",
    description: "The product should make an average mentor look reliable, not just make a great mentor look greater.",
  },
  {
    icon: BookOpen,
    title: "Earn trust before asking for data",
    description: "No field gets added to a form unless the team can explain why it directly helps the student clinical experience.",
  },
];

function Values() {
  const ref = useScrollReveal<HTMLDivElement>({ stagger: 0.1 });

  return (
    <section className="bg-sage/5 relative z-10 border-b border-cream-dark/10">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div data-reveal className="mb-16 max-w-lg">
          <span className="text-overline text-gold">Our Values</span>
          <h2 className="text-h2 text-navy mt-3">What drives our design</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {values.map((v) => (
            <div
              key={v.title}
              data-reveal
              className="bg-white border border-sage/20 rounded-refined p-8 shadow-editorial transition-all duration-300 hover:border-sage/40 hover:scale-[1.01]"
            >
              <v.icon size={22} className="text-sage stroke-[1.5] mb-6" />
              <h3 className="text-h3 text-navy font-semibold mb-3">{v.title}</h3>
              <p className="text-body text-charcoal-muted leading-relaxed">{v.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Team ─── */
const team = [
  {
    name: "Dr. Carolyne Kerubo Nyariki",
    role: "Lead Research Initiator",
    image: "/images/testimonial-2.jpg",
    bio: "Lecturer and Researcher at JKUAT School of Nursing. Proposed the foundational research basis for structured digital placement mentorship in maternal healthcare.",
    socials: { linkedin: "#", twitter: "" },
  },
  {
    name: "Dr. Lawrence Nderu",
    role: "Academic Supervisor",
    image: "/images/team/lawrence.jpeg",
    bio: "Senior Lecturer at JKUAT School of Computing. Guides computing design frameworks, technical architecture, and developer sprint coordination.",
    socials: { linkedin: "#", github: "#" },
  },
  {
    name: "Bouric Okwaro",
    role: "Fullstack Developer",
    image: "/images/team/bouric.jpeg",
    bio: "Develops and maintains both frontend and backend systems, builds and integrates APIs, manages databases, and ensures secure, scalable applications.",
    socials: { github: "#", linkedin: "#", twitter: "#" },
  },
  {
    name: "Jude Hunja",
    role: "Project Manager",
    image: "/images/team/jude.jpeg",
    bio: "Leads project planning and execution, coordinates team activities, tracks progress, manages timelines, and ensures project delivery.",
    socials: { linkedin: "#", twitter: "#" },
  },
  {
    name: "Branice Nafula",
    role: "Frontend Developer",
    image: "/images/team-3.jpg",
    bio: "Builds intuitive and responsive user interfaces, implements features, integrates APIs, and optimizes user experience on web and mobile platforms.",
    socials: { github: "#", linkedin: "#" },
  },
  {
    name: "Michelle Mwangi",
    role: "UI/UX Designer",
    image: "/images/team-4.jpg",
    bio: "Designs user-centered experiences, creates wireframes and prototypes, builds the design system, and ensures brand consistency and usability.",
    socials: { linkedin: "#", twitter: "#" },
  },
  {
    name: "Joshua Mativo",
    role: "AI & Data Intelligence",
    image: "/images/team/joshua.jpeg",
    bio: "Builds AI-powered features and recommendation systems, develops analytics dashboards, and analyzes data to drive better decision making.",
    socials: { github: "#", linkedin: "#" },
  },
];

function Team() {
  const ref = useScrollReveal<HTMLDivElement>({ stagger: 0.08 });

  return (
    <section className="bg-white relative z-10 border-t border-cream-dark/20">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div data-reveal className="mb-14">
          <span className="text-overline text-sage">Our Team</span>
          <h2 className="text-h2 text-navy mt-2">The people behind MentorMAMA</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {team.map((m) => (
            <div
              key={m.name}
              data-reveal
              className="bg-white border border-sage/20 rounded-refined p-6 shadow-editorial hover:shadow-editorial-hover hover:border-sage/40 transition-all duration-300 flex flex-col justify-between h-auto md:h-full group"
            >
              <div>
                <div className="overflow-hidden rounded-refined mb-5 shadow-sm aspect-square relative bg-cream">
                  <img
                    src={m.image}
                    alt={m.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <h3 className="text-[16px] font-semibold text-navy leading-tight">{m.name}</h3>
                <p className="text-[12px] font-medium text-sage mt-2 uppercase tracking-wider">{m.role}</p>
                <p className="text-[13px] text-charcoal-muted mt-3.5 leading-relaxed">{m.bio}</p>
              </div>

              {/* Social Links */}
              <div className="flex items-center gap-4 mt-6 pt-4 border-t border-cream-dark/30">
                {m.socials.linkedin && (
                  <a
                    href={m.socials.linkedin}
                    className="text-charcoal-muted/50 hover:text-sage transition-colors"
                    aria-label={`${m.name} LinkedIn`}
                  >
                    <Linkedin size={16} className="stroke-[1.75]" />
                  </a>
                )}
                {m.socials.github && (
                  <a
                    href={m.socials.github}
                    className="text-charcoal-muted/50 hover:text-sage transition-colors"
                    aria-label={`${m.name} GitHub`}
                  >
                    <Github size={16} className="stroke-[1.75]" />
                  </a>
                )}
                {m.socials.twitter && (
                  <a
                    href={m.socials.twitter}
                    className="text-charcoal-muted/50 hover:text-sage transition-colors"
                    aria-label={`${m.name} Twitter`}
                  >
                    <Twitter size={16} className="stroke-[1.75]" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function About() {
  return (
    <>
      <AboutHero />
      <Story />
      <VisionMission />
      <Values />
      <Team />
    </>
  );
}
