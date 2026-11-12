import { useEffect, useRef, useState, type FormEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Bold,
  BookOpen,
  Heading2,
  Heading3,
  Check,
  FileText,
  GraduationCap,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Plus,
  Quote,
  Redo2,
  Save,
  Send,
  Undo2,
  Upload,
} from "lucide-react";
import { Button } from "@mentormama/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createContentItem,
  createTrainingModule,
  publishContentItem,
  publishTrainingModule,
  getAdminTrainingModules,
  getContentItem,
  reviseContentItem,
  reviseTrainingModule,
  uploadLessonImage,
} from "../../services/api";
import type { LessonType } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import "./authoring-layout.css";
import { Modal } from "../../components/kit";
import { Callout } from "./lessonExtensions";
import { PublishingExtras } from "./PublishingExtras";
import { QuizEditor } from "./QuizEditor";
import { fromQuestion, questionProblem, toPayload, type QuizDraft } from "./quizDraft";
import { LessonToolbar } from "./LessonToolbar";
import { AdminButton } from "../programme-admin/ui/AdminKit";
import { GuideReader, isGuideBodyEmpty, parseGuideBody } from "./ContentReader";
import { audienceOptions, groupsFromRoles, rolesFromGroups, type AudienceGroup } from "./contentMeta";
import "./content-detail.css";
import { StoredImage } from "../../components/StoredImage";

export interface SavedContent {
  kind: AuthoringKind;
  id: string;
}

type ExistingStatus = "draft" | "published" | "archived";

function AudiencePicker({ value, onChange }: { value: AudienceGroup[]; onChange: (value: AudienceGroup[]) => void }) {
  return (
    <fieldset className="content-authoring-field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ padding: 0 }}>
        Audience <span className="content-authoring-required">*</span>
      </legend>
      <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.45rem" }}>
        {audienceOptions.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              style={{
                display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer",
                border: `1px solid ${checked ? "#1d8c8c" : "#dbe4ed"}`, borderRadius: "0.65rem",
                background: checked ? "#e8f7f5" : "#fff", padding: "0.55rem 0.75rem",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? value.filter((item) => item !== option.value) : [...value, option.value])}
              />
              <span style={{ display: "grid", lineHeight: 1.25 }}>
                <strong style={{ fontSize: "0.82rem", color: "#10223b" }}>{option.label}</strong>
                <small style={{ fontSize: "0.72rem", color: "#607392" }}>{option.hint}</small>
              </span>
            </label>
          );
        })}
      </div>
      {value.length === 0 && (
        <small role="alert" style={{ color: "#b83e3e", marginTop: "0.4rem", display: "block" }}>
          Choose at least one audience so someone can see this.
        </small>
      )}
    </fieldset>
  );
}

function ReadinessChecklist({ items }: { items: Array<{ label: string; done: boolean }> }) {
  const remaining = items.filter((item) => !item.done).length;
  return (
    <div className="content-authoring-side-card">
      <p>Publishing checklist</p>
      {items.map((item) => (
        <div className="content-authoring-check" key={item.label}>
          <span className={item.done ? "is-checked" : ""} aria-hidden="true">
            <Check size={13} />
          </span>
          <strong style={{ fontWeight: item.done ? 600 : 500, color: item.done ? "#10223b" : "#607392" }}>
            {item.label}
            <span className="sr-only">{item.done ? " (done)" : " (still needed)"}</span>
          </strong>
        </div>
      ))}
      <small style={{ display: "block", marginTop: "0.5rem", color: remaining ? "#a35f00" : "#2f845d" }} role="status">
        {remaining ? `${remaining} ${remaining === 1 ? "item" : "items"} left before publishing.` : "Ready to publish."}
      </small>
    </div>
  );
}

export type AuthoringKind = "guide" | "module" | "document" | "external";

const kindMeta = {
  guide: {
    label: "Guide",
    icon: BookOpen,
    description: "Write clear programme guidance for your team.",
  },
  module: {
    label: "Learning module",
    icon: GraduationCap,
    description: "Build structured learning with verified completion.",
  },
  document: {
    label: "Document",
    icon: FileText,
    description: "Add a supporting PDF, Word document or presentation.",
  },
  external: {
    label: "External resource",
    icon: Link2,
    description: "Link people to trusted material elsewhere.",
  },
} as const;

