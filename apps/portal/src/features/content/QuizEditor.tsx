import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Download, Library, Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "../../components/kit";
import { csvBlob, datedFilename, saveBlob } from "../../lib/download";
import { AdminButton } from "../programme-admin/ui/AdminKit";
import { ApiError, getQuestionBank, saveToQuestionBank } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { emptyQuestion, fromBank, KIND_LABELS, questionProblem, toPayload, type QuestionKind, type QuizDraft } from "./quizDraft";
import "./quiz-editor.css";

function parseCsvRow(line: string) {
  const values: string[] = [];
  const pattern = /("(?:[^"]|"")*"|[^,]*)(?:,|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) && match[0] !== "") values.push(match[1].replace(/^"|"$/g, "").replace(/""/g, '"'));
  return values;
}

/** Knowledge-check questions: single choice, multiple select, true/false, with optional case text and feedback. */
export function QuizEditor({
  questions,
  onChange,
  onError,
  lessonId,
  heading = "Knowledge check questions",
  compact = false,
}: {
  questions: QuizDraft[];
  onChange: (questions: QuizDraft[]) => void;
  onError: (message: string) => void;
  /** When set, new questions are checks for this lesson (practice only, never affecting completion). */
  lessonId?: string;
  heading?: string;
  compact?: boolean;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [bankOpen, setBankOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const bank = useQuery({ queryKey: ["question-bank", bankSearch], queryFn: () => getQuestionBank(bankSearch), enabled: bankOpen });
  async function saveRowToBank(question: QuizDraft) {
    const issue = questionProblem(question);
    if (issue) {
      onError(`Finish this question before saving it to the bank: ${issue}`);
      return;
    }
    try {
      const { id: _id, lesson_id: _lesson, ...payload } = toPayload(question);
      void _id;
      void _lesson;
      await saveToQuestionBank(payload);
      void queryClient.invalidateQueries({ queryKey: ["question-bank"] });
      pushToast({ kind: "success", title: "Saved to the question bank", message: "You can reuse it in any module." });
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not save that question to the bank.");
    }
  }
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<QuizDraft>(emptyQuestion());
  const [problem, setProblem] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  function open(index?: number) {
    setProblem(null);
    setDraft(index === undefined ? emptyQuestion() : { ...questions[index], options: questions[index].options.map((o) => ({ ...o })) });
    setEditing(index ?? "new");
  }
  function save() {
    const issue = questionProblem(draft);
    if (issue) {
      setProblem(issue);
      return;
    }
    const saved = { ...draft, lesson_id: lessonId };
    onChange(editing === "new" ? [...questions, saved] : questions.map((item, index) => (index === editing ? saved : item)));
    setEditing(null);
  }
  function setKind(kind: QuestionKind) {
    if (kind === draft.kind) return;
    if (kind === "true_false") {
      setDraft({ ...emptyQuestion("true_false"), id: draft.id, scenario: draft.scenario, prompt: draft.prompt, explanation: draft.explanation });
    } else {
      const keepOptions = draft.kind === "true_false" ? emptyQuestion(kind).options : draft.options;
      // Going from multiple to single keeps only the first correct answer.
      let seen = false;
      const options = keepOptions.map((option) => {
        const correct = kind === "single" && option.correct ? !seen && (seen = true) : option.correct;
        return { ...option, correct };
      });
      setDraft({ ...draft, kind, options });
    }
  }
  function setOption(index: number, patch: Partial<QuizDraft["options"][number]>) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) => {
        if (i === index) return { ...option, ...patch };
        // Single choice and true/false allow one correct answer.
        return patch.correct && current.kind !== "multi" ? { ...option, correct: false } : option;
      }),
    }));
  }
  function downloadTemplate() {
    saveBlob(
      csvBlob([
        ["type", "question", "option_1", "option_2", "option_3", "option_4", "correct_answers", "explanation"],
        ["single", "What is the first step?", "Answer A", "Answer B", "Answer C", "", "Answer A", "Why A is right"],
        ["multi", "Which are safe practices? (pick all)", "Wash hands", "Skip gloves", "Label samples", "", "Wash hands|Label samples", ""],
        ["true_false", "Handover should be structured.", "True", "False", "", "", "True", ""],
      ]),
      datedFilename("quiz-template", "csv"),
    );
  }
  function importCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows: QuizDraft[] = [];
      String(reader.result ?? "")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(1)
        .map(parseCsvRow)
        .forEach((row) => {
          const kind = (["single", "multi", "true_false"].includes(row[0]) ? row[0] : "single") as QuestionKind;
          const correct = new Set((row[6] ?? "").split("|").map((x) => x.trim()).filter(Boolean));
          const options = row.slice(2, 6).map((text) => text.trim()).filter(Boolean).map((text) => ({ text, feedback: "", correct: correct.has(text) }));
          const question: QuizDraft = { lesson_id: lessonId, kind, scenario: "", prompt: (row[1] ?? "").trim(), explanation: (row[7] ?? "").trim(), options };
          if (!questionProblem(question)) rows.push(question);
        });
      if (!rows.length) {
        onError("No valid questions found. Use the downloaded CSV template.");
        return;
      }
      onChange([...questions, ...rows]);
    };
    reader.readAsText(file);
  }

  const multi = draft.kind === "multi";
  return (
    <div className="qe">
      <div className="qe__head">
        <div>
          <strong>{heading}</strong>
          <small>{questions.length ? `${questions.length} question${questions.length === 1 ? "" : "s"} added` : compact ? "Optional practice questions shown after this lesson." : "Add questions one by one or import them in bulk."}</small>
        </div>
        <AdminButton size="sm" icon={<Plus />} onClick={() => open()}>
          Add question
        </AdminButton>
      </div>
      <div className="qe__tools">
        <button type="button" onClick={() => setBankOpen(true)}>
          <Library size={14} /> Add from question bank
        </button>
        {!compact && (
          <>
            <button type="button" onClick={downloadTemplate}>
              <Download size={14} /> Download CSV template
            </button>
            <button type="button" onClick={() => csvInputRef.current?.click()}>
              <Upload size={14} /> Import CSV
            </button>
          </>
        )}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importCsv(file);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {questions.length > 0 && (
        <ol className="qe__list">
          {questions.map((question, index) => (
            <li key={question.id ?? `${question.prompt}-${index}`}>
              <div>
                <strong>{question.prompt || "Untitled question"}</strong>
                <small>
                  {KIND_LABELS[question.kind]}
                  {question.scenario ? " · case-based" : ""} · {question.options.filter((o) => o.text.trim()).length} answers
                  {questionProblem(question) ? " · incomplete" : ""}
                </small>
              </div>
              <button type="button" aria-label={`Save question ${index + 1} to the question bank`} title="Save to the question bank" onClick={() => void saveRowToBank(question)}>
                <BookmarkPlus size={15} />
              </button>
              <button type="button" aria-label={`Edit question ${index + 1}`} onClick={() => open(index)}>
                Edit
              </button>
              <button type="button" aria-label={`Delete question ${index + 1}`} onClick={() => onChange(questions.filter((_, i) => i !== index))}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <Modal
        open={bankOpen}
        onClose={() => setBankOpen(false)}
        size="lg"
        title="Question bank"
        description="Reusable questions from across your programme. Adding one copies it into this module."
      >
        <div className="qe__form">
          <label className="content-authoring-field">
            <span>Search</span>
            <input value={bankSearch} onChange={(event) => setBankSearch(event.target.value)} placeholder="Search questions or tags" />
          </label>
          {bank.isPending ? (
            <p>Loading…</p>
          ) : (bank.data ?? []).length === 0 ? (
            <p>{bankSearch ? "No questions match." : "The bank is empty. Use the bookmark button on any question to save it here."}</p>
          ) : (
            <ul className="qe__bank">
              {(bank.data ?? []).map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.prompt}</strong>
                    <small>
                      {KIND_LABELS[entry.kind]}
                      {entry.scenario ? " · case-based" : ""} · {entry.options.length} answers
                    </small>
                  </div>
                  <AdminButton
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onChange([...questions, fromBank(entry, lessonId)]);
                      pushToast({ kind: "success", title: "Question added", message: "A copy was added to this module." });
                    }}
                  >
                    Add
                  </AdminButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === "new" ? "Add a question" : "Edit question"}
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </AdminButton>
            <AdminButton size="sm" onClick={save}>
              Save question
            </AdminButton>
          </>
        }
      >
        <div className="qe__form">
          <label className="content-authoring-field">
            <span>Question type</span>
            <select value={draft.kind} onChange={(event) => setKind(event.target.value as QuestionKind)}>
              {(Object.keys(KIND_LABELS) as QuestionKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="content-authoring-field">
            <span>Case description (optional)</span>
            <textarea rows={3} value={draft.scenario} onChange={(event) => setDraft({ ...draft, scenario: event.target.value })} placeholder="Describe a situation the learner should reason about" />
          </label>
          <label className="content-authoring-field">
            <span>Question</span>
            <textarea rows={2} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder="What should the learner answer?" />
          </label>
          <fieldset className="qe__options">
            <legend>{multi ? "Answers — tick every correct one" : "Answers — choose the correct one"}</legend>
            {draft.options.map((option, index) => (
              <div className="qe__option" key={index}>
                <input
                  type={multi ? "checkbox" : "radio"}
                  name="correct-answer"
                  aria-label={`Answer ${index + 1} is correct`}
                  checked={option.correct}
                  onChange={(event) => setOption(index, { correct: event.target.checked })}
                />
                <input
                  aria-label={`Answer ${index + 1}`}
                  value={option.text}
                  readOnly={draft.kind === "true_false"}
                  placeholder={`Answer ${index + 1}`}
                  onChange={(event) => setOption(index, { text: event.target.value })}
                />
                <input
                  aria-label={`Feedback for answer ${index + 1}`}
                  value={option.feedback}
                  placeholder="Feedback when chosen (optional)"
                  onChange={(event) => setOption(index, { feedback: event.target.value })}
                />
              </div>
            ))}
            {draft.kind !== "true_false" && draft.options.length < 6 && (
              <button type="button" className="qe__add" onClick={() => setDraft({ ...draft, options: [...draft.options, { text: "", feedback: "", correct: false }] })}>
                <Plus size={14} /> Add an answer
              </button>
            )}
          </fieldset>
          <label className="content-authoring-field">
            <span>Explanation (optional)</span>
            <textarea rows={2} value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} placeholder="Why this is the right answer. Shown after the learner submits." />
          </label>
          {problem && (
            <p className="qe__problem" role="alert">
              {problem}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
