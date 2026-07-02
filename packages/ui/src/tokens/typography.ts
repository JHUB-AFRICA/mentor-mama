/**
 * MentorMAMA typography tokens.
 *
 * Source: docs/brand/MentorMAMA_Website_Build_Guide.md §2.2
 *
 * Hard rule from the build guide:
 * Headings = Manrope. Body/UI text = Inter. No other typefaces.
 * Point sizes are scaled up proportionally for web use.
 */

export const fontFamily = {
  display: '"Manrope", sans-serif',
  body: '"Inter", sans-serif',
} as const;

/**
 * Type scale from Build Guide §2.2.
 * Original point sizes are converted to rem assuming a 16px base,
 * then scaled up slightly for web readability where the guide notes.
 */
export const fontSize = {
  display: ["2.125rem", { lineHeight: "1.2", fontWeight: "700" }], // ~34pt
  heading: ["1.375rem", { lineHeight: "1.3", fontWeight: "600" }], // ~22pt
  subheading: ["0.875rem", { lineHeight: "1.4", fontWeight: "600" }], // ~14pt
  body: ["1rem", { lineHeight: "1.6", fontWeight: "400" }], // scaled up for web
  caption: ["0.75rem", { lineHeight: "1.5", fontWeight: "500" }], // scaled up for web
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export type FontFamilyToken = keyof typeof fontFamily;
export type FontSizeToken = keyof typeof fontSize;
export type FontWeightToken = keyof typeof fontWeight;