export function ContentAuthoringWorkspace({
  kind,
  onBack,
  onError,
  onSaved,
  editId,
}: {
  kind: AuthoringKind;
  onBack: () => void;
  onError: (message: string) => void;
  onSaved: (saved?: SavedContent) => void;
  editId?: string;
}) {
  const queryClient = useQueryClient();
  function handleSaved(saved?: SavedContent) {
    void Promise.all(
      ["content-items", "admin-library-overview", "admin-training-modules", "library", "content-detail", "content-revisions", "content-edit", "module-edit", "training-modules"].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
    onSaved(saved);
  }
  if (kind === "guide")
    return (
      <GuideAuthoring onBack={onBack} onError={onError} onSaved={handleSaved} editId={editId} />
    );
  if (kind === "module")
    return (
      <ModuleAuthoring onBack={onBack} onError={onError} onSaved={handleSaved} editId={editId} />
    );
  return (
    <ResourceAuthoring
      kind={kind}
      onBack={onBack}
      onError={onError}
      onSaved={handleSaved}
      editId={editId}
    />
  );
}

function AuthoringShell({
  kind,
  mode,
  existingStatus,
  preview,
  onPreview,
  onBack,
  onSaveDraft,
  onPublish,
  busy = false,
  children,
}: {
  kind: AuthoringKind;
  mode: "create" | "edit";
  existingStatus?: ExistingStatus;
  preview: boolean;
  onPreview: () => void;
  onBack: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const meta = kindMeta[kind];
  const Icon = meta.icon;
  const live = mode === "edit" && existingStatus === "published";
  const verb = mode === "edit" ? "Edit" : "Create";
  const stateLabel =
    mode === "create"
      ? "New draft · not saved yet"
      : existingStatus === "published"
        ? "Live · changes apply when you save"
        : existingStatus === "archived"
          ? "Archived · restored when published"
          : "Draft";
  return (
    <div className="content-authoring-page">
      <div className="content-authoring-titlebar">
        <div className="content-authoring-breadcrumb">
          <button type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            {mode === "edit" ? "Back" : "Content library"}
          </button>
          <span>/</span>
          <strong>
            {verb} {meta.label.toLowerCase()}
          </strong>
        </div>
        <div className="content-authoring-titlebar-row">
          <div>
            <p className="content-library-eyebrow">
              <Icon size={15} />
              {meta.label}
            </p>
            <h1>
              {preview ? `Preview ${meta.label.toLowerCase()}` : `${verb} ${meta.label.toLowerCase()}`}
            </h1>
            <p>{meta.description}</p>
          </div>
          <div className="content-authoring-topbar-actions">
            <span className="content-authoring-save-state">
              <span />
              {stateLabel}
            </span>
            <Button type="button" variant="tertiary" onClick={onPreview}>
              {preview ? "Edit content" : "Preview"}
            </Button>
            <Button
              type="button"
              variant={live ? "tertiary" : undefined}
              onClick={onSaveDraft}
              disabled={busy}
              title={live ? "Takes this content down and saves your edits as a draft" : undefined}
            >
              <Save size={16} />
              {busy ? "Saving…" : live ? "Save as draft" : "Save draft"}
            </Button>
            <Button type="button" onClick={onPublish} disabled={busy}>
              <Send size={16} />
              {live ? "Save changes" : `Publish ${meta.label.toLowerCase()}`}
            </Button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function savedToast(variables: { publish: boolean; keepLive?: boolean }) {
  if (variables.keepLive)
    return { kind: "success" as const, title: "Changes saved", message: "Your edits are live for the selected audience." };
  if (variables.publish)
    return { kind: "success" as const, title: "Content published", message: "The content is now available to its selected audience." };
  return { kind: "success" as const, title: "Draft saved", message: "Your changes have been saved. Publish when you are ready." };
}

function GuideAuthoring({
  onBack,
  onError,
  onSaved,
  editId,
}: Omit<React.ComponentProps<typeof ContentAuthoringWorkspace>, "kind">) {
  const { pushToast } = useToast();
  const [preview, setPreview] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [audience, setAudience] = useState<AudienceGroup[]>(["mentor"]);
  const [category, setCategory] = useState("onboarding");
  const [tags, setTags] = useState<string[]>([]);
  const [facilityIds, setFacilityIds] = useState<string[]>([]);
  const [contentId, setContentId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<ExistingStatus | undefined>();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const existing = useQuery({ queryKey: ["content-edit", editId], queryFn: () => getContentItem(editId!), enabled: Boolean(editId) });
  const editor = useEditor({
    extensions: [
      StarterKit,
      // Legacy guides may still hold embedded pictures; new ones are uploaded (see insertImage).
      Image.configure({ allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: "Write the guidance your programme needs...",
      }),
    ],
    content: "",
  });
  useEffect(() => {
    const item = existing.data;
    if (!item || !editor) return;
    setContentId(item.id); setTitle(item.title); setSummary(item.summary); setAudience(groupsFromRoles(item.visible_roles)); setCategory(item.category ?? "onboarding"); setTags(item.tags ?? []); setFacilityIds(item.facility_ids ?? []);
    setExistingStatus(item.status ?? (item.published ? "published" : "draft"));
    if (item.cover_image) setCoverPreview(item.cover_image);
    try { editor.commands.setContent(JSON.parse(item.body), { emitUpdate: false }); } catch { editor.commands.clearContent(); }
  }, [editor, existing.data]);
  const bodyJson = JSON.stringify(editor?.getJSON() ?? {});
  const bodyEmpty = isGuideBodyEmpty(bodyJson);
  const save = useMutation({
    mutationFn: async ({ publish, keepLive = false }: { publish: boolean; keepLive?: boolean }) => {
      const input = {
        title,
        slug: slugify(title),
        summary,
        body: JSON.stringify(editor?.getJSON() ?? {}),
        content_type: "guide",
        category,
        visible_roles: rolesFromGroups(audience),
        tags,
        facility_ids: facilityIds,
        cover_image: coverFile,
        keep_published: keepLive,
      };
      const item = contentId
        ? await reviseContentItem(contentId, input)
        : await createContentItem(input);
      setContentId(item.id);
      if (publish) await publishContentItem(item.id);
      return item;
    },
    onSuccess: (result, variables) => { pushToast(savedToast(variables)); onSaved({ kind: "guide", id: result.id }); },
    onError: (cause) =>
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this guide.",
      ),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveDraft();
  }
  function saveDraft() {
    if (!title.trim()) {
      onError("Add a title before saving this guide.");
      return;
    }
    void save.mutate({ publish: false });
  }
  function publish() {
    const problem = !title.trim()
      ? "Add a title before publishing this guide."
      : !summary.trim()
        ? "Add a short summary so people know what this guide covers."
        : bodyEmpty
          ? "Write some content before publishing this guide."
          : audience.length === 0
            ? "Choose at least one audience before publishing."
            : null;
    if (problem) {
      onError(problem);
      return;
    }
    if (existingStatus === "published") void save.mutate({ publish: false, keepLive: true });
    else void save.mutate({ publish: true });
  }
  /**
   * Images are uploaded to private storage and the guide keeps only their link. (Embedding the picture in the
   * guide text made saves fail once a few photos were added.) Older guides with embedded pictures still display.
   */
  async function insertImage(file: File) {
    if (!editor) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
      onError("Choose a PNG, JPG, WEBP or GIF image smaller than 2MB.");
      return;
    }
    const alt = window.prompt("Describe the image in a few words (read aloud to screen-reader users)")?.trim();
    if (!alt) {
      onError("An image needs a short description so everyone can use it.");
      return;
    }
    setImageUploading(true);
    try {
      const asset = await uploadLessonImage(file, alt);
      editor.chain().focus().setImage({ src: asset.url, alt: asset.alt }).run();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not upload that image. Please try again.");
    } finally {
      setImageUploading(false);
    }
  }
  function selectCover(file: File) {
    if (!file.type.startsWith("image/")) {
      onError("Choose a PNG, JPG or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onError("Choose an image smaller than 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCoverPreview(reader.result);
        setCoverFile(file);
      }
    };
    reader.readAsDataURL(file);
  }
  return (
    <AuthoringShell
      kind="guide"
      mode={editId ? "edit" : "create"}
      existingStatus={existingStatus}
      preview={preview}
      onPreview={() => setPreview((value) => !value)}
      onBack={onBack}
      onSaveDraft={saveDraft}
      onPublish={publish}
      busy={save.isPending}
    >
      <form
        id="content-authoring-form"
        className="content-authoring-layout"
        onSubmit={submit}
      >
        <div className="content-authoring-main">
          <GuideDetails
            title={title}
            setTitle={setTitle}
            summary={summary}
            setSummary={setSummary}
          />
          <section className="content-authoring-section">
            <div className="content-authoring-section-heading">
              <div>
                <p>Content</p>
                <span>
                  Use headings, lists, links and callouts to make the guidance
                  easy to follow.
                </span>
              </div>
            </div>
            {preview ? (
              <GuidePreview title={title} summary={summary} editor={editor} />
            ) : (
              <div className="content-authoring-editor">
                <div className="content-editor-toolbar">
                  <button
                    type="button"
                    title="Paragraph"
                    onClick={() => editor?.chain().focus().setParagraph().run()}
                  >
                    Paragraph
                  </button>
                  <button
                    type="button"
                    title="Section heading"
                    aria-label="Section heading"
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                  >
                    <Heading2 size={18} />
                  </button>
                  <button
                    type="button"
                    title="Sub-heading"
                    aria-label="Sub-heading"
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                  >
                    <Heading3 size={18} />
                  </button>
                  <ToolbarDivider />
                  <button
                    type="button"
                    title="Bold"
                    aria-label="Bold"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                  >
                    <Bold size={17} />
                  </button>
                  <button
                    type="button"
                    title="Italic"
                    aria-label="Italic"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                  >
                    <Italic size={17} />
                  </button>
                  <ToolbarDivider />
                  <button
                    type="button"
                    title="Bulleted list"
                    aria-label="Bulleted list"
                    onClick={() =>
                      editor?.chain().focus().toggleBulletList().run()
                    }
                  >
                    <List size={18} />
                  </button>
                  <button
                    type="button"
                    title="Numbered list"
                    aria-label="Numbered list"
                    onClick={() =>
                      editor?.chain().focus().toggleOrderedList().run()
                    }
                  >
                    <ListOrdered size={18} />
                  </button>
                  <button
                    type="button"
                    title="Add link"
                    aria-label="Add link"
                    onClick={() => {
                      const url = window.prompt("Paste the link URL");
                      if (url)
                        editor?.chain().focus().setLink({ href: url }).run();
                    }}
                  >
                    <Link2 size={17} />
                  </button>
                  <button
                    type="button"
                    title={imageUploading ? "Uploading image…" : "Add image"}
                    aria-label={imageUploading ? "Uploading image" : "Add image"}
                    aria-busy={imageUploading}
                    disabled={imageUploading}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImagePlus size={17} />
                  </button>
                  <button
                    type="button"
                    title="Block quote"
                    aria-label="Block quote"
                    onClick={() =>
                      editor?.chain().focus().toggleBlockquote().run()
                    }
                  >
                    <Quote size={17} />
                  </button>
                  <span className="content-editor-toolbar-spacer" />
                  <button
                    type="button"
                    title="Undo"
                    aria-label="Undo"
                    onClick={() => editor?.chain().focus().undo().run()}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    type="button"
                    title="Redo"
                    aria-label="Redo"
                    onClick={() => editor?.chain().focus().redo().run()}
                  >
                    <Redo2 size={17} />
                  </button>
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void insertImage(file);
                    event.currentTarget.value = "";
                  }}
                />
                <EditorContent editor={editor} />
              </div>
            )}
          </section>
          <div className="content-authoring-bottom-actions">
            <Button type="button" variant="tertiary" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              <Save size={16} />
              {save.isPending ? "Saving…" : existingStatus === "published" ? "Save as draft" : "Save draft"}
            </Button>
          </div>
        </div>
        <GuideSettings
          checklist={[
            { label: "Title added", done: Boolean(title.trim()) },
            { label: "Summary added", done: Boolean(summary.trim()) },
            { label: "Content written", done: !bodyEmpty },
            { label: "Audience selected", done: audience.length > 0 },
          ]}
          audience={audience}
          setAudience={setAudience}
          category={category}
          setCategory={setCategory}
          extras={<PublishingExtras tags={tags} setTags={setTags} facilityIds={facilityIds} setFacilityIds={setFacilityIds} />}
          coverInputRef={coverInputRef}
          coverPreview={coverPreview}
          onCoverChange={selectCover}
        />
      </form>
    </AuthoringShell>
  );
}

function ModuleAuthoring({
  onBack,
  onError,
  onSaved,
  editId,
}: Omit<React.ComponentProps<typeof ContentAuthoringWorkspace>, "kind">) {
  const { pushToast } = useToast();
  const [preview, setPreview] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [audience, setAudience] = useState<AudienceGroup[]>(["mentor"]);
  const [category, setCategory] = useState("clinical_care");
  const [existingStatus, setExistingStatus] = useState<ExistingStatus | undefined>();
  const [required, setRequired] = useState(false);
  const [certificate, setCertificate] = useState(true);
  const [includeQuiz, setIncludeQuiz] = useState(false);
  const [passMark, setPassMark] = useState(70);
  const [selectedLesson, setSelectedLesson] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [changeKind, setChangeKind] = useState<"minor" | "major">("minor");
  const [changeNote, setChangeNote] = useState("");
  const [lessons, setLessons] = useState<Array<{ title: string; body: string; lesson_type: LessonType; duration_minutes: number; video_url?: string; id?: string; section?: string }>>([
    { id: crypto.randomUUID(), title: "", body: "", lesson_type: "reading" as LessonType, duration_minutes: 5 },
  ]);
  const [quiz, setQuiz] = useState<QuizDraft[]>([]);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const existing = useQuery({ queryKey: ["module-edit", editId], queryFn: getAdminTrainingModules, enabled: Boolean(editId) });
  useEffect(() => {
    const module = existing.data?.find((row) => row.id === editId);
    if (!module) return;
    setTitle(module.title); setSummary(module.description); setAudience(groupsFromRoles(module.visible_roles)); setCategory(module.category); setRequired(module.is_required); setCertificate(module.certificate_enabled !== false); setPassMark(module.pass_mark);
    setExistingStatus(module.status);
    setLessons(module.lessons.map((lesson) => ({ title: lesson.title, body: lesson.body, lesson_type: lesson.lesson_type, duration_minutes: lesson.duration_minutes, video_url: lesson.video_url ?? "", id: lesson.id, section: lesson.section ?? "" })));
    setSelectedLesson(0); setIncludeQuiz(module.quiz.length > 0);
    setQuiz([...module.quiz, ...(module.checks ?? [])].map(fromQuestion));
    if (module.cover_image) setCoverPreview(module.cover_image);
  }, [editId, existing.data]);
  const buildInput = (keepLive: boolean) => ({
    title,
    description: summary,
    pass_mark: passMark,
    is_required: required,
    certificate_enabled: certificate,
    visible_roles: rolesFromGroups(audience),
    category,
    lessons,
    // Lesson checks are always kept; the final knowledge check only when switched on.
    quiz: quiz.filter((question) => (question.lesson_id ? true : includeQuiz)).map(toPayload),
    cover_image: coverFile,
    keep_published: keepLive,
  });
  const save = useMutation({
    mutationFn: async ({ publish, keepLive = false, change }: { publish: boolean; keepLive?: boolean; change?: { kind: "minor" | "major"; note: string } }) => {
      const module = editId
        ? await reviseTrainingModule(editId, buildInput(keepLive))
        : await createTrainingModule(buildInput(false));
      if (publish) await publishTrainingModule(module.id, change);
      return module;
    },
    onSuccess: (result, variables) => { pushToast(savedToast(variables)); onSaved({ kind: "module", id: result.id }); },
    onError: (cause) =>
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this learning module.",
      ),
  });
  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= lessons.length) return;
    setLessons((current) => {
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
    setSelectedLesson(next);
  }
  function selectCover(file: File) {
    if (!file.type.startsWith("image/")) {
      onError("Choose a PNG, JPG or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onError("Choose an image smaller than 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCoverPreview(reader.result);
        setCoverFile(file);
      }
    };
    reader.readAsDataURL(file);
  }
  const lessonsComplete = lessons.length > 0 && lessons.every((lesson) => lesson.title.trim() && lesson.body.trim());
  const finalQuiz = quiz.filter((question) => !question.lesson_id);
  const quizComplete =
    quiz.filter((question) => question.lesson_id).every((question) => !questionProblem(question)) &&
    (!includeQuiz || (finalQuiz.length > 0 && finalQuiz.every((question) => !questionProblem(question))));
  function publishProblem(): string | null {
    if (!title.trim()) return "Add a title to this module.";
    if (!summary.trim()) return "Add a description so learners know what the module covers.";
    if (!lessonsComplete) return "Give every lesson a title and some content.";
    if (!quizComplete) return "Finish every knowledge check question: a prompt, at least two answers and the correct answer.";
    if (audience.length === 0) return "Choose at least one audience.";
    return null;
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveDraft();
  }
  function saveDraft() {
    if (!title.trim()) {
      onError("Add a title before saving this module.");
      return;
    }
    if (lessons.some((lesson) => !lesson.title.trim() || !lesson.body.trim())) {
      onError("Give every lesson a title and some content, or remove the empty lesson.");
      return;
    }
    if (!quizComplete) {
      onError("Finish every knowledge check question or remove the incomplete one.");
      return;
    }
    void save.mutate({ publish: false });
  }
  function publish() {
    const problem = publishProblem();
    if (problem) {
      onError(problem);
      return;
    }
    if (existingStatus === "published") setPublishOpen(true);
    else void save.mutate({ publish: true });
  }
  const activeLesson = lessons[selectedLesson];
  function removeLesson(index: number) {
    if (lessons.length === 1) return;
    const removedId = lessons[index]?.id;
    // A lesson's practice questions go with it.
    if (removedId) setQuiz((current) => current.filter((question) => question.lesson_id !== removedId));
    setLessons((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
    setSelectedLesson((current) => Math.min(current, lessons.length - 2));
  }
  const publishDialog = (
    <Modal
      open={publishOpen}
      onClose={() => setPublishOpen(false)}
      dismissible={!save.isPending}
      size="sm"
      title="Publish this update"
      description="Learners who already started keep the version they are on. Choose how the change affects people who finished it."
      footer={
        <>
          <AdminButton variant="secondary" size="sm" disabled={save.isPending} onClick={() => setPublishOpen(false)}>Cancel</AdminButton>
          <AdminButton
            size="sm"
            disabled={save.isPending || (changeKind === "major" && !changeNote.trim())}
            onClick={() => {
              setPublishOpen(false);
              void save.mutate({ publish: true, keepLive: true, change: { kind: changeKind, note: changeNote } });
            }}
          >
            {save.isPending ? "Publishing…" : "Publish update"}
          </AdminButton>
        </>
      }
    >
      <fieldset className="content-authoring-field">
        <legend>What kind of change is this?</legend>
        <label>
          <input type="radio" name="change-kind" checked={changeKind === "minor"} onChange={() => setChangeKind("minor")} /> Minor — wording or typo. Existing completions stay complete.
        </label>
        <label>
          <input type="radio" name="change-kind" checked={changeKind === "major"} onChange={() => setChangeKind("major")} /> Major — the content changed. Required learners must refresh after 30 days.
        </label>
      </fieldset>
      <label className="content-authoring-field">
        {changeKind === "major" ? "What changed? (required)" : "What changed? (optional)"}
        <input value={changeNote} maxLength={500} onChange={(event) => setChangeNote(event.target.value)} />
      </label>
    </Modal>
  );
  return (
    <>
    {publishDialog}
    <AuthoringShell
      kind="module"
      mode={editId ? "edit" : "create"}
      existingStatus={existingStatus}
      preview={preview}
      onPreview={() => setPreview((value) => !value)}
      onBack={onBack}
      onSaveDraft={saveDraft}
      onPublish={publish}
      busy={save.isPending}
    >
      <form
        id="content-authoring-form"
        className="content-authoring-layout content-module-authoring-layout"
        onSubmit={submit}
      >
        <ModuleStructure
          lessons={lessons}
          selected={selectedLesson}
          includeQuiz={includeQuiz}
          onSelect={setSelectedLesson}
          onMove={move}
          onDelete={removeLesson}
          onAdd={() =>
            setLessons((current) => [
              ...current,
              { id: crypto.randomUUID(), title: "", body: "", lesson_type: "reading" as LessonType, duration_minutes: 5 },
            ])
          }
        />
        {preview ? (
          <ModulePreview title={title} summary={summary} lessons={lessons} includeQuiz={includeQuiz} quiz={quiz.filter((question) => !question.lesson_id)} passMark={passMark} />
        ) : (
          <ModuleLessonEditor
            checksSlot={
              activeLesson?.id ? (
                <QuizEditor
                  heading="Check your understanding"
                  compact
                  lessonId={activeLesson.id}
                  questions={quiz.filter((question) => question.lesson_id === activeLesson.id)}
                  onChange={(next) => setQuiz([...quiz.filter((question) => question.lesson_id !== activeLesson.id), ...next])}
                  onError={onError}
                />
              ) : null
            }
            lesson={activeLesson}
            index={selectedLesson}
            onTitleChange={(value) =>
              setLessons((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === selectedLesson
                    ? { ...item, title: value }
                    : item,
                ),
              )
            }
            onBodyChange={(value) =>
              setLessons((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === selectedLesson
                    ? { ...item, body: value }
                    : item,
                ),
              )
            }
            onTypeChange={(value) =>
              setLessons((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === selectedLesson ? { ...item, lesson_type: value } : item,
                ),
              )
            }
            sections={Array.from(new Set(lessons.map((item) => item.section ?? "").filter(Boolean)))}
            onError={onError}
            onSectionChange={(value) =>
              setLessons((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === selectedLesson ? { ...item, section: value } : item,
                ),
              )
            }
            onVideoChange={(value) =>
              setLessons((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === selectedLesson ? { ...item, video_url: value } : item,
                ),
              )
            }
            onDurationChange={(value) =>
              setLessons((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === selectedLesson ? { ...item, duration_minutes: value } : item,
                ),
              )
            }
            onMove={move}
            onDelete={removeLesson}
          />
        )}
        <aside className="content-authoring-sidebar">
          <ModuleDetails
            title={title}
            setTitle={setTitle}
            summary={summary}
            setSummary={setSummary}
            audience={audience}
            setAudience={setAudience}
            category={category}
            setCategory={setCategory}
            coverInputRef={coverInputRef}
            coverPreview={coverPreview}
            onCoverChange={selectCover}
          />
          <div className="content-authoring-side-card">
            <div className="content-authoring-card-heading">
              <span className="content-authoring-card-icon">
                <Check size={17} />
              </span>
              <div>
                <strong>Completion settings</strong>
                <small>Define how learners complete this module.</small>
              </div>
            </div>
            <label className="content-authoring-check">
              <input
                type="checkbox"
                checked={required}
                onChange={(event) => setRequired(event.target.checked)}
              />
              <span className={required ? "is-checked" : ""}>
                <Check size={13} />
              </span>
              <strong>Required for everyone in the audience</strong>
            </label>
            <small className="content-authoring-field-help">Mentors must finish required modules before they can take placements.</small>
            <label className="content-authoring-check">
              <input type="checkbox" checked={certificate} onChange={(event) => setCertificate(event.target.checked)} />
              <span className={certificate ? "is-checked" : ""}>
                <Check size={13} />
              </span>
              <strong>Give a certificate of completion</strong>
            </label>
            <label className="content-authoring-check">
              <input
                type="checkbox"
                checked={includeQuiz}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setIncludeQuiz(checked);
                }}
              />
              <span className={includeQuiz ? "is-checked" : ""}>
                <Check size={13} />
              </span>
              <strong>Include a knowledge check</strong>
            </label>
            {!includeQuiz && (
              <small className="content-authoring-field-help">
                Without a knowledge check, learners complete this module by marking it as read after the last lesson.
              </small>
            )}
            {includeQuiz && (
              <label className="content-authoring-module-score">
                Passing score
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={passMark}
                  onChange={(event) => setPassMark(Number(event.target.value))}
                />
                <span>%</span>
              </label>
            )}
            {includeQuiz && (
              <QuizEditor
                questions={finalQuiz}
                onChange={(next) => setQuiz([...quiz.filter((question) => question.lesson_id), ...next])}
                onError={onError}
              />
            )}
          </div>
          <ReadinessChecklist
            items={[
              { label: "Title and description added", done: Boolean(title.trim() && summary.trim()) },
              { label: "Every lesson has a title and content", done: lessonsComplete },
              { label: includeQuiz ? "Knowledge check questions complete" : "Knowledge check (optional)", done: includeQuiz ? quizComplete && quiz.length > 0 : true },
              { label: "Audience selected", done: audience.length > 0 },
            ]}
          />
          <div className="content-authoring-bottom-actions">
            <Button type="button" variant="tertiary" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              <Save size={16} />
              {save.isPending ? "Saving…" : existingStatus === "published" ? "Save as draft" : "Save draft"}
            </Button>
          </div>
        </aside>
      </form>
    </AuthoringShell>
    </>
  );
}

/** Lesson bodies are editor documents (JSON); older lessons are plain text and become paragraphs. */
function bodyToDoc(body: string) {
  const doc = parseGuideBody(body);
  if (doc) return doc;
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.length
      ? paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] }))
      : [{ type: "paragraph" }],
  };
}

