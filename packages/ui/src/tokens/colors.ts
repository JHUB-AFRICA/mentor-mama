/**
 * MentorMAMA color tokens.
 *
 * Source: docs/brand/MentorMAMA_Website_Build_Guide.md §2.1
 *
 * Hard rule from the build guide:
 * Navy and white/mist dominate every screen. Teal is an accent, never a
 * second primary. Terracotta is reserved for one deliberate highlight —
 * never decorative, never repeated across a page.
 */

export const colors = {
  midnightNavy: "#0D1B33",
  white: "#FFFFFF",
  warmMist: "#F4F7F8",
  guidingTeal: "#1D8C8C",
  softStone: "#E4E8EE",
  mutedTerracotta: "#D97757",
} as const;

/**
 * Intended usage ratios from Build Guide §2.1.
 * Keeps teal from becoming a second primary and terracotta from becoming
 * decorative noise.
 */
export const colorUsage = {
  navy: "~30%",
  whiteAndMist: "~50%",
  teal: "~15%",
  terracotta: "<5%",
} as const;

export type ColorToken = keyof typeof colors;
