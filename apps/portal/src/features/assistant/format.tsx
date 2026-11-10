import { Fragment, useEffect, useMemo, useState } from "react";

// Tiny, safe formatter for model replies: paragraphs, bullet/numbered lists and
// **bold**. It builds React elements only (never raw HTML), so replies cannot
// inject markup.

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={index}>{part.replaceAll("**", "")}</Fragment>
    ),
  );
}

export function FormattedReply({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const result: ({ type: "p"; text: string } | { type: "list"; ordered: boolean; items: string[] })[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const item = LIST_ITEM.exec(line);
      if (item) {
        const ordered = /^\s*\d/.test(line);
        const last = result.at(-1);
        if (last?.type === "list" && last.ordered === ordered) last.items.push(item[1]);
        else result.push({ type: "list", ordered, items: [item[1]] });
      } else {
        result.push({ type: "p", text: line.trim() });
      }
    }
    return result;
  }, [text]);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) =>
        block.type === "p" ? (
          <p key={index}>{inline(block.text)}</p>
        ) : block.ordered ? (
          <ol key={index} className="list-decimal space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ol>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5 marker:text-teal">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** Reveals a reply word by word (total ≤ ~1.6s); instantly complete when disabled. */
export function TypedReply({
  text,
  animate,
  onProgress,
}: {
  text: string;
  animate: boolean;
  onProgress?: () => void;
}) {
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const total = words.length;
  const [shown, setShown] = useState(animate ? 0 : total);

  useEffect(() => {
    if (!animate) {
      setShown(total);
      return;
    }
    setShown(0);
    const step = Math.max(2, Math.min(28, Math.floor(1600 / Math.max(total / 2, 1))));
    const id = window.setInterval(() => {
      setShown((current) => {
        if (current + 2 >= total) {
          window.clearInterval(id);
          return total;
        }
        return current + 2;
      });
    }, step);
    return () => window.clearInterval(id);
  }, [animate, text, total]);

  useEffect(() => {
    onProgress?.();
  }, [shown, onProgress]);

  let visible = words.slice(0, shown).join("");
  // Close a half-revealed **bold** so stray asterisks never flash on screen.
  if ((visible.match(/\*\*/g)?.length ?? 0) % 2 === 1) visible += "**";
  return <FormattedReply text={visible} />;
}
