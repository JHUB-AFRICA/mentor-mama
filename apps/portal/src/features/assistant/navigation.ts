import type { MentaDestination } from "../../services/api";

/** Only same-origin, in-app paths may be navigated to from Menta. */
export function isSafeHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.includes("\\");
}

function split(href: string): { path: string; view: string } {
  const url = new URL(href, "https://portal.local");
  return { path: url.pathname.replace(/\/+$/, "") || "/", view: url.searchParams.get("view") ?? "" };
}

/** The destination for the current location: exact path+view match, else longest path prefix. */
export function currentDestination(
  destinations: MentaDestination[],
  pathname: string,
  search: string,
): MentaDestination | undefined {
  const here = split(`${pathname}${search}`);
  const exact = destinations.find((d) => {
    const target = split(d.href);
    return target.path === here.path && target.view === here.view;
  });
  if (exact) return exact;
  return destinations
    .filter((d) => {
      const target = split(d.href);
      return !target.view && (here.path === target.path || here.path.startsWith(`${target.path}/`));
    })
    .sort((a, b) => split(b.href).path.length - split(a.href).path.length)[0];
}

const STOP = new Set(["the", "a", "an", "to", "go", "open", "show", "me", "my", "page", "screen", "take", "where", "is", "how", "do", "i", "can"]);

/** Instant, offline matching of what the user is typing against their role's screens. */
export function matchDestinations(destinations: MentaDestination[], query: string, limit = 3): MentaDestination[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9&]+/)
    .filter((word) => word.length >= 2 && !STOP.has(word));
  if (!words.length) return [];
  return destinations
    .map((d) => {
      const label = d.label.toLowerCase();
      const labelWords = label.split(/[^a-z0-9&]+/);
      const description = d.description.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (labelWords.some((part) => part.startsWith(word))) score += 3;
        else if (label.includes(word)) score += 2;
        else if (description.includes(word)) score += 1;
        else return { d, score: -1 };
      }
      return { d, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.d);
}
