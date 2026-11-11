/**
 * Shared chrome for browser-printed documents (docs/ux/document-design-system.md):
 * a repeating header (master logo lockup, title, scope, Stone rule with a Teal
 * segment), a repeating footer (confidentiality, generated time, page X of Y)
 * and the monochrome-lockup watermark (Midnight Navy, 5%, centred, unrotated).
 *
 * Header and footer are @page margin boxes and the watermark is a
 * `position: fixed` element, which Chrome repeats on every printed page. The rules live in a <style> element
 * only while the component is mounted. The root element is hidden on screen.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import logoAccentRaw from "../assets/brand/logo-horizontal-accent.svg?raw";
import logoMonoRaw from "../assets/brand/logo-horizontal-mono.svg?raw";

export const CONFIDENTIALITY_NOTICE =
  "Confidential: MentorMAMA programme record. Share only with people authorised to see it.";

const NAVY = "#0D1B33";
const dataUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const LOGO_ACCENT = dataUrl(logoAccentRaw);
// The mono master is `currentColor`; resolve it to Midnight Navy at 5% opacity.
const WATERMARK = dataUrl(logoMonoRaw.replaceAll("currentColor", NAVY).replace("<svg ", '<svg opacity="0.05" '));

const cssString = (value: string) => `"${value.replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ")}"`;

function formatGenerated(date: Date) {
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" });
}

/** Generated time, refreshed the moment the user prints. */
function useGeneratedAt() {
  const [generated, setGenerated] = useState(() => formatGenerated(new Date()));
  useEffect(() => {
    const refresh = () => flushSync(() => setGenerated(formatGenerated(new Date())));
    window.addEventListener("beforeprint", refresh);
    return () => window.removeEventListener("beforeprint", refresh);
  }, []);
  return generated;
}

function pageCss(orientation: "portrait" | "landscape", title: string, scope: string, generated: string) {
  const side = orientation === "portrait" ? "16mm" : "14mm";
  const text = "color: #5e6c81; font: 500 7pt/1.4 Inter, Arial, sans-serif;";
  // One full-width header box: logo (left, 10mm high) + title/scope (right),
  // then a 0.6pt Stone rule with a 28mm Teal segment at the left.
  return `@media print { @page {
  size: A4 ${orientation};
  margin: 30mm ${side} 20mm;
  @top-left {
    content: ${cssString(title)} "\\A" ${cssString(scope)};
    width: 100%; margin-bottom: 4mm; padding-bottom: 3mm;
    white-space: pre; text-align: right; vertical-align: bottom; ${text}
    background:
      ${LOGO_ACCENT} left bottom / auto 10mm no-repeat,
      linear-gradient(#1d8c8c, #1d8c8c) left bottom / 28mm 0.6pt no-repeat,
      linear-gradient(#e4e8ee, #e4e8ee) left bottom / 100% 0.6pt no-repeat;
    background-origin: content-box, border-box, border-box;
  }
  @bottom-left { content: ${cssString(CONFIDENTIALITY_NOTICE)}; width: 64%; text-align: left; vertical-align: top; padding-top: 6mm; ${text} }
  @bottom-right { content: "Generated " ${cssString(generated)} "  ·  Page " counter(page) " of " counter(pages); text-align: right; vertical-align: top; padding-top: 6mm; ${text} }
} }`;
}

export function PrintFrame({
  title,
  scope,
  orientation,
  className = "",
  children,
}: {
  title: string;
  scope: string;
  orientation: "portrait" | "landscape";
  /** Extra class on the root (`doc-print-root--exclusive` replaces the whole app on paper). */
  className?: string;
  children?: ReactNode;
}) {
  const generated = useGeneratedAt();
  return createPortal(
    <div className={`doc-print-root doc-print-root--${orientation} ${className}`.trim()} aria-hidden="true">
      <style>{pageCss(orientation, title, scope, generated)}</style>
      <div className="doc-watermark" style={{ backgroundImage: WATERMARK }} />
      {children}
    </div>,
    document.body,
  );
}
