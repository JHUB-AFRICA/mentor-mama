import { lazy, Suspense, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sprout,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getActivity,
  getAdminTrainingModules,
  getLibrary,
  getDashboardIndicators,
  getDashboardSummary,
  getProgrammeSettings,
  type ActivityEntry,
  type CurrentUser,
} from "../../services/api";
import { InviteMemberModal } from "./InviteMemberModal";
import {
  ProgrammeAdminFrame,
  type ProgrammeAdminNav,
} from "./ProgrammeAdminFrame";
import type { AuthoringKind } from "../content/ContentAuthoringWorkspace";
import { PortalWorkspaceSkeleton } from "../../components/PortalWorkspaceSkeleton";
import { useToast } from "../../components/ToastProvider";

const AccountSettings = lazy(() =>
  import("../auth/AccountSettings").then((module) => ({
    default: module.AccountSettings,
  })),
);
const PeopleTable = lazy(() =>
  import("./PeopleTable").then((module) => ({ default: module.PeopleTable })),
);
const MFARecoveryInbox = lazy(() =>
  import("./MFARecoveryInbox").then((module) => ({ default: module.MFARecoveryInbox })),
);
const ActivityTimeline = lazy(() =>
  import("./ActivityTimeline").then((module) => ({
    default: module.ActivityTimeline,
  })),
);
const ProgrammeSettings = lazy(() =>
  import("./ProgrammeSettings").then((module) => ({
    default: module.ProgrammeSettings,
  })),
);
const Reports = lazy(() =>
  import("./Reports").then((module) => ({ default: module.Reports })),
);
const ContentLibrary = lazy(() =>
  import("../content/ContentLibrary").then((module) => ({
    default: module.ContentLibrary,
  })),
);
const ContentDetailScreen = lazy(() =>
  import("../content/ContentDetailScreen").then((module) => ({
    default: module.ContentDetailScreen,
  })),
);
const ContentAuthoringWorkspace = lazy(() =>
  import("../content/ContentAuthoringWorkspace").then((module) => ({
    default: module.ContentAuthoringWorkspace,
  })),
);

type AdminView =
  | "overview"
  | "people"
  | "recovery"
  | "setup"
  | "content"
  | "content-detail"
  | "content-authoring"
  | "reports"
  | "activity"
  | "account";
type AccountTab =
  | "overview"
  | "security"
  | "profile"
  | "notifications"
  | "preferences"
  | "devices"
  | "support"
  | "recovery";
type SetupSection = "identity" | "directory" | "access";
type SetupStep = {
  number: string;
  title: string;
  detail: string;
  status: string;
  onClick: () => void;
  actions?: Array<{ label: string; onClick: () => void }>;
};

function authoringKindFromPath(pathname: string): AuthoringKind {
  const kind = pathname.split("/").pop();
  return kind === "module" || kind === "document" || kind === "external"
    ? kind
    : "guide";
}

function contentDetailFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const kind = parts[3];
  const id = parts[4];
  return {
    kind:
      kind === "module" ||
      kind === "document" ||
      kind === "external" ||
      kind === "guide"
        ? kind
        : "guide",
    id: id ?? "",
  } as const;
}

function viewFromPath(pathname: string): AdminView {
  if (pathname.startsWith("/admin/people/recovery")) return "recovery";
  if (pathname.startsWith("/admin/content/item/")) return "content-detail";
  if (pathname.startsWith("/admin/content/new/")) return "content-authoring";
  if (pathname.endsWith("/people")) return "people";
  if (pathname.endsWith("/activity")) return "activity";
  if (pathname.endsWith("/reports")) return "reports";
  if (pathname.endsWith("/content")) return "content";
  if (pathname.endsWith("/account")) return "account";
  if (pathname.endsWith("/settings")) return "setup";
  return "overview";
}

function titleForView(view: AdminView) {
  return view === "overview"
    ? "Overview"
    : view === "people"
      ? "People & access"
      : view === "recovery"
        ? "Authenticator recovery"
      : view === "setup"
        ? "Programme setup"
        : view === "content" ||
            view === "content-authoring" ||
            view === "content-detail"
          ? "Content library"
          : view === "reports"
            ? "Reports"
            : view === "account"
              ? "Account settings"
              : "Activity";
}

