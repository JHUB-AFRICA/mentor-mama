import { placementStateLabel } from "../placements/placementJourney";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getFacilityMentors,
  getMentorAvailabilityHistory,
  getPlacementActivity,
  getPlacements,
  resendInvitation,
  updateFacilityMentor,
  type CurrentUser,
  type FacilityMentor,
  type Placement,
} from "../../services/api";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";

export function NurseManagerMentorDetail({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const mentorId = location.pathname
    .replace(/\/+$/, "")
    .match(/^\/facility\/mentors\/([^/]+)$/)?.[1];
  const [workloadView, setWorkloadView] = useState<
    "all" | "attention" | "active"
  >("all");
  const [acceptingStudents, setAcceptingStudents] = useState(true);
  const [maxPlacements, setMaxPlacements] = useState("5");
  const [availabilityReason, setAvailabilityReason] = useState("");
  const query = useQuery<{ mentor: FacilityMentor; placements: Placement[] }>({
    queryKey: ["facility-mentor-detail", mentorId],
    enabled: Boolean(mentorId),
    queryFn: async () => {
      const [mentorPage, placementPage] = await Promise.all([
        getFacilityMentors({ page_size: 50 }),
        getPlacements({ mentor: mentorId, pageSize: 50 }),
      ]);
      const mentor = mentorPage.results.find((item) => item.id === mentorId);
      if (!mentor)
        throw new Error("This mentor is not available in your facility scope.");
      return { mentor, placements: placementPage.results };
    },
  });
  const refresh = () => void query.refetch();
  const mentor = query.data?.mentor;
  useEffect(() => {
    if (!mentor) return;
    setAcceptingStudents(mentor.accepting_students);
    setMaxPlacements(String(mentor.max_active_placements));
  }, [mentor]);
  const settingsMutation = useMutation({
    mutationFn: () =>
      updateFacilityMentor(mentorId ?? "", {
        accepting_students: acceptingStudents,
        max_active_placements: Number(maxPlacements),
        reason: availabilityReason,
      }),
    onSuccess: () => {
      setAvailabilityReason("");
      void query.refetch();
      void availabilityHistory.refetch();
    },
    onError: (cause) =>
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not save mentor settings.",
      ),
  });
  const availabilityHistory = useQuery({
    queryKey: ["mentor-availability-history", mentorId],
    queryFn: () => getMentorAvailabilityHistory(mentorId ?? ""),
    enabled: Boolean(mentorId),
  });
  const placements = query.data?.placements ?? [];
  const activityQueries = useQueries({
    queries: placements.map((placement) => ({
      queryKey: ["placement-activity", placement.id],
      queryFn: () => getPlacementActivity(placement.id),
      enabled: Boolean(query.data),
      staleTime: 30_000,
    })),
  });
  const activity = activityQueries
    .flatMap((activityQuery, index) =>
      (activityQuery.data ?? []).map((entry) => ({
        ...entry,
        studentName: placements[index]?.student?.name ?? "Student placement",
      })),
    )
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .slice(0, 8);
  const attentionPlacements = placements.filter((placement) =>
    ["awaiting_student", "orientation", "induction", "paused"].includes(
      placement.state,
    ),
  );
  const activePlacements = placements.filter(
    (placement) => placement.state === "active",
  );
  const capacityReached = Boolean(
    mentor && placements.length >= mentor.max_active_placements,
  );
  const visiblePlacements =
    workloadView === "attention"
      ? attentionPlacements
      : workloadView === "active"
        ? activePlacements
        : placements;
  const nav = (destination: string) =>
    navigate(
      destination === "overview"
        ? "/facility"
        : destination === "placements"
          ? "/placements"
          : `/facility/${destination}`,
    );
  return (
    <FacilityWorkspaceFrame
      user={user}
      active="mentors"
      title="Mentor detail"
      onNavigate={nav}
      onAccount={() => navigate("/facility/account")}
      onError={onError}
    >
      {query.isPending ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : query.isError || !mentor ? (
        <ErrorState onRetry={refresh} />
      ) : (
        <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 pb-10">
          <button
            type="button"
            onClick={() => navigate("/facility/mentors")}
            className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-bold text-teal hover:underline"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Mentor register
          </button>
          <section className="rounded-3xl bg-navy p-6 text-white shadow-[0_16px_36px_rgba(8,25,53,0.12)] sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal-bright">
                  Facility mentor
                </p>
                <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {mentor.name}
                </h1>
                <p className="mt-3 font-body text-sm text-slate-300">
                  {mentor.email} {mentor.phone ? `· ${mentor.phone}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-4 py-2 font-body text-sm font-bold capitalize text-teal-bright">
                {mentor.status}
              </span>
            </div>
          </section>
          {(mentor.accepting_students === false || capacityReached) && (
            <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-body text-sm font-bold text-amber-950">
                  {capacityReached
                    ? "Workload limit reached"
                    : "New allocations paused"}
                </p>
                <p className="mt-1 font-body text-sm leading-5 text-amber-900/75">
                  {capacityReached
                    ? `This mentor has ${placements.length} active placements, matching the limit of ${mentor.max_active_placements}. Review the workload before assigning another student.`
                    : "New assignments to this mentor will be blocked until availability is restored."}
                </p>
              </div>
              {placements.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate(`/placements?mentor=${mentor.id}`)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-amber-300 bg-white px-4 font-body text-sm font-bold text-amber-950 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  Review workload <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </section>
          )}
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
            <div className="space-y-6 lg:contents">
              <Card
                title="Current placement workload"
                eyebrow="Operational workload"
                icon={<UserRound size={20} />}
                detail="See every student assigned to this mentor, with attention states surfaced first."
                className="lg:order-1"
              >
                <div
                  className="mb-5 flex flex-wrap items-center gap-2"
                  aria-label="Filter mentor workload"
                >
                  {(
                    [
                      ["all", `All students · ${placements.length}`],
                      [
                        "attention",
                        `Needs attention · ${attentionPlacements.length}`,
                      ],
                      ["active", `Active · ${activePlacements.length}`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setWorkloadView(value)}
                      className={`rounded-full border px-3 py-1.5 font-body text-xs font-bold transition ${workloadView === value ? "border-teal bg-teal text-white" : "border-border bg-white text-navy-muted hover:border-teal hover:text-teal"}`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => navigate(`/placements?mentor=${mentor.id}`)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-xs font-bold text-teal hover:bg-teal-light"
                  >
                    Open placement register{" "}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
                {placements.length === 0 ? (
                  <p className="rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">
                    No active student placements are assigned.
                  </p>
                ) : visiblePlacements.length === 0 ? (
                  <p className="rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">
                    No placements match this workload view.
                  </p>
                ) : (
                  <div className="divide-y divide-border border-y border-border">
                    {visiblePlacements.map((placement) => (
                      <button
                        key={placement.id}
                        type="button"
                        onClick={() => navigate(`/placements/${placement.id}`)}
                        className="flex w-full items-center justify-between gap-4 px-1 py-4 text-left hover:bg-mist"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-body text-sm font-bold text-navy">
                            {placement.student?.name ?? "Student placement"}
                          </span>
                          <span className="mt-1 block truncate font-body text-xs text-navy-muted">
                            {placement.ward?.name ?? "Ward pending"} ·{" "}
                            {placement.cohort_name ?? "Cohort pending"}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-mist px-2.5 py-1 font-body text-xs font-bold capitalize text-navy-muted">
                            {placementStateLabel(placement.state, "staff")}
                          </span>
                          <ArrowRight
                            size={16}
                            className="text-teal"
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
              <Card
                title="Recent mentor activity"
                eyebrow="Audit trail"
                icon={<ShieldCheck size={20} />}
                detail="A read-only view of placement changes connected to this mentor."
                className="lg:order-3"
              >
                {activity.length === 0 ? (
                  <p className="rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">
                    No placement activity has been recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border border-y border-border">
                    {activity.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-body text-sm font-bold text-navy">
                            {entry.action.replaceAll(".", " · ")}
                          </p>
                          <p className="mt-1 truncate font-body text-xs text-navy-muted">
                            {entry.studentName} · {entry.actor}
                          </p>
                        </div>
                        <time
                          className="shrink-0 font-body text-xs text-navy-muted"
                          dateTime={entry.occurred_at}
                        >
                          {new Date(entry.occurred_at).toLocaleDateString(
                            "en-GB",
                          )}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
            <aside className="space-y-6 lg:contents">
              <Card
                title="Mentor profile"
                eyebrow="Facility record"
                icon={<ShieldCheck size={20} />}
                className="lg:order-2"
              >
                <dl className="grid gap-4">
                  <Info label="Status" value={mentor.status} />
                  <Info
                    label="Active students"
                    value={String(query.data.placements.length)}
                  />
                  <Info
                    label="Added"
                    value={new Date(mentor.created_at).toLocaleDateString(
                      "en-GB",
                    )}
                  />
                </dl>
              </Card>
              <Card
                title="Invitation"
                eyebrow="Account access"
                icon={<Mail size={20} />}
                className="lg:order-4"
              >
                <p className="font-body text-sm leading-6 text-navy-muted">
                  {mentor.status === "invited"
                    ? "This mentor has not activated their account yet."
                    : "This mentor has an active facility account."}
                </p>
                {mentor.status === "invited" && (
                  <Button
                    size="sm"
                    className="mt-4"
                    onClick={async () => {
                      try {
                        await resendInvitation(mentor.id);
                        refresh();
                      } catch (cause) {
                        onError(
                          cause instanceof Error
                            ? cause.message
                            : "We could not resend that invitation.",
                        );
                      }
                    }}
                  >
                    Resend invitation
                  </Button>
                )}
              </Card>
              <Card
                title="Availability & capacity"
                eyebrow="Allocation rules"
                icon={<ShieldCheck size={20} />}
                detail="Control whether new students may be assigned and set a safe workload ceiling."
                className="lg:order-6"
              >
                <label className="flex items-start gap-3 rounded-xl border border-border bg-mist/35 p-3 font-body text-sm text-navy">
                  <input
                    type="checkbox"
                    checked={acceptingStudents}
                    onChange={(event) =>
                      setAcceptingStudents(event.target.checked)
                    }
                    className="mt-0.5 size-4 accent-teal"
                  />
                  <span>
                    <span className="block font-bold">
                      Accepting new students
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-navy-muted">
                      Turn this off when the mentor is temporarily unavailable.
                    </span>
                  </span>
                </label>
                <label className="mt-4 block font-body text-sm font-semibold text-navy">
                  Maximum active students
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={maxPlacements}
                    onChange={(event) => setMaxPlacements(event.target.value)}
                    className="auth-control mt-2 h-11 rounded-xl px-3"
                  />
                </label>
                <label className="mt-4 block font-body text-sm font-semibold text-navy">
                  Change reason <span className="font-normal text-navy-muted">(recommended for audit history)</span>
                  <textarea value={availabilityReason} onChange={(event) => setAvailabilityReason(event.target.value)} rows={2} placeholder="Why is this availability or capacity changing?" className="mt-2 w-full rounded-2xl border border-border bg-white px-3 py-2.5 font-body text-sm font-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
                </label>
                <Button
                  size="sm"
                  className="mt-4"
                  disabled={settingsMutation.isPending || !maxPlacements}
                  onClick={() => void settingsMutation.mutate()}
                >
                  {settingsMutation.isPending
                    ? "Saving…"
                    : "Save allocation rules"}
                </Button>
              </Card>
              <Card
                title="Availability history"
                eyebrow="Operational record"
                icon={<ShieldCheck size={20} />}
                detail="See who changed this mentor’s availability or capacity, when it changed, and the workload affected."
                className="lg:order-7"
              >
                {availabilityHistory.data?.length ? (
                  <div className="divide-y divide-border border-y border-border">
                    {availabilityHistory.data.map((entry) => (
                      <div key={entry.id} className="py-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-body text-sm font-bold text-navy">{entry.changes.accepting_students ? (entry.changes.accepting_students as { to: boolean }).to ? "Availability resumed" : "Availability paused" : "Allocation rules updated"}</p>
                          <time dateTime={entry.occurred_at} className="font-body text-xs text-navy-muted">{new Date(entry.occurred_at).toLocaleString("en-GB")}</time>
                        </div>
                        <p className="mt-1 font-body text-xs text-navy-muted">By {entry.actor} · {String(entry.changes.affected_active_placements ?? 0)} active student(s) affected</p>
                        {entry.reason && <p className="mt-1 font-body text-xs italic text-navy-muted">“{entry.reason}”</p>}
                      </div>
                    ))}
                  </div>
                ) : <p className="rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">No availability changes have been recorded yet.</p>}
              </Card>
              <Card
                title="Manager controls"
                eyebrow="Safe next steps"
                icon={<UserRound size={20} />}
                detail="Open a student placement to reassign the mentor, pause work, or review its audit history."
                className="lg:order-5"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/placements?mentor=${mentor.id}`)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-teal px-4 font-body text-sm font-bold text-white transition hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
                >
                  Review mentor placements{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </Card>
            </aside>
          </section>
        </main>
      )}
    </FacilityWorkspaceFrame>
  );
}
function Card({
  title,
  eyebrow,
  icon,
  detail,
  className,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: React.ReactNode;
  detail?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-border bg-white p-6 shadow-[0_8px_24px_rgba(8,25,53,0.04)] ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal">
          {icon}
        </span>
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-navy">
            {title}
          </h2>
          {detail && (
            <p className="mt-1 font-body text-sm leading-6 text-navy-muted">
              {detail}
            </p>
          )}
        </div>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-body text-sm font-semibold capitalize text-navy">
        {value}
      </dd>
    </div>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error"
    >
      We could not load this mentor record.
      <button
        type="button"
        onClick={onRetry}
        className="ml-2 font-bold underline"
      >
        Try again
      </button>
    </div>
  );
}