function ModuleStructure({
  lessons,
  selected,
  includeQuiz,
  onSelect,
  onAdd,
  onMove,
  onDelete,
}: {
  lessons: Array<{ title: string; body: string; lesson_type: LessonType; duration_minutes: number; video_url?: string; id?: string; section?: string }>;
  selected: number;
  includeQuiz: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
}) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  return (
    <aside className="content-module-structure content-authoring-side-card">
      <h2>Module structure</h2>
      <div className="content-module-lesson-list">
        {lessons.map((lesson, index) => (
          <div
            key={`${index}-${lesson.title}`}
            className={`content-module-lesson-row ${selected === index ? "is-selected" : ""}`}
          >
            <button
              type="button"
              className="content-module-lesson-select"
              aria-pressed={selected === index}
              onClick={() => onSelect(index)}
            >
              <span className="content-authoring-lesson-number">{index + 1}</span>
              <strong>{lesson.title || `Lesson ${index + 1}`}</strong>
            </button>
            <span className="content-module-lesson-menu">
              <button
                type="button"
                className="content-module-more"
                aria-label={`Actions for ${lesson.title || `Lesson ${index + 1}`}`}
                aria-expanded={openMenu === index}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenu((current) => (current === index ? null : index));
                }}
              >
                ⋮
              </button>
              {openMenu === index && (
                <div className="content-module-lesson-menu-popover" role="menu">
                  <button type="button" role="menuitem" disabled={index === 0} onClick={() => { onMove(index, -1); setOpenMenu(null); }}>
                    Move up
                  </button>
                  <button type="button" role="menuitem" disabled={index === lessons.length - 1} onClick={() => { onMove(index, 1); setOpenMenu(null); }}>
                    Move down
                  </button>
                  <button type="button" role="menuitem" disabled={lessons.length === 1} onClick={() => { onDelete(index); setOpenMenu(null); }}>
                    Delete lesson
                  </button>
                </div>
              )}
            </span>
          </div>
        ))}
        {includeQuiz && (
          <div className="content-module-lesson-list-quiz">
            <span className="content-authoring-lesson-number">✓</span>
            <strong>Knowledge check</strong>
            <span className="content-module-quiz-status">Included</span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="content-module-add-lesson"
        onClick={onAdd}
      >
        <Plus size={18} />
        Add lesson
      </button>
      <div className="content-module-reorder-hint">
        <ArrowUp size={14} />
        <ArrowDown size={14} /> Use the lesson controls to change the order.
      </div>
    </aside>
  );
}

