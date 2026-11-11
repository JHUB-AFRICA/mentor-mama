/** Shared helpers for producing and saving files client-side. */

/** Save a Blob via a temporary anchor. Works in Safari and Firefox (anchor must be in the DOM). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let text = String(value);
  // Formula-injection guard: spreadsheets treat these leading characters as formulas.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /["\n\r,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV with a formula-injection guard. Lines are joined with CRLF. */
export function toCsv(rows: unknown[][], { bom = true }: { bom?: boolean } = {}): string {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return `${bom ? "\ufeff" : ""}${body}`;
}

export function csvBlob(rows: unknown[][]): Blob {
  return new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `mentormama-<base>[-<parts>]-YYYY-MM-DD.<ext>` using the local date. */
export function datedFilename(base: string, ext: string, parts: string[] = []): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const segments = ["mentormama", slug(base), ...parts.map(slug).filter(Boolean), date].filter(Boolean);
  return `${segments.join("-")}.${ext}`;
}
