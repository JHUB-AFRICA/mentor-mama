/**
 * MentorMAMA spacing tokens.
 *
 * Source: docs/brand/MentorMAMA_Website_Build_Guide.md §2.3
 *
 * Hard rule from the build guide:
 * Whitespace is treated as part of the interface, not empty space to fill.
 * Every section needs generous vertical padding so sections feel substantial
 * through spacing and type scale, not through cramming in more content.
 *
 * Note: the build guide does not specify exact pixel values for spacing.
 * The scale below defines clearly-named steps so "generous" is encoded in
 * the token rather than left to each developer's judgment.
 */

export const spacing = {
  "0": "0rem",
  px: "0.0625rem",
  "0.5": "0.125rem",
  "1": "0.25rem",
  "2": "0.5rem",
  "3": "0.75rem",
  "4": "1rem",
  "5": "1.25rem",
  "6": "1.5rem",
  "8": "2rem",
  "10": "2.5rem",
  "12": "3rem",
  "16": "4rem",
  "20": "5rem",
  "24": "6rem",
  "32": "8rem",
  "40": "10rem",
  "48": "12rem",
  "64": "16rem",

  // Generous section-level spacing to enforce the "substantial through
  // spacing" rule from §2.3.
  sectionPaddingY: "6rem",
  sectionGap: "5rem",
  contentGap: "2rem",
} as const;

export type SpacingToken = keyof typeof spacing;