function ModuleLessonEditor({
  lesson,
  index,
  onTitleChange,
  onBodyChange,
  onTypeChange,
  onDurationChange,
  onVideoChange,
  onSectionChange,
  onError,
  sections,
  checksSlot,
  onMove,
  onDelete,
}: {
  lesson: { title: string; body: string; lesson_type: LessonType; duration_minutes: number; video_url?: string; id?: string; section?: string } | undefined;
  index: number;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onTypeChange: (value: LessonType) => void;
  onDurationChange: (value: number) => void;
  onVideoChange: (value: string) => void;
  onSectionChange: (value: string) => void;
  onError: (message: string) => void;
  sections: string[];
  checksSlot?: React.ReactNode;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
}) {
  const lastEmitted = useRef<string>(lesson?.body ?? "");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Callout,
      Image.configure({ HTMLAttributes: { loading: "lazy" } }),
      Placeholder.configure({ placeholder: "Write the lesson content..." }),
    ],
    content: bodyToDoc(lesson?.body ?? ""),
    onUpdate: ({ editor: nextEditor }) => {
      if (!nextEditor.isDestroyed && nextEditor.schema) {
        // Keep the formatting: store the editor document, not its plain text.
        const next = nextEditor.isEmpty ? "" : JSON.stringify(nextEditor.getJSON());
        lastEmitted.current = next;
        onBodyChange(next);
      }
    },
  });
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.schema || !lesson) return;
    if (lesson.body !== lastEmitted.current) {
      lastEmitted.current = lesson.body;
      editor.commands.setContent(bodyToDoc(lesson.body), { emitUpdate: false });
    }
  }, [editor, lesson]);
  if (!lesson) return null;
  return (
    <section className="content-authoring-section content-module-lesson-editor">
      <div className="content-module-editor-heading">
        <h2>Lesson {index + 1}</h2>
        <button
          type="button"
          aria-label="Move lesson down"
          title="Move lesson down"
          onClick={() => onMove(index, 1)}
        >
          <ArrowDown size={16} /> Move down
        </button>
        <button
          type="button"
          aria-label="Delete lesson"
          title="Delete lesson"
          onClick={() => onDelete(index)}
        >
          ×
        </button>
      </div>
      <label className="content-authoring-field">
        <span>Lesson title <span className="content-authoring-required">*</span></span>
        <input
          value={lesson.title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <div className="content-module-editor-meta">
        <label className="content-authoring-field">
          Lesson type{" "}
          <select value={lesson.lesson_type} onChange={(event) => onTypeChange(event.target.value as LessonType)}>
            <option value="reading">Reading</option>
            <option value="video">Video</option>
            <option value="checklist">Checklist</option>
          </select>
        </label>
        <label className="content-authoring-field">
          Estimated duration
          <input type="number" min="1" max="600" value={lesson.duration_minutes} onChange={(event) => onDurationChange(Number(event.target.value))} />
        </label>
      </div>
      <label className="content-authoring-field">
        Section (optional)
        <input
          list="lesson-sections"
          maxLength={120}
          placeholder="e.g. Before the first shift"
          value={lesson.section ?? ""}
          onChange={(event) => onSectionChange(event.target.value)}
        />
        <datalist id="lesson-sections">
          {sections.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <small className="content-authoring-field-help">Lessons with the same section name are grouped together for learners.</small>
      </label>
      {lesson.lesson_type === "video" && (
        <label className="content-authoring-field">
          <span>
            Video link <span className="content-authoring-required">*</span>
          </span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={lesson.video_url ?? ""}
            onChange={(event) => onVideoChange(event.target.value)}
          />
          <small>Paste a YouTube or Vimeo link. It plays inside MentorMAMA only when the learner taps play. Use the content box below for a short summary or transcript, which learners without video access can read.</small>
        </label>
      )}
      <div className="content-authoring-field">
        <span>
          Lesson content <span className="content-authoring-required">*</span>
        </span>
        <div className="content-authoring-editor content-module-editor">
          <LessonToolbar editor={editor} onError={onError} />
          <EditorContent editor={editor} />
        </div>
      </div>
      {checksSlot && <div className="content-module-checks">{checksSlot}</div>}
      <div className="content-module-note">
        <Check size={17} />
        <span>
          <strong>Authoring note</strong>Lessons are presented to learners in
          the order shown in the module structure. Use Preview to review the
          learning flow before saving or publishing.
        </span>
      </div>
    </section>
  );
}

function ModuleDetails({
  title,
  setTitle,
  summary,
  setSummary,
  audience,
  setAudience,
  category,
  setCategory,
  coverInputRef,
  coverPreview,
  onCoverChange,
}: Omit<React.ComponentProps<typeof AuthoringDetails>, "audience" | "setAudience"> & {
  audience: AudienceGroup[];
  setAudience: (value: AudienceGroup[]) => void;
  coverInputRef: React.RefObject<HTMLInputElement | null>;
  coverPreview: string | null;
  onCoverChange: (file: File) => void;
}) {
  return (
    <div className="content-authoring-side-card content-module-details">
      <div className="content-authoring-card-heading">
        <span className="content-authoring-card-icon">
          <FileText size={17} />
        </span>
        <div>
          <strong>Module details</strong>
          <small>Set the learning context and audience.</small>
        </div>
      </div>
      <label className="content-authoring-field">
        <span>Title <span className="content-authoring-required">*</span></span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          placeholder="Mentor orientation"
        />
      </label>
      <label className="content-authoring-field">
        <span>Description <span className="content-authoring-required">*</span></span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          required
          placeholder="Describe what learners will gain from this module."
        />
      </label>
      <AudiencePicker value={audience} onChange={setAudience} />
      <label className="content-authoring-field">
        <span>Category <span className="content-authoring-required">*</span></span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="onboarding">Orientation</option>
          <option value="clinical_care">Clinical care</option>
          <option value="safeguarding">Safeguarding</option>
          <option value="reference">Reference</option>
        </select>
      </label>
      <div className="content-authoring-cover">
        <strong>Cover image</strong>
        <button type="button" onClick={() => coverInputRef.current?.click()}>
          <StoredImage src={coverPreview} alt="Module cover preview" fallback={<ImagePlus size={17} />} />
          {coverPreview ? "Change cover image" : "Add a cover image"}
          <small>PNG, JPG or WEBP · max 2MB</small>
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onCoverChange(file);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );
}

function ModulePreview({
  title,
  summary,
  lessons,
  includeQuiz,
  quiz,
  passMark,
}: {
  title: string;
  summary: string;
  lessons: Array<{ title: string; body: string }>;
  includeQuiz: boolean;
  quiz: QuizDraft[];
  passMark: number;
}) {
  return (
    <article className="content-authoring-section content-module-preview">
      <p className="content-library-eyebrow">Learning module · Preview</p>
      <h2>{title || "Untitled learning module"}</h2>
      <p>{summary || "Add a description for this module."}</p>
      {lessons.map((lesson, index) => (
        <section key={`${index}-${lesson.title}`}>
          <span>{index + 1}</span>
          <div>
            <h3>{lesson.title}</h3>
            <GuideReader body={lesson.body} />
          </div>
        </section>
      ))}
      {includeQuiz && quiz.length > 0 && (
        <section className="content-module-preview-quiz">
          <div>
            <span>Knowledge check</span>
            <small>
              {quiz.length} {quiz.length === 1 ? "question" : "questions"} · pass mark {passMark}%
            </small>
          </div>
          {quiz.map((question, questionIndex) => (
            <div key={`preview-question-${questionIndex}`}>
              {question.scenario && <p><em>{question.scenario}</em></p>}
              <h3>
                {questionIndex + 1}. {question.prompt || "Your question will appear here."}
              </h3>
              {question.kind === "multi" && <p>Select all that apply.</p>}
              <ul>
                {question.options.map((option, index) => (
                  <li key={`preview-option-${questionIndex}-${index}`}>{option.text || `Answer option ${index + 1}`}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}

function ResourceAuthoring({
  kind,
  onBack,
  onError,
  onSaved,
  editId,
}: { kind: "document" | "external" } & Omit<
  React.ComponentProps<typeof ContentAuthoringWorkspace>,
  "kind"
>) {
  const { pushToast } = useToast();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [audience, setAudience] = useState<AudienceGroup[]>(["mentor"]);
  const [category, setCategory] = useState("reference");
  const [tags, setTags] = useState<string[]>([]);
  const [facilityIds, setFacilityIds] = useState<string[]>([]);
  const [existingStatus, setExistingStatus] = useState<ExistingStatus | undefined>();
  const [resourceUrl, setResourceUrl] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState("");
  const documentInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!documentFile) { setDocumentPreviewUrl(""); return; }
    const url = URL.createObjectURL(documentFile);
    setDocumentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [documentFile]);
  const [preview, setPreview] = useState(false);
  const [contentId, setContentId] = useState<string | null>(null);
  const existing = useQuery({ queryKey: ["content-edit", editId], queryFn: () => getContentItem(editId!), enabled: Boolean(editId) });
  useEffect(() => {
    const item = existing.data;
    if (!item) return;
    setContentId(item.id); setTitle(item.title); setSummary(item.summary); setResourceUrl(item.resource_url.startsWith("/api/v1/content/") ? "" : item.resource_url); setAudience(groupsFromRoles(item.visible_roles)); setCategory(item.category ?? "reference"); setTags(item.tags ?? []); setFacilityIds(item.facility_ids ?? []);
    setExistingStatus(item.status ?? (item.published ? "published" : "draft"));
  }, [existing.data]);
  const save = useMutation({
    mutationFn: async ({ publish, keepLive = false }: { publish: boolean; keepLive?: boolean }) => {
      const input = {
        title,
        slug: slugify(title),
        summary,
        body: summary,
        resource_url: resourceUrl,
        document_file: documentFile,
        content_type: kind,
        category,
        visible_roles: rolesFromGroups(audience),
        tags,
        facility_ids: facilityIds,
        keep_published: keepLive,
      };
      const item = contentId
        ? await reviseContentItem(contentId, input)
        : await createContentItem(input);
      setContentId(item.id);
      if (publish) await publishContentItem(item.id);
      return item;
    },
    onSuccess: (result, variables) => { pushToast(savedToast(variables)); onSaved({ kind, id: result.id }); },
    onError: (cause) =>
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this resource.",
      ),
  });
  const hasSource = kind === "document"
    ? Boolean(documentFile || resourceUrl.trim() || existing.data?.document_name)
    : Boolean(resourceUrl.trim());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveDraft();
  }
  function saveDraft() {
    if (!title.trim()) {
      onError("Add a title before saving.");
      return;
    }
    void save.mutate({ publish: false });
  }
  function publish() {
    const problem = !title.trim()
      ? "Add a title before publishing."
      : !hasSource
        ? kind === "document"
          ? "Choose a document file or add its managed link before publishing."
          : "Add a valid resource URL before publishing."
        : audience.length === 0
          ? "Choose at least one audience before publishing."
          : null;
    if (problem) {
      onError(problem);
      return;
    }
    if (existingStatus === "published") void save.mutate({ publish: false, keepLive: true });
    else void save.mutate({ publish: true });
  }
  return (
    <AuthoringShell
      kind={kind}
      mode={editId ? "edit" : "create"}
      existingStatus={existingStatus}
      preview={preview}
      onPreview={() => setPreview((value) => !value)}
      onBack={onBack}
      onSaveDraft={saveDraft}
      onPublish={publish}
      busy={save.isPending}
    >
      <form
        id="content-authoring-form"
        className="content-authoring-layout"
        onSubmit={submit}
      >
        <div className="content-authoring-main">
          <AuthoringDetails
            title={title}
            setTitle={setTitle}
            summary={summary}
            setSummary={setSummary}
            audience={audience}
            setAudience={setAudience}
            category={category}
            setCategory={setCategory}
          />
          <section className="content-authoring-section">
            <PublishingExtras tags={tags} setTags={setTags} facilityIds={facilityIds} setFacilityIds={setFacilityIds} />
          </section>
          <section className="content-authoring-section">
            <div className="content-authoring-section-heading">
              <div>
                <p>{kind === "document" ? "Document" : "External resource"}</p>
                <span>
                  {kind === "document"
                    ? "Add a managed document link that learners can open from the library."
                    : "Check the link before publishing so learners always have a reliable destination."}
                </span>
              </div>
            </div>
            {kind === "document" && !preview ? (
              <div className="content-authoring-upload-placeholder">
                <FileText size={28} />
                <strong>{documentFile?.name ?? existing.data?.document_name ?? "Add a PDF, Word document or presentation"}</strong>
                <span>{documentFile ? `${(documentFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to upload` : "Choose a file up to 20 MB, or add a managed link below."}</span>
                <input ref={documentInput} type="file" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) setDocumentFile(file); event.currentTarget.value = ""; }} />
                <Button type="button" variant="tertiary" onClick={() => documentInput.current?.click()}><Upload size={15} /> {documentFile || existing.data?.document_name ? "Replace file" : "Choose file"}</Button>
                {documentFile && <Button type="button" variant="tertiary" onClick={() => setDocumentFile(null)}>Remove</Button>}
              </div>
            ) : null}
            {preview ? (
              <ResourcePreview kind={kind} title={title} summary={summary} url={kind === "document" ? documentPreviewUrl || resourceUrl || existing.data?.resource_url || "" : resourceUrl} />
            ) : (
              <label className="content-authoring-field">
                {kind === "document" ? "Managed document link (optional)" : "Resource URL"}
                <input
                  type="url"
                  value={resourceUrl}
                  onChange={(event) => setResourceUrl(event.target.value)}
                  placeholder="https://..."
                  required={kind === "external"}
                />
                <small className="content-authoring-field-help">
                  {kind === "document" ? "Use this only if your team already stores the document in an approved managed location." : "Use the canonical HTTPS page learners should visit."}
                </small>
              </label>
            )}
          </section>
          <div className="content-authoring-bottom-actions">
            <Button type="button" variant="tertiary" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              <Save size={16} />
              {save.isPending ? "Saving…" : existingStatus === "published" ? "Save as draft" : "Save draft"}
            </Button>
          </div>
        </div>
        <AuthoringSidePanel
          kind={kind}
          items={[
            { label: "Title added", done: Boolean(title.trim()) },
            { label: kind === "document" ? "Document or link attached" : "Valid resource URL added", done: hasSource },
            { label: "Audience selected", done: audience.length > 0 },
          ]}
        />
      </form>
    </AuthoringShell>
  );
}

function ResourcePreview({
  kind,
  title,
  summary,
  url,
}: {
  kind: "document" | "external";
  title: string;
  summary: string;
  url: string;
}) {
  return (
    <div className="content-authoring-resource-preview">
      <span className="content-authoring-row-icon content-authoring-row-icon--resource">
        {kind === "document" ? <FileText size={20} /> : <Link2 size={20} />}
      </span>
      <div>
        <strong>{title || "Untitled resource"}</strong>
        <p>{summary || "Add a short description for learners."}</p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            Open destination <ArrowLeft size={14} className="rotate-180" />
          </a>
        ) : (
          <span>Add a URL to preview the destination.</span>
        )}
      </div>
    </div>
  );
}

function GuideDetails({
  title,
  setTitle,
  summary,
  setSummary,
}: {
  title: string;
  setTitle: (value: string) => void;
  summary: string;
  setSummary: (value: string) => void;
}) {
  return (
    <section className="content-authoring-section content-authoring-guide-details">
      <label className="content-authoring-field content-authoring-field--wide">
        <span>Title <span className="content-authoring-required">*</span></span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Preparing for your first mentorship session"
          required
        />
      </label>
      <label className="content-authoring-field content-authoring-field--wide">
        <span>Summary <span className="content-authoring-required">*</span></span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="A short description to help people decide if this guide is for them."
          maxLength={300}
        />
        <small className="content-authoring-character-count">
          {summary.length}/300
        </small>
      </label>
    </section>
  );
}

function GuideSettings({
  checklist,
  audience,
  setAudience,
  category,
  setCategory,
  extras,
  coverInputRef,
  coverPreview,
  onCoverChange,
}: {
  extras?: React.ReactNode;
  checklist: Array<{ label: string; done: boolean }>;
  audience: AudienceGroup[];
  setAudience: (value: AudienceGroup[]) => void;
  category: string;
  setCategory: (value: string) => void;
  coverInputRef: React.RefObject<HTMLInputElement | null>;
  coverPreview: string | null;
  onCoverChange: (file: File) => void;
}) {
  return (
    <aside className="content-authoring-sidebar">
      <div className="content-authoring-side-card">
        <div className="content-authoring-card-heading">
          <span className="content-authoring-card-icon">
            <BookOpen size={17} />
          </span>
          <div>
            <strong>Guide settings</strong>
            <small>
              Control who can see this guide and how it is organised.
            </small>
          </div>
        </div>
        <AudiencePicker value={audience} onChange={setAudience} />
        <label className="content-authoring-field">
          <span>Category <span className="content-authoring-required">*</span></span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="onboarding">Onboarding</option>
            <option value="clinical_care">Clinical care</option>
            <option value="safeguarding">Safeguarding</option>
            <option value="templates">Templates</option>
            <option value="reference">Reference</option>
          </select>
        </label>
        {extras}
        <div className="content-authoring-cover">
          <strong>Cover image</strong>
          <button type="button" onClick={() => coverInputRef.current?.click()}>
            <StoredImage src={coverPreview} alt="Guide cover preview" fallback={<Plus size={16} />} />
            {coverPreview ? "Change image" : "Upload an image"}
            <small>PNG, JPG or WEBP · max 2MB</small>
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onCoverChange(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
      <ReadinessChecklist items={checklist} />
    </aside>
  );
}

function AuthoringDetails({
  title,
  setTitle,
  summary,
  setSummary,
  audience,
  setAudience,
  category,
  setCategory,
}: {
  title: string;
  setTitle: (value: string) => void;
  summary: string;
  setSummary: (value: string) => void;
  audience: AudienceGroup[];
  setAudience: (value: AudienceGroup[]) => void;
  category: string;
  setCategory: (value: string) => void;
}) {
  return (
    <section className="content-authoring-section">
      <div className="content-authoring-section-heading">
        <div>
          <p>Details</p>
          <span>Help people understand who this content is for.</span>
        </div>
      </div>
      <div className="content-authoring-fields">
        <label className="content-authoring-field content-authoring-field--wide">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Mentor orientation guide"
            required
          />
        </label>
        <label className="content-authoring-field content-authoring-field--wide">
          Summary
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="What will this help people do?"
          />
        </label>
        <AudiencePicker value={audience} onChange={setAudience} />
        <label className="content-authoring-field">
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="onboarding">Onboarding</option>
            <option value="clinical_care">Clinical care</option>
            <option value="safeguarding">Safeguarding</option>
            <option value="templates">Templates</option>
            <option value="reference">Reference</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function AuthoringSidePanel({ kind, items }: { kind: AuthoringKind; items: Array<{ label: string; done: boolean }> }) {
  const Icon = kindMeta[kind].icon;
  return (
    <aside className="content-authoring-sidebar">
      <ReadinessChecklist items={items} />
      <div className="content-authoring-side-card content-authoring-side-card--quiet">
        <Icon size={18} />
        <strong>{kindMeta[kind].label}</strong>
        <p>
          This content will be visible to the selected audience after
          publication.
        </p>
      </div>
    </aside>
  );
}
function GuidePreview({
  title,
  summary,
  editor,
}: {
  title: string;
  summary: string;
  editor: ReturnType<typeof useEditor>;
}) {
  return (
    <article className="content-authoring-preview">
      <p className="content-library-eyebrow">Guide · Preview</p>
      <h2>{title || "Untitled guide"}</h2>
      <p className="content-authoring-preview-summary">
        {summary || "Add a short summary to introduce this guide."}
      </p>
      <EditorContent editor={editor} />
    </article>
  );
}
function ToolbarDivider() {
  return <span className="content-editor-toolbar-divider" aria-hidden="true" />;
}
function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `content-${Date.now()}`
  );
}
