import type { QuizPayloadQuestion, TrainingModule } from "../../services/api";

export type QuestionKind = "single" | "multi" | "true_false";

export type QuizDraft = {
  id?: string;
  /** Set for a check shown after one lesson; empty for the final knowledge check. */
  lesson_id?: string;
  kind: QuestionKind;
  /** Optional case description shown above the question (a case-based question). */
  scenario: string;
  prompt: string;
  /** Why the answer is right; shown after learners submit. */
  explanation: string;
  options: Array<{ id?: string; text: string; feedback: string; correct: boolean }>;
};

export const KIND_LABELS: Record<QuestionKind, string> = {
  single: "Single choice",
  multi: "Multiple select",
  true_false: "True / False",
};

export function emptyQuestion(kind: QuestionKind = "single"): QuizDraft {
  const options =
    kind === "true_false"
      ? [
          { text: "True", feedback: "", correct: false },
          { text: "False", feedback: "", correct: false },
        ]
      : [
          { text: "", feedback: "", correct: false },
          { text: "", feedback: "", correct: false },
          { text: "", feedback: "", correct: false },
        ];
  return { kind, scenario: "", prompt: "", explanation: "", options };
}

export function fromQuestion(question: TrainingModule["quiz"][number]): QuizDraft {
  const correct = new Set(question.correct_option_ids ?? (question.correct_option_id ? [question.correct_option_id] : []));
  return {
    id: question.id,
    lesson_id: question.lesson_id,
    kind: (question.kind ?? "single") as QuestionKind,
    scenario: question.scenario ?? "",
    prompt: question.prompt,
    explanation: question.explanation ?? "",
    options: question.choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      feedback: choice.feedback ?? "",
      correct: correct.has(choice.id),
    })),
  };
}

/** Why a question cannot be saved yet, or null when it is complete. */
export function questionProblem(question: QuizDraft): string | null {
  const options = question.options.filter((option) => option.text.trim());
  if (!question.prompt.trim()) return "Write the question.";
  if (options.length < 2) return "Add at least two answers.";
  if (new Set(options.map((option) => option.text.trim())).size !== options.length) return "Answers must be different from each other.";
  const correct = options.filter((option) => option.correct).length;
  if (correct === 0) return "Mark the correct answer.";
  if (question.kind !== "multi" && correct !== 1) return "Choose exactly one correct answer.";
  return null;
}

export function toPayload(question: QuizDraft): QuizPayloadQuestion {
  const options = question.options.filter((option) => option.text.trim());
  return {
    id: question.id,
    lesson_id: question.lesson_id,
    kind: question.kind,
    scenario: question.scenario.trim(),
    prompt: question.prompt.trim(),
    explanation: question.explanation.trim(),
    options: options.map((option) => ({ id: option.id, text: option.text.trim(), feedback: option.feedback.trim() })),
    correct_options: options.filter((option) => option.correct).map((option) => option.id ?? option.text.trim()),
  };
}

/** A bank entry becomes a fresh draft (new ids), optionally tied to a lesson. */
export function fromBank(entry: import("../../services/api").BankQuestion, lessonId?: string): QuizDraft {
  const correct = new Set(entry.correct_options);
  return {
    lesson_id: lessonId,
    kind: entry.kind,
    scenario: entry.scenario,
    prompt: entry.prompt,
    explanation: entry.explanation,
    options: entry.options.map((option) => ({ text: option.text, feedback: option.feedback, correct: correct.has(option.text) })),
  };
}
