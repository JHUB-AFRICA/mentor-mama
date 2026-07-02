# MentorMAMA Website — Build Guide

**Purpose of this document:** This is the single source of truth for building the MentorMAMA marketing/product website. Every fact, claim, number, name, and piece of copy in this guide is sourced directly from MentorMAMA's Brand Guidelines and Developer Concept Note.

**Rule for the coding assistant: Do not invent, estimate, or embellish any content.** If a piece of content is needed but not specified here (e.g. a specific icon, a stock photo, exact pixel spacing), flag it as a placeholder rather than generating a plausible-sounding substitute. Do not add testimonials, user counts, statistics, review quotes, partner logos, or claims that are not explicitly listed in this document.

---

## 1. Ground Rules (Read First)

These rules exist because early design drafts repeatedly hallucinated content that looked plausible but was fabricated. Follow them strictly.

1. **No fake social proof.** No testimonials, review quotes, star ratings, or named user stories. MentorMAMA is pre-pilot — it has no users to quote yet.
2. **No fabricated metrics.** Do not display "1,250+ active users," "320+ mentors," or any invented usage statistic. The only numbers permitted on the site are the real pilot-scope numbers in Section 4 below.
3. **No fake trust badges.** Do not add "Powered by Community," security certification badges, or award badges that don't exist.
4. **No newsletter/email capture** unless explicitly instructed later — there is no active mailing list or CRM to receive it.
5. **No dead links.** The footer and nav must only link to pages that are actually being built (see Section 3, Sitemap). Do not add "Blog," "Resources," "Privacy Policy," "Terms of Service," or "Cookie Policy" links — these pages do not exist yet.
6. **No fabricated partner claims.** Only JKUAT, JHUB Africa, and AfyaVentures may be referenced as partners/collaborators, and only in the way described in Section 8.
7. **One CTA button per section, one dominant CTA per page.** Do not add multiple competing calls to action (e.g. "Get Started" + "Watch Demo" side by side).
8. **Stick to the visual system in Section 2 exactly.** Do not introduce gradients, drop shadows, 3D icon effects, dot-grid or blob background textures, or colors outside the defined palette.
9. **Every claim of "what the product does" must trace back to Section 5 (Product Modules) or Section 6 (User Roles) of this document.** Do not invent features.
   9.1. **No copy — headlines, labels, eyebrow text, captions, button text — may appear on the site unless it is either quoted verbatim from Section 9 (Approved Copy Blocks) or directly sourced from a specific section of the concept note/brand guide cited by name.** Small additions like an unlisted eyebrow label or a decorative tagline are still unauthorized copy, even if they sound plausible and on-brand. If a section feels like it needs a short label and none is specified, flag it and ask rather than writing one.
10. **If something in a design mockup conflicts with this document, this document wins.**

---

## 2. Brand System (Design Tokens)

### 2.1 Color Palette (strict — do not deviate or introduce new colors)

| Name             | Hex       | Role                                                | Usage ratio                    |
| ---------------- | --------- | --------------------------------------------------- | ------------------------------ |
| Midnight Navy    | `#0D1B33` | Primary — trust, stability, text                    | ~30%                           |
| White            | `#FFFFFF` | Primary canvas                                      | ~50% (combined with Warm Mist) |
| Warm Mist        | `#F4F7F8` | Backgrounds, cards, surfaces                        | (part of the ~50% above)       |
| Guiding Teal     | `#1D8C8C` | Secondary accent — links, progress, highlights      | ~15%                           |
| Soft Stone       | `#E4E8EE` | Dividers, borders, disabled states                  | minor                          |
| Muted Terracotta | `#D97757` | Sparing use only — single highlight moments, alerts | <5%                            |

**Rule:** Navy and white/mist dominate every screen. Teal is an accent, never a second primary. Terracotta is reserved for one deliberate highlight — never decorative, never repeated across a page.

### 2.2 Typography

| Level      | Font    | Weight/Size                                        | Use                        |
| ---------- | ------- | -------------------------------------------------- | -------------------------- |
| Display    | Manrope | Bold, 28–34pt                                      | Hero statements            |
| Heading    | Manrope | SemiBold, 18–22pt                                  | Section titles             |
| Subheading | Manrope | SemiBold, 12–14pt                                  | Card labels, form sections |
| Body       | Inter   | Regular, 10–11pt (scale up proportionally for web) | Paragraphs                 |
| Caption    | Inter   | Medium, 8–9pt                                      | Metadata, timestamps       |

