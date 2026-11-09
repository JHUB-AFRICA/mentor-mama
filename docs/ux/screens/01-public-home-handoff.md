# Screen 01 — Public Home Handoff

**Surface:** `apps/web` public website  
**Purpose:** Explain MentorMAMA and make the next public action obvious  
**Primary action:** Request Pilot Access  
**Secondary action:** Portal sign in

## Layout

```text
Desktop
┌──────────────────────────────────────────────────────────────┐
│ Logo       About  How It Works  Resources  Contact   Portal sign in │
│                                                        [Request access] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  overline                                                    │
│  approved headline                                           │  meaningful
│  short product explanation                                   │  clinical
│  [Request Pilot Access]                                      │  visual
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ product loop / role lanes / proof of usefulness              │
└──────────────────────────────────────────────────────────────┘
```

Mobile collapses to a logo + menu button. The menu exposes `Portal sign in`
before the public links, then `Request Pilot Access` as the final primary
action. The main CTA must remain visible without requiring a menu open.

## Component hierarchy

```text
PublicSiteShell
├── PublicNavbar
│   ├── LogoLockup
│   ├── DesktopPublicLinks
│   ├── PortalSignInLink
│   └── PilotAccessButton
├── HomeHero
│   ├── PageLabel
│   ├── ApprovedHeadline
│   ├── ProductDescription
│   ├── PilotAccessButton
│   └── MeaningfulClinicalVisual
├── ProductLoopSection
├── RoleLanesSection
└── PublicFooter
```

## Interaction and motion

- Header remains calm and readable on scroll; no heavy blur or decorative shadow.
- Hero content enters with a short 8–12px reveal, 250–400ms, disabled under reduced motion.
- CTA hover changes fill only; no scale or glow.
- `Portal sign in` is a normal link, not a competing bright CTA.
- No autoplay video or carousel in the handoff area.

## States

- Navigation default, active, hover, focus, mobile-open, mobile-closed.
- Pilot CTA default, hover, focus, loading only if it becomes an async action.
- Image loading, missing/approved placeholder, reduced-motion.
- No public authentication error appears on this screen.

## Copy and trust rules

- Use only approved copy from the brand guide and product requirements.
- Do not claim that a visitor already has access.
- Do not show live user counts, invented outcomes, testimonials, or partner claims.
- The public CTA starts an enquiry; it does not create an account immediately.