function accountTabFromUrl(search: string): AccountTab {
  const value = new URLSearchParams(search).get("tab");
  return value === "overview" ||
    value === "profile" ||
    value === "preferences" ||
    value === "devices" ||
    value === "support" ||
    value === "notifications" ||
    value === "recovery"
    ? value
    : "security";
}

export function ProgramAdminDashboard({
  user,
  onSignedOut,
  onError,
  onUserUpdated,
}: {
  user: CurrentUser;
  onSignedOut: () => void;
  onError: (message: string) => void;
  onUserUpdated: (user: CurrentUser) => void;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigateRoute = useNavigate();
  const view = viewFromPath(location.pathname);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountTab = accountTabFromUrl(location.search);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInitialRole, setInviteInitialRole] = useState<
    "coordinator" | "nurse_manager" | null
  >(null);
  const [notice, setNotice] = useState<{ message: string } | null>(null);

  function navigate(destination: ProgrammeAdminNav) {
    const path =
      destination === "overview"
        ? "/admin"
        : destination === "placements"
          ? "/placements"
          : destination === "setup"
            ? "/admin/settings"
            : `/admin/${destination}`;
    navigateRoute(path);
    setAccountOpen(false);
  }

  function openSetupSection(section: SetupSection) {
    navigateRoute(`/admin/settings?section=${section}`);
    setAccountOpen(false);
  }

  function openAccount(tab: AccountTab = "overview") {
    navigateRoute(`/admin/account?tab=${tab}`);
    setAccountOpen(true);
  }

  function openInvite(role: "coordinator" | "nurse_manager" | null = null) {
    setNotice(null);
    setInviteInitialRole(role);
    setInviteOpen(true);
  }

  const pageContent =
    accountOpen || view === "account" ? (
      <AccountSettings
        user={user}
        onSignedOut={onSignedOut}
        onError={onError}
        onUserUpdated={onUserUpdated}
        initialTab={accountTab}
      />
    ) : view === "setup" ? (
      <ProgrammeSettings onError={onError} onInviteRole={openInvite} />
    ) : view === "content" ? (
      <ContentLibrary user={user} onError={onError} />
    ) : view === "content-detail" ? (
      <ContentDetailScreen
        {...contentDetailFromPath(location.pathname)}
        user={user}
        onBack={() => navigate("content")}
        onError={onError}
      />
    ) : view === "content-authoring" ? (
      <ContentAuthoringWorkspace
        kind={authoringKindFromPath(location.pathname)}
        editId={new URLSearchParams(location.search).get("edit") ?? undefined}
        onBack={() => navigate("content")}
        onError={onError}
        onSaved={() => navigate("content")}
      />
    ) : view === "people" ? (
      <PeopleTable
        onInvite={() => {
          openInvite();
        }}
        onOpenRecovery={() => navigateRoute("/admin/people/recovery")}
      />
    ) : view === "recovery" ? (
      <MFARecoveryInbox />
    ) : view === "reports" ? (
      <Reports user={user} onError={onError} />
    ) : view === "activity" ? (
      <ActivityTimeline />
    ) : (
      <Overview
        user={user}
        onInvite={() => {
          openInvite();
        }}
        onInviteRole={openInvite}
        onPeople={() => navigate("people")}
        onSetup={() => navigate("setup")}
        onSetupSection={openSetupSection}
        onActivity={() => navigate("activity")}
        onPlacements={() => navigate("placements")}
        onContent={() => navigate("content")}
        onAccountSecurity={() => openAccount("security")}
      />
    );

  return (
    <ProgrammeAdminFrame
      user={user}
      active={
        view === "account"
          ? "overview"
          : view === "content-authoring" || view === "content-detail"
            ? "content"
            : view === "recovery"
              ? "people"
            : view
      }
      title={titleForView(view)}
      onNavigate={navigate}
      onSettings={() => openAccount("security")}
      onAccount={openAccount}
      onSignedOut={onSignedOut}
      onError={onError}
    >
      {notice && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 border-l-2 border-teal bg-teal-light/40 px-4 py-3 font-body text-sm font-semibold text-teal"
        >
          <span>{notice.message}</span>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={() => navigate("people")}
          >
            Review invitations
          </Button>
        </div>
      )}
      <Suspense
        fallback={
          <PortalWorkspaceSkeleton
            role="program_admin"
            pathname={location.pathname}
            includeShell={false}
          />
        }
      >
        {pageContent}
      </Suspense>
      <InviteMemberModal
        open={inviteOpen}
        initialRole={inviteInitialRole}
        onClose={() => {
          setInviteOpen(false);
          setInviteInitialRole(null);
        }}
        onError={onError}
        onSuccess={({ roleLabel, scopeName }) => {
          const message = `${roleLabel} invitation for ${scopeName} was queued for delivery. Access stays pending until they accept the secure invitation.`;
          setNotice({ message });
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
            queryClient.invalidateQueries({ queryKey: ["programme-people"] }),
          ]);
          pushToast({ kind: "success", title: "Invitation queued", message });
        }}
      />
    </ProgrammeAdminFrame>
  );
}

