import { useState } from "react";
import { useScrollReveal, useImageReveal } from "../hooks/useScrollReveal";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle,
  Building,
  Database
} from "lucide-react";

/* ─── Hero ─── */
function HowItWorksHero() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative min-h-[50vh] flex items-center overflow-hidden py-20 lg:py-28">
      {/* Immersive background image with stethoscope */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ 
          backgroundImage: "url('/images/close-up-african-american-hand-holding-stethoscope.jpg')",
        }}
      />
      {/* Rich dark navy gradient overlay for professional high-contrast aesthetic */}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-navy via-navy/90 to-navy/40" />

      <div ref={ref} className="relative z-20 content-max-width container-padding pt-16 w-full">
        <div className="max-w-2xl">
          <span data-reveal className="text-overline text-gold">How It Works</span>
          <h1 data-reveal className="text-h1 text-white mt-3">
            Structured for consistency and impact
          </h1>
          <p data-reveal className="mt-6 text-body-large text-white/80">
            A comprehensive clinical mentorship workflow built to connect learners, mentors, nurse managers, and universities.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Core Workflow Sequence ─── */
const workflowSteps = [
  {
    step: "01",
    title: "Set up facility & cohort",
    desc: "Program coordinators define clinical placements, maternity units, and matching pairings.",
  },
  {
    step: "02",
    title: "Train mentors",
    desc: "Mentors complete short case-based modules on constructive feedback and clinical teaching.",
  },
  {
    step: "03",
    title: "Onboard students",
    desc: "Students undergo a structured labour ward induction checklist upon reporting to the unit.",
  },
  {
    step: "04",
    title: "Log sessions & support",
    desc: "Mentors log practical clinical skills and feedback in under 3 minutes per session.",
  },
  {
    step: "05",
    title: "Track progress",
    desc: "Ward managers and university coordinators monitor placement quality on dashboards.",
  },
];

