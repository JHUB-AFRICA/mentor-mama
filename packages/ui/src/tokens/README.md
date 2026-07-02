# MentorMAMA Design Tokens

Single source of truth for the MentorMAMA brand system, consumed by both `apps/web` and `apps/portal`.

## `colors.ts`

Contains the six colors from Build Guide §2.1, exported as named constants (`midnightNavy`, `white`, `warmMist`, `guidingTeal`, `softStone`, `mutedTerracotta`) plus a `colorUsage` object documenting the intended ratio.

**Hard rule enforced:** Teal is an accent only, never a second primary. Terracotta is reserved for one deliberate highlight moment per page — never decorative, never repeated.

## `typography.ts`

Contains the two approved typefaces and five type levels from Build Guide §2.2.

**Hard rule enforced:** Headings use Manrope; body/UI text uses Inter. No other typefaces are permitted.

## `spacing.ts`

Contains a spacing scale plus named section-level tokens (`sectionPaddingY`, `sectionGap`, `contentGap`).

**Hard rule enforced:** Whitespace is part of the interface, not empty space to fill. Section-level tokens encode "generous vertical padding" so the rule is enforced by the token rather than left to each developer's judgment.
