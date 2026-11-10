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

## Programme Admin design kit (2026-11-10)

Every Programme Admin screen composes `apps/portal/src/features/programme-admin/ui/AdminKit.tsx` (styles in `ui/admin-kit.css`), derived from the Content library page:

- **Page header** — eyebrow 0.75rem/700 teal uppercase, title 2.25rem/700, description 1rem muted, actions right-aligned.
- **Stat card** — 2.8rem icon tile, value 1.5rem/700, label 0.76rem, optional hint; clickable when it leads somewhere.
- **Card** — 1px `#dbe4ed` border, 0.75rem radius, header title 0.98rem/700 with 0.76rem description; list rows via `ListRow`.
- **Controls** — one 2.8rem height and 0.75rem radius for search, selects and buttons (primary, secondary, ghost); no pill-shaped buttons.
- **Tabs** — underline tabs with optional count badge. **Tables** — `.pa-table` with 0.64rem uppercase headers. **Status** — `StatusPill` tones success, warning, danger, info, teal, neutral.

All roles share `features/workspaces/PortalSidebar.tsx`: a 17rem navy sidebar with grouped navigation, a sliding active indicator, an "Ask Menta" card (Ctrl/⌘+K), a profile block, and a drawer below 1024px.

## Overlays, fields, header (2026-11-10)

- `src/components/kit`: `Modal` and `Drawer` render in a portal at z-index 70 (above sidebar, header and Menta), trap and restore focus, close on Escape/backdrop unless `dismissible={false}`, lock page scroll, and animate (reduced-motion aware). On phones modals become bottom sheets. `DetailList`/`DetailSection` render record details. `Field`, `TextInput`, `PasswordInput` (show/hide), `SelectInput`, `TextArea` and `FieldRow` give one 2.8rem control, label, hint and error style.
- `features/workspaces/PortalHeader.tsx`: one sticky in-flow header for every role (breadcrumb or eyebrow/title, "Search or ask Menta" Ctrl/Cmd+K, context chip, notifications, keyboard-navigable account menu). Shell roots use `overflow-x: clip` because `overflow-x: hidden` breaks sticky positioning.
- Kit tokens (`--pa-*`) are defined on `:root` so portal-mounted dialogs keep them.
- Account settings: header, sticky section nav and one content column; password strength checklist, device sign-out confirmation, switch toggles.
- Auth pages: split brand/form layout, animated brand panel, step transitions, six-box authenticator code input (single labelled input underneath), Caps Lock warning, copyable setup key, recovery-code copy/download/confirm, password strength and match indicators.
