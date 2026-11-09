# MentorMAMA Authentication Visual Direction

**Status:** Active implementation rule  
**Applies to:** Invitation, activation, sign-in, verification, MFA, and recovery screens

## Composition

Desktop authentication screens use a two-part composition:

- A stable navy brand panel with MentorMAMA identity, concise product context,
  supporting feature cues, and the shared journey artwork.
- A warm-mist content surface with one focused task, clear progress context,
  comfortable form width, and one dominant action.

The brand panel is supporting context, not a second navigation system. On small
screens it is hidden and the compact wordmark/header remains visible.

## Asset and decoration rules

- Shared auth artwork lives at
  `apps/portal/src/assets/auth/mentor-mama-journey.png`.
- Decorative dot grids are CSS-only using a low-opacity radial dot pattern.
- Soft wavy shades are CSS pseudo-elements with pale mist/teal fills and large
  rounded geometry. They must not interfere with reading order or pointer input.
- Artwork is decorative and has an empty alt attribute. Meaningful future
  images require a real description and documented product purpose.
- Never bake copy, buttons, logos, or form instructions into images.

## Spacing and hierarchy

Each screen follows this order:

1. Back/support context, when applicable.
2. Progress or status marker.
3. One page title.
4. Short explanation limited to the decision the user is making.
5. Form or information block.
6. One dominant action.
7. Secondary reassurance, support, or recovery guidance.

Use compact vertical rhythm: 24–40px between major groups, 10–12px between a
label and its control, and 16–24px between related fields. The screen should
feel breathable without creating empty vertical corridors.

The visual scale is deliberately controlled: authentication headings should
usually remain between 40–48px on desktop, body copy between 15–17px, fields
around 48–52px high, and primary actions around 48–52px high. Forms should
usually remain within a 520–560px reading width. Wider content is preferred
only when it prevents awkward title wrapping; controls should not stretch just
because the viewport is wide.

## Component standards

- Labels remain visible above inputs; placeholders are supporting examples.
- Password and code controls support labelled visibility or input behavior.
- Primary buttons are full-width on mobile and may be constrained on desktop
  only when the surrounding hierarchy remains clear.
- Loading, invalid, expired, success, and network states reserve space so the
  layout does not jump.
- All decoration is subordinate to the task and invisible to assistive
  technology when it carries no information.

Email verification is not part of initial invitation activation: the signed
invitation link already verifies control of the invited address. It is reserved
for later email changes and recovery hardening unless product policy changes.

Passwords use a 12-character minimum with common-password and user-attribute
checks. The interface should encourage memorable passphrases and password
managers, not force users into a rigid number/symbol recipe.

## Styling implementation rule

Keep Tailwind as the portal styling engine rather than introducing a second
styling framework. Use Tailwind tokens and responsive utilities for layout,
then promote repeated patterns into semantic classes in
`apps/portal/src/styles/index.css` or reusable components in `packages/ui`.

This gives us Tailwind’s speed with custom CSS consistency. Inputs, primary
actions, support panels, progress markers, cards, and status messages should
share named visual primitives instead of accumulating unrelated utility
strings. CSS Modules are reserved for isolated components with genuinely
complex interaction states.
