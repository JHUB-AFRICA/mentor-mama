import {
  BRAND_ACCENT,
  BRAND_INK,
  LOCKUP,
  MARK_BOX,
  MARK_PATH,
  MARK_RING,
  TAGLINE_BOX,
  TAGLINE_PATH,
  WORDMARK_BOX,
  WORDMARK_MAMA_PATH,
  WORDMARK_MENTOR_PATH,
  WORDMARK_PATH,
} from "./brand/marks";

type Lockup = "horizontal" | "stacked" | "icon";
type Tone = "navy" | "white" | "mono";

interface LogoProps {
  className?: string;
  /** Rendered height in px. The lockup scales from this. */
  height?: number;
  lockup?: Lockup;
  tone?: Tone;
  /** Only meaningful for the stacked lockup — the master pairs the tagline there. */
  showTagline?: boolean;
  /**
   * Render "MAMA" in the accent colour. A deliberate deviation from the master
   * artwork, approved for UI use — see assets/brand/logo/README.md.
   */
  accentWord?: boolean;
  /** Accessible name. Pass "" when an adjacent link already names it. */
  title?: string;
}

/**
 * The MentorMAMA logo, drawn from the vectorised master artwork in
 * ./brand/marks. Nothing here is redrawn or approximated: the mark and the
 * logotype are the master outlines, and the colours are the documented palette.
 *
 * Guidelines constraints encoded here:
 *  - the logotype is a single ink colour, never two-tone (§05)
 *  - the mark never renders below 24px (§04) — warns in development
 *  - the tagline is only paired in the stacked lockup (§05)
 */
export default function Logo({
  className = "",
  height = 32,
  lockup = "horizontal",
  tone = "navy",
  showTagline = false,
  accentWord = false,
  title = "MentorMAMA",
}: LogoProps) {
  const ink = tone === "white" ? "#FFFFFF" : tone === "mono" ? "currentColor" : BRAND_INK;
  const accent = tone === "mono" ? "currentColor" : BRAND_ACCENT;

  const a11y = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true, focusable: "false" } as const);

  if (lockup === "icon") {
    if (process.env.NODE_ENV !== "production" && height < LOCKUP.minIconPx) {
      console.warn(
        `Logo: the mark should not render below ${LOCKUP.minIconPx}px (got ${height}px) — ` +
          "the learner circle loses legibility. Brand Guidelines §04.",
      );
    }
    return (
      <svg
        className={className}
        width={(height * MARK_BOX.width) / MARK_BOX.height}
        height={height}
        viewBox={`0 0 ${MARK_BOX.width} ${MARK_BOX.height}`}
        {...a11y}
      >
        <Mark ink={ink} accent={accent} />
      </svg>
    );
  }

  if (lockup === "stacked") {
    const { markHeight, gapToWordmark } = LOCKUP.stacked;
    const markWidth = (markHeight * MARK_BOX.width) / MARK_BOX.height;
    const wordTop = markHeight + gapToWordmark;
    const boxHeight =
      wordTop + (showTagline ? TAGLINE_BOX.top + TAGLINE_BOX.height : WORDMARK_BOX.capHeight);
    return (
      <svg
        className={className}
        width={(height * WORDMARK_BOX.width) / boxHeight}
        height={height}
        viewBox={`0 0 ${WORDMARK_BOX.width} ${boxHeight}`}
        {...a11y}
      >
        <g
          transform={`translate(${(WORDMARK_BOX.width - markWidth) / 2} 0) scale(${
            markHeight / MARK_BOX.height
          })`}
        >
          <Mark ink={ink} accent={accent} />
        </g>
        <g transform={`translate(0 ${wordTop})`}>
          <Wordmark ink={ink} accent={accent} accentWord={accentWord} />
          {showTagline && <path d={TAGLINE_PATH} fill={accent} />}
        </g>
      </svg>
    );
  }

  const { markHeight, gap } = LOCKUP.horizontal;
  const markWidth = (markHeight * MARK_BOX.width) / MARK_BOX.height;
  const boxWidth = markWidth + gap + WORDMARK_BOX.width;
  return (
    <svg
      className={className}
      width={(height * boxWidth) / markHeight}
      height={height}
      viewBox={`0 0 ${boxWidth} ${markHeight}`}
      {...a11y}
    >
      <g transform={`scale(${markHeight / MARK_BOX.height})`}>
        <Mark ink={ink} accent={accent} />
      </g>
      <g transform={`translate(${markWidth + gap} ${(markHeight - WORDMARK_BOX.capHeight) / 2})`}>
        <Wordmark ink={ink} accent={accent} accentWord={accentWord} />
      </g>
    </svg>
  );
}

function Wordmark({ ink, accent, accentWord }: { ink: string; accent: string; accentWord: boolean }) {
  if (!accentWord) return <path d={WORDMARK_PATH} fill={ink} />;
  return (
    <>
      <path d={WORDMARK_MENTOR_PATH} fill={ink} />
      <path d={WORDMARK_MAMA_PATH} fill={accent} />
    </>
  );
}

function Mark({ ink, accent }: { ink: string; accent: string }) {
  return (
    <>
      <path d={MARK_PATH} fill={ink} />
      <circle
        cx={MARK_RING.cx}
        cy={MARK_RING.cy}
        r={MARK_RING.r}
        fill="none"
        stroke={accent}
        strokeWidth={MARK_RING.strokeWidth}
      />
    </>
  );
}
