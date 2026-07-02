/**
 * MentorMAMA layout tokens.
 *
 * These are not explicitly listed in the build guide, but they encode
 * the "generous vertical padding" and "substantial through spacing"
 * rules from §2.3 into named, reusable values so the page rhythm stays
 * consistent across every page and section.
 */

export const layout = {
  navbarHeight: "5rem",
  sectionY: "5rem",
  heroY: "7rem",
  cardPadding: "2rem",
  containerPadding: "4rem",
  contentGap: "2rem",
  sectionGap: "8rem",
} as const;

export type LayoutToken = keyof typeof layout;
