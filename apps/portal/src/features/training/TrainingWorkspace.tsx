import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  GraduationCap,
} from "lucide-react";
import { Button, Card, Skeleton } from "@mentormama/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getTrainingModules,
  getTrainingProgress,
  submitTrainingAttempt,
} from "../../services/api";
import { PortalErrorState } from "../../components/PortalErrorState";

export function TrainingWorkspace({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const modules = useQuery({
    queryKey: ["training-modules"],
    queryFn: getTrainingModules,
  });
  const progress = useQuery({
    queryKey: ["training-progress"],
    queryFn: getTrainingProgress,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const module = modules.data?.find((item) => item.id === selected) ?? null;
  const completedCount = progress.data?.completed ?? 0;
  const totalCount = progress.data?.total ?? 0;
  const queryClient = useQueryClient();
  const attempt = useMutation({
    mutationFn: ({
      id,
      answers,
    }: {
      id: string;
      answers: Record<string, string>;
    }) => submitTrainingAttempt(id, answers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["training-modules"] });
      void queryClient.invalidateQueries({ queryKey: ["training-progress"] });
    },
    onError: (cause) =>
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not record that attempt.",
      ),
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (modules.isPending || progress.isPending)
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28" />
        <Skeleton className="h-44" />
      </div>
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
  if (module)
    return (
      <div className="space-y-8">
        <button
          type="button"
          className="inline-flex items-center gap-2 font-body text-sm font-semibold text-teal hover:text-navy"
          onClick={() => {
            setSelected(null);
            setAnswers({});
          }}
        >
          <ChevronRight className="rotate-180" size={16} /> Back to training
        </button>
        <section className="max-w-3xl">
          {module.cover_image && (
            <img
              src={module.cover_image}
              alt=""
              className="mb-5 h-44 w-full rounded-2xl object-cover"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              {module.category || "Mentor development"}
            </p>
            {module.is_required && <span className="rounded-full bg-warning/10 px-2 py-1 font-body text-[0.65rem] font-bold text-warning">Required</span>}
            {module.completed && <span className="rounded-full bg-teal-light px-2 py-1 font-body text-[0.65rem] font-bold text-teal">Complete</span>}
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            {module.title}
          </h2>
          <p className="mt-3 font-body leading-7 text-navy-muted">
            {module.description ||
              "A focused learning module for safe, consistent mentorship practice."}
          </p>
        </section>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-mist px-4 py-3"><p className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">Lessons</p><p className="mt-1 font-display text-2xl font-bold text-navy">{module.lessons.length}</p></div>
          <div className="rounded-xl bg-mist px-4 py-3"><p className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">Knowledge check</p><p className="mt-1 font-display text-2xl font-bold text-navy">{module.quiz.length ? `${module.quiz.length} questions` : "Not required"}</p></div>
          <div className="rounded-xl bg-teal-light/60 px-4 py-3"><p className="font-body text-xs font-bold uppercase tracking-[0.1em] text-teal">Pass mark</p><p className="mt-1 font-display text-2xl font-bold text-navy">{module.pass_mark}%</p></div>
        </div>
        <div className="space-y-5">
          {module.lessons.map((lesson) => (
            <article key={lesson.id} className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-teal">Lesson {lesson.position} · {lesson.lesson_type}</p><h3 className="mt-1 font-display text-xl font-bold text-navy">{lesson.title}</h3></div><span className="shrink-0 rounded-full bg-mist px-2 py-1 font-body text-[0.68rem] font-semibold text-navy-muted">{lesson.duration_minutes} min</span></div>
              <p className="mt-3 whitespace-pre-line font-body text-sm leading-7 text-navy-muted">
                {lesson.body}
              </p>
            </article>
          ))}
        </div>
        {module.quiz.length > 0 && (
          <section className="border-t-2 border-teal pt-5">
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Knowledge check
            </p>
            <h3 className="mt-2 font-display text-2xl font-bold text-navy">
              Check your understanding
            </h3>
            <div className="mt-5 space-y-5">
              {module.quiz.map((question) => (
                <fieldset
                  key={question.id}
                  className="border-b border-border pb-5"
                >
                  <legend className="font-body text-sm font-bold text-navy">
                    {question.prompt}
                  </legend>
                  <div className="mt-3 grid gap-2">
                    {question.options.map((option) => (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 font-body text-sm ${answers[question.id] === option ? "border-teal bg-teal-light/40 text-navy" : "border-border text-navy-muted"}`}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={() =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: option,
                            }))
                          }
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <Button
              className="mt-6"
              disabled={
                attempt.isPending ||
                Object.keys(answers).length !== module.quiz.length
              }
              onClick={() => void attempt.mutate({ id: module.id, answers })}
            >
              {attempt.isPending
                ? "Checking answers…"
                : "Submit knowledge check"}
            </Button>
            {attempt.data && (
              <p
                role="status"
                className={`mt-4 flex items-center gap-2 font-body text-sm font-semibold ${attempt.data.passed ? "text-teal" : "text-warning"}`}
              >
                {attempt.data.passed ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <CircleAlert size={17} />
                )}
                {attempt.data.passed
                  ? `Module complete — ${attempt.data.score}%`
                  : `Not quite yet — ${attempt.data.score}%. Review the lessons and try again.`}
              </p>
            )}
          </section>
        )}
      </div>
    );
  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-6 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Mentor development
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Mentor training, in one place.
          </h2>
          <p className="mt-3 max-w-2xl font-body leading-7 text-navy-muted">
            Build practical confidence through short lessons and knowledge checks. Your completion record follows you across placements.
          </p>
        </div>
        <div className="shrink-0 rounded-2xl bg-teal-light px-5 py-4">
          <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
            Overall progress
          </p>
          <p className="mt-1 font-display text-3xl font-bold text-navy">
            {completedCount}/{totalCount}
          </p>
          <div className="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-teal" style={{ width: `${progress.data?.percentage ?? 0}%` }} /></div>
          <p className="mt-2 font-body text-xs text-navy-muted">{progress.data?.required_completed}/{progress.data?.required_total} required complete</p>
        </div>
      </section>
      {!modules.data.length ? (
        <Card padding="lg">
          <BookOpen className="text-teal" />
          <h3 className="mt-4 font-display text-xl font-bold text-navy">
            No training is published yet
          </h3>
          <p className="mt-2 font-body text-sm text-navy-muted">
            Your programme team will make modules available here.
          </p>
        </Card>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white">
          {modules.data.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className="flex w-full items-center justify-between gap-5 px-4 py-5 text-left hover:bg-mist sm:px-6"
            >
              <span className="flex min-w-0 items-start gap-4">
                <span
                  className={`mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl ${item.completed ? "bg-teal-light text-teal" : "bg-mist text-teal"}`}
                >
                  {item.completed ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <GraduationCap size={20} />
                  )}
                </span>
                <span>
                  <span className="block font-body text-sm font-bold text-navy">
                    {item.title}
                    {item.is_required && (
                      <span className="ml-2 rounded-full bg-warning/10 px-2 py-1 text-[0.65rem] text-warning">
                        Required
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block font-body text-sm text-navy-muted">
                    {item.lessons.length} lesson
                    {item.lessons.length === 1 ? "" : "s"} ·{" "}
                    {item.completed
                      ? `Completed at ${item.score}%`
                      : item.quiz.length ? `${item.quiz.length}-question check` : "Read when ready"}
                  </span>
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-navy-muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
