import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useLocation, useNavigate } from "react-router-dom";
import {
  allocateWard,
  assignMentor,
  getPlacement,
  getPlacementActivity,
  getPlacementOptions,
  getPlacementProgress,
  getTransitions,
  updatePlacementLifecycle,
  type CurrentUser,
  type Placement,
  type PlacementActivityEntry,
  type PlacementOptions,
  type PlacementProgress,
  type TransitionResponse,
} from "../../services/api";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { managerPlacementAction } from "./managerPlacementLogic";

type DetailData = {
  placement: Placement;
  options: PlacementOptions;
  transitions: TransitionResponse;
  activity: PlacementActivityEntry[];
  progress: PlacementProgress;
};

export function NurseManagerPlacementDetail({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  // The portal uses role workspaces as a pathname dispatcher rather than
  // react-router <Route> declarations, so read the id from the actual URL.
  const location = useLocation();
  const placementId = location.pathname.match(/^\/placements\/([^/]+)$/)?.[1];
  const query = useQuery<DetailData>({
    queryKey: ["manager-placement-detail", placementId],
    enabled: Boolean(placementId),
    queryFn: async () => {
      const [placement, options, transitions, activity, progress] =
        await Promise.all([
          getPlacement(placementId!),
          getPlacementOptions(),
          getTransitions(placementId!),
          getPlacementActivity(placementId!),
          getPlacementProgress(placementId!),
        ]);
      return { placement, options, transitions, activity, progress };
    },
  });

  const refresh = () => void query.refetch();
  const open = (path: string) => navigate(path);

  return (
    <FacilityWorkspaceFrame
      user={user}
      active="placements"
      title="Handoff detail"
      onAccount={() => open("/facility/account")}
      onError={onError}
    >
      {query.isPending ? (
        <DetailSkeleton />
      ) : query.isError || !query.data ? (
        <ErrorState onRetry={refresh} />
      ) : (
        <ManagerDetailBody
          data={query.data}
          user={user}
          onRefresh={refresh}
          onBack={() => open("/placements")}
          onError={onError}
        />
      )}
    </FacilityWorkspaceFrame>
  );
}

function ManagerDetailBody({
  data,
  user,
  onRefresh,
  onBack,
  onError,
}: {
  data: DetailData;
  user: CurrentUser;
  onRefresh: () => void;
  onBack: () => void;
  onError: (message: string) => void;
}) {
  const [placement, setPlacement] = useState(data.placement);
  const [ward, setWard] = useState(data.placement.ward?.id ?? "");
  const [mentor, setMentor] = useState(data.placement.mentor?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [reasonAction, setReasonAction] = useState<"pause" | "withdraw" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const action = managerPlacementAction(placement);
  const available = data.transitions.available;
  const canWard = Boolean(user.capabilities.allocate_ward);
  const canMentor = Boolean(user.capabilities.assign_mentor);
  const canPause = Boolean(user.capabilities.pause_placement);
  const canResume = Boolean(user.capabilities.resume_placement);
  const canComplete = Boolean(user.capabilities.complete_placement);
  const canWithdraw = Boolean(user.capabilities.withdraw_placement);
  const wardChanged = ward !== (placement.ward?.id ?? "");
  const mentorChanged = mentor !== (placement.mentor?.id ?? "");

  async function run(command: () => Promise<Placement>) {
    setBusy(true);
    try {
      setPlacement(await command());
      onRefresh();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not complete that placement action.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-bold text-teal hover:underline"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Placement queue
      </button>
      <section className="rounded-3xl bg-navy p-6 text-white shadow-[0_16px_36px_rgba(8,25,53,0.12)] sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal-bright">
              Facility handoff
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {placement.student?.name ?? "Student placement"}
            </h1>
            <p className="mt-3 font-body text-sm text-slate-300">
              {placement.cohort_name ?? "Cohort pending"} ·{" "}
              {placement.facility_name ?? "Facility scope"}
            </p>
          </div>
          <Status state={placement.state} />
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-6">
          <CardSection
            icon={<ShieldCheck size={20} />}
            eyebrow="Facility ownership"
            title="Ward and mentor assignment"
            detail="Only save a change when the operational owner or ward actually changes."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Assignment
                label="Ward"
                value={ward}
                onChange={setWard}
                disabled={!canWard || busy}
                options={data.options.wards.map(
                  (item) =>
                    [item.id, `${item.name} · ${item.facility_name}`] as [
                      string,
                      string,
                    ],
                )}
                empty="No ward allocated"
              />
              <Assignment
                label="Mentor"
                value={mentor}
                onChange={setMentor}
                disabled={!canMentor || busy}
                options={data.options.mentors.map(
                  (item) =>
                    [
                      item.id,
                      `${item.name} · ${item.active_placements}/${item.max_active_placements} students${item.accepting_students ? "" : " · not accepting"}`,
                    ] as [string, string],
                )}
                empty="No mentor assigned"
              />
            </div>
            {(wardChanged || mentorChanged) && (
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  size="sm"
                  disabled={busy || !wardChanged}
                  onClick={() =>
                    void run(() => allocateWard(placement.id, ward))
                  }
                >
                  Save ward
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !mentorChanged}
                  onClick={() =>
                    void run(() => assignMentor(placement.id, mentor))
                  }
                >
                  Save mentor
                </Button>
              </div>
            )}
          </CardSection>
          <CardSection
            icon={<ClipboardCheck size={20} />}
            eyebrow="Progress evidence"
            title="How the placement is moving"
            detail="Operational signals only; detailed learning records remain with their owning roles."
          >
            <ProgressGrid progress={data.progress} />
          </CardSection>
          <CardSection
            icon={<Clock3 size={20} />}
            eyebrow="Placement record"
            title="Recent activity"
            detail="A traceable record of what changed and who changed it."
          >
            <ActivityList entries={data.activity} />
          </CardSection>
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border border-teal/20 bg-teal-light/40 p-6">
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Next facility action
            </p>
            <h2 className="mt-2 font-display text-xl font-bold text-navy">
              {action.label}
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
              {action.actionable
                ? "This is a facility-owned decision."
                : `${action.label}. The next step belongs to the student, mentor, or programme team.`}
            </p>
            {action.actionable && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 font-body text-xs font-bold text-teal">
                <CheckCircle2 size={14} aria-hidden="true" /> Ready for your
                review
              </p>
            )}
          </section>
          <CardSection
            icon={<UserRound size={20} />}
            eyebrow="Placement snapshot"
            title="At a glance"
          >
            <Snapshot placement={placement} />
          </CardSection>
          <LifecycleActions
            available={available}
            busy={busy}
            canPause={canPause}
            canResume={canResume}
            canComplete={canComplete}
            canWithdraw={canWithdraw}
            reasonAction={reasonAction}
            reason={reason}
            onReason={setReason}
            onChooseReason={setReasonAction}
            onCancel={() => {
              setReasonAction(null);
              setReason("");
            }}
            onRun={(kind, value) => {
              setReasonAction(null);
              setReason("");
              void run(() =>
                updatePlacementLifecycle(placement.id, kind, value),
              );
            }}
          />
        </aside>
      </section>
    </main>
  );
}

function CardSection({
  icon,
  eyebrow,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-white p-6 shadow-[0_8px_24px_rgba(8,25,53,0.04)]">
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
function Assignment({
  label,
  value,
  onChange,
  options,
  disabled,
  empty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled: boolean;
  empty: string;
}) {
  return (
    <label className="font-body text-sm font-bold text-navy">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 h-12 w-full rounded-xl border border-border bg-white px-3 font-body text-sm font-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:bg-mist"
      >
        <option value="">{empty}</option>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function Status({ state }: { state: string }) {
  return (
    <span className="rounded-full bg-white/10 px-4 py-2 font-body text-sm font-bold capitalize text-teal-bright">
      {state.replaceAll("_", " ")}
    </span>
  );
}
function ProgressGrid({ progress }: { progress: PlacementProgress }) {
  const items = [
    [
      "Orientation",
      progress.orientation?.acknowledged
        ? "Acknowledged"
        : "Awaiting acknowledgement",
    ],
    [
      "Induction",
      progress.induction.percentage === null
        ? "Not opened"
        : `${progress.induction.percentage}% complete`,
    ],
    ["Mentorship", `${progress.mentorship.sessions_logged} sessions logged`],
    [
      "Assessment",
      progress.assessment.final_submitted ? "Submitted" : "Pending",
    ],
    [
      "Safeguarding",
      progress.safeguarding.open_concerns
        ? `${progress.safeguarding.open_concerns} open concerns`
        : "No open concerns",
    ],
  ];
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 py-3"
        >
          <span className="min-w-0 font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
            {label}
          </span>
          <span className="min-w-0 break-words text-right font-body text-sm font-semibold text-navy">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}
function Snapshot({ placement }: { placement: Placement }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Info
        label="Planned window"
        value={`${placement.planned_start} → ${placement.planned_end}`}
      />
      <Info
        label="Student email"
        value={placement.student?.email ?? "Pending"}
      />
      <Info label="Ward" value={placement.ward?.name ?? "Not allocated"} />
      <Info label="Mentor" value={placement.mentor?.name ?? "Not assigned"} />
    </dl>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-body text-sm font-semibold text-navy">
        {value}
      </dd>
    </div>
  );
}
function ActivityList({ entries }: { entries: PlacementActivityEntry[] }) {
  return entries.length ? (
    <ol className="space-y-4">
      {entries.slice(0, 6).map((entry) => (
        <li key={entry.id} className="border-l-2 border-teal pl-4">
          <p className="font-body text-sm font-semibold text-navy">
            {entry.action.replaceAll("_", " ")}
          </p>
          <p className="mt-1 font-body text-xs text-navy-muted">
            {entry.actor} · {new Date(entry.occurred_at).toLocaleString()}
          </p>
          {entry.override_reason && (
            <p className="mt-2 font-body text-xs text-navy-muted">
              Reason: {entry.override_reason}
            </p>
          )}
        </li>
      ))}
    </ol>
  ) : (
    <p className="rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">
      No placement activity has been recorded yet.
    </p>
  );
}
function LifecycleActions({
  available,
  busy,
  canPause,
  canResume,
  canComplete,
  canWithdraw,
  reasonAction,
  reason,
  onReason,
  onChooseReason,
  onCancel,
  onRun,
}: {
  available: string[];
  busy: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
  canWithdraw: boolean;
  reasonAction: "pause" | "withdraw" | null;
  reason: string;
  onReason: (value: string) => void;
  onChooseReason: (value: "pause" | "withdraw") => void;
  onCancel: () => void;
  onRun: (
    kind: "pause" | "resume" | "complete" | "withdraw",
    reason?: string,
  ) => void;
}) {
  const show = (state: string) => available.includes(state);
  const canAct = (state: string, capability: boolean) => show(state) && capability;
  return (
    <CardSection
      icon={<CheckCircle2 size={20} />}
      eyebrow="Lifecycle"
      title="Facility actions"
      detail="Only commands currently available to your role are shown."
    >
      <div className="flex flex-wrap gap-3">
        {canAct("pause", canPause) && (
          <Button
            size="sm"
            variant="tertiary"
            disabled={busy}
            onClick={() => onChooseReason("pause")}
          >
            Pause placement
          </Button>
        )}
        {canAct("resume", canResume) && (
          <Button size="sm" disabled={busy} onClick={() => onRun("resume")}>
            Resume placement
          </Button>
        )}
        {canAct("complete", canComplete) && (
          <Button size="sm" disabled={busy} onClick={() => onRun("complete")}>
            Complete placement
          </Button>
        )}
        {canAct("withdraw", canWithdraw) && (
          <Button
            size="sm"
            variant="tertiary"
            disabled={busy}
            onClick={() => onChooseReason("withdraw")}
          >
            Withdraw placement
          </Button>
        )}
        {!canAct("pause", canPause) &&
          !canAct("resume", canResume) &&
          !canAct("complete", canComplete) &&
          !canAct("withdraw", canWithdraw) && (
            <p className="font-body text-sm text-navy-muted">
              No facility lifecycle action is available right now.
            </p>
          )}
      </div>
      {reasonAction && (
        <div className="mt-5 rounded-xl border border-border bg-mist/50 p-4">
          <label className="font-body text-sm font-bold text-navy">
            Why is this placement being{" "}
            {reasonAction === "pause" ? "paused" : "withdrawn"}?
            <textarea
              value={reason}
              onChange={(event) => onReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-border bg-white p-3 font-body text-sm outline-none focus:border-teal"
            />
          </label>
          <div className="mt-3 flex gap-3">
            <Button
              size="sm"
              disabled={!reason.trim() || busy}
              onClick={() => onRun(reasonAction, reason.trim())}
            >
              Confirm
            </Button>
            <Button size="sm" variant="tertiary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </CardSection>
  );
}
function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-48 rounded-3xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error"
    >
      We could not load this facility placement.
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