function WorkflowTimeline() {
  const ref = useScrollReveal<HTMLDivElement>({ stagger: 0.12 });

  return (
    <section className="bg-cream relative z-10 border-b border-cream-dark/20">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div data-reveal className="mb-16 text-center max-w-xl mx-auto">
          <span className="text-overline text-sage">The Workflow</span>
          <h2 className="text-h2 text-navy mt-3">From Placement to Dashboard</h2>
          <p className="text-body text-charcoal-muted mt-3">
            MentorMAMA streamlines the clinical placement lifecycle, helping mentors guide students consistently.
          </p>
        </div>

        {/* Workflow Horizontal Line / Sequence */}
        <div className="relative mt-12">
          {/* Connecting Curved Line Motif */}
          <div className="hidden lg:block absolute top-[44px] left-[5%] right-[5%] h-0.5 bg-gradient-to-r from-sage/20 via-sage/50 to-sage/20" />
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-6">
            {workflowSteps.map((s) => (
              <div key={s.step} data-reveal className="relative group text-center lg:text-left">
                {/* Step Circle */}
                <div className="w-14 h-14 rounded-full bg-white border border-cream-dark shadow-editorial flex items-center justify-center text-sage font-display font-bold text-lg mx-auto lg:mx-0 mb-6 group-hover:border-sage group-hover:text-white group-hover:bg-sage transition-all duration-300">
                  {s.step}
                </div>
                <h3 className="text-h4 text-navy font-semibold mb-2">{s.title}</h3>
                <p className="text-body-small text-charcoal-muted leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Feature Sections ─── */
const mainFeatures = [
  {
    overline: "Guided Learning",
    overlineColor: "text-sage",
    bg: "bg-white",
    title: "Structured learning for real-world impact",
    description:
      "Access curated learning modules designed by experienced healthcare professionals. Each module combines theoretical knowledge with practical case studies.",
    bullets: [
      "Interactive case studies",
      "Step-by-step protocol guides",
      "Self-paced learning",
      "Quizzes and assessments",
    ],
    image: "/images/two-african-american-pharmacist-working-drugstore-hospital-pharmacy-african-healthcare.jpg",
  },
  {
    overline: "Expert Mentorship",
    overlineColor: "text-gold",
    bg: "bg-sage/5",
    title: "Learn from experienced professionals",
    description:
      "Connect one-on-one with seasoned midwives and medical professionals who are passionate about helping the next generation succeed.",
    bullets: [
      "One-on-one sessions",
      "Group mentoring circles",
      "Specialty-specific matching",
      "Flexible scheduling",
    ],
    image: "/images/black-young-couple-attending-online-video-call-connection-home.jpg",
  },
  {
    overline: "Practical Resources",
    overlineColor: "text-sage",
    bg: "bg-white",
    title: "Clinical tools at your fingertips",
    description:
      "Access a comprehensive library of clinical tools, reference guides, and learning materials created by healthcare professionals.",
    bullets: [
      "Downloadable checklists",
      "Drug reference guides",
      "Visual procedure guides",
      "Evidence-based summaries",
    ],
    image: "/images/close-up-african-american-hand-holding-stethoscope.jpg",
  },
];

function FeatureSections() {
  return (
    <>
      {mainFeatures.map((f, i) => {
        const ref = useScrollReveal<HTMLDivElement>();
        const imageRef = useImageReveal<HTMLDivElement>();
        const isDark = f.bg === "bg-navy";
        const isReversed = i % 2 === 1;

        return (
          <section key={f.overline} className={`${f.bg} relative z-10 border-b border-cream-dark/10`}>
            <div ref={ref} className="content-max-width container-padding py-20 lg:py-28">
              <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
                <div
                  className={`lg:col-span-6 ${isReversed ? "lg:order-2" : ""}`}
                >
                  <div data-reveal>
                    <span className={`text-overline ${f.overlineColor}`}>
                      {f.overline}
                    </span>
                    <h2
                      className={`text-h2 mt-3 mb-4 ${
                        isDark ? "text-white" : "text-navy"
                      }`}
                    >
                      {f.title}
                    </h2>
                    <p
                      className={`text-body-large mb-6 ${
                        isDark ? "text-white/50" : "text-charcoal-muted"
                      }`}
                    >
                      {f.description}
                    </p>
                    <ul className="space-y-3 mb-8">
                      {f.bullets.map((b) => (
                        <li
                          key={b}
                          className={`flex items-start gap-3 ${
                            isDark ? "text-white/60" : "text-charcoal-muted"
                          }`}
                        >
                          <CheckCircle
                            size={16}
                            className="text-sage mt-0.5 flex-shrink-0"
                          />
                          <span className="text-body">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  className={`lg:col-span-6 ${isReversed ? "lg:order-1" : ""}`}
                >
                  <div
                    ref={imageRef}
                    className={`overflow-hidden rounded-refined ${
                      isDark ? "shadow-editorial-hover" : "shadow-editorial"
                    }`}
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

/* ─── For Institutions Section ─── */
function ForInstitutions() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="bg-white relative z-10 py-20 lg:py-28 border-b border-cream-dark/10">
      <div ref={ref} className="content-max-width container-padding">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left: Content */}
          <div className="lg:col-span-6" data-reveal>
            <span className="text-overline text-sage">For Institutions</span>
            <h2 className="text-h2 text-navy mt-3 mb-5">
              Cross-facility placement quality and reporting
            </h2>
            <p className="text-body-large text-charcoal-muted mb-6">
              MentorMAMA coordinates training and supervision parameters across multiple facility locations and student placement cohorts, giving managers and university coordinators evidence-ready, exportable data.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-refined bg-sage/10 flex items-center justify-center flex-shrink-0 text-sage">
                  <Building size={18} />
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-navy">Facility Dashboards</h4>
                  <p className="text-body-small text-charcoal-muted mt-1">Real-time indicators for training completion, inductions, and logs.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-refined bg-sage/10 flex items-center justify-center flex-shrink-0 text-sage">
                  <Database size={18} />
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-navy">Exportable Data</h4>
                  <p className="text-body-small text-charcoal-muted mt-1">Export structured session logs and competencies to CSV or Excel.</p>
                </div>
              </div>
            </div>

            <Link
              to="/contact"
              className="inline-flex items-center gap-2 bg-sage text-white px-7 py-3 rounded-pill text-[14px] font-semibold hover:bg-sage/90 transition-colors"
            >
              Discuss a Pilot Partnership <ArrowRight size={16} />
            </Link>
          </div>

          {/* Right: Partners Info */}
          <div className="lg:col-span-6 bg-[#F4F7F8] border border-cream-dark/50 rounded-refined p-8 shadow-editorial" data-reveal>
            <h3 className="text-h3 text-navy mb-4">Program Partners</h3>
            <p className="text-body-small text-charcoal-muted mb-6 leading-relaxed">
              MentorMAMA is developed as a collaborative initiative to validate structured mobile tools for clinical mentorship in Count referral hospitals.
            </p>
            
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-sage mt-2 flex-shrink-0" />
                <div>
                  <strong className="text-navy font-semibold text-body-small block">JKUAT School of Nursing</strong>
                  <span className="text-body-small text-charcoal-muted">Academic partner coordinating placements and supervisor frameworks.</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-sage mt-2 flex-shrink-0" />
                <div>
                  <strong className="text-navy font-semibold text-body-small block">JHUB Africa</strong>
                  <span className="text-body-small text-charcoal-muted">Collaborative development and technical validation partner.</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-sage mt-2 flex-shrink-0" />
                <div>
                  <strong className="text-navy font-semibold text-body-small block">AfyaVentures</strong>
                  <span className="text-body-small text-charcoal-muted">Program validation and pilot placement support.</span>
                </div>
              </li>
            </ul>
          </div>
          
        </div>
      </div>
    </section>
  );
}

/* ─── Role Journeys Tabbed Timeline ─── */
type RoleType = "student" | "mentor" | "manager";

const studentSteps = [
  { step: "01", title: "Invitation & Account", desc: "Student receives a placement invitation or link from the JKUAT university placement coordinator." },
  { step: "02", title: "Profile Creation", desc: "Student creates their profile and confirms their assigned maternity unit and placement dates." },
  { step: "03", title: "Expectations Review", desc: "Student views their assigned clinical mentor and reads through the unit learning expectations." },
  { step: "04", title: "Pre-Arrival Brief", desc: "Student completes the digital pre-arrival orientation information before reporting to the ward." },
  { step: "05", title: "Labour Ward Induction", desc: "Upon arrival, the clinical mentor or ward manager completes the interactive labor ward induction checklist." },
  { step: "06", title: "Mentorship & Logs", desc: "During placement, the student receives practical sessions and submits feedback and confidence ratings." },
  { step: "07", title: "Final Evaluation", desc: "At the end of placement, the student completes a final experience survey and confidence self-assessment." }
];

const mentorSteps = [
  { step: "01", title: "Onboarding Profile", desc: "Mentor receives an invitation, sets up their account, and completes their professional cadre profile." },
  { step: "02", title: "Preceptorship Training", desc: "Mentor completes case-based modules on constructive feedback, clinical teaching, and respectful maternity care." },
  { step: "03", title: "Allocated Placements", desc: "Mentor views their assigned midwifery students, placement timelines, and target learning objectives." },
  { step: "04", title: "Student Orientation", desc: "Mentor walks the student through the ward layout and completes the induction checklist in under 5 minutes." },
  { step: "05", title: "Lightweight Logging", desc: "After teaching sessions, the mentor logs the skills discussed and feedback given (takes less than 3 minutes)." },
  { step: "06", title: "Follow-Up Action", desc: "Mentor reviews pending action points, follow-ups, and flagged student learning support needs." },
  { step: "07", title: "CPD Validation", desc: "Mentor receives a summary report of placement hours completed for professional development review." }
];

const managerSteps = [
  { step: "01", title: "Staff & Student Audit", desc: "Nurse manager audits all active students and assigned mentors currently in their unit." },
  { step: "02", title: "Staffing Allocations", desc: "Manager assigns or reallocates mentors to students when ward staffing shifts occur." },
  { step: "03", title: "Quality Monitoring", desc: "Manager monitors labor ward induction completion rates and logs to ensure placements are supported." },
  { step: "04", title: "Safeguarding Escalation", desc: "Manager reviews flagged safety concerns, logs corrective actions, and closes resolved issues." },
  { step: "05", title: "Data Exporting", desc: "Manager exports monthly placement reports to coordinate with university placement teams." }
];

function RoleJourneys() {
  const [activeTab, setActiveTab] = useState<RoleType>("student");
  const ref = useScrollReveal<HTMLDivElement>();

  const currentSteps = 
    activeTab === "student" ? studentSteps : 
    activeTab === "mentor" ? mentorSteps : managerSteps;

  return (
    <section className="bg-[#F2F8F8] relative z-10 border-b border-cream-dark/10">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div data-reveal className="mb-14 text-center max-w-xl mx-auto">
          <span className="text-overline text-sage">User Flows</span>
          <h2 className="text-h2 text-navy mt-3">Structured Role Journeys</h2>
          <p className="text-body text-charcoal-muted mt-3">
            See exactly how each participant interacts with the MentorMAMA workflow.
          </p>
        </div>

        {/* Tab Buttons */}
        <div data-reveal className="flex flex-wrap justify-center gap-4 mb-12">
          {(["student", "mentor", "manager"] as RoleType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-pill text-[13px] font-semibold transition-all ${
                activeTab === tab
                  ? "bg-sage text-white shadow-editorial"
                  : "bg-white border border-sage/20 text-charcoal hover:bg-sage/5"
              }`}
            >
              {tab === "student" ? "Midwifery Student" : tab === "mentor" ? "Clinical Mentor" : "Nurse Manager"}
            </button>
          ))}
        </div>

        {/* Journey Timeline Container (White card with soft teal border) */}
        <div data-reveal className="max-w-3xl mx-auto bg-white border border-sage/20 rounded-refined p-8 md:p-10 shadow-editorial">
          <div className="relative border-l-2 border-sage/20 pl-6 md:pl-8 space-y-8 py-2">
            {currentSteps.map((s) => (
              <div key={s.step} className="relative">
                {/* Step badge absolute alignment */}
                <div className="absolute -left-[37px] md:-left-[45px] top-0 w-7 h-7 rounded-full bg-white border border-sage text-sage flex items-center justify-center font-display font-bold text-[12px] shadow-sm">
                  {s.step}
                </div>
                <div>
                  <h4 className="text-[15px] font-semibold text-navy leading-none mb-2">{s.title}</h4>
                  <p className="text-[13px] text-charcoal-muted leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Scope Honesty Section ─── */
function ScopeHonesty() {
  const ref = useScrollReveal<HTMLDivElement>({ stagger: 0.12 });

  return (
    <section className="bg-cream relative z-10 border-b border-cream-dark/15">
      <div ref={ref} className="content-max-width container-padding section-padding">
        <div data-reveal className="mb-14 text-center max-w-xl mx-auto">
          <span className="text-overline text-gold">Honest Scope</span>
          <h2 className="text-h2 text-navy mt-3">What MentorMAMA Is Not</h2>
          <p className="text-body text-charcoal-muted mt-3">
            Clarity of purpose is key. MentorMAMA is designed to support, not overreach.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: "No EHR / HMS", desc: "MentorMAMA is not an electronic medical record or hospital management system." },
            { title: "No Surveillance Tool", desc: "We do not build compliance tools to police, rank, or shame mentors." },
            { title: "No Mentor Replacement", desc: "We support clinical interactions; we do not replace real human relationships." },
            { title: "No Generic LMS", desc: "We focus exclusively on maternal healthcare placement workflows." }
          ].map((item) => (
            <div
              key={item.title}
              data-reveal
              className="bg-white border border-sage/20 rounded-refined p-6 shadow-editorial transition-all duration-300 hover:border-sage/40 hover:scale-[1.01]"
            >
              <h4 className="text-[14px] font-semibold text-navy mb-2">{item.title}</h4>
              <p className="text-body-small text-charcoal-muted leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <>
      <HowItWorksHero />
      <WorkflowTimeline />
      <FeatureSections />
      <RoleJourneys />
      <ScopeHonesty />
      <ForInstitutions />
    </>
  );
}