Headings = Manrope. Body/UI text = Inter. No other typefaces.

### 2.3 Shape & Visual Language

- Soft, rounded, continuous forms only — no sharp/aggressive angles.
- The logo motif (a single rising stroke that curves into an open base, with one small circle) should recur structurally — e.g. as the connecting line in a "how it works" step sequence — not just as the logo in the header.
- Iconography: rounded corners, consistent 1.75px stroke weight, simple and universal, friendly but never cartoonish.
- Illustration (if used at all): soft, minimal, editorial line art. No cartoon figures.
- Motion: gentle, slow, purposeful — never flashy or attention-grabbing.
- **Explicitly avoid:** gradient blobs, dot-grid background textures, drop shadows, 3D icon effects, bright primary colors, crowded brochure layouts.
- Whitespace is treated as part of the interface, not empty space to fill. Every section needs generous vertical padding — sections should feel substantial through spacing and type scale, not through cramming in more content or more sections.

### 2.3.1 Placeholder Imagery (until real photography is available)

Never render a bare `<img>` with no `src` — an empty image element falls back to displaying its `alt` text as raw text on the page, which looks broken, not minimal. Until real photography (Section 2.4) is in hand, use a styled placeholder instead: a Warm Mist (`#F4F7F8`) or Soft Stone (`#E4E8EE`) background box with a centered caption in caption-scale type describing what photo belongs there (e.g. "Photo: mentor and student, labour ward"). The placeholder must read as an intentional design element, not a broken asset.

### 2.3.2 Section Rhythm

Alternate section backgrounds between white and Warm Mist (`#F4F7F8`) down the length of a page to create visual separation between sections without borders, dividing lines, or drop shadows. The Hero section is always white. Every section after it alternates white → mist → white → mist, in page order. This is the only approved mechanism for separating sections visually.

### 2.4 Photography

Real, authentic photography of Kenyan maternity ward clinical staff — mentoring, teaching, hands-on learning — natural lighting. **No staged stock photography.** No "smiling doctor pointing at clipboard" clichés, no posed handshakes.

### 2.5 Voice & Tone

- Plain, practical, respectful of the reader's time. Closer to how a competent charge nurse talks to a new student than a compliance manual.
- Short sentences. Never use words like "facilitate," "leverage," "stakeholder," "optimize."
- Say what to do, not just what the system tracks.
- Encouraging without being cheerful — this is a hospital tool, not a wellness app.
- Honest about effort — if something takes time, say so.

| Instead of                                  | We say                                |
| ------------------------------------------- | ------------------------------------- |
| Digital Mentorship Monitoring System        | Mentorship Hub                        |
| Session Documentation Module                | Session Log                           |
| "Facilitate structured engagement tracking" | "Log this session in under 3 minutes" |
| "Dashboard Analytics Suite"                 | "Insights"                            |

### 2.6 Logo Usage Rules

- Never stretch, distort, recolor outside the palette, add drop shadows/gradients/3D effects, rotate, flip, or redraw the mark by hand.
- Never close the open curve into a closed loop.
- Never pair with a new tagline without approval — the approved tagline is **"Better mentorship. Better outcomes."**
- Minimum size: 24px digital / 10mm print.
- Clear space around the mark = height of the icon's circle, on all sides.

---

## 3. Sitemap (Build Exactly These Pages — No More, No Fewer)

```
/                    Home
/about               About
/how-it-works        How It Works (expanded)
/for-institutions     For Institutions
/team                Team
/contact             Contact
```

### 3.1 Global Header (every page)

- Logo + "MentorMAMA" wordmark (left)
- Nav links: Home / About / How It Works / For Institutions / Team / Contact
- One CTA button, top right: **"Request Pilot Access"**

### 3.2 Global Footer (every page)

Three columns + bottom bar. This exact structure — no additional columns, no additional links:

