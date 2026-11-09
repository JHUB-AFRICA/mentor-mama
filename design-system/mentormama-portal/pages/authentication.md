# MentorMAMA Portal — Authentication Page Override

This page override applies to invitation, activation, login, password recovery,
MFA, and account-security screens.

## Direction

Use the approved MentorMAMA palette and typography from the brand guide. The
generated master design system is a pattern reference only; it does not replace
the product palette.

- Layout: spacious single-column form, optional quiet context panel on desktop.
- Tone: calm, direct, reassuring, never playful or clinical-cold.
- Primary action: one per screen, full-width on mobile.
- Card: 12px radius, full perimeter border, no decorative shadow.
- Form: visible label, helper text, inline validation, preserved context on error.
- MFA: show progress and a clear explanation before requesting a code.
- Recovery codes: dedicated readable state with copy/download affordance and acknowledgement.
- Destructive account actions: desktop dialog, mobile bottom sheet.
- Toasts: global changes only; field errors stay inline.

## Motion

Use 150–250ms opacity + 8px translate transitions for route/state changes. Add
no decorative animation. Honor `prefers-reduced-motion`.
