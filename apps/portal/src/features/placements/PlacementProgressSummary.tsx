import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card, Skeleton } from "@mentormama/ui";
import { useQuery } from "@tanstack/react-query";
import { getPlacementProgress } from "../../services/api";

function date(value: string | null) {
  if (!value) return "No sessions yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

export function PlacementProgressSummary({
  placementId,
  audience = "participant",
}: {
  placementId: string;
  audience?: "participant" | "admin";
}) {
  const query = useQuery({
    queryKey: ["placement-progress", placementId],
    queryFn: () => getPlacementProgress(placementId),
    staleTime: 30_000,
  });

  if (query.isPending)
    return (
      <Skeleton
        className={audience === "admin" ? "h-40" : "mb-7 h-44 rounded-2xl"}
      />
    );
  if (query.isError)
    return (
      <div
        role="alert"
        className="flex flex-col gap-4 rounded-2xl border border-error/20 bg-error/[0.04] px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error">
            <TriangleAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="font-body text-sm font-bold text-navy">
              Progress evidence unavailable
            </p>
            <p className="mt-1 font-body text-sm leading-6 text-navy-muted">
              The placement is loaded, but its milestone summary could not be
              retrieved.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-lg border border-error/20 px-3 font-body text-sm font-semibold text-error transition hover:bg-error/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-error sm:self-center"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  const progress = query.data;
  const overall = progress.overall_percentage;
  const orientationAcknowledged = progress.orientation?.acknowledged ?? false;

  if (audience === "admin") {
    return (
      <section
        aria-labelledby="placement-progress-heading"
        className="border-y border-border py-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Operational signals
            </p>
            <h2
              id="placement-progress-heading"
              className="mt-1 font-display text-xl font-bold text-navy"
            >
              Progress evidence
            </h2>
            <p className="mt-1 max-w-2xl font-body text-sm leading-6 text-navy-muted">
              Safe milestone indicators from the placement record. Detailed
              responses and narratives remain with their owning roles.
            </p>
          </div>
          {overall !== null && (
            <p className="font-body text-sm font-semibold text-teal">
              {overall}% overall progress
            </p>
          )}
        </div>
        <div className="mt-6 divide-y divide-border border-y border-border">
          <AdminProgressRow
            icon={
              orientationAcknowledged ? (
                <CheckCircle2 size={17} />
              ) : (
                <ClipboardCheck size={17} />
              )
            }
            label="Orientation"
            value={
              orientationAcknowledged
                ? "Acknowledged"
                : "Awaiting acknowledgement"
            }
            detail="Student-owned confirmation milestone"
          />
          <AdminProgressRow
            icon={<ClipboardCheck size={17} />}
            label="Induction"
            value={
              progress.induction.percentage === null
                ? "Not opened"
                : `${progress.induction.percentage}% complete`
            }
            detail={
              progress.induction.available
                ? `${progress.induction.completed} of ${progress.induction.total} required items`
                : "Checklist is not available yet"
            }
          />
          <AdminProgressRow
            icon={<Activity size={17} />}
            label="Mentorship"
            value={`${progress.mentorship.sessions_logged} sessions logged`}
            detail={
              progress.mentorship.last_session_date
                ? `Latest session ${date(progress.mentorship.last_session_date)}`
                : "No sessions logged yet"
            }
          />
          <AdminProgressRow
            icon={
              progress.assessment.final_submitted ? (
                <CheckCircle2 size={17} />
              ) : (
                <ClipboardCheck size={17} />
              )
            }
            label="Assessment"
            value={
              progress.assessment.final_submitted
                ? "Final assessment submitted"
                : "Final assessment pending"
            }
            detail={
              progress.assessment.baseline_submitted
                ? "Baseline assessment is on record"
                : "Baseline assessment pending"
            }
          />
          <AdminProgressRow
            icon={
              progress.safeguarding.open_concerns ? (
                <ShieldAlert size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )
            }
            label="Safeguarding"
            value={
              progress.safeguarding.open_concerns
                ? `${progress.safeguarding.open_concerns} open concern${progress.safeguarding.open_concerns === 1 ? "" : "s"}`
                : "No open concerns"
            }
            detail={
              progress.safeguarding.open_concerns
                ? `${progress.safeguarding.severity?.high ?? 0} high · ${progress.safeguarding.severity?.medium ?? 0} medium · ${progress.safeguarding.severity?.low ?? 0} low`
                : "Only the operational count is shown here"
            }
          />
        </div>
      </section>
    );
  }

  return (
    <Card padding="lg" className="mb-7 border-teal/20 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
            Placement progress
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-navy">
            Your placement at a glance
          </h2>
          <p className="mt-1 font-body text-sm text-navy-muted">
            Updated from the placement record and its completed activities.
          </p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-light font-display text-lg font-bold text-teal">
          {overall === null ? "—" : `${overall}%`}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ProgressItem
          icon={<ClipboardCheck size={17} />}
          label="Induction"
          value={
            progress.induction.percentage === null
              ? "Not opened"
              : `${progress.induction.percentage}%`
          }
          detail={
            progress.induction.available
              ? `${progress.induction.completed}/${progress.induction.total} required items`
              : "Awaiting checklist"
          }
        />
        <ProgressItem
          icon={<Activity size={17} />}
          label="Mentorship"
          value={`${progress.mentorship.sessions_logged} sessions`}
          detail={`Last logged ${date(progress.mentorship.last_session_date)}`}
        />
        <ProgressItem
          icon={
            progress.safeguarding.open_concerns ? (
              <ShieldAlert size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )
          }
          label="Wellbeing"
          value={
            progress.safeguarding.open_concerns
              ? "Follow-up needed"
              : "No open concerns"
          }
          detail={
            progress.safeguarding.open_concerns
              ? `${progress.safeguarding.open_concerns} open concern`
              : "Safeguarding status is clear"
          }
        />
      </div>
    </Card>
  );
}

function AdminProgressRow({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="grid gap-2 px-1 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-5">
      <div className="flex items-center gap-2 text-teal">
        <span aria-hidden="true">{icon}</span>
        <span className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
          {label}
        </span>
      </div>
      <p className="font-body text-sm font-semibold text-navy">{value}</p>
      <p className="font-body text-xs text-navy-muted sm:text-right">
        {detail}
      </p>
    </div>
  );
}

function ProgressItem({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-mist px-4 py-3">
      <div className="flex items-center gap-2 text-teal">
        {icon}
        <span className="font-body text-xs font-bold uppercase tracking-[0.1em]">
          {label}
        </span>
      </div>
      <p className="mt-2 font-body text-sm font-semibold text-navy">{value}</p>
      <p className="mt-1 font-body text-xs text-navy-muted">{detail}</p>
    </div>
  );
}