- **Column 1:** Logo + tagline "Better mentorship. Better outcomes." + one short description line (see Section 9 for approved copy)
- **Column 2 — "Product":** links to About, How It Works, Team
- **Column 3 — "Contact":** email address (placeholder until confirmed), "Nairobi, Kenya"
- **Bottom bar:** "© 2026 MentorMAMA. Built by Sinaps Technology." — no Privacy Policy / Terms / Cookie links (they don't exist yet)

---

## 4. Facts & Numbers Permitted On the Site (Do Not Alter These)

Use only these figures. Do not round up, dramatize, or supplement with invented numbers.

| Fact                                     | Value                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pilot facility count                     | 1–2 maternity units linked to JKUAT clinical placement sites                                                 |
| Pilot mentor count                       | 10–25 mentors                                                                                                |
| Pilot student count                      | 30–80 students                                                                                               |
| Pilot duration                           | 8–12 weeks (minimum)                                                                                         |
| Session log time                         | Under 3 minutes per session                                                                                  |
| Data policy                              | No patient-identifiable data collected in MVP                                                                |
| Research basis                           | Derived from a proposal by Dr. Carolyne Kerubo Nyariki, School of Nursing, College of Health Sciences, JKUAT |
| Prepared for                             | AfyaVentures / JHUB Africa                                                                                   |
| Locations named in the problem statement | County Referral Hospitals in Nairobi, Kiambu, Murang'a, and Machakos counties                                |

**Do not state:** any live user count, mentor count, "active users," ratings, review scores, or completion rates as if they are current/live data. The site describes a pilot program that has not yet concluded.

---

## 5. Product Modules (Source of Truth for "What It Does")

Any feature description on the site must map to one of these ten modules. Do not describe capabilities beyond this list.

1. **Account and Access Management** — role-based accounts, password reset, account status, permission boundaries
2. **Facility and Placement Setup** — facilities, wards/units, cohorts, dates, mentor-student assignments
3. **Mentor Training Hub** — short case-based modules on mentorship, feedback, respectful maternity care, documentation, escalation
4. **Labour Ward Induction Checklist** — structured onboarding checklist completed when a student reports to the unit
5. **Mentorship Session Log** — lightweight form logging date, student, topic, supervision type, skills discussed, feedback, follow-up (under 3 minutes)
6. **Student Feedback and Confidence Tracker** — feedback on induction quality, mentor availability, confidence, safety
7. **Escalation and Support** — flagging serious concerns; managers review, assign status, document action, close issue
8. **Dashboard and Reports** — visual indicators for onboarding status, training completion, session frequency, feedback, issues
9. **Content Library** — PDFs, guides, videos, checklists, accessible by role
10. **Admin Configuration** — admin creates/edits modules, indicators, checklist items, facilities, cohorts, exports

### 5.1 The Core Workflow ("How It Works" — use this exact sequence)

```
Set up facility & cohort  →  Train mentors  →  Onboard students
     →  Log sessions & support  →  Track progress on dashboards
```

This is the real product loop and should be the basis of any "How it works" visual — connected by a single curved line echoing the logo, not numbered icon circles.

---

## 6. User Roles (Source of Truth for "Who It's For")

Do not reduce this to a simple two-audience "mentors vs. managers" split — that excludes two real, named user groups (students and university coordinators).

| Role                                  | Core needs                                                                                      | Main permissions                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Student**                           | Clear orientation, assigned mentor, learning expectations, session history, feedback submission | View own placement, complete onboarding, submit feedback, view mentor assignment          |
| **Clinical mentor**                   | Quick guidance, checklist tools, session logging, feedback prompts                              | Complete training, access assigned students, complete induction checklist, log sessions   |
| **Nurse manager / ward in-charge**    | Visibility on onboarding, mentor participation, issues                                          | View facility dashboard, assign mentors, review escalated issues, export facility reports |
| **University coordinator**            | Monitor placement quality across facilities/cohorts                                             | Create cohorts, upload/approve students, view dashboards, export university reports       |
| **Program admin** (AfyaVentures/JHUB) | Configure the system                                                                            | Full administrative configuration and analytics access                                    |

For the homepage's "Built for your whole team" section, use **three lanes**: **Mentors**, **Managers & Coordinators** (nurse managers + university coordinators combined for space), **Students**. Do not omit Students.

---

## 7. Brand Strategy Content (for About page)

### 7.1 The Core Problem (verbatim concept, may be lightly rephrased for tone, facts must not change)

Clinical mentorship quality in maternity units depends on which mentor a student happens to get — not on any system designed to make that experience consistent. Some students receive excellent guidance. Others receive almost none. The difference is luck, not design.

### 7.2 Brand Purpose

MentorMAMA exists so that good mentorship doesn't depend on which mentor a student happens to get.

### 7.3 Vision

A future where the quality of a student's clinical mentorship is determined by the system supporting them, not by chance.

### 7.4 Mission

To give clinical mentors the structure, training, and tools to mentor well in minutes, not hours — and to give universities and facilities visibility into mentorship quality without adding to mentors' workload.

### 7.5 Positioning Statement

MentorMAMA is a mobile-first mentorship support tool for maternity units, helping clinical mentors guide students consistently without adding to their workload. It is not a hospital information system, and not another health NGO project — it's a practical tool mentors actually want to open.

### 7.6 What MentorMAMA Is Not (use this list exactly — important for scope honesty)

- An electronic medical record or hospital management system
- A compliance tool built to police or rank mentors
- A replacement for human mentorship
- A generic learning management system

### 7.7 Values (use as-is, do not paraphrase the behavioral tests)

- **Mentor time is sacred** — If a feature adds more than a few minutes to a mentor's day, it gets redesigned or cut, regardless of how useful it would be for reporting.
- **Visibility, not surveillance** — Dashboards exist to help managers support mentors and students, never to rank, shame, or punish individuals.
- **Consistency over charisma** — The product should make an average mentor look reliable, not just make a great mentor look greater.
- **Earn trust before asking for data** — No field gets added to a form unless the team can explain, in one sentence, why it directly helps the student.

---

## 8. Partners (Only These Three — Do Not Add Others)

| Partner                                                            | Relationship                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| **JKUAT** (Jomo Kenyatta University of Agriculture and Technology) | Academic institution; research basis; clinical placement sites |
| **JHUB Africa**                                                    | Collaboration partner (see note below on framing)              |
| **AfyaVentures**                                                   | Program the concept note was prepared for                      |

**Important framing note:** Do not describe the JHUB Africa relationship in a way that implies MentorMAMA is a JHUB-owned or JHUB-branded product, unless explicitly instructed. Use neutral collaboration language only (e.g. "in partnership with," "developed alongside").

---

## 9. Approved Copy Blocks (Use Verbatim Unless Told Otherwise)

- **Tagline:** "Better mentorship. Better outcomes."
- **One-sentence pitch:** "MentorMAMA helps maternity clinical mentors guide students better by combining short digital mentor training, a labour ward induction checklist, mentorship session logs, student feedback, and real-time dashboards."
- **Hero CTA button text:** "Request Pilot Access"
- **Trust strip items** (use only these three, as plain statements — not badges):
  1. "No patient-identifiable data collected"
  2. "Sessions logged in under 3 minutes"
  3. "Built with JKUAT School of Nursing"
- **Status/roadmap line:** "Piloting in 1–2 maternity units linked to JKUAT clinical placement sites — 10–25 mentors, 30–80 students, over 8–12 weeks. In partnership with AfyaVentures and JHUB Africa."
- **Footer description line:** "A digital mentorship toolkit for safer midwifery clinical placement."
- **Copyright line:** "© 2026 MentorMAMA. Built by Sinaps Technology."

---

## 10. Team (for /team page)

Use only these five names and roles. Do not invent additional team members, bios, or credentials beyond what's listed. If a bio line is needed and not provided below, leave it as `[TODO: bio needed]` rather than generating one.

| #   | Name            | Role                   | Description                                                                                                                                         |
| --- | --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Bouric Okwaro   | Fullstack Developer    | Develops and maintains both frontend and backend systems, builds and integrates APIs, manages databases, and ensures secure, scalable applications. |
| 02  | Jude Hunja      | Project Manager        | Leads project planning and execution, coordinates team activities, tracks progress, manages timelines, and ensures project delivery.                |
| 03  | Branice Nafula  | Frontend Developer     | Builds intuitive and responsive user interfaces, implements features, integrates APIs, and optimizes user experience on web and mobile.             |
| 04  | Michelle Mwangi | UI/UX Designer         | Designs user-centered experiences, creates wireframes and prototypes, builds the design system, and ensures brand consistency and usability.        |
| 05  | Joshua Mativo   | AI & Data Intelligence | Builds AI-powered features and recommendation systems, develops analytics dashboards, and analyzes data to drive better decision making.            |

Academic supervisor (mention only if appropriate/instructed): Dr. Lawrence Nderu, JKUAT.

---

## 11. Section-by-Section Build Spec

### 11.1 Home (`/`)

1. **Hero** — Headline "Better mentorship. Better outcomes." + one-sentence pitch (Section 9) + single CTA "Request Pilot Access." Full first-viewport, real photography, generous padding.
2. **The problem** — Section 7.1 content, text-led, no icon grid.
3. **How it works** — 5-step sequence from Section 5.1, connected by a curved line motif.
4. **Built for your whole team** — 3 columns: Mentors / Managers & Coordinators / Students (Section 6), each with real photography and 2-3 concrete capability lines pulled from the role table — not generic benefit language.
5. **Trust strip** — the three items in Section 9, plain text or minimal icon, not badges.
6. **Status/roadmap** — Section 9 status line.
7. **Closing CTA** — "Ready to strengthen mentorship in your unit?" + single "Request Pilot Access" button.

### 11.2 About (`/about`)

- Origin/why (7.1)
- Brand purpose, vision, mission (7.2–7.4)
- Positioning + what it's not (7.5–7.6)
- Values (7.7)
- Research basis attribution: "Derived from a proposal by Dr. Carolyne Kerubo Nyariki, School of Nursing, College of Health Sciences, JKUAT."

### 11.3 How It Works (`/how-it-works`)

- Full workflow diagram: all steps from Section 5, module descriptions from Section 5 (numbered 1–10, but presented in workflow order, not list order)
- Role-based journeys: tabbed/accordion for Student journey, Mentor journey, Nurse Manager journey (see concept note Section 7 for the exact step sequences per role — do not invent additional journey steps)
- "What it's not" reiteration (Section 7.6) to keep scope honest

### 11.4 For Institutions (`/for-institutions`)

- Institutional pitch: cross-facility, cross-cohort visibility; exportable, evidence-ready data
- What you get: facility/cohort setup, training completion tracking, dashboard indicators, CSV/Excel export (Modules 2, 8 from Section 5)
- Partners section (Section 8)
- CTA: "Discuss a pilot partnership"

### 11.5 Team (`/team`)

- Short intro line on who's building this
- Team grid: Section 10, five members
- Supervision credit if instructed

### 11.6 Contact (`/contact`)

- Simple form: Name, Email, Institution (optional), Message
- Direct contact: email (placeholder until confirmed), Nairobi, Kenya
- No newsletter signup

---

## 12. Known Implementation Notes

Track deviations, temporary technical debt, or drift risks discovered during manual build here, so they aren't forgotten once implementation is underway.

- **Token duplication risk:** `packages/config/tailwind-preset` (CommonJS) currently duplicates the hex/type/spacing values from `packages/ui/src/tokens/*.ts` (TypeScript) by hand rather than deriving from them at build time. If a token value changes, both files must be updated manually. Fix by generating the `.cjs` from the `.ts` source, or revisit if this becomes a live bug.
- **Type scale rem values** (`display: 2.125rem`, `heading: 1.375rem`, `subheading: 0.875rem`, `body: 1rem`, `caption: 0.75rem`) and **spacing values** (`section-y: 6rem`, `section-gap: 5rem`, `content-gap: 2rem`) were not specified as exact numbers in the original brand guidelines PDF — they were interpreted from the point-size ranges and the general "generous padding" instruction. Treat as provisional until visually reviewed against real content.

## 13. Explicit Do-Not-Build List

For quick reference during build/QA — reject any of the following if they appear in a design file, AI-generated draft, or get suggested mid-build:

- ❌ Testimonial carousels or named user quotes
- ❌ Fake statistics ("1,250+ users," etc.)
- ❌ "Powered by Community" or unverified trust badges
- ❌ Newsletter/email capture box
- ❌ Multiple competing CTAs in one section
- ❌ Gradient blobs, dot-grid textures, drop shadows, 3D icons
- ❌ Footer links to Blog, Resources, Guides, Privacy Policy, Terms, Cookie Policy
- ❌ A two-audience-only "who it's for" framing that excludes Students or Coordinators
- ❌ Any claim of guaranteed student feedback anonymity (this is an **open decision**, not yet resolved — see concept note Section 19)
- ❌ Any AI feature that provides patient-specific clinical decisions, diagnosis, or prescription advice
- ❌ Collection of patient names, phone numbers, IDs, or medical record numbers anywhere in forms or copy
