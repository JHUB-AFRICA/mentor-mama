# Frontend UI stack decision for the Programme Admin redesign

**Status:** Proposed for implementation
**Stage:** UX → BUILD handoff
**Scope:** `apps/portal` and `packages/ui`

## Decision

Use the existing React + TypeScript + Vite + Tailwind CSS 3 stack as the
implementation foundation. Build the visual language in the shared
`@mentormama/ui` package, using small accessible primitives and semantic HTML.
Use Radix for interaction-heavy behavior, Lucide for icons, and CSS
transitions for restrained motion.

This gives the Programme Admin workspace the cleanest implementation because
the project already has the build pipeline, design tokens, responsive utility
layer, and several accessible overlay primitives in place. Introducing a second
styling system would create competing spacing, typography, and component rules
at exactly the point where the redesign needs consistency.

## Styling approach comparison

| Option | Decision | Reason |
|---|---|---|
| Tailwind CSS + shared CSS tokens | **Adopt** | Already installed and configured; supports responsive table/settings layouts without a global component look; keeps tokens close to the shared UI package |
| Plain CSS only | Use selectively | Appropriate for semantic tokens, complex table states, focus rules, and shell-specific styles; not efficient as the sole layout system for this app |
| Bootstrap | **Reject** | Adds a second visual vocabulary and global resets; its official JavaScript plugins are not fully compatible with React’s DOM ownership model, while the portal already uses Radix primitives |
| shadcn/ui | **Adopt as a pattern/source approach** | Components are source code composed on top of Tailwind and Radix, so we can use the patterns without surrendering MentorMAMA tokens to a generic theme; do not initialise a second app-level component tree |

## Component and package policy

### Adopt now

| Need | Package / approach | Use in this redesign |
|---|---|---|
| Shared visual primitives | `@mentormama/ui` | Button, surface, table, badge/status, empty, skeleton, alert, separator, page header, navigation primitives |
| Styling utilities | `class-variance-authority`, `clsx`, `tailwind-merge` | Keep variants composable and prevent conflicting utility classes in shared primitives |
| Accessible overlays | Existing Radix Dialog, Popover, Tooltip; add only the missing primitives required by the shell | Person drawer, confirmation dialog, account menu, filter/menu surfaces |
| Icons | Existing `lucide-react` | One consistent outline family; import icons directly so bundling stays tree-shakeable |
| Server state | Existing `@tanstack/react-query` | Lists, dashboard summaries, mutations, loading/error/retry state |
| Forms | Existing React Hook Form + Zod | Invitations, settings, filters, confirmation/reason forms |
| Feedback | Existing Sonner plus shared inline notices | Save/send/action results; inline error recovery for data surfaces |

### Deliberately defer

| Package / approach | Decision | Reason |
|---|---|---|
| Bootstrap / React-Bootstrap | Do not install | Duplicates Tailwind and would require reconciling a second component vocabulary |
| `@tremor/react` or Tremor Raw | Defer | Reports do not yet have a confirmed chart contract; the current Tremor Raw guidance targets Tailwind 4 while this repo is Tailwind 3.4. Use tables and compact indicators first |
| `motion` / Framer Motion | Defer | The shell, drawers, and status changes can use CSS transitions; add only if an approved interaction needs choreography CSS cannot express |
| `recharts` | Defer | No chart is required for the first workspace frame, Overview, People, or Setup slices |
| `@tanstack/react-table` | Defer | The current access and placement tables need semantic markup, filters, pagination, and row actions—not a table engine yet |
| Redux/Zustand | Do not install | React local state and TanStack Query cover the current UI state/server state split |
| Second icon family | Do not install | Lucide is already established in the portal and design guidance |

## Component inventory for the workspace

### Shell and navigation

- `ProgrammeAdminShell`
- `Sidebar` / `SidebarSection` / `SidebarItem`
- `MobileNavigationSheet`
- `PageHeader`
- `Breadcrumbs`
- `AccountMenu`
- `NotificationPopover`

### Operational data

- Semantic `Table`, `TableHeader`, `TableBody`, `TableRow`, and labelled mobile
  row fallback
- `StatusBadge` with text and icon, not colour alone
- `Pagination`
- `FilterBar` / `SearchField`
- `EmptyState`
- `SkeletonTable` / `SkeletonBlock`
- `InlineAlert` / `RetryAction`

### Actions and configuration

- `Button` with primary, secondary, tertiary, and destructive treatments
- `DropdownMenu` for row overflow actions
- `Dialog` for short focused forms
- `Sheet` for person and placement details
- `AlertDialog` for destructive or privileged confirmation
- `Tabs` for genuinely related settings sections
- `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, and `Switch`
- `Separator`
- `Progress` for export or long-running operations

Cards are not a default component in this inventory. A `Card` remains available
for a meaningful summary or distinct state, but the main Programme Admin
surfaces should be lists, tables, sectioned settings, and drawers.

## Visual foundations

### Inherited

- MentorMAMA navy/teal/mist/stone palette and semantic status colors.
- Manrope for headings and Inter for body/UI text, as established by the
  approved brand/build guide and the shared token package.
- Lucide icons, responsive Tailwind utilities, visible focus, and reduced-motion
  support.

### Adapted

- The existing rounded workspace shell becomes quieter and more operational:
  fewer elevated panels, thinner borders, denser table rows, and stronger
  whitespace between sections.
- Existing Radix dialog/popover behavior is retained while the visual treatment
  moves into shared MentorMAMA primitives.

### Proposed

- A shared table/status/action vocabulary for the Programme Admin pages.
- A compact page-header contract with one primary action and contextual
  breadcrumb.
- A semantic token layer for surface, border, text, accent, success, warning,
  destructive, focus, and disabled states.

## Installation boundary

Install only the variant utility dependencies needed to strengthen
`@mentormama/ui`. Do not initialise Bootstrap, Tremor, Motion, or a separate
shadcn application. Add individual Radix packages only when a concrete shell or
page component uses them.

Any future package addition must record its purpose, accessibility impact,
bundle impact, compatibility with React 19/Tailwind 3, and removal path in this
decision record before installation.

## Verification expectations

Before the first redesigned slice is considered complete:

- portal lint, type-check, and production build pass;
- the shared UI package type-checks;
- desktop, tablet, and mobile shell states are inspected;
- keyboard focus and reduced-motion behavior are checked;
- an authenticated Programme Admin browser journey proves navigation and the
  primary action path;
- no new package has introduced a second icon, typography, spacing, or modal
  vocabulary.

