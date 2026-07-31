# MentorMAMA logo files

**Read this before editing, replacing, or recreating any file in this folder.**

## What is here

| File | Use |
| --- | --- |
| `logo-icon.svg` | The mark alone — app icon, favicon, social avatar |
| `logo-icon-mono.svg` | The mark in `currentColor` — inherits the surrounding text colour |
| `logo-horizontal.svg` | Mark + logotype, side by side. For UI headers and any short, wide space |
| `logo-horizontal-on-dark.svg` | The same, white ink for navy backgrounds |
| `logo-horizontal-mono.svg` | The same, `currentColor` — single-colour print, watermarks |
| `logo-horizontal-accent.svg` | Mark + logotype with "MAMA" in Guiding Teal — the approved UI treatment |
| `logo-horizontal-accent-on-dark.svg` | The same, for navy backgrounds |
| `logo-stacked.svg` | Mark above logotype, with the approved tagline. Matches the master artwork |
| `favicon.svg` | The mark on a 16px grid |
| `logo.png`, `logo-icon.png` | **The original raster masters.** Kept as the source of record — do not delete |

The web app does not load these files. It inlines the same path data from
`apps/web/src/components/brand/marks.ts` so the logo can be themed and scaled
without a network request. Both come from the same extraction; if you change one,
regenerate the other.

## Provenance — and why this is not a hand redraw

The Brand Guidelines §05 say: *"Don't redraw or trace the mark by hand"* and
*"use the master logo files only — do not recreate the mark from screenshots,
exports, or memory."*

That rule is respected here, and it is worth being precise about how:

- **No vector master exists.** The only source files are `logo.png` (1846×852)
  and `logo-icon.png` (1254×1254). If a vector original exists in the designer's
  hands, it should replace everything in this folder.
- The SVGs were **measured and machine-vectorised from `logo-icon.png` at full
  resolution** — not eyeballed, not redrawn, not traced from a screenshot.
- Fidelity is measured, not asserted: the mark reproduces the master to
  **99.25% pixel agreement** (intersection-over-union of the ink area against
  the master raster, rendered back at 1254px). Remaining disagreement is
  anti-aliasing at the edge, roughly one pixel wide.
- The logotype ("MentorMAMA") and the tagline are vectorised the same way, from
  `logo.png`.

**What was previously in the codebase was the thing the guidelines warn about:**
a hand-approximated `<path>` — a plain vertical line, a circular arc and a
perfectly centred circle — plus the logotype re-set as live Manrope text with
"MAMA" in teal. That has been replaced.

## Deliberate corrections made during vectorisation

These are the only places the SVGs differ from the raster masters. Each is a
correction *towards* the documented brand, not a creative change.

1. **Colour.** The rasters drift from the palette in Guidelines §06, and drift
   differently from each other:

   | | Specified | `logo-icon.png` | `logo.png` |
   | --- | --- | --- | --- |
   | Ink | `#0D1B33` | `#122B4E` | `#09284E` |
   | Accent | `#1D8C8C` | `#278B92` | `#239FA5` |

   The SVGs use the **specified** values. Guidelines §06 is authoritative for
   colour, and two masters cannot both be right.

2. **Background.** Both rasters have a near-white `#FEFEFE` plate rather than
   transparency, which shows as a faint grey box when placed on white. The SVGs
   have no background.

3. **"MAMA" may be set in Guiding Teal.** Approved by the team lead, 30 July 2026,
   for UI use. This is a deviation from the master artwork, which is single-ink,
   so it is kept as an explicit opt-in (`accentWord` on the `Logo` component,
   and the `-accent` asset files) rather than becoming the default everywhere.
   It is applied to the **real letterforms**: the master logotype is split at the
   blank gutter between "Mentor" and "MAMA", so no glyph is re-typed. The
   stacked lockup and the print/mono variants stay single-ink.

4. **The learner circle is drawn as a true circle.** Measured from the master,
   its outer and inner edges are concentric to within 0.5px and round to within
   0.4px — so it was a circle, and it is now exactly one.

## Construction facts, measured from the master

Useful if the mark ever has to be rebuilt or animated:

- The mark is a **single stroke of varying width**: 102px wide at the top of the
  rising stroke, narrowing to 80px at the open right end (measured at 1254px).
  It **tapers**, which is why it is a filled outline and not a stroked path — a
  constant-width stroke cannot express it. The taper is the "open end" described
  in Guidelines §04: the path continues beyond the mark.
- The rising stroke is exactly vertical (deviation 0.5px over 300px) and eases
  into the curve; the curve is **not** a single circular arc, and the two are not
  tangent. Any reconstruction as "line + arc" will show a kink.
- Learner circle: centre offset (549.7, 555.9), radius 146.7, stroke 80.2, in the
  mark's own 1082.5 × 1000 coordinate space.
- The logotype is **not** Manrope. The closest match among the brand's own
  candidates is Montserrat SemiBold, at only 0.67 shape agreement — not an
  identification. Treat the logotype as artwork, never as live text.
- The tagline is tracked so its width matches the logotype's to within 0.2%
  (911.9 vs 913.5 units). That is deliberate; preserve it.

## Usage rules carried from the guidelines

- **Minimum size:** the mark never renders below **24px** on screen or 10mm in
  print. Below that the learner circle closes up. The `Logo` component warns in
  development if you go under.
- **Clear space:** keep space equal to the height of the learner circle
  (0.293 × the mark's height) clear on all sides.
- **Never** stretch it, recolour it outside the palette, add shadows or
  gradients, rotate or flip it, close the open curve into a loop, or set the
  logotype in a different typeface.
- **Never re-set the logotype in a font.** It is artwork. The closest candidate
  typeface scores only 0.67 shape agreement, so any substitution visibly changes
  the logo. If a live-font logotype is ever wanted, that is a brand decision for
  the guidelines' author, not a UI change — Outfit Medium was the closest match
  reviewed on 30 July 2026, and was not adopted.

## Two open items for the brand owner

1. **The guidelines contradict themselves on the primary lockup.** §04 labels the
   primary lockup "horizontal, full colour" while the artwork shown on that page
   is the *stacked* lockup, which is also what the raster master is. The stacked
   file here matches the master; the horizontal lockup was constructed for UI use
   (a stacked lockup cannot work in a 64px-tall header) and needs sign-off on its
   proportions: **mark height 2.2 × cap height, gap 0.55 × cap height** — set on
   30 July 2026 so the logotype reads as secondary to the mark at small sizes.
2. **A vector master, if one exists, wins.** Everything here should be replaced
   by it.

## Regenerating

The extraction and asset generation are scripted rather than manual. See the
commit that introduced this folder for the measurement and generation scripts;
they take the raster masters as input and emit both the SVGs and
`apps/web/src/components/brand/marks.ts`. Do not hand-edit path data.
