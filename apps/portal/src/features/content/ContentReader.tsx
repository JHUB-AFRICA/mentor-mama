import { Fragment, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/react";
import { Callout } from "./lessonExtensions";
import "./content-detail.css";

type DocNode = JSONContent;

/** Parse a guide body saved by the editor. Returns null for plain-text bodies. */
export function parseGuideBody(body: string): DocNode | null {
  try {
    const parsed = JSON.parse(body) as DocNode;
    return parsed && parsed.type === "doc" ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a guide body has no visible text or images. */
export function isGuideBodyEmpty(body: string): boolean {
  const doc = parseGuideBody(body);
  if (!doc) return !body.trim();
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    const item = node as { type?: string; text?: string; content?: unknown[] };
    if (item.type === "image") return true;
    if (typeof item.text === "string" && item.text.trim()) return true;
    return (item.content ?? []).some(walk);
  };
  return !walk(doc);
}

const readerExtensions = [
  StarterKit.configure({ link: { openOnClick: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } } }),
  Callout,
  Image.configure({ allowBase64: true, HTMLAttributes: { loading: "lazy" } }),
];

/** Read-only, formatted rendering of a guide body (headings, lists, links, images, quotes). */
export function GuideReader({ body }: { body: string }) {
  const doc = useMemo(() => parseGuideBody(body), [body]);
  const editor = useEditor(
    { extensions: readerExtensions, content: doc ?? "", editable: false, immediatelyRender: false },
    [doc],
  );
  if (!doc) return <PlainText text={body} />;
  return (
    <div className="cd-reader">
      <EditorContent editor={editor} />
    </div>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** Plain lesson/guide text: paragraphs preserved, bare URLs become links. */
export function PlainText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) return null;
  return (
    <div className="cd-reader cd-reader--plain">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split("\n").map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {line.split(URL_PATTERN).map((part, partIndex) =>
                /^https?:\/\//.test(part) ? (
                  <a key={partIndex} href={part} target="_blank" rel="noopener noreferrer">
                    {part}
                  </a>
                ) : (
                  <Fragment key={partIndex}>{part}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
