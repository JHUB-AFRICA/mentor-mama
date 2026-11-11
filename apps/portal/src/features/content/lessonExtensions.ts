import { Node, mergeAttributes } from "@tiptap/react";

export type CalloutVariant = "info" | "tip" | "safety";

export const CALLOUT_LABELS: Record<CalloutVariant, string> = {
  info: "Good to know",
  tip: "Tip",
  safety: "Safety",
};

/** A highlighted box (information, tip or safety note) wrapping ordinary blocks. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-callout") ?? "info",
        renderHTML: (attributes) => ({ "data-callout": attributes.variant }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const variant = (node.attrs.variant as CalloutVariant) ?? "info";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `lesson-callout lesson-callout--${variant}`,
        role: "note",
        "aria-label": CALLOUT_LABELS[variant],
      }),
      0,
    ];
  },
});
