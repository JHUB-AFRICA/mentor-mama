import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  GraduationCap,
  ListChecks,
  PlayCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  completeTrainingModule,
  explainTrainingLesson,
  getAIStatus,
  getTrainingModules,
  getTrainingProgress,
  submitTrainingAttempt,
  type TrainingModule,
} from "../../services/api";
import { PortalErrorState } from "../../components/PortalErrorState";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  StatusPill,
} from "../programme-admin/ui/AdminKit";
import { PlainText } from "../content/ContentReader";
import { categoryLabel, formatMinutes } from "../content/contentMeta";
import "../content/content-detail.css";
import "./training.css";

type Filter = "all" | "required" | "in_progress" | "completed";

function moduleState(module: TrainingModule): "completed" | "in_progress" | "not_started" {
  if (module.completed) return "completed";
  return (module.attempt_count ?? 0) > 0 ? "in_progress" : "not_started";
}

function visitedKey(moduleId: string) {
  return `mm.training.visited.${moduleId}`;
}
function readVisited(moduleId: string): number[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(visitedKey(moduleId)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value)) : [];
  } catch {
    return [];
  }
}

function LessonExplainer({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const explanation = useMutation({
    mutationFn: () => explainTrainingLesson(moduleId, lessonId),
  });
  return (
    <div className="tr-explain">
      <AdminButton variant="secondary" size="sm" icon={<Sparkles />} disabled={explanation.isPending} onClick={() => explanation.mutate()}>
        {explanation.isPending ? "Preparing explanation…" : explanation.data ? "Explain again" : "Explain this lesson"}
      </AdminButton>
      {explanation.data && (
        <div className="tr-explain__box" role="status">
          <p>{explanation.data.explanation}</p>
          <small>AI generated from this lesson only. It is not clinical guidance; check the lesson if anything is unclear.</small>
        </div>
      )}
      {explanation.isError && (
        <p className="tr-explain__error" role="alert">
          {explanation.error instanceof ApiError && explanation.error.status === 429
            ? "You have reached the hourly limit for explanations. Please try again later."
            : "We couldn’t prepare an explanation right now. Please try again later."}
        </p>
      )}
    </div>
  );
}

export function TrainingWorkspace({ onError }: { onError: (message: string) => void }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("module");
  const modules = useQuery({ queryKey: ["training-modules"], queryFn: getTrainingModules });
  const progress = useQuery({ queryKey: ["training-progress"], queryFn: getTrainingProgress });
  const [filter, setFilter] = useState<Filter>("all");

  if (modules.isPending || progress.isPending)
    return (
      <AdminPage>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28" />
        <Skeleton className="h-44" />
      </AdminPage>
    );
  if (modules.isError || progress.isError)
    return (
      <PortalErrorState
        onRetry={() => {
          void modules.refetch();
          void progress.refetch();
        }}
      />
    );

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("module", id);
    else next.delete("module");
    setParams(next, { replace: false });
  };

  if (selected) {
    const module = modules.data.find((item) => item.id === selected);
    if (module) return <ModuleRunner key={module.id} module={module} all={modules.data} onBack={() => open(null)} onOpen={open} onError={onError} />;
    return (
      <AdminPage>
        <EmptyState
          icon={<BookOpen />}
          title="This module isn’t available"
          text="It may have been unpublished or moved. Your completed modules are still on your record."
          action={
            <AdminButton variant="secondary" size="sm" icon={<ArrowLeft />} onClick={() => open(null)}>
              Back to training
            </AdminButton>
          }
        />
      </AdminPage>
    );
  }

  const list = modules.data;
  const counts = {
    all: list.length,
    required: list.filter((item) => item.is_required).length,
    in_progress: list.filter((item) => moduleState(item) === "in_progress").length,
    completed: list.filter((item) => item.completed).length,
  };
  const visible = list.filter((item) =>
    filter === "all"
      ? true
      : filter === "required"
        ? item.is_required
        : filter === "completed"
          ? item.completed
          : moduleState(item) === "in_progress",
  );
  const total = progress.data.total;
  const percent = progress.data.percentage ?? 0;
  const requiredLeft = progress.data.required_total - progress.data.required_completed;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Mentor development"
        title="Training"
        description="Short lessons and knowledge checks that build practical mentoring confidence. Your completion record follows you across placements."
      />
      {list.length > 0 && (
        <section className="tr-summary" aria-label="Your training progress">
          <div className="tr-summary__ring" role="img" aria-label={`${percent}% complete`} style={{ ["--tr-pct" as string]: `${percent * 3.6}deg` }}>
            <strong>{percent}%</strong>
          </div>
          <div className="tr-summary__text">
            <h3>
              {progress.data.completed} of {total} {total === 1 ? "module" : "modules"} complete
            </h3>
            <p>
              {progress.data.required_total === 0
                ? "No modules are required right now."
                : requiredLeft === 0
                  ? "You have finished every required module."
                  : `${requiredLeft} required ${requiredLeft === 1 ? "module" : "modules"} still to finish before you can take placements.`}
            </p>
          </div>
        </section>
      )}
      {list.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No training is published yet"
          text="Your programme team will make modules available here."
        />
      ) : (
        <>
          <AdminTabs
            label="Filter training"
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: "all", label: "All", count: counts.all },
              { value: "required", label: "Required", count: counts.required },
              { value: "in_progress", label: "In progress", count: counts.in_progress },
              { value: "completed", label: "Completed", count: counts.completed },
            ]}
          />
          {visible.length === 0 ? (
            <EmptyState icon={<ListChecks />} title="Nothing here yet" text="No modules match this filter." />
          ) : (
            <ul className="tr-grid">
              {visible.map((item) => (
                <li key={item.id}>
                  <ModuleCard module={item} onOpen={() => open(item.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AdminPage>
  );
}

function ModuleCard({ module, onOpen }: { module: TrainingModule; onOpen: () => void }) {
  const state = moduleState(module);
  return (
    <button type="button" className="tr-card" onClick={onOpen}>
      <span className={`tr-card__media${module.cover_image ? "" : " is-empty"}`}>
        {module.cover_image ? <img src={module.cover_image} alt="" /> : <GraduationCap size={28} aria-hidden="true" />}
      </span>
      <span className="tr-card__body">
        <span className="tr-card__chips">
          <span className="cd-chip">{categoryLabel(module.category)}</span>
          {module.is_required && <span className="cd-chip cd-chip--amber">Required</span>}
        </span>
        <strong className="tr-card__title">{module.title}</strong>
        <span className="tr-card__meta">
          {module.lessons.length} {module.lessons.length === 1 ? "lesson" : "lessons"}
          {module.total_minutes ? ` · ${formatMinutes(module.total_minutes)}` : ""}
          {module.quiz.length ? ` · ${module.quiz.length}-question check` : ""}
        </span>
        <span className="tr-card__foot">
          {state === "completed" ? (
            <StatusPill tone="success">Completed · {module.score}%</StatusPill>
          ) : state === "in_progress" ? (
            <StatusPill tone="warning">In progress · best {module.best_score}%</StatusPill>
          ) : (
            <StatusPill tone="neutral">Not started</StatusPill>
          )}
          <span className="tr-card__go">
            {state === "completed" ? "Review" : state === "in_progress" ? "Continue" : "Start"} <ArrowRight size={15} aria-hidden="true" />
          </span>
        </span>
      </span>
    </button>
  );
}

function ModuleRunner({
  module,
  all,
  onBack,
  onOpen,
  onError,
}: {
  module: TrainingModule;
  all: TrainingModule[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const aiStatus = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus, staleTime: 5 * 60_000, retry: false });
  const lessons = module.lessons;
  const hasQuiz = module.quiz.length > 0;
  const finalStep = lessons.length;
  const [visited, setVisited] = useState<number[]>(() => readVisited(module.id));
  const [step, setStep] = useState(() => {
    const seen = new Set(readVisited(module.id));
    const first = lessons.findIndex((_, index) => !seen.has(index));
    return module.completed || first === -1 ? 0 : first;
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [retaking, setRetaking] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);
  useEffect(() => {
    if (step >= finalStep) return;
    setVisited((current) => {
      if (current.includes(step)) return current;
      const next = [...current, step];
      sessionStorage.setItem(visitedKey(module.id), JSON.stringify(next));
      return next;
    });
  }, [step, finalStep, module.id]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["training-modules"] });
    void queryClient.invalidateQueries({ queryKey: ["training-progress"] });
    void queryClient.invalidateQueries({ queryKey: ["content-detail"] });
    void queryClient.invalidateQueries({ queryKey: ["library"] });
  };
  const fail = (cause: unknown) =>
    onError(cause instanceof ApiError ? cause.message : "We could not record that. Please try again.");
  const attempt = useMutation({
    mutationFn: () => submitTrainingAttempt(module.id, answers),
    onSuccess: (result) => {
      refresh();
      if (result.passed) setRetaking(false);
    },
    onError: fail,
  });
  const finish = useMutation({ mutationFn: () => completeTrainingModule(module.id), onSuccess: refresh, onError: fail });

  const readCount = visited.filter((index) => index < lessons.length).length;
  const pct = lessons.length ? Math.round((readCount * 100) / lessons.length) : 0;
  const nextRequired = useMemo(
    () => all.find((item) => item.id !== module.id && item.is_required && !item.completed),
    [all, module.id],
  );
  const answeredAll = module.quiz.every((question) => answers[question.id]);
  const passedNow = attempt.data?.passed === true;
  const showQuiz = hasQuiz && (!module.completed || retaking) && !passedNow;
  const lesson = step < finalStep ? lessons[step] : null;

  return (
    <AdminPage>
      <div>
        <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={onBack}>
          Training
        </AdminButton>
      </div>
      <header className="cd-hero">
        {module.cover_image && <img className="cd-hero__cover" src={module.cover_image} alt="" />}
        <div className="cd-hero__body">
          <div className="cd-chips">
            <span className="cd-chip cd-chip--teal">
              <GraduationCap aria-hidden="true" /> Learning module
            </span>
            <span className="cd-chip">{categoryLabel(module.category)}</span>
            {module.is_required && <span className="cd-chip cd-chip--amber">Required</span>}
            {module.completed && (
              <span className="cd-chip cd-chip--teal">
                <CheckCircle2 aria-hidden="true" /> Completed · {module.score}%
              </span>
            )}
          </div>
          <h1 className="cd-title">{module.title}</h1>
          {module.description && <p className="cd-lede">{module.description}</p>}
          <div className="cd-facts">
            <span>
              <BookOpen aria-hidden="true" /> {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
            </span>
            {module.total_minutes ? (
              <span>
                <Clock aria-hidden="true" /> {formatMinutes(module.total_minutes)}
              </span>
            ) : null}
            <span>
              <ListChecks aria-hidden="true" /> {hasQuiz ? `${module.quiz.length} ${module.quiz.length === 1 ? "question" : "questions"} · ${module.pass_mark}% to pass` : "No knowledge check"}
            </span>
          </div>
        </div>
      </header>

      <div className="tr-layout">
        <nav className="tr-outline" aria-label="Module outline">
          <ol>
            {lessons.map((item, index) => {
              const done = visited.includes(index);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`tr-outline__item${step === index ? " is-current" : ""}${done ? " is-done" : ""}`}
                    aria-current={step === index ? "step" : undefined}
                    onClick={() => setStep(index)}
                  >
                    <span className="tr-outline__dot" aria-hidden="true">
                      {done ? <Check size={13} /> : index + 1}
                    </span>
                    <span className="tr-outline__label">{item.title}</span>
                    <small>{item.duration_minutes} min</small>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                className={`tr-outline__item${step === finalStep ? " is-current" : ""}${module.completed ? " is-done" : ""}`}
                aria-current={step === finalStep ? "step" : undefined}
                onClick={() => setStep(finalStep)}
              >
                <span className="tr-outline__dot" aria-hidden="true">
                  {module.completed ? <Check size={13} /> : <ListChecks size={13} />}
                </span>
                <span className="tr-outline__label">{hasQuiz ? "Knowledge check" : "Finish"}</span>
              </button>
            </li>
          </ol>
          <div className="tr-outline__progress" role="img" aria-label={`${pct}% of lessons read`}>
            <div className="cd-progress">
              <span style={{ width: `${module.completed ? 100 : pct}%` }} />
            </div>
            <small>{module.completed ? "Module complete" : `${readCount} of ${lessons.length} lessons read`}</small>
          </div>
        </nav>

        <main className="tr-stage" id="training-stage" aria-live="polite">
          {lesson ? (
            <AdminCard>
              <p className="cd-lesson__meta">
                Lesson {step + 1} of {lessons.length} · {lesson.lesson_type} · {lesson.duration_minutes} min
              </p>
              <h2 className="tr-stage__title">{lesson.title}</h2>
              <PlainText text={lesson.body} />
              {aiStatus.data?.lesson_explanations && <LessonExplainer key={lesson.id} moduleId={module.id} lessonId={lesson.id} />}
              <div className="tr-stage__nav">
                <AdminButton variant="secondary" size="sm" icon={<ArrowLeft />} disabled={step === 0} onClick={() => setStep(step - 1)}>
                  Previous
                </AdminButton>
                <AdminButton size="sm" onClick={() => setStep(step + 1)}>
                  {step === lessons.length - 1 ? (hasQuiz ? "Go to knowledge check" : "Finish module") : "Next lesson"} <ArrowRight />
                </AdminButton>
              </div>
            </AdminCard>
          ) : (
            <AdminCard title={hasQuiz ? "Knowledge check" : "Finish this module"} description={hasQuiz ? `${module.quiz.length} ${module.quiz.length === 1 ? "question" : "questions"} · ${module.pass_mark}% needed to pass` : undefined}>
              {(module.completed && !retaking) || passedNow ? (
                <div className="tr-result tr-result--pass" role="status">
                  <CheckCircle2 aria-hidden="true" />
                  <div>
                    <strong>Module complete{(passedNow ? attempt.data?.score : module.score) != null ? ` — ${passedNow ? attempt.data?.score : module.score}%` : ""}</strong>
                    <p>This is now on your training record.</p>
                  </div>
                </div>
              ) : null}
              {showQuiz ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (answeredAll) attempt.mutate();
                  }}
                >
                  {module.quiz.map((question, index) => (
                    <fieldset key={question.id} className="tr-question">
                      <legend>
                        {index + 1}. {question.prompt}
                      </legend>
                      <div className="tr-options">
                        {question.options.map((option) => (
                          <label key={option} className={answers[question.id] === option ? "is-selected" : undefined}>
                            <input
                              type="radio"
                              name={question.id}
                              value={option}
                              checked={answers[question.id] === option}
                              onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  {attempt.data && !attempt.data.passed && (
                    <div className="tr-result tr-result--fail" role="status">
                      <CircleAlert aria-hidden="true" />
                      <div>
                        <strong>
                          Not quite yet — {attempt.data.score}% (you need {module.pass_mark}%)
                        </strong>
                        <p>Review the lessons, change your answers and try again. There is no limit on attempts.</p>
                      </div>
                    </div>
                  )}
                  <div className="tr-stage__nav">
                    <AdminButton variant="secondary" size="sm" icon={<ArrowLeft />} onClick={() => setStep(finalStep - 1)} disabled={lessons.length === 0}>
                      Back to lessons
                    </AdminButton>
                    <AdminButton type="submit" size="sm" disabled={!answeredAll || attempt.isPending}>
                      {attempt.isPending ? "Checking answers…" : attempt.data && !attempt.data.passed ? "Submit again" : "Submit answers"}
                    </AdminButton>
                  </div>
                  {!answeredAll && <p className="cd-empty tr-hint">Answer every question to submit.</p>}
                </form>
              ) : !hasQuiz && !module.completed ? (
                <>
                  <p className="cd-empty">
                    You have reached the end of the lessons. Mark this module complete to add it to your training record.
                  </p>
                  <div className="tr-stage__nav">
                    <AdminButton variant="secondary" size="sm" icon={<ArrowLeft />} onClick={() => setStep(Math.max(0, finalStep - 1))}>
                      Back to lessons
                    </AdminButton>
                    <AdminButton size="sm" icon={<CheckCircle2 />} onClick={() => finish.mutate()} disabled={finish.isPending}>
                      {finish.isPending ? "Saving…" : "Mark module complete"}
                    </AdminButton>
                  </div>
                </>
              ) : (
                <div className="tr-stage__nav">
                  {hasQuiz && !retaking && !passedNow && (
                    <AdminButton variant="secondary" size="sm" icon={<RotateCcw />} onClick={() => { setAnswers({}); attempt.reset(); setRetaking(true); }}>
                      Retake knowledge check
                    </AdminButton>
                  )}
                  {nextRequired ? (
                    <AdminButton size="sm" icon={<PlayCircle />} onClick={() => { setStep(0); onOpen(nextRequired.id); }}>
                      Next required: {nextRequired.title}
                    </AdminButton>
                  ) : (
                    <AdminButton size="sm" onClick={onBack}>
                      Back to training
                    </AdminButton>
                  )}
                </div>
              )}
            </AdminCard>
          )}
        </main>
      </div>
    </AdminPage>
  );
}
