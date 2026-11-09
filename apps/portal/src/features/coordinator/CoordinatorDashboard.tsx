import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Card, Skeleton } from "@mentormama/ui";
import {
  getCohorts,
  getDashboardIndicators,
  getInstitutionStudents,
  type CurrentUser,
} from "../../services/api";
import { SafeguardingReviewPanel } from "../safeguarding/SafeguardingReviewPanel";
import { InterruptionReport } from "../workspaces/InterruptionReport";

type Destination = "cohorts" | "placements" | "reports";

export function CoordinatorDashboard({
  user,
  onError,
  onNavigate,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
  onNavigate: (destination: Destination) => void;
}) {
  const indicators = useQuery({
    queryKey: ["coordinator-dashboard"],
    queryFn: getDashboardIndicators,
    staleTime: 15_000,
  });
  const cohorts = useQuery({
    queryKey: ["institution-cohorts"],
    queryFn: getCohorts,
    staleTime: 30_000,
  });
  const students = useQuery({
    queryKey: ["institution-students"],
    queryFn: () => getInstitutionStudents(),
    staleTime: 30_000,
  });
  const values = indicators.data?.indicators ?? {};
  const draft = values.placements_draft ?? 0;
  const scheduled = values.placements_scheduled ?? 0;
  const awaiting = values.placements_awaiting_student ?? 0;
  const orientation = values.placements_orientation ?? 0;
  const concerns = values.open_concerns ?? 0;
  const induction = values.placements_induction ?? 0;
  const active = values.placements_active ?? 0;
  const paused = values.placements_paused ?? 0;
  const completed = values.placements_completed ?? 0;
  const needsSetup = draft + scheduled;
  const hasAttention = needsSetup > 0 || awaiting > 0 || paused > 0 || concerns > 0;
  const institutionName = user.scope?.institution_name ?? "Your institution";

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[1.5rem] bg-navy px-6 py-8 text-white sm:px-9 sm:py-10 lg:px-12">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border-[3rem] border-teal/15" />
        <div className="relative max-w-3xl">
          <p className="font-body text-xs font-bold uppercase tracking-[0.18em] text-teal-bright">
            Institution control room · {institutionName}
          </p>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Keep every student moving toward a safe placement.
          </h2>
          <p className="mt-4 max-w-xl font-body text-sm leading-7 text-slate-300 sm:text-base">
            A focused view of your institution’s cohorts, placement handoffs,
            and signals that need your attention.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate("placements")}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal px-5 font-body text-sm font-bold text-white transition hover:bg-teal-dark focus:outline-none focus:ring-2 focus:ring-teal-bright focus:ring-offset-2 focus:ring-offset-navy"
            >
              Review placements <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("cohorts")}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-5 font-body text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-bright"
            >
              Manage cohorts
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="institution-signals">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
              Institution snapshot
            </p>
            <h3
              id="institution-signals"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Your operating picture
            </h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Users />}
            label="Students"
            query={students}
            value={students.data?.pagination.total_count}
            detail="In your institution"
            tone="teal"
          />
          <MetricCard
            icon={<BookOpen />}
            label="Cohorts"
            query={cohorts}
            value={cohorts.data?.length}
            detail="Planning groups"
            tone="blue"
          />
          <MetricCard
            icon={<ClipboardList />}
            label="Active placements"
            query={indicators}
            value={active}
            detail={`${completed} completed`}
            tone="navy"
          />
          <MetricCard
            icon={<TriangleAlert />}
            label="Needs attention"
            query={indicators}
            value={awaiting + concerns}
            detail={`${awaiting} awaiting · ${concerns} concern${concerns === 1 ? "" : "s"}`}
            tone={hasAttention ? "amber" : "green"}
          />
        </div>
      </section>

      <section
        aria-labelledby="flow-heading"
        className="border-y border-border py-7"
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
              Placement flow
            </p>
            <h3
              id="flow-heading"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Where students are in the journey
            </h3>
            <p className="mt-2 font-body text-sm text-navy-muted">
              A live institution-level snapshot of placement progression.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("placements")}
            className="inline-flex min-h-11 items-center gap-2 font-body text-sm font-bold text-teal hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            Open register <ArrowRight size={15} />
          </button>
        </div>
          {indicators.isPending ? (
            <Skeleton className="mt-6 h-24 rounded-2xl" />
          ) : indicators.isError ? (
          <InlineRetry
            message="Placement flow is temporarily unavailable."
            onRetry={() => void indicators.refetch()}
          />
        ) : (
          <div
            className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4 xl:grid-cols-8"
            aria-label="Placement progression summary"
          >
            {[
              ["Draft", draft],
              ["Scheduled", scheduled],
              ["Awaiting student", awaiting],
              ["Orientation", orientation],
              ["Induction", induction],
              ["Active", active],
              ["Paused", paused],
              ["Completed", completed],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-4 sm:px-5">
                <p className="font-body text-2xl font-bold tabular-nums text-navy">
                  {value}
                </p>
                <p className="mt-1 font-body text-xs font-semibold leading-5 text-navy-muted">
                  {label}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        aria-labelledby="attention-heading"
        className="border-y border-border py-7"
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
              Coordination queue
            </p>
            <h3
              id="attention-heading"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              What needs your decision?
            </h3>
            <p className="mt-2 font-body text-sm text-navy-muted">
              Start with the handoffs and exceptions that can slow a student
              down.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("placements")}
            className="inline-flex min-h-11 items-center gap-2 font-body text-sm font-bold text-teal hover:text-navy"
          >
            Open placement register <ArrowRight size={15} />
          </button>
        </div>
        {indicators.isPending ? (
          <Skeleton className="mt-6 h-28" />
        ) : indicators.isError ? (
          <InlineRetry
            message="The coordination queue is temporarily unavailable."
            onRetry={() => void indicators.refetch()}
          />
        ) : (
          <div className="mt-6 divide-y divide-border border-t border-border">
          {needsSetup > 0 && (
            <QueueRow
              icon={<ClipboardList />}
              title={`${needsSetup} placement${needsSetup === 1 ? " needs" : "s need"} setup or release`}
              detail="Review assignments and release fully prepared placements to students when ready."
              action="Review placements"
              onClick={() => onNavigate("placements")}
              tone="amber"
            />
          )}
          {awaiting > 0 && (
            <QueueRow
              icon={<ClipboardList />}
              title={`${awaiting} placement${awaiting === 1 ? " is" : "s are"} awaiting student confirmation`}
              detail="Review the placement record and follow up on the student handoff."
              action="Review placements"
              onClick={() => onNavigate("placements")}
              tone="amber"
            />
          )}
          {concerns > 0 && (
            <QueueRow
              icon={<TriangleAlert />}
              title={`${concerns} safeguarding concern${concerns === 1 ? "" : "s"} in your scope`}
              detail="Open the authorised review workspace and see the next permitted action."
              action="Review concerns"
              onClick={() => onNavigate("reports")}
              tone="red"
            />
          )}
          {paused > 0 && (
            <QueueRow
              icon={<TriangleAlert />}
              title={`${paused} placement${paused === 1 ? " is" : "s are"} paused`}
              detail="Review the placement register and coordinate the next permitted action."
              action="Review paused"
              onClick={() => onNavigate("placements")}
              tone="amber"
            />
          )}
          {induction > 0 && (
            <QueueRow
              icon={<BookOpen />}
              title={`${induction} placement${induction === 1 ? " is" : "s are"} in induction`}
              detail="Monitor the handoff and keep students on track for active placement."
              action="View placements"
              onClick={() => onNavigate("placements")}
              tone="green"
            />
          )}
          {!hasAttention && (
            <QueueRow
              icon={<CheckCircle2 />}
              title="Nothing is waiting for your decision"
              detail="Your institution has no placement handoff or safeguarding exception requiring attention."
              action="View placements"
              onClick={() => onNavigate("placements")}
              tone="green"
            />
          )}
          </div>
        )}
      </section>

      <section aria-labelledby="monitoring-heading">
        <div className="mb-5">
          <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
            Signals to monitor
          </p>
          <h3
            id="monitoring-heading"
            className="mt-2 font-display text-2xl font-bold text-navy"
          >
            Continuity and safety
          </h3>
          <p className="mt-2 font-body text-sm text-navy-muted">
            Read-only signals help you spot where an institution handoff may
            need support.
          </p>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <InterruptionReport compact scopeLabel="Institution monitoring" />
          <SafeguardingReviewPanel user={user} onError={onError} compact />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  query,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  value?: number;
  detail: string;
  tone: "teal" | "blue" | "navy" | "amber" | "green";
}) {
  if (query.isPending) return <Skeleton className="h-36 rounded-2xl" />;
  if (query.isError)
    return (
      <Card
        padding="sm"
        className="rounded-[1rem] border border-error/20 bg-error/[0.03]"
      >
        <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-error">
          {label}
        </p>
        <p className="mt-3 font-body text-sm text-navy-muted">Unavailable</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-3 min-h-9 font-body text-sm font-bold text-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          Try again
        </button>
      </Card>
    );
  return (
    <StatCard
      icon={icon}
      label={label}
      value={value ?? 0}
      detail={detail}
      tone={tone}
    />
  );
}

function InlineRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-error/[0.04] px-4 py-3"
    >
      <p className="font-body text-sm text-error">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-9 font-body text-sm font-bold text-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        Try again
      </button>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: "teal" | "blue" | "navy" | "amber" | "green";
}) {
  const tones = {
    teal: "bg-teal-light text-teal",
    blue: "bg-blue-50 text-blue-700",
    navy: "bg-slate-100 text-navy",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <Card
      padding="sm"
      className="rounded-[1rem] border border-border/70 bg-white shadow-[0_3px_12px_rgba(13,27,51,0.04)]"
    >
      <span
        className={`flex size-9 items-center justify-center rounded-lg ${tones[tone]}`}
      >
        <span aria-hidden="true">{icon}</span>
      </span>
      <p className="mt-4 font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </p>
      <p className="mt-0.5 font-display text-2xl font-bold text-navy">
        {value}
      </p>
      <p className="mt-0.5 font-body text-xs text-navy-muted">{detail}</p>
    </Card>
  );
}
function QueueRow({
  icon,
  title,
  detail,
  action,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
  tone: "amber" | "red" | "green";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <span aria-hidden="true">{icon}</span>
        </span>
        <div>
          <p className="font-body text-sm font-bold text-navy">{title}</p>
          <p className="mt-1 max-w-2xl font-body text-sm leading-6 text-navy-muted">
            {detail}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-11 items-center gap-2 self-start whitespace-nowrap font-body text-sm font-bold text-teal hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:self-center"
      >
        {action} <ArrowRight size={15} />
      </button>
    </div>
  );
}
