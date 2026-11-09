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
  Check,
  FileText,
  GraduationCap,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Download,
  Plus,
  Quote,
  Redo2,
  Save,
  Send,
  Trash2,
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
} from "../../services/api";
import type { LessonType } from "../../services/api";
import { useToast } from "../../components/ToastProvider";

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
  onSaved: () => void;
  editId?: string;
}) {
  const queryClient = useQueryClient();
  function handleSaved() {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["content-items"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-library-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-training-modules"] }),
      queryClient.invalidateQueries({ queryKey: ["library"] }),
    ]);
    onSaved();
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
  preview,
  onPreview,
  onBack,
  onSaveDraft,
  onPublish,
  busy = false,
  children,
}: {
  kind: AuthoringKind;
  preview: boolean;
  onPreview: () => void;
  onBack: () => void;
  onSaveDraft?: () => void;
  onPublish?: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const meta = kindMeta[kind];
  const Icon = meta.icon;
  return (
    <div className="content-authoring-page">
      <div className="content-authoring-titlebar">
        <div className="content-authoring-breadcrumb">
          <button type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Content library
          </button>
          <span>/</span>
          <strong>Create {meta.label.toLowerCase()}</strong>
        </div>
        <div className="content-authoring-titlebar-row">
          <div>
            <p className="content-library-eyebrow">
              <Icon size={15} />
              {meta.label}
            </p>
            <h1>
              {preview
                ? `Preview ${meta.label.toLowerCase()}`
                : `Create ${meta.label.toLowerCase()}`}
            </h1>
            <p>{meta.description}</p>
          </div>
          <div className="content-authoring-topbar-actions">
            <span className="content-authoring-save-state">
              <span />
              Draft · Not saved
            </span>
            <Button type="button" variant="tertiary" onClick={onPreview}>
              {preview ? "Edit content" : "Preview"}
            </Button>
            <Button
              type={onSaveDraft ? "button" : "submit"}
              form={onSaveDraft ? undefined : "content-authoring-form"}
              onClick={onSaveDraft}
              disabled={busy}
            >
              <Save size={16} />
              {busy ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type={onPublish ? "button" : "submit"}
              form={onPublish ? undefined : "content-authoring-form"}
              onClick={onPublish}
              disabled={busy}
            >
              <Send size={16} />
              Publish {meta.label.toLowerCase()}
            </Button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
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
  const [audience, setAudience] = useState("mentor");
  const [category, setCategory] = useState("onboarding");
  const [contentId, setContentId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const existing = useQuery({ queryKey: ["content-edit", editId], queryFn: () => getContentItem(editId!), enabled: Boolean(editId) });
  const editor = useEditor({
    extensions: [
      StarterKit,
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
    setContentId(item.id); setTitle(item.title); setSummary(item.summary); setAudience(item.visible_roles[0] ?? "mentor"); setCategory(item.category ?? "onboarding");
    if (item.cover_image) setCoverPreview(item.cover_image);
    try { editor.commands.setContent(JSON.parse(item.body), { emitUpdate: false }); } catch { editor.commands.clearContent(); }
  }, [editor, existing.data]);
  const save = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      const input = {
        title,
        slug: slugify(title),
        summary,
        body: JSON.stringify(editor?.getJSON() ?? {}),
        content_type: "guide",
        category,
        visible_roles: [audience],
        cover_image: coverFile,
      };
      const item = contentId
        ? await reviseContentItem(contentId, input)
        : await createContentItem(input);
      setContentId(item.id);
      if (publish) await publishContentItem(item.id);
      return item;
    },
    onSuccess: (_result, variables) => { pushToast({ kind: "success", title: variables.publish ? "Content published" : "Draft saved", message: variables.publish ? "The content is now available to its selected audience." : "Your changes have been saved." }); onSaved(); },
    onError: (cause) =>
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this guide.",
      ),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    void save.mutate({ publish: false });
  }
  function publish() {
    if (!title.trim()) {
      onError("Add a title before publishing this guide.");
      return;
    }
    void save.mutate({ publish: true });
  }
  function insertImage(file: File) {
    if (!file.type.startsWith("image/")) {
      onError("Choose a PNG, JPG or WEBP image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (src) editor?.chain().focus().setImage({ src, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
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
      preview={preview}
      onPreview={() => setPreview((value) => !value)}
      onBack={onBack}
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
                    title="Add image"
                    aria-label="Add image"
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
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) insertImage(file);
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
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
        <GuideSettings
          audience={audience}
          setAudience={setAudience}
          category={category}
          setCategory={setCategory}
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
  const [audience, setAudience] = useState("mentor");
  const [category, setCategory] = useState("clinical_care");
  const [required, setRequired] = useState(false);
  const [includeQuiz, setIncludeQuiz] = useState(false);
  const [passMark, setPassMark] = useState(70);
  const [selectedLesson, setSelectedLesson] = useState(0);
  const [lessons, setLessons] = useState([
    { title: "", body: "", lesson_type: "reading" as LessonType, duration_minutes: 5 },
  ]);
  const [quiz, setQuiz] = useState([
    {
      prompt: "",
      options: ["", "", ""],
      correct_option: "",
    },
  ]);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const existing = useQuery({ queryKey: ["module-edit", editId], queryFn: getAdminTrainingModules, enabled: Boolean(editId) });
  useEffect(() => {
    const module = existing.data?.find((row) => row.id === editId);
    if (!module) return;
    setTitle(module.title); setSummary(module.description); setAudience(module.visible_roles[0] ?? "mentor"); setCategory(module.category); setRequired(module.is_required); setPassMark(module.pass_mark);
    setLessons(module.lessons.map((lesson) => ({ title: lesson.title, body: lesson.body, lesson_type: lesson.lesson_type, duration_minutes: lesson.duration_minutes })));
    setSelectedLesson(0); setIncludeQuiz(module.quiz.length > 0);
    if (module.quiz.length > 0) setQuiz(module.quiz.map((question) => ({ prompt: question.prompt, options: question.options, correct_option: question.correct_option ?? "" })));
    if (module.cover_image) setCoverPreview(module.cover_image);
  }, [editId, existing.data]);
  const save = useMutation({
    mutationFn: ({ publish }: { publish: boolean }) =>
      (editId ? reviseTrainingModule(editId, {
        title,
        description: summary,
        pass_mark: passMark,
        is_required: required,
        visible_roles: [audience],
        category,
        lessons,
        quiz: includeQuiz ? quiz : [],
        cover_image: coverFile,
      }) : createTrainingModule({
        title,
        description: summary,
        pass_mark: passMark,
        is_required: required,
        visible_roles: [audience],
        category,
        lessons,
        quiz: includeQuiz ? quiz : [],
        cover_image: coverFile,
      })).then(async (module) => {
        if (publish) await publishTrainingModule(module.id);
        return module;
      }),
    onSuccess: (_result, variables) => { pushToast({ kind: "success", title: variables.publish ? "Content published" : "Draft saved", message: variables.publish ? "The content is now available to its selected audience." : "Your changes have been saved." }); onSaved(); },
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
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !title.trim() ||
      !summary.trim() ||
      lessons.some((lesson) => !lesson.title.trim() || !lesson.body.trim()) ||
      (includeQuiz && (quiz.length === 0 || quiz.some((question) => !question.prompt.trim() || question.options.filter(Boolean).length < 2 || !question.correct_option)))
    ) {
      onError(
        "Add a title and content to every lesson before saving this module.",
      );
      return;
    }
    void save.mutate({ publish: false });
  }
  function publish() {
    if (
      !title.trim() ||
      !summary.trim() ||
      lessons.some((lesson) => !lesson.title.trim() || !lesson.body.trim()) ||
      (includeQuiz && (quiz.length === 0 || quiz.some((question) => !question.prompt.trim() || question.options.filter(Boolean).length < 2 || !question.correct_option)))
    ) {
      onError(
        "Add a title and content to every lesson before publishing this module.",
      );
      return;
    }
    void save.mutate({ publish: true });
  }
  const activeLesson = lessons[selectedLesson];
  function removeLesson(index: number) {
    if (lessons.length === 1) return;
    setLessons((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
    setSelectedLesson((current) => Math.min(current, lessons.length - 2));
  }
  return (
    <AuthoringShell
      kind="module"
      preview={preview}
      onPreview={() => setPreview((value) => !value)}
      onBack={onBack}
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
              { title: "", body: "", lesson_type: "reading" as LessonType, duration_minutes: 5 },
            ])
          }
        />
        {preview ? (
          <ModulePreview title={title} summary={summary} lessons={lessons} includeQuiz={includeQuiz} quiz={quiz} passMark={passMark} />
        ) : (
          <ModuleLessonEditor
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
              <strong>Require all lessons to be completed</strong>
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
            {includeQuiz && <QuizManager questions={quiz} onChange={setQuiz} onError={onError} />}
          </div>
          <div className="content-authoring-bottom-actions">
            <Button type="button" variant="tertiary" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              <Save size={16} />
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </aside>
      </form>
    </AuthoringShell>
  );
}

type QuizQuestionDraft = { prompt: string; options: string[]; correct_option: string };

function QuizManager({
  questions,
  onChange,
  onError,
}: {
  questions: QuizQuestionDraft[];
  onChange: (questions: QuizQuestionDraft[]) => void;
  onError: (message: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<QuizQuestionDraft>({ prompt: "", options: ["", "", ""], correct_option: "" });
  const csvInputRef = useRef<HTMLInputElement>(null);
  function openQuestion(index?: number) {
    setEditing(index ?? null);
    setDraft(index === undefined ? { prompt: "", options: ["", "", ""], correct_option: "" } : { ...questions[index], options: [...questions[index].options] });
    setModalOpen(true);
  }
  function saveQuestion() {
    const options = draft.options.map((option) => option.trim()).filter(Boolean);
    if (!draft.prompt.trim() || options.length < 2 || !options.includes(draft.correct_option.trim())) {
      onError("Add a question, at least two answers, and select the correct answer.");
      return;
    }
    const question = { ...draft, prompt: draft.prompt.trim(), options, correct_option: draft.correct_option.trim() };
    onChange(editing === null ? [...questions, question] : questions.map((item, index) => index === editing ? question : item));
    setModalOpen(false);
  }
  function downloadTemplate() {
    const csv = "prompt,option_1,option_2,option_3,correct_option\n\"What is the first step?\",\"Answer A\",\"Answer B\",\"Answer C\",\"Answer A\"\n";
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "mentormama-quiz-template.csv"; link.click(); URL.revokeObjectURL(link.href);
  }
  function importCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result ?? "").split(/\r?\n/).filter(Boolean).slice(1).map(parseCsvRow).map((row) => ({ prompt: row[0] ?? "", options: row.slice(1, 4), correct_option: row[4] ?? "" })).filter((row) => row.prompt && row.options.filter(Boolean).length >= 2 && row.options.includes(row.correct_option));
      if (!rows.length) { onError("No valid quiz questions found. Use the downloaded CSV template."); return; }
      onChange([...questions, ...rows]);
    };
    reader.readAsText(file);
  }
  return <div className="content-authoring-quiz-manager"><div className="content-authoring-quiz-manager-heading"><div><strong>Knowledge check questions</strong><small>{questions.length ? `${questions.length} question${questions.length === 1 ? "" : "s"} added` : "Add questions manually or import them in bulk."}</small></div><button type="button" className="content-authoring-quiz-add" onClick={() => openQuestion()}><Plus size={15} /> Add question</button></div><div className="content-authoring-quiz-tools"><button type="button" onClick={downloadTemplate}><Download size={14} /> Download CSV template</button><button type="button" onClick={() => csvInputRef.current?.click()}><Upload size={14} /> Import CSV</button><input ref={csvInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) importCsv(file); event.currentTarget.value = ""; }} /></div>{questions.length > 0 && <div className="content-authoring-quiz-list">{questions.map((question, index) => <div className="content-authoring-quiz-row" key={`${question.prompt}-${index}`}><span>{index + 1}</span><div><strong>{question.prompt || "Untitled question"}</strong><small>{question.options.filter(Boolean).length} answers · Correct answer selected</small></div><button type="button" aria-label={`Edit question ${index + 1}`} onClick={() => openQuestion(index)}>Edit</button><button type="button" aria-label={`Delete question ${index + 1}`} onClick={() => onChange(questions.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}</div>}{modalOpen && <QuizQuestionModal draft={draft} onChange={setDraft} onClose={() => setModalOpen(false)} onSave={saveQuestion} />}</div>;
}

function QuizQuestionModal({ draft, onChange, onClose, onSave }: { draft: QuizQuestionDraft; onChange: (draft: QuizQuestionDraft) => void; onClose: () => void; onSave: () => void }) {
  return <div className="content-authoring-modal-backdrop"><section className="content-authoring-quiz-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-modal-title"><div className="content-authoring-quiz-modal-heading"><div><p>Knowledge check</p><h2 id="quiz-modal-title">Add a question</h2></div><button type="button" onClick={onClose} aria-label="Close question dialog">×</button></div><label className="content-authoring-field"><span>Question</span><textarea autoFocus value={draft.prompt} onChange={(event) => onChange({ ...draft, prompt: event.target.value })} placeholder="Write the question learners should answer" /></label>{draft.options.map((option, index) => <label className="content-authoring-field" key={index}><span>Answer option {index + 1}</span><input value={option} onChange={(event) => { const options = [...draft.options]; options[index] = event.target.value; onChange({ ...draft, options, correct_option: draft.correct_option === option ? event.target.value : draft.correct_option }); }} placeholder={`Option ${index + 1}`} /></label>)}<label className="content-authoring-field"><span>Correct answer</span><select value={draft.correct_option} onChange={(event) => onChange({ ...draft, correct_option: event.target.value })}><option value="">Select an answer</option>{draft.options.filter(Boolean).map((option) => <option value={option} key={option}>{option}</option>)}</select></label><div className="content-authoring-modal-actions"><Button type="button" variant="tertiary" onClick={onClose}>Cancel</Button><Button type="button" onClick={onSave}>Save question</Button></div></section></div>;
}

function parseCsvRow(line: string) {
  const values: string[] = []; const pattern = /("(?:[^"]|"")*"|[^,]*)(?:,|$)/g; let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) && match[0] !== "") values.push(match[1].replace(/^"|"$/g, "").replace(/""/g, '"'));
  return values;
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
  lessons: Array<{ title: string; body: string; lesson_type: LessonType; duration_minutes: number }>;
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
  onMove,
  onDelete,
}: {
  lesson: { title: string; body: string; lesson_type: LessonType; duration_minutes: number } | undefined;
  index: number;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onTypeChange: (value: LessonType) => void;
  onDurationChange: (value: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write the lesson content..." }),
    ],
    content: lesson?.body || "",
    onUpdate: ({ editor: nextEditor }) => {
      if (!nextEditor.isDestroyed && nextEditor.schema) {
        onBodyChange(nextEditor.getText());
      }
    },
  });
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.schema || !lesson) return;
    if (editor.getText() !== lesson.body) {
      editor.commands.setContent(lesson.body || "", { emitUpdate: false });
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
        Lesson title <span className="content-authoring-required">*</span>
        <input
          value={lesson.title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <div className="content-module-editor-meta">
        <label className="content-authoring-field">
          Lesson type{" "}
          <select value={lesson.lesson_type} onChange={(event) => onTypeChange(event.target.value as LessonType)}>
            <option value="reading">Reading (text and media)</option>
            <option value="video">Video</option>
            <option value="checklist">Checklist</option>
          </select>
        </label>
        <label className="content-authoring-field">
          Estimated duration
          <input type="number" min="1" max="600" value={lesson.duration_minutes} onChange={(event) => onDurationChange(Number(event.target.value))} />
        </label>
      </div>
      <div className="content-authoring-field">
        <span>
          Lesson content <span className="content-authoring-required">*</span>
        </span>
        <div className="content-authoring-editor content-module-editor">
          <div className="content-editor-toolbar">
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={16} />
            </button>
            <span className="content-editor-toolbar-spacer" />
            <button
              type="button"
              onClick={() => editor?.chain().focus().undo().run()}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().redo().run()}
            >
              <Redo2 size={16} />
            </button>
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>
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
}: React.ComponentProps<typeof AuthoringDetails> & {
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
        Title <span className="content-authoring-required">*</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          placeholder="Mentor orientation"
        />
      </label>
      <label className="content-authoring-field">
        Description <span className="content-authoring-required">*</span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          required
          placeholder="Describe what learners will gain from this module."
        />
      </label>
      <label className="content-authoring-field">
        Audience <span className="content-authoring-required">*</span>
        <select
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
        >
          <option value="mentor">Mentors</option>
          <option value="student">Students</option>
          <option value="coordinator">Programme staff</option>
        </select>
      </label>
      <label className="content-authoring-field">
        Category <span className="content-authoring-required">*</span>
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
          {coverPreview ? <img src={coverPreview} alt="Module cover preview" /> : <ImagePlus size={17} />}
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
  quiz: Array<{ prompt: string; options: string[]; correct_option: string }>;
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
            <p>{lesson.body}</p>
          </div>
        </section>
      ))}
      {includeQuiz && quiz[0] && (
        <section className="content-module-preview-quiz">
          <div>
            <span>Knowledge check</span>
            <small>Pass mark {passMark}%</small>
          </div>
          <h3>{quiz[0].prompt || "Your question will appear here."}</h3>
          <ul>
            {quiz[0].options.map((option, index) => (
              <li key={`preview-option-${index}`}>{option || `Answer option ${index + 1}`}</li>
            ))}
          </ul>
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
  const [audience, setAudience] = useState("mentor");
  const [category, setCategory] = useState("reference");
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
    setContentId(item.id); setTitle(item.title); setSummary(item.summary); setResourceUrl(item.resource_url.startsWith("/api/v1/content/") ? "" : item.resource_url); setAudience(item.visible_roles[0] ?? "mentor"); setCategory(item.category ?? "reference");
  }, [existing.data]);
  const save = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      const input = {
        title,
        slug: slugify(title),
        summary,
        body: summary,
        resource_url: resourceUrl,
        document_file: documentFile,
        content_type: kind,
        category,
        visible_roles: [audience],
      };
      const item = contentId
        ? await reviseContentItem(contentId, input)
        : await createContentItem(input);
      setContentId(item.id);
      if (publish) await publishContentItem(item.id);
      return item;
    },
    onSuccess: (_result, variables) => { pushToast({ kind: "success", title: variables.publish ? "Content published" : "Draft saved", message: variables.publish ? "The content is now available to its selected audience." : "Your changes have been saved." }); onSaved(); },
    onError: (cause) =>
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this resource.",
      ),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || (kind === "document" ? !documentFile && !resourceUrl.trim() && !existing.data?.document_name : !resourceUrl.trim())) {
      onError(kind === "document" ? "Choose a document file or add its managed link before saving." : "Add a title and a valid resource URL before saving.");
      return;
    }
    void save.mutate({ publish: false });
  }
  function publish() {
    if (!title.trim() || (kind === "document" ? !documentFile && !resourceUrl.trim() && !existing.data?.document_name : !resourceUrl.trim())) {
      onError(kind === "document" ? "Choose a document file or add its managed link before publishing." : "Add a title and a valid resource URL before publishing.");
      return;
    }
    void save.mutate({ publish: true });
  }
  return (
    <AuthoringShell
      kind={kind}
      preview={preview}
      onPreview={() => setPreview((value) => !value)}
      onBack={onBack}
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
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
        <AuthoringSidePanel kind={kind} />
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
        Title <span className="content-authoring-required">*</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Preparing for your first mentorship session"
          required
        />
      </label>
      <label className="content-authoring-field content-authoring-field--wide">
        Summary <span className="content-authoring-required">*</span>
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
  audience,
  setAudience,
  category,
  setCategory,
  coverInputRef,
  coverPreview,
  onCoverChange,
}: {
  audience: string;
  setAudience: (value: string) => void;
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
        <label className="content-authoring-field">
          Audience <span className="content-authoring-required">*</span>
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
          >
            <option value="mentor">Mentors</option>
            <option value="student">Students</option>
            <option value="coordinator">Programme staff</option>
          </select>
        </label>
        <label className="content-authoring-field">
          Category <span className="content-authoring-required">*</span>
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
        <div className="content-authoring-cover">
          <strong>Cover image</strong>
          <button type="button" onClick={() => coverInputRef.current?.click()}>
            {coverPreview ? (
              <img src={coverPreview} alt="Guide cover preview" />
            ) : (
              <Plus size={16} />
            )}
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
      <div className="content-authoring-side-card">
        <div className="content-authoring-card-heading">
          <span className="content-authoring-card-icon">
            <BookOpen size={17} />
          </span>
          <div>
            <strong>Guide outline</strong>
            <small>Headings are generated automatically.</small>
          </div>
        </div>
        <p className="content-authoring-outline-empty">
          Add headings to your guide to build its outline.
        </p>
      </div>
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
  audience: string;
  setAudience: (value: string) => void;
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
        <label className="content-authoring-field">
          Audience
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
          >
            <option value="mentor">Mentors</option>
            <option value="student">Students</option>
            <option value="coordinator">Programme staff</option>
          </select>
        </label>
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

function AuthoringSidePanel({ kind }: { kind: AuthoringKind }) {
  const Icon = kindMeta[kind].icon;
  return (
    <aside className="content-authoring-sidebar">
      <div className="content-authoring-side-card">
        <p>Publishing checklist</p>
        {[
          "Title and summary added",
          "Audience and category selected",
          kind === "module"
            ? "Lessons are in the right order"
            : "Content is ready to publish",
        ].map((item) => (
          <div className="content-authoring-check" key={item}>
            <span>
              <Check size={13} />
            </span>
            {item}
          </div>
        ))}
      </div>
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
