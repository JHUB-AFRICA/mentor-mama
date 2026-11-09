# Portal routing and loading-state decisions

**Status:** Implementation guidance and package review  
**Scope:** Authenticated portal routes and loading placeholders

## Routing review

The portal uses `react-router-dom` 7.18.1 and `BrowserRouter`. This is a valid
client-side routing setup for the existing Vite SPA. The portal uses
TanStack Query for API state; replacing the router with a framework or a new
data layer is not required for the current product.

The problem found was inconsistent use of the router APIs: several Programme
Admin screens changed the address with `window.history` or performed full-page
`window.location.assign` navigations. This bypassed React Router's location
state, weakened back/forward behavior, and reloaded the app unnecessarily.

Use React Router APIs consistently:

- `useNavigate` for in-app navigation and `useLocation` as the route-state
  source of truth.
- `useSearchParams` for shareable page state such as report tab and period.
- Keep server-owned capability and role guards in the authenticated router.
- Use lazy feature imports with local Suspense boundaries so an infrequently
  used page does not inflate the first workspace chunk.
- Keep query data in TanStack Query; route changes should not force a session
  reload or discard cached server data.

## Skeleton package review

No additional skeleton package is recommended for this portal.

The existing `@mentormama/ui` `Skeleton` primitive already supports custom
dimensions and shapes through CSS classes. The package is intentionally small;
the missing piece was page-specific composition and placement of loading
boundaries, not primitive capability.

- shadcn/ui's Skeleton is a small class-based placeholder intended to be
  composed into avatar, card, text, form, and table shapes. It does not infer a
  page layout.
- `react-loading-skeleton` is useful for inline text placeholders that should
  inherit the surrounding typography. Its own guidance recommends putting
  skeleton states near the content they replace; it does not remove the need to
  compose a page-shaped loading state.
- A custom SVG/content-loader package would require maintaining a second visual
  model for page structure and would add complexity without a need in the
  current CSS/Tailwind system.

Decision: keep the local primitive, create page-shaped compositions for route
loading and feature-level data loading, preserve approximate page geometry to
reduce layout shift, and disable pulse animation for users who request reduced
motion.

## Implemented direction

- The shared lazy-workspace fallback now reflects the signed-in role, current
  route, navigation vocabulary, and page shape.
- The shared lazy-workspace fallback applies to Programme Admin, Coordinator,
  Nurse Manager, Mentor, and Student roles. The Student profile gate also has a
  local profile-shaped loading state; its profile request does not repeat on
  internal route or query-string changes.
- Programme Admin detail pages load on demand behind page-level Suspense
  boundaries rather than being bundled into the initial admin workspace.
- Placement management is split from the Programme Admin dashboard bundle.
- Programme Admin navigation, content detail/authoring links, and report query
  state use React Router instead of direct History API mutation.
- Account tabs and the facility invite/placeholder destinations use router
  navigation too; account activation now relies on the authenticated role guard
  to replace the activation URL with the correct workspace.
- Coordinator account-tab selection reads the router location, and Nurse Manager
  profile updates refresh the in-memory user instead of reloading the page.
- The shared skeleton primitive respects `prefers-reduced-motion`.
- Production build output shows the Programme Admin workspace chunk reduced
  from 1,034.87 kB (296.59 kB gzip) before the split to 33.40 kB (9.83 kB
  gzip). Reports and content-authoring code now load as separate chunks when
  those routes are opened.

## Research sources

- [React Router data loading](https://reactrouter.com/start/data/data-loading)
- [React Router custom data router and lazy loading](https://reactrouter.com/start/data/custom)
- [shadcn/ui Skeleton](https://ui.shadcn.com/docs/components/base/skeleton)
- [react-loading-skeleton README](https://github.com/dvtng/react-loading-skeleton)
