import { lazy, Suspense, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  LockKeyhole,
  Plus,
  ShieldAlert,
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
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  ListRow,
  Notice,
  StatCard,
  StatGrid,
  StatusPill,
} from "./ui/AdminKit";

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
const ReportsDashboard = lazy(() =>
  import("../reports/ReportsDashboard").then((module) => ({ default: module.ReportsDashboard })),
);
const ConcernQueue = lazy(() =>
  import("../safeguarding/ConcernQueue").then((module) => ({ default: module.ConcernQueue })),
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
  | "safeguarding"
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
  if (pathname.endsWith("/safeguarding")) return "safeguarding";
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
            : view === "safeguarding"
              ? "Safeguarding"
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
        onBack={() => {
          const editing = new URLSearchParams(location.search).get("edit");
          if (editing) navigateRoute(`/admin/content/item/${authoringKindFromPath(location.pathname)}/${editing}`);
          else navigate("content");
        }}
        onError={onError}
        onSaved={(saved) =>
          saved ? navigateRoute(`/admin/content/item/${saved.kind}/${saved.id}`) : navigate("content")
        }
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
      <ReportsDashboard user={user} onError={onError} onOpenSafeguarding={() => navigate("safeguarding")} />
    ) : view === "safeguarding" ? (
      <ConcernQueue user={user} onError={onError} />
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
          ? "settings"
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
  const identityComplete = Boolean(programme.data?.name?.trim());
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

  const indicatorValues = indicators.data?.indicators ?? {};
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const statusTone =
    overviewError || content.isError
      ? "danger"
      : overviewLoading || content.isPending
        ? "neutral"
        : !coreSetupComplete || attentionCount > 0
          ? "warning"
          : "success";
  const statusText = overviewError
    ? "Programme readiness unavailable"
    : overviewLoading
      ? "Checking programme setup"
      : content.isError
        ? "Attention summary unavailable"
        : !coreSetupComplete
          ? "Setup in progress"
          : attentionCount > 0
            ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention`
            : "Initial setup recorded";
  const lastActivity = activity.isPending
    ? "Checking…"
    : activity.isError
      ? "Unavailable"
      : activity.data?.results[0]
        ? relativeTime(activity.data.results[0].occurred_at)
        : "No recent activity recorded";
  const attentionBadge = attentionUnavailable
    ? setupError || content.isError
      ? "Unavailable"
      : "Checking…"
    : `${attentionCount} item${attentionCount === 1 ? "" : "s"}`;
  const attentionTone =
    overviewError || content.isError || !coreSetupComplete
      ? "warning"
      : attentionCount > 0
        ? "danger"
        : "success";
  const readinessBadge = overviewError
    ? "Unavailable"
    : overviewLoading
      ? "Checking…"
      : coreSetupComplete
        ? "Core setup recorded"
        : "Setup in progress";
  const indicatorsUnavailable = indicators.isPending || indicators.isError;
  const openConcerns = indicatorValues.open_concerns ?? 0;
  const highConcerns = indicatorValues.high_concerns ?? 0;
  const refetchAll = () => {
    void summary.refetch();
    void indicators.refetch();
    void programme.refetch();
    void content.refetch();
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Programme administration"
        title="Programme overview"
        description={`Welcome back, ${firstName}. Review programme readiness, pending actions and placement handoffs.`}
        meta={
          <>
            <StatusPill tone={statusTone}>{statusText}</StatusPill>
            <span>
              <Clock3 size={14} className="text-teal" aria-hidden="true" />
              Last activity {lastActivity}
            </span>
          </>
        }
        actions={
          <AdminButton
            onClick={primaryAction.run}
            disabled={primaryAction.disabled}
            icon={primaryAction.label === "Invite another person" ? <Plus /> : undefined}
          >
            {primaryAction.label}
          </AdminButton>
        }
      />

      {(overviewError || content.isError) && (
        <Notice icon={<TriangleAlert />}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <span>
              <strong>Some overview data could not be loaded.</strong> Check
              the status below before treating the programme as clear.
            </span>
            <AdminButton variant="secondary" size="sm" onClick={refetchAll}>
              Try again
            </AdminButton>
          </div>
        </Notice>
      )}

      <StatGrid>
        <StatCard
          icon={<Users />}
          tone="teal"
          value={activePeople}
          label="Active team accounts"
          hint={summary.isError ? "Unavailable" : `${pendingInvites} invitation${pendingInvites === 1 ? "" : "s"} pending`}
          loading={summary.isPending || summary.isError}
          onClick={onPeople}
        />
        <StatCard
          icon={<ClipboardList />}
          tone="violet"
          value={activePlacements}
          label="Active placements"
          hint={indicators.isError ? "Unavailable" : `${indicatorValues.placements_total ?? 0} in the placement register`}
          loading={indicatorsUnavailable}
          onClick={onPlacements}
        />
        <StatCard
          icon={<CalendarCheck />}
          tone="blue"
          value={indicatorValues.sessions_this_week ?? 0}
          label="Sessions this week"
          hint={indicators.isError ? "Unavailable" : `${indicatorValues.sessions_total ?? 0} logged in total`}
          loading={indicatorsUnavailable}
        />
        <StatCard
          icon={<ShieldAlert />}
          tone={openConcerns > 0 ? "rose" : "green"}
          value={openConcerns}
          label="Open safeguarding concerns"
          hint={indicators.isError ? "Unavailable" : highConcerns > 0 ? `${highConcerns} high severity` : "None at high severity"}
          loading={indicatorsUnavailable}
        />
      </StatGrid>

      {!allSetupStepsComplete && (
        <AdminCard
          title="Getting started"
          titleId="getting-started-heading"
          description="Complete these steps to prepare your programme for placement handoffs."
          action={
            <StatusPill tone="teal" dot={false}>
              {completedSetupSteps}/{setupSteps.length}{" "}
              {setupError ? "status unavailable" : "steps complete"}
            </StatusPill>
          }
          className="programme-admin-setup-progress"
        >
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
            <span className="programme-admin-setup-stepper-track" aria-hidden="true" />
            <span className="programme-admin-setup-stepper-fill" aria-hidden="true" />
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
                  aria-current={index === activeSetupStepIndex ? "step" : undefined}
                  className="programme-admin-setup-step-button"
                >
                  <span className="programme-admin-setup-step-marker" aria-hidden="true">
                    {step.status === "Complete" ? <CheckCircle2 size={19} /> : step.number}
                  </span>
                  <span className="programme-admin-setup-step-copy">
                    <span className="programme-admin-setup-step-title">{step.title}</span>
                    <span className="programme-admin-setup-step-status">{step.status}</span>
                    <span className="programme-admin-setup-step-detail">{step.detail}</span>
                  </span>
                </button>
                {step.actions?.length ? (
                  <div className="programme-admin-setup-step-actions">
                    {step.actions.map((action) => (
                      <AdminButton
                        key={action.label}
                        variant="secondary"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          action.onClick();
                        }}
                      >
                        {action.label}
                      </AdminButton>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      <div className="pa-grid-2">
        <AdminCard
          title="Needs attention"
          description="Items requiring your decision or follow-up."
          action={<StatusPill tone={attentionTone}>{attentionBadge}</StatusPill>}
          flush
        >
          <div className="pa-list">
            {!coreSetupComplete && (
              <ListRow
                icon={<Building2 />}
                tone="amber"
                title="Programme setup"
                meta={
                  setupError
                    ? "Setup readiness is unavailable. Review the configuration checks."
                    : "Complete the first-use steps before relying on programme readiness."
                }
                value={setupError ? "—" : outstandingSetupCount}
                onClick={primaryAction.run}
              />
            )}
            <ListRow
              icon={<Users />}
              tone="rose"
              title="Pending invitations"
              meta="Invitations awaiting acceptance."
              value={invitationCount}
              onClick={onPeople}
            />
            <ListRow
              icon={<TriangleAlert />}
              tone="amber"
              title="Placements missing setup"
              meta="Handoffs cannot proceed until resolved."
              value={missingSetupCount}
              onClick={onPlacements}
            />
            <ListRow
              icon={<FileText />}
              tone="blue"
              title="Draft content to review"
              meta="Check audience, completeness and visibility before publishing."
              value={draftCount}
              onClick={onContent}
            />
          </div>
        </AdminCard>

        <AdminCard
          title="Programme readiness"
          description="The records your operational teams depend on."
          action={
            <StatusPill tone={overviewError ? "warning" : overviewLoading ? "neutral" : coreSetupComplete ? "success" : "warning"}>
              {readinessBadge}
            </StatusPill>
          }
          flush
        >
          <div className="pa-list">
            <ListRow
              icon={<Building2 />}
              title="Operating context"
              meta={
                summary.isPending
                  ? "Loading programme setup…"
                  : summary.isError
                    ? "Could not load programme setup"
                    : `${readiness?.institutions ?? 0} institutions · ${readiness?.facilities ?? 0} facilities · ${readiness?.wards ?? 0} wards`
              }
              onClick={() => onSetupSection("directory")}
            />
            <ListRow
              icon={<Users />}
              title="People & access"
              meta={
                summary.isPending
                  ? "Loading account totals…"
                  : summary.isError
                    ? "Could not load account totals"
                    : `${activePeople} active · ${pendingInvites} pending · ${data?.suspended_people ?? 0} suspended (excludes you)`
              }
              onClick={onPeople}
            />
            <ListRow
              icon={<ClipboardList />}
              title="Handoffs & placements"
              meta={
                indicators.isPending || summary.isPending
                  ? "Loading placement readiness…"
                  : indicators.isError || summary.isError
                    ? "Could not load placement readiness"
                    : `${activePlacements} active · ${readiness?.placements_missing_setup ?? 0} missing setup · ${readiness?.unassigned_placements ?? 0} unassigned`
              }
              onClick={onPlacements}
            />
          </div>
        </AdminCard>

        <AdminCard
          title="Recent programme activity"
          description="The latest changes made across your programme."
          action={
            <AdminButton variant="ghost" size="sm" onClick={onActivity}>
              View all <ArrowRight />
            </AdminButton>
          }
          flush
        >
          {activity.isPending ? (
            <ActivitySkeleton />
          ) : activity.isError ? (
            <EmptyState
              icon={<Activity size={22} />}
              title="Recent activity could not be loaded"
              action={
                <AdminButton variant="secondary" size="sm" onClick={() => void activity.refetch()}>
                  Try again
                </AdminButton>
              }
            />
          ) : activity.data?.results.length ? (
            <div className="pa-list">
              {activity.data.results.map((entry) => (
                <RecentActivity key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Activity size={22} />}
              title="No activity yet"
              text="Activity will appear here as your team works."
            />
          )}
        </AdminCard>

        <AdminCard
          title="Programme governance"
          description="The controls that keep programme data safe."
          action={
            <AdminButton variant="ghost" size="sm" onClick={() => onSetupSection("access")}>
              View policy <ArrowRight />
            </AdminButton>
          }
          flush
        >
          <div className="pa-list">
            <ListRow
              icon={<LockKeyhole />}
              tone="slate"
              title="Access policy"
              meta="Server-enforced role capabilities"
              trailing={<StatusPill tone="success">Enforced</StatusPill>}
              onClick={() => onSetupSection("access")}
            />
            <ListRow
              icon={<ShieldCheck />}
              tone="slate"
              title="Multi-factor authentication"
              meta="Required for Programme Admins, Coordinators and Nurse Managers"
              trailing={<StatusPill tone="success">Enforced</StatusPill>}
              onClick={onAccountSecurity}
            />
            <ListRow
              icon={<BookOpen />}
              tone="slate"
              title="Content library"
              meta={
                content.isPending
                  ? "Loading library status…"
                  : content.isError
                    ? "Could not load library status"
                    : `${published} published · ${drafts} drafts · ${archived} archived`
              }
              trailing={
                <StatusPill tone={content.isError ? "neutral" : drafts ? "warning" : "success"}>
                  {content.isError ? "Unavailable" : drafts ? "Review" : "Healthy"}
                </StatusPill>
              }
              onClick={onContent}
            />
            <ListRow
              icon={<Sprout />}
              tone="slate"
              title="Programme configuration"
              meta="Institutions, facilities, wards and directory"
              onClick={() => onSetupSection("identity")}
            />
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function displayCount(isPending: boolean, isError: boolean, count: number) {
  if (isPending) return "…";
  if (isError) return "—";
  return count;
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
    <ListRow
      icon={<Activity />}
      title={
        <>
          {entry.actor}{" "}
          <span className="font-normal text-navy-muted">
            {labels[entry.action] ?? formatActivityLabel(entry.action)}
          </span>
        </>
      }
      meta={`${entry.actor_role.replaceAll("_", " ")} · ${relativeTime(entry.occurred_at)}`}
    />
  );
}

function ActivitySkeleton() {
  return (
    <div className="pa-list" aria-label="Loading recent activity">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="pa-row">
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
