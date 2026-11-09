import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Hospital,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import {
  getDashboardIndicators,
  getFacilities,
  getFacilityMentors,
  getPlacements,
  getWards,
  type CurrentUser,
  type Placement,
} from "../../services/api";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { InterruptionReport } from "../workspaces/InterruptionReport";
import { SafeguardingReviewPanel } from "../safeguarding/SafeguardingReviewPanel";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  isManagerActionablePlacement,
  managerPlacementAction,
} from "./managerPlacementLogic";

interface NurseManagerDashboardProps {
  user: CurrentUser;
  onError: (message: string) => void;
}

const indicatorCards = [
  [
    "placements_total",
    "Placement handoffs",
    "All facility placements",
    ClipboardCheck,
  ],
  [
    "placements_awaiting_student",
    "Awaiting student",
    "Ready for confirmation",
    Users,
  ],
  ["placements_induction", "In induction", "Handoff in progress", Activity],
  [
    "placements_active",
    "Currently active",
    "Operating on the ward",
    CheckCircle2,
  ],
] as const;
export function NurseManagerDashboard({
  user,
  onError,
}: NurseManagerDashboardProps) {
  const navigate = useNavigate();
  const indicators = useQuery({
    queryKey: ["facility-dashboard-indicators"],
    queryFn: getDashboardIndicators,
    staleTime: 15_000,
  });
  const facilities = useQuery({
    queryKey: ["facility-dashboard-facilities"],
    queryFn: getFacilities,
    staleTime: 60_000,
  });
  const wards = useQuery({
    queryKey: ["facility-dashboard-wards"],
    queryFn: getWards,
    staleTime: 15_000,
  });
  const placements = useQuery({
    queryKey: ["facility-dashboard-placements"],
    queryFn: () => getPlacements({ pageSize: 50 }),
    staleTime: 15_000,
  });
  const mentors = useQuery({
    queryKey: ["facility-dashboard-mentors"],
    queryFn: () => getFacilityMentors({ page_size: 50 }),
    staleTime: 15_000,
  });
  const refresh = () => {
    void Promise.all([
      indicators.refetch(),
      facilities.refetch(),
      wards.refetch(),
      placements.refetch(),
      mentors.refetch(),
    ]);
  };
  const values = indicators.data?.indicators ?? {};
  const facilityName = facilities.data?.[0]?.name ?? "Facility scope unavailable";
  const needsAttention = (placements.data?.results ?? []).filter(
    isManagerActionablePlacement,
  );
  const attentionPreview = needsAttention.slice(0, 5);
  const mayHaveMoreAttention = placements.data?.pagination.has_next ?? false;
  const mentorAlerts = (mentors.data?.results ?? []).filter(
    (mentor) =>
      !mentor.accepting_students ||
      mentor.active_placements >= mentor.max_active_placements,
  );
  const busy =
    indicators.isFetching ||
    facilities.isFetching ||
    wards.isFetching ||
    placements.isFetching ||
    mentors.isFetching;
  const open = (destination: string) => navigate(destination);
  const go = (
    destination:
      | "overview"
      | "placements"
      | "mentors"
      | "wards"
      | "safeguarding"
      | "reports"
      | "activity",
  ) =>
    open(
      destination === "overview"
        ? "/facility"
        : destination === "placements"
          ? "/placements"
          : `/facility/${destination}`,
    );

  return (
    <FacilityWorkspaceFrame
      user={user}
      title="Facility operations"
      active="overview"
      onNavigate={go}
      onAccount={() => open("/facility/account")}
      onError={onError}
    >
      <div className="space-y-6 sm:space-y-7">
        <section className="overflow-hidden rounded-2xl bg-navy px-6 py-6 text-white shadow-[0_16px_36px_rgba(8,25,53,0.1)] sm:px-8 sm:py-7 lg:px-9">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal-bright">
                Good morning, {user.name.split(" ")[0]}
              </p>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Your facility at a glance.
              </h2>
              <p className="mt-3 max-w-xl font-body text-sm leading-6 text-slate-300 sm:text-base">
                See what needs a decision, check capacity, and keep each student
                moving through placement.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => open("/placements")}
                >
                  Review placements{" "}
                  <ArrowRight size={15} className="ml-2" aria-hidden="true" />
                </Button>
                <button
                  type="button"
                  onClick={() => open("/facility/mentors")}
                  className="inline-flex min-h-10 items-center rounded-xl border border-white/20 px-4 font-body text-sm font-semibold text-white transition hover:border-teal-bright hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-teal-bright"
                >
                  Manage mentors
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 lg:min-w-64">
              <span className="flex size-10 items-center justify-center rounded-xl bg-teal-bright/15 text-teal-bright">
                <Building2 size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-body text-xs uppercase tracking-[0.12em] text-slate-400">
                  Current facility
                </p>
                {facilities.isPending ? <p className="mt-2 h-4 w-36 animate-pulse rounded bg-white/15" /> : facilities.isError ? <button type="button" className="mt-1 text-left font-body text-xs font-semibold text-amber-200 underline" onClick={() => void facilities.refetch()}>Facility identity unavailable. Try again.</button> : <p className="mt-1 truncate font-body text-sm font-semibold">{facilityName}</p>}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="stats-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
                Operating picture
              </p>
              <h2
                id="stats-heading"
                className="mt-2 font-display text-2xl font-bold tracking-tight"
              >
                At a glance
              </h2>
            </div>
          </div>
          {indicators.isPending ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {indicatorCards.map(([key]) => (
                <Skeleton key={key} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : indicators.isError ? (
            <ErrorRegion
              message="We could not load the facility indicators."
              onRetry={() => void indicators.refetch()}
            />
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {indicatorCards.map(([key, label, detail, Icon]) => (
                <div
                  key={key}
                  className="flex min-h-36 flex-col justify-between rounded-2xl border border-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-teal-light text-teal">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <p className="font-display text-3xl font-bold tabular-nums text-navy">
                      {values[key] ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="font-body text-sm font-bold text-navy">
                      {label}
                    </p>
                    <p className="mt-1 font-body text-xs text-navy-muted">
                      {detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="attention-heading">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
                Next facility decisions
              </p>
              <h2
                id="attention-heading"
                className="mt-2 font-display text-2xl font-bold tracking-tight"
              >
                Keep the queue moving
              </h2>
              <p className="mt-1 font-body text-sm text-navy-muted">
                Resolve the next placement action for students at your facility.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 font-body text-sm font-semibold text-teal transition hover:bg-teal-light disabled:cursor-wait disabled:opacity-50 sm:self-auto"
            >
              <RefreshCw
                size={16}
                className={busy ? "animate-spin" : ""}
                aria-hidden="true"
              />
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {placements.isPending ? (
            <div className="mt-5 grid gap-3">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : placements.isError ? (
            <ErrorRegion
              message="We could not load the facility handoff queue."
              onRetry={() => void placements.refetch()}
            />
          ) : needsAttention.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-white px-5 py-9 text-center">
              <CheckCircle2
                className="mx-auto text-teal"
                size={25}
                aria-hidden="true"
              />
              <p className="mt-3 font-body text-sm font-semibold">
                Your handoff queue is clear
              </p>
              <p className="mt-1 font-body text-sm text-navy-muted">
                No placement currently needs a facility decision.
              </p>
              <button
                type="button"
                onClick={() => open("/placements")}
                className="mt-4 font-body text-sm font-semibold text-teal hover:underline"
              >
                Open all placements{" "}
                <ArrowRight
                  size={14}
                  className="ml-1 inline"
                  aria-hidden="true"
                />
              </button>
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {attentionPreview.map((item) => (
                <PlacementQueueRow key={item.id} placement={item} />
              ))}
              {mayHaveMoreAttention && (
                <button
                  type="button"
                  onClick={() => open("/placements")}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-teal/35 bg-teal-light/35 font-body text-sm font-bold text-teal transition hover:border-teal hover:bg-teal-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  View all placement decisions
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="mentor-alerts-heading" className="rounded-2xl border border-border bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">Mentor readiness</p>
              <h2 id="mentor-alerts-heading" className="mt-2 font-display text-2xl font-bold tracking-tight">Availability and workload</h2>
              <p className="mt-1 font-body text-sm text-navy-muted">Paused or full mentors are surfaced here before a placement decision is made.</p>
            </div>
            <button type="button" onClick={() => open("/facility/mentors")} className="self-start font-body text-sm font-bold text-teal hover:underline">Open mentor register <ArrowRight size={14} className="ml-1 inline" aria-hidden="true" /></button>
          </div>
          {mentors.isPending ? <Skeleton className="mt-5 h-16 rounded-xl" /> : mentorAlerts.length === 0 ? <p className="mt-5 rounded-xl bg-mist px-4 py-4 font-body text-sm text-navy-muted">All mentors are currently available and within their workload limits.</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{mentorAlerts.map((mentor) => <button key={mentor.id} type="button" onClick={() => open(`/facility/mentors/${mentor.id}`)} className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><span className="min-w-0"><span className="block truncate font-body text-sm font-bold text-amber-950">{mentor.name}</span><span className="mt-1 block font-body text-xs text-amber-900/75">{mentor.accepting_students ? `${mentor.active_placements}/${mentor.max_active_placements} active students` : "New allocations paused"}</span></span><ArrowRight size={16} className="shrink-0 text-amber-800" aria-hidden="true" /></button>)}</div>}
        </section>

        <section aria-labelledby="readiness-heading">
          <div className="mb-4">
            <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
              Facility readiness
            </p>
            <h2
              id="readiness-heading"
              className="mt-2 font-display text-2xl font-bold tracking-tight"
            >
              Ready for the next handoff
            </h2>
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <section
              aria-labelledby="capacity-heading"
              className="rounded-2xl border border-border bg-white p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-teal-light text-teal">
                    <Hospital size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                      Before you allocate
                    </p>
                    <h2
                      id="capacity-heading"
                      className="mt-1 font-display text-xl font-bold"
                    >
                      Ward capacity
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => open("/facility/wards")}
                  className="font-body text-sm font-semibold text-teal hover:underline"
                >
                  View wards
                </button>
              </div>
              {wards.isPending ? (
                <div className="mt-5 space-y-3">
                  {[1, 2].map((item) => (
                    <Skeleton key={item} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : wards.isError ? (
                <div className="flex min-h-36 items-center">
                  <ErrorRegion
                    className="mt-0 w-full"
                    message="Ward capacity is temporarily unavailable."
                    onRetry={() => void wards.refetch()}
                  />
                </div>
              ) : wards.data?.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {wards.data.map((ward) => (
                    <div
                      key={ward.id}
                      className="rounded-xl border border-border/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate font-body text-sm font-semibold">
                          {ward.name}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 font-body text-xs font-bold ${ward.available_slots > 0 ? "bg-teal-light text-teal" : "bg-error/10 text-error"}`}
                        >
                          {ward.available_slots} open
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                        <div
                          className={`h-full rounded-full ${ward.available_slots > 0 ? "bg-teal" : "bg-error"}`}
                          style={{
                            width: `${Math.min((ward.allocated_students / Math.max(ward.max_students, 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 font-body text-xs text-navy-muted">
                        {ward.allocated_students} of {ward.max_students}{" "}
                        students allocated
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-dashed border-border bg-mist/35 px-4 py-6 text-center font-body text-sm text-navy-muted">
                  No wards are configured for this facility.
                </p>
              )}
            </section>
            <section
              aria-labelledby="progress-heading"
              className="rounded-2xl border border-border bg-[#edf8f7] p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white text-teal">
                  <Activity size={19} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                    Facility pulse
                  </p>
                  <h2
                    id="progress-heading"
                    className="mt-1 font-display text-xl font-bold"
                  >
                    Mentorship in motion
                  </h2>
                </div>
              </div>
              {indicators.isPending ? (
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-14 rounded-xl" />
                  <Skeleton className="h-14 rounded-xl" />
                </div>
              ) : indicators.isError ? (
                <ErrorRegion
                  message="Progress signals are temporarily unavailable."
                  onRetry={() => void indicators.refetch()}
                />
              ) : (
                <div className="mt-6 space-y-3">
                  <Signal
                    label="Active placements"
                    value={values.placements_active ?? 0}
                    detail="Currently operating"
                  />
                  <Signal
                    label="Sessions recorded"
                    value={values.sessions_total ?? 0}
                    detail="Across this facility"
                  />
                </div>
              )}
            </section>
          </div>
        </section>

        <section
          aria-labelledby="pipeline-heading"
          className="rounded-2xl border border-border bg-white p-5 sm:p-6"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Placement pipeline
              </p>
              <h2
                id="pipeline-heading"
                className="mt-1 font-display text-xl font-bold"
              >
                Where students are in the journey
              </h2>
            </div>
            <button
              type="button"
              onClick={() => open("/placements")}
              className="inline-flex items-center gap-1 self-start font-body text-sm font-semibold text-teal hover:underline sm:self-auto"
            >
              Open register <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          {indicators.isPending ? (
            <Skeleton className="mt-6 h-24 rounded-xl" />
          ) : indicators.isError ? (
            <ErrorRegion
              message="The placement pipeline is temporarily unavailable."
              onRetry={() => void indicators.refetch()}
            />
          ) : (
            <div className="mt-5 grid overflow-hidden rounded-xl border border-border sm:grid-cols-5 sm:divide-x sm:divide-border">
              <PipelineStep label="Preparing" value={preparingCount(values)} />
              <PipelineStep
                label="Awaiting student"
                value={values.placements_awaiting_student ?? 0}
              />
              <PipelineStep
                label="In induction"
                value={values.placements_induction ?? 0}
              />
              <PipelineStep
                label="Active"
                value={values.placements_active ?? 0}
              />
              <PipelineStep
                label="Completed"
                value={values.placements_completed ?? 0}
              />
            </div>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <InterruptionReport compact scopeLabel="Facility monitoring" />
          <SafeguardingReviewPanel compact user={user} onError={onError} />
        </div>
      </div>
    </FacilityWorkspaceFrame>
  );
}

function preparingCount(values: Record<string, number>) {
  const total = values.placements_total ?? 0;
  const known =
    (values.placements_awaiting_student ?? 0) +
    (values.placements_induction ?? 0) +
    (values.placements_active ?? 0) +
    (values.placements_completed ?? 0);
  return Math.max(total - known, 0);
}
function Signal({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-white px-4 py-3">
      <div>
        <p className="font-body text-sm font-semibold text-navy">{label}</p>
        <p className="mt-1 font-body text-xs text-navy-muted">{detail}</p>
      </div>
      <p className="font-display text-2xl font-bold tabular-nums text-navy">
        {value}
      </p>
    </div>
  );
}
function PipelineStep({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-mist/45 px-3 py-4 first:sm:rounded-l-xl last:sm:rounded-r-xl sm:px-4">
      <p className="font-display text-2xl font-bold tabular-nums text-navy">
        {value}
      </p>
      <p className="mt-1 font-body text-xs font-semibold leading-4 text-navy-muted">
        {label}
      </p>
    </div>
  );
}
function ErrorRegion({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/20 bg-error/5 px-4 py-3 font-body text-sm text-error ${className}`}
    >
      <span>{message}</span>
      <button
        type="button"
        className="font-semibold underline"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}
function PlacementQueueRow({ placement }: { placement: Placement }) {
  const missing = managerPlacementAction(placement).label;
  return (
    <Link
      to={`/placements/${placement.id}`}
      className="group flex min-h-24 flex-col justify-between gap-4 rounded-xl border border-border bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-[0_8px_22px_rgba(8,25,53,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:flex-row sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal">
          <UserRound size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-body text-sm font-bold text-navy group-hover:text-teal">
            {placement.student?.name ?? "Student handoff"}
          </p>
          <p className="mt-1 truncate font-body text-xs text-navy-muted">
            {placement.ward?.name ?? "Ward pending"} ·{" "}
            {placement.mentor?.name ?? "Mentor pending"}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
        <div className="min-w-0">
          <p className="truncate font-body text-xs font-semibold text-navy-muted">
            {missing}
          </p>
          <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-1 font-body text-[11px] font-bold capitalize text-amber-800">
            {placement.state.replaceAll("_", " ")}
          </span>
        </div>
        <ArrowRight
          size={17}
          className="shrink-0 text-teal transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
