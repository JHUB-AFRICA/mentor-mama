# MentorMAMA dashboard direction

**Status:** Implemented cross-role visual refinement

## Working brief

- **User and job:** programme staff need to orient themselves quickly, move to
  placements or onboarding, and understand their operational scope; mentors and
  students need a calm, reliable path to their assigned work.
- **Primary outcome:** make the next useful action obvious without hiding scope,
  account status, or navigation.
- **Direction:** calm clinical operations software with a confident navy frame,
  teal action language, generous white content surfaces, and compact status
  signals. The interface is intentionally closer to a focused workspace than a
  decorative analytics dashboard.

## Inherited and adapted decisions

- **Inherited:** MentorMAMA navy/teal palette, Figtree/Noto Sans typography,
  Lucide icons, rounded panels, and existing shared UI primitives.
- **Adapted:** all role workspaces now use a consistent responsive shell with a
  desktop sidebar, mobile off-canvas navigation, sticky header, role label, and
  touch-sized controls. Participant workspaces now share the same shell as
  operational workspaces while retaining their focused placement content.
- **Proposed:** coordinator and nurse-manager onboarding uses a dark contextual
  hero with a small “workspace pulse” rather than adding speculative metrics or
  charts that the current API does not provide.

## Responsive and accessibility rules

- Desktop navigation stays visible from the large breakpoint upward.
- Below that breakpoint, navigation becomes an explicit menu with an overlay and
  close action; the content never sits behind the fixed rail.
- Headers truncate long role/user labels instead of distorting the layout.
- Interactive controls have visible focus, hover feedback, and touch-sized hit
  areas; status is not communicated by colour alone.
- Reduced-motion users receive effectively static transitions.
- Empty, loading, error, success, and offline states remain feature-owned and
  are not hidden by the visual shell.
