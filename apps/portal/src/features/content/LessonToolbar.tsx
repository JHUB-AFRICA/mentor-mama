import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  Italic,
  Link2,
  Lightbulb,
  List,
  ListOrdered,
  Quote,
  Redo2,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { ApiError, uploadLessonImage } from "../../services/api";
import type { CalloutVariant } from "./lessonExtensions";

const CALLOUTS: Array<{ variant: CalloutVariant; label: string; icon: typeof Info }> = [
  { variant: "info", label: "Good-to-know box", icon: Info },
  { variant: "tip", label: "Tip box", icon: Lightbulb },
  { variant: "safety", label: "Safety box", icon: ShieldAlert },
];

/** Formatting, callout and image controls for the lesson editor. Every control has a text label. */
export function LessonToolbar({ editor, onError }: { editor: Editor | null; onError: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function addImage(file: File) {
    if (!editor) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      onError("Choose a PNG, JPG, WEBP or GIF image smaller than 2MB.");
      return;
    }
    const alt = window.prompt("Describe the image in a few words (read aloud to screen-reader users)")?.trim();
    if (!alt) {
      onError("An image needs a short description so everyone can use it.");
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadLessonImage(file, alt);
      editor.chain().focus().setImage({ src: asset.url, alt: asset.alt }).run();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not upload that image.");
    } finally {
      setUploading(false);
    }
  }

  function addLink() {
    if (!editor) return;
    const url = window.prompt("Paste the link (it must start with https://)")?.trim();
    if (!url) return;
    if (!/^(https:\/\/|mailto:)/i.test(url)) {
      onError("Links must start with https:// or mailto:.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  const run = (action: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () =>
    editor && action(editor.chain().focus()).run();

  return (
    <div className="content-editor-toolbar" role="toolbar" aria-label="Lesson formatting">
      <button type="button" title="Section heading" aria-label="Heading" aria-pressed={editor?.isActive("heading", { level: 2 })} onClick={run((c) => c.toggleHeading({ level: 2 }))}>
        <Heading2 size={17} />
      </button>
      <button type="button" title="Sub-heading" aria-label="Sub-heading" aria-pressed={editor?.isActive("heading", { level: 3 })} onClick={run((c) => c.toggleHeading({ level: 3 }))}>
        <Heading3 size={17} />
      </button>
      <button type="button" title="Bold" aria-label="Bold" aria-pressed={editor?.isActive("bold")} onClick={run((c) => c.toggleBold())}>
        <Bold size={16} />
      </button>
      <button type="button" title="Italic" aria-label="Italic" aria-pressed={editor?.isActive("italic")} onClick={run((c) => c.toggleItalic())}>
        <Italic size={16} />
      </button>
      <button type="button" title="Bulleted list" aria-label="Bulleted list" aria-pressed={editor?.isActive("bulletList")} onClick={run((c) => c.toggleBulletList())}>
        <List size={16} />
      </button>
      <button type="button" title="Numbered list" aria-label="Numbered list" aria-pressed={editor?.isActive("orderedList")} onClick={run((c) => c.toggleOrderedList())}>
        <ListOrdered size={16} />
      </button>
      <button type="button" title="Quote" aria-label="Quote" aria-pressed={editor?.isActive("blockquote")} onClick={run((c) => c.toggleBlockquote())}>
        <Quote size={16} />
      </button>
      <button type="button" title="Link" aria-label="Link" aria-pressed={editor?.isActive("link")} onClick={addLink}>
        <Link2 size={16} />
      </button>
      <span className="content-editor-toolbar-divider" aria-hidden="true" />
      {CALLOUTS.map(({ variant, label, icon: Icon }) => (
        <button
          key={variant}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={editor?.isActive("callout", { variant })}
          onClick={() => {
            if (!editor) return;
            if (editor.isActive("callout")) editor.chain().focus().lift("callout").run();
            else editor.chain().focus().wrapIn("callout", { variant }).run();
          }}
        >
          <Icon size={16} />
        </button>
      ))}
      <button type="button" title="Insert image" aria-label="Insert image" disabled={uploading} onClick={() => fileRef.current?.click()}>
        <ImagePlus size={16} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="lt-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addImage(file);
          event.currentTarget.value = "";
        }}
      />
      <span className="content-editor-toolbar-spacer" />
      <button type="button" title="Undo" aria-label="Undo" onClick={run((c) => c.undo())}>
        <Undo2 size={16} />
      </button>
      <button type="button" title="Redo" aria-label="Redo" onClick={run((c) => c.redo())}>
        <Redo2 size={16} />
      </button>
    </div>
  );
}