function Overview({
  user,
  onInvite,
  onInviteRole,
  onPeople,
  onSetup,
  onSetupSection,
  onActivity,
  onPlacements,
  onContent,
  onAccountSecurity,
}: {
  user: CurrentUser;
  onInvite: () => void;
  onInviteRole: (role: "coordinator" | "nurse_manager") => void;
  onPeople: () => void;
  onSetup: () => void;
  onSetupSection: (section: SetupSection) => void;
  onActivity: () => void;
  onPlacements: () => void;
  onContent: () => void;
  onAccountSecurity: () => void;
}) {
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    staleTime: 15_000,
  });
  const activity = useQuery({
    queryKey: ["programme-activity", "overview"],
    queryFn: () => getActivity(1, 4),
    staleTime: 15_000,
  });
  const content = useQuery({
    queryKey: ["admin-library-overview"],
    queryFn: () => getLibrary(),
    staleTime: 30_000,
  });
  const programme = useQuery({
    queryKey: ["programme-settings"],
    queryFn: getProgrammeSettings,
    staleTime: 60_000,
  });
  const trainingModules = useQuery({
    queryKey: ["admin-training-modules"],
    queryFn: getAdminTrainingModules,
    staleTime: 30_000,
    enabled: Boolean(programme.data?.require_mentor_training_before_placement),
  });
  const indicators = useQuery({
    queryKey: ["dashboard-indicators"],
    queryFn: getDashboardIndicators,
    staleTime: 30_000,
  });
  const data = summary.data;
  const readiness = data?.readiness;
  const pendingInvites = data?.invited_people ?? 0;
  const activePeople = data?.active_people ?? 0;
  const items = content.data?.data ?? [];
  const drafts = items.filter((item) => item.status === "draft").length;
  const published = items.filter((item) => item.status === "published").length;
  const archived = items.filter((item) => item.status === "archived").length;
  const activePlacements = indicators.data?.indicators.placements_active ?? 0;
  const trainingRequired = Boolean(
    programme.data?.require_mentor_training_before_placement,
  );
  const requiredTrainingPublished = Boolean(
    trainingModules.data?.some(
      (module) =>
        module.is_required &&
        module.status === "published" &&
        module.visible_roles.includes("mentor"),
    ),
  );
  const setupLoading =
    summary.isPending ||
    programme.isPending ||
    (trainingRequired && trainingModules.isPending);
  const setupError =
    summary.isError ||
    programme.isError ||
    (trainingRequired && trainingModules.isError);
  const overviewLoading = setupLoading || indicators.isPending;
  const overviewError = setupError || indicators.isError;
  const identityComplete = Boolean(programme.data?.name.trim());
  const directory = readiness;
  const directoryComplete = Boolean(
    directory &&
    directory.institutions > 0 &&
    directory.facilities > 0 &&
    directory.wards > 0,
  );
  const directoryReviewed = Boolean(programme.data?.directory_reviewed_at);
  const operationalLeadsActive = Boolean(
    directory &&
    directory.active_coordinators > 0 &&
    directory.active_nurse_managers > 0,
  );
  const pendingCoordinatorInvitations = readiness?.invited_coordinators ?? 0;
  const pendingNurseManagerInvitations = readiness?.invited_nurse_managers ?? 0;
  const pendingOperationalInvitations =
    pendingCoordinatorInvitations + pendingNurseManagerInvitations;
  const coreSetupComplete =
    !setupLoading &&
    !setupError &&
    identityComplete &&
    directoryComplete &&
    directoryReviewed &&
    operationalLeadsActive &&
    (!trainingRequired || requiredTrainingPublished);
  const nextSetupStep = !identityComplete
    ? "identity"
    : !directoryComplete
      ? "directory"
      : !directoryReviewed
        ? "directory-review"
        : !operationalLeadsActive
          ? "people"
          : trainingRequired && !requiredTrainingPublished
            ? "content"
            : null;
  const outstandingSetupCount =
    setupLoading || setupError
      ? 0
      : Number(!identityComplete) +
        Number(!directoryComplete) +
        Number(directoryComplete && !directoryReviewed) +
        Number(!operationalLeadsActive) +
        Number(trainingRequired && !requiredTrainingPublished);
  const attentionCount =
    pendingInvites +
    (readiness?.placements_missing_setup ?? 0) +
    drafts +
    outstandingSetupCount;
  const attentionUnavailable = setupLoading || setupError || content.isPending || content.isError;
  const invitationCount = displayCount(
    summary.isPending,
    summary.isError,
    pendingInvites,
  );
  const missingSetupCount = displayCount(
    summary.isPending,
    summary.isError,
    readiness?.placements_missing_setup ?? 0,
  );
  const draftCount = displayCount(content.isPending, content.isError, drafts);
  const primaryAction = setupLoading
    ? { label: "Checking programme setup…", run: onSetup, disabled: true }
    : setupError
      ? { label: "Review programme setup", run: onSetup, disabled: false }
      : nextSetupStep === "identity"
        ? {
            label: "Confirm programme identity",
            run: () => onSetupSection("identity"),
            disabled: false,
          }
        : nextSetupStep === "directory"
          ? {
              label: "Set up programme directory",
              run: () => onSetupSection("directory"),
              disabled: false,
            }
          : nextSetupStep === "directory-review"
            ? {
                label: "Confirm pilot directory coverage",
                run: () => onSetupSection("identity"),
                disabled: false,
              }
            : nextSetupStep === "people"
              ? {
                  label:
                    pendingOperationalInvitations > 0
                      ? "Review staff invitations"
                      : readiness?.active_coordinators === 0
                        ? "Invite a Coordinator"
                        : "Invite a Nurse Manager",
                  run:
                    pendingOperationalInvitations > 0
                      ? onPeople
                      : () =>
                          onInviteRole(
                            readiness?.active_coordinators === 0
                              ? "coordinator"
                              : "nurse_manager",
                          ),
                  disabled: false,
                }
              : nextSetupStep === "content"
                ? {
                    label: "Prepare required mentor training",
                    run: onContent,
                    disabled: false,
                  }
                : {
                    label: "Invite another person",
                    run: onInvite,
                    disabled: false,
                  };
  const setupSteps: SetupStep[] = [
    {
      number: "1",
      title: "Programme identity",
      detail: programme.isError
        ? "Programme identity could not be checked. Open setup to retry."
        : programme.isPending
          ? "Checking programme identity…"
          : identityComplete
            ? `${programme.data.name} is on your programme record.`
            : "Add the programme name and operating details.",
      status: programme.isError
        ? "Unavailable"
        : programme.isPending
          ? "Checking"
          : identityComplete
            ? "Complete"
            : "Needs setup",
      onClick: () => onSetupSection("identity"),
    },
    {
      number: "2",
      title: "Active programme directory",
      detail: summary.isError
        ? "Directory readiness could not be checked. Open setup to retry."
        : summary.isPending
          ? "Checking programme directory…"
          : directoryComplete && directoryReviewed
            ? `${readiness?.institutions ?? 0} institutions · ${readiness?.facilities ?? 0} facilities · ${readiness?.wards ?? 0} wards. Pilot coverage reviewed by ${programme.data?.directory_reviewed_by_name || "a Programme Administrator"}.`
            : directoryComplete
              ? `${readiness?.institutions ?? 0} institutions · ${readiness?.facilities ?? 0} facilities · ${readiness?.wards ?? 0} wards. Confirm these active records cover the pilot.`
              : "Add the scopes your Coordinators and Nurse Managers will need.",
      status: summary.isError
        ? "Unavailable"
        : summary.isPending
          ? "Checking"
          : directoryComplete && directoryReviewed
            ? "Complete"
            : directoryComplete
              ? "Needs review"
              : readiness && readiness.institutions + readiness.facilities > 0
                ? "In progress"
                : "Needs setup",
      onClick: () =>
        onSetupSection(directoryComplete ? "identity" : "directory"),
    },
    {
      number: "3",
      title: "Operational lead access",
      detail: summary.isError
        ? "Team readiness could not be checked. Open People & access to retry."
        : summary.isPending
          ? "Checking operational access…"
          : `${readiness?.active_coordinators ?? 0} active Coordinators · ${pendingCoordinatorInvitations} pending · ${readiness?.active_nurse_managers ?? 0} active Nurse Managers · ${pendingNurseManagerInvitations} pending. Pending means the invitation is awaiting acceptance; it does not confirm email delivery or account activation.`,
      status: summary.isError
        ? "Unavailable"
        : summary.isPending
          ? "Checking"
          : operationalLeadsActive
            ? "Complete"
            : pendingOperationalInvitations > 0
              ? "Invitations pending"
              : "Needs setup",
      onClick: onPeople,
      actions:
        directoryComplete && !summary.isPending && !summary.isError
          ? [
              {
                label: "Invite Coordinator",
                onClick: () => onInviteRole("coordinator"),
              },
              {
                label: "Invite Nurse Manager",
                onClick: () => onInviteRole("nurse_manager"),
              },
            ]
          : undefined,
    },
    ...(trainingRequired
      ? [
          {
            number: "4",
            title: "Required mentor training",
            detail: trainingModules.isError
              ? "Required training status could not be checked. Open the content library to retry."
              : trainingModules.isPending
                ? "Checking required learning modules…"
                : requiredTrainingPublished
                  ? "A required module is published for the mentor audience."
                  : "Publish at least one required module before placement release.",
            status: trainingModules.isError
              ? "Unavailable"
              : trainingModules.isPending
                ? "Checking"
                : requiredTrainingPublished
                  ? "Complete"
                  : "Review access",
            onClick: onContent,
          },
        ]
      : []),
  ];
  const completedSetupSteps = setupSteps.filter(
    (step) => step.status === "Complete",
  ).length;
  const activeSetupStepIndex = setupSteps.findIndex(
    (step) => step.status !== "Complete",
  );
  const allSetupStepsComplete =
    setupSteps.length > 0 && completedSetupSteps === setupSteps.length;

  return (
    <div className="programme-admin-overview">
      <section className="programme-admin-overview-hero">
        <div className="programme-admin-overview-intro">
          <p className="font-body text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal">
            Programme Administrator
          </p>
          <p className="font-body text-sm font-semibold text-navy">
            Welcome, {user.name}
          </p>
          <h2 className="mt-2 font-display text-4xl font-bold leading-none tracking-tight text-navy sm:text-5xl">
            Programme overview
          </h2>
          <p className="mt-3 max-w-lg font-body text-base leading-6 text-navy-muted">
            Review programme readiness, pending actions, and placement handoffs.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-xs font-semibold text-navy-muted">
            <span className="inline-flex items-center gap-2">
              <span
                className={`size-2.5 rounded-full ${overviewError || content.isError ? "bg-error" : overviewLoading || content.isPending ? "bg-navy-muted/40" : attentionCount > 0 ? "bg-warning" : "bg-success"}`}
              />
              {overviewError
                ? "Programme readiness unavailable"
                : overviewLoading
                  ? "Checking programme setup"
                  : content.isError
                    ? "Attention summary unavailable"
                  : !coreSetupComplete
                    ? "Setup in progress"
                    : attentionCount > 0
                      ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention`
                      : "Initial setup recorded"}
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <span className="inline-flex items-center gap-2">
              <Clock3 size={14} className="text-teal" />
              Last activity{" "}
              {activity.isPending
                ? "Checking…"
                : activity.isError
                  ? "Unavailable"
                  : activity.data?.results[0]
                    ? relativeTime(activity.data.results[0].occurred_at)
                    : "No recent activity recorded"}
            </span>
          </div>
        </div>
        <Button
          size="md"
          className="programme-admin-hero-invite self-center lg:self-center"
          onClick={primaryAction.run}
          disabled={primaryAction.disabled}
        >
          {primaryAction.label === "Invite another person" && (
            <Plus size={17} className="mr-2" />
          )}
          {primaryAction.label}
        </Button>
      </section>

      {!allSetupStepsComplete && (
        <section
          className="programme-admin-setup-progress rounded-2xl border border-border bg-white p-5 shadow-[0_4px_24px_rgba(13,27,51,0.035)] sm:p-6"
          aria-labelledby="getting-started-heading"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Programme setup
              </p>
              <h3
                id="getting-started-heading"
                className="mt-1 font-display text-xl font-bold text-navy"
              >
                Getting started
              </h3>
              <p className="mt-1 max-w-2xl font-body text-sm leading-6 text-navy-muted">
                Complete these steps to prepare your programme for placement
                handoffs.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start rounded-full bg-mist px-3 py-1.5 font-body text-xs font-semibold text-navy-muted sm:self-center">
              <span className="programme-admin-setup-progress-count">
                {completedSetupSteps}/{setupSteps.length}
              </span>
              <span>
                {setupError ? "status unavailable" : "steps complete"}
              </span>
            </div>
          </div>
          <div
            className="programme-admin-setup-stepper"
            style={
              {
                "--setup-step-count": setupSteps.length,
                "--setup-inset": `${(50 / setupSteps.length).toFixed(3)}%`,
                "--setup-progress": `${Math.max(0, completedSetupSteps - 1) * (100 / setupSteps.length)}%`,
              } as React.CSSProperties
            }
            role="list"
            aria-label={`${completedSetupSteps} of ${setupSteps.length} programme setup steps complete`}
          >
            <span
              className="programme-admin-setup-stepper-track"
              aria-hidden="true"
            />
            <span
              className="programme-admin-setup-stepper-fill"
              aria-hidden="true"
            />
            {setupSteps.map((step, index) => (
              <div
                className={`programme-admin-setup-step${step.status === "Complete" ? " is-complete" : ""}${index === activeSetupStepIndex ? " is-current" : ""}${step.status === "Unavailable" ? " is-unavailable" : ""}`}
                key={step.number}
                role="listitem"
              >
                <button
                  type="button"
                  onClick={step.onClick}
                  aria-label={`${step.title}. ${step.status}. ${step.detail}`}
                  aria-current={
                    index === activeSetupStepIndex ? "step" : undefined
                  }
                  className="programme-admin-setup-step-button"
                >
                  <span
                    className="programme-admin-setup-step-marker"
                    aria-hidden="true"
                  >
                    {step.status === "Complete" ? (
                      <CheckCircle2 size={19} />
                    ) : (
                      step.number
                    )}
                  </span>
                  <span className="programme-admin-setup-step-copy">
                    <span className="programme-admin-setup-step-title">
                      {step.title}
                    </span>
                    <span className="programme-admin-setup-step-status">
                      {step.status}
                    </span>
                    <span className="programme-admin-setup-step-detail">
                      {step.detail}
                    </span>
                  </span>
                </button>
                {step.actions?.length ? (
                  <div className="programme-admin-setup-step-actions">
                    {step.actions.map((action) => (
                      <Button
                        key={action.label}
                        type="button"
                        size="sm"
                        variant="tertiary"
                        onClick={(event) => {
                          event.stopPropagation();
                          action.onClick();
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {(overviewError || content.isError) && (
        <div className="flex flex-col justify-between gap-3 border-l-2 border-error bg-error/5 px-4 py-3 sm:flex-row sm:items-center">
          <p className="font-body text-sm text-error">
            Some programme overview data could not be loaded. Check the status
            below before treating the programme as clear.
          </p>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => {
              void summary.refetch();
              void indicators.refetch();
              void programme.refetch();
              void content.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      )}

      <div className="programme-admin-overview-grid">
        <Panel
          className="programme-admin-overview-panel--attention"
          title="Needs attention"
          badge={
            attentionUnavailable
              ? setupError || content.isError
                ? "Unavailable"
                : "Checking…"
              : `${attentionCount} item${attentionCount === 1 ? "" : "s"}`
          }
          tone={
            overviewError || content.isError || !coreSetupComplete
              ? "warning"
              : attentionCount > 0
                ? "alert"
                : "success"
          }
        >
          <p className="programme-admin-panel-intro">
            Items requiring your decision or follow-up.
          </p>
          {!coreSetupComplete && (
            <AttentionItem
              icon={<Building2 />}
              count={setupError ? "—" : outstandingSetupCount}
              title="Programme setup"
              detail={
                setupError
                  ? "Setup readiness is unavailable. Review the configuration checks."
                  : "Complete the first-use steps before relying on programme readiness."
              }
              onClick={primaryAction.run}
              tone="warning"
            />
          )}
          <AttentionItem
            icon={<Users />}
            count={invitationCount}
            title="Pending invitations"
            detail="Invitations awaiting acceptance."
            onClick={onPeople}
            tone="error"
          />
          <AttentionItem
            icon={<TriangleAlert />}
            count={missingSetupCount}
            title="Placements missing setup"
            detail="Handoffs cannot proceed until resolved."
            onClick={onPlacements}
            tone="warning"
          />
          <AttentionItem
            icon={<FileText />}
            count={draftCount}
            title="Draft content to review"
            detail="Check audience, completeness, and visibility before publishing."
            onClick={onContent}
            tone="info"
          />
        </Panel>
        <Panel
          className="programme-admin-overview-panel--readiness"
          title="Programme readiness"
          badge={
            overviewError
              ? "Unavailable"
              : overviewLoading
                ? "Checking…"
                : coreSetupComplete
                  ? "Core setup recorded"
                  : "Setup in progress"
          }
          tone={
            overviewError
              ? "warning"
              : overviewLoading
                ? "default"
                : coreSetupComplete
                  ? "success"
                  : "warning"
          }
        >
          <ReadinessRow
            icon={<Building2 />}
            title="Operating context"
            detail={
              summary.isPending
                ? "Loading programme setup…"
                : summary.isError
                  ? "Could not load programme setup"
                  : `${readiness?.institutions ?? 0} institutions · ${readiness?.facilities ?? 0} facilities · ${readiness?.wards ?? 0} wards`
            }
            onClick={() => onSetupSection("directory")}
          />
          <ReadinessRow
            icon={<Users />}
            title="People & access"
            detail={
              summary.isPending
                ? "Loading account totals…"
                : summary.isError
                  ? "Could not load account totals"
                  : `${activePeople} active · ${pendingInvites} pending · ${data?.suspended_people ?? 0} suspended team accounts; excludes your account`
            }
            onClick={onPeople}
          />
          <ReadinessRow
            icon={<FileText />}
            title="Handoffs & placements"
            detail={
              indicators.isPending || summary.isPending
                ? "Loading placement readiness…"
                : indicators.isError || summary.isError
                  ? "Could not load placement readiness"
                  : `${activePlacements} active · ${readiness?.placements_missing_setup ?? 0} missing setup · ${readiness?.unassigned_placements ?? 0} unassigned`
            }
            onClick={onPlacements}
          />
        </Panel>
        <Panel
          className="programme-admin-overview-panel--activity"
          title="Recent programme activity"
          action="View all"
          onClick={onActivity}
        >
          {activity.isPending ? (
            <ActivitySkeleton />
          ) : activity.isError ? (
            <div className="flex flex-col items-start gap-3 py-3">
              <p className="font-body text-sm text-error">
                Recent activity could not be loaded.
              </p>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => void activity.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : activity.data?.results.length ? (
            <div className="divide-y divide-border">
              {activity.data.results.map((entry) => (
                <RecentActivity key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyPanel text="Activity will appear here as your team works." />
          )}
        </Panel>
        <Panel
          className="programme-admin-overview-panel--governance"
          title="Programme governance"
          action="View policy"
          onClick={() => onSetupSection("access")}
        >
          <GovernanceRow
            icon={<LockKeyhole />}
            title="Access policy"
            detail="Server enforced role capabilities"
            status="Enforced"
            onClick={() => onSetupSection("access")}
          />
          <GovernanceRow
            icon={<ShieldCheck />}
            title="Multi-factor authentication"
            detail="Required for Programme Admin, Coordinator, and Nurse Manager accounts; optional for Mentors and Students"
            status="Enforced"
            onClick={onAccountSecurity}
          />
          <GovernanceRow
            icon={<BookOpen />}
            title="Content library"
            detail={
              content.isPending
                ? "Loading library status…"
                : content.isError
                  ? "Could not load library status"
                  : `${published} published · ${drafts} drafts · ${archived} archived`
            }
            status={
              content.isError ? "Unavailable" : drafts ? "Review" : "Healthy"
            }
            onClick={onContent}
          />
          <GovernanceRow
            icon={<Sprout />}
            title="Programme configuration"
            detail="Institutions, facilities, wards and directory"
            onClick={() => onSetupSection("identity")}
          />
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  className = "",
  title,
  badge,
  action,
  onClick,
  tone = "default",
  children,
}: {
  className?: string;
  title: string;
  badge?: string;
  action?: string;
  onClick?: () => void;
  tone?: "default" | "alert" | "success" | "warning";
  children: React.ReactNode;
}) {
  const badgeClass =
    tone === "alert"
      ? "bg-error/10 text-error"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : tone === "success"
          ? "bg-teal-light text-teal"
          : "bg-mist text-navy-muted";
  return (
    <section
      className={`programme-admin-panel rounded-2xl border border-border bg-white shadow-[0_4px_24px_rgba(13,27,51,0.035)] ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-display text-2xl font-bold tracking-tight text-navy">
          {title}
        </h3>
        <div className="flex items-center gap-3">
          {badge && (
            <span
              className={`rounded-full px-3 py-1.5 font-body text-xs font-bold ${badgeClass}`}
            >
              {badge}
            </span>
          )}
          {action && onClick && (
            <button
              type="button"
              onClick={onClick}
              className="hidden min-h-10 items-center gap-1 font-body text-xs font-semibold text-teal hover:text-navy sm:inline-flex"
            >
              {action}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function AttentionItem({
  icon,
  count,
  title,
  detail,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  count: number | string;
  title: string;
  detail: string;
  onClick: () => void;
  tone: "error" | "warning" | "info";
}) {
  const styles = {
    error: "bg-error/10 text-error",
    warning: "bg-warning/15 text-warning",
    info: "bg-sky-100 text-sky-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-border py-4 text-left last:border-b-0"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${styles[tone]}`}
      >
        {icon}
      </span>
      <span className="w-8 shrink-0 font-display text-2xl font-bold text-navy">
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-sm font-bold text-navy">
          {title}
        </span>
        <span className="mt-1 block font-body text-xs leading-5 text-navy-muted">
          {detail}
        </span>
      </span>
      <ChevronRight
        size={18}
        className="shrink-0 text-navy-muted transition group-hover:translate-x-0.5 group-hover:text-teal"
      />
    </button>
  );
}

function displayCount(isPending: boolean, isError: boolean, count: number) {
  if (isPending) return "…";
  if (isError) return "—";
  return count;
}

function ReadinessRow({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-border py-4 text-left last:border-b-0"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-sm font-bold text-navy">
          {title}
        </span>
        <span className="mt-1 block truncate font-body text-xs text-navy-muted">
          {detail}
        </span>
      </span>
      <ChevronRight
        size={17}
        className="shrink-0 text-navy-muted group-hover:text-teal"
      />
    </button>
  );
}
function RecentActivity({ entry }: { entry: ActivityEntry }) {
  const labels: Record<string, string> = {
    "account.invited": "invited a team member",
    "account.invitation_resent": "resent an invitation",
    "account.status_changed": "changed account access",
    "account.activated": "activated an account",
    "account.mfa_enabled": "enabled multi-factor authentication",
    "account.profile_updated": "updated account details",
    "account.mfa_recovery_override": "completed MFA recovery",
    "content.published": "published programme content",
  };
  return (
    <div className="flex gap-3 py-3.5">
      <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal">
        <Activity size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm text-navy">
          <strong>{entry.actor}</strong>{" "}
          {labels[entry.action] ?? formatActivityLabel(entry.action)}
        </p>
        <p className="mt-1 font-body text-xs text-navy-muted">
          {entry.actor_role.replaceAll("_", " ")} ·{" "}
          {relativeTime(entry.occurred_at)}
        </p>
      </div>
    </div>
  );
}
function GovernanceRow({
  icon,
  title,
  detail,
  status,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  status?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-border py-3 text-left"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mist text-navy-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-body text-sm font-bold text-navy">
          {title}
        </span>
        <span className="mt-1 block font-body text-xs text-navy-muted">
          {detail}
        </span>
      </span>
      {status && (
        <span className="hidden rounded-full bg-teal-light px-3 py-1.5 font-body text-xs font-bold text-teal sm:block">
          {status}
        </span>
      )}
      <ChevronRight
        size={16}
        className="text-navy-muted group-hover:text-teal"
      />
    </button>
  );
}
function EmptyPanel({ text }: { text: string }) {
  return <p className="py-8 font-body text-sm text-navy-muted">{text}</p>;
}
function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
function formatActivityLabel(action: string) {
  return action.replaceAll(".", " · ").replaceAll("_", " ");
}
function relativeTime(value: string) {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
