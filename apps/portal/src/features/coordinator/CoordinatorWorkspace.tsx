import { useLocation, useNavigate } from "react-router-dom";
import type { CurrentUser } from "../../services/api";
import { AccountSettings } from "../auth/AccountSettings";
import { ConcernQueue } from "../safeguarding/ConcernQueue";
import { ReportsDashboard } from "../reports/ReportsDashboard";
import { CoordinatorActivity } from "./CoordinatorActivity";
import { CoordinatorBatchDetail } from "./CoordinatorBatchDetail";
import { CoordinatorBatchManagement } from "./CoordinatorBatchManagement";
import { CoordinatorCohortDetail } from "./CoordinatorCohortDetail";
import { CoordinatorCohorts } from "./CoordinatorCohorts";
import { CoordinatorDashboard } from "./CoordinatorDashboard";
import { CoordinatorFrame, type CoordinatorNav } from "./CoordinatorFrame";
import { CoordinatorPlacementCreate } from "./CoordinatorPlacementCreate";
import { CoordinatorPlacementDetail } from "./CoordinatorPlacementDetail";
import { CoordinatorPlacementRegister } from "./CoordinatorPlacementRegister";
import { CoordinatorStudentInvites } from "./CoordinatorStudentInvites";
import { CoordinatorStudents } from "./CoordinatorStudents";
import { AllocationResult } from "./planning/AllocationResult";
import { AllocationRuns } from "./planning/AllocationRuns";
import { PlacementPlanning } from "./planning/PlacementPlanning";
import { PlacementsTabs } from "./planning/planningUi";
import { TrainingWorkspace } from "../training/TrainingWorkspace";
import { ContentLibrary } from "../content/ContentLibrary";
import { ContentDetailScreen } from "../content/ContentDetailScreen";

type AccountTab = "security" | "profile" | "notifications" | "privacy" | "recovery";

interface Route {
  nav: CoordinatorNav;
  title: string;
  crumbs?: string[];
  render: () => React.ReactNode;
}

function accountTab(search: string): AccountTab {
  const value = new URLSearchParams(search).get("tab");
  return value === "profile" || value === "notifications" || value === "privacy" || value === "recovery" ? value : "security";
}

/**
 * Coordinator workspace router. Every page sits in the same frame; list pages
 * use the shared kit, and creation or editing happens in dialogs where it can.
 */
export function CoordinatorWorkspace({
  user,
  onError,
  onSignedOut,
  onUserUpdated,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
  onSignedOut: () => void;
  onUserUpdated: (user: CurrentUser) => void;
}) {
  const location = useLocation();
  const go = useNavigate();
  const path = location.pathname.replace(/\/+$/, "");

  const navigateTo = (destination: CoordinatorNav) => go(destination === "overview" ? "/coordinator" : `/coordinator/${destination}`);
  const openAccount = (tab: AccountTab = "security") => go(`/coordinator/account?tab=${tab}`);

  const placementState = (state?: string) => go(state ? `/coordinator/placements?state=${state}` : "/coordinator/placements");

  function resolve(): Route {
    const match = (pattern: RegExp) => path.match(pattern)?.[1];

    if (path === "/coordinator/students/invite")
      return {
        nav: "students", title: "Invite students", crumbs: ["Students"],
        render: () => <CoordinatorStudentInvites user={user} onBack={() => go("/coordinator/students")} onError={onError} />,
      };
    if (path === "/coordinator/students" || path === "/coordinator/cohorts/students")
      return {
        nav: "students", title: "Students",
        render: () => <CoordinatorStudents onInvite={() => go("/coordinator/students/invite")} onError={onError} />,
      };

    const cohortId = match(/^\/coordinator\/cohorts\/([^/]+)$/);
    if (cohortId)
      return {
        nav: "cohorts", title: "Cohort", crumbs: ["Cohorts"],
        render: () => (
          <CoordinatorCohortDetail
            id={cohortId}
            onBack={() => go("/coordinator/cohorts")}
            onManageStudents={() => go("/coordinator/students?cohort_status=unassigned")}
            onInviteStudents={() => go("/coordinator/students/invite")}
            onError={onError}
          />
        ),
      };
    if (path === "/coordinator/cohorts")
      return {
        nav: "cohorts", title: "Cohorts",
        render: () => <CoordinatorCohorts onOpenCohort={(id) => go(`/coordinator/cohorts/${id}`)} onError={onError} />,
      };

    if (path === "/coordinator/placements/planning")
      return {
        nav: "placements", title: "Planning", crumbs: ["Placements"],
        render: () => <><PlacementsTabs active="planning" /><PlacementPlanning user={user} /></>,
      };
    if (path === "/coordinator/placements/runs")
      return {
        nav: "placements", title: "Allocation runs", crumbs: ["Placements"],
        render: () => <><PlacementsTabs active="runs" /><AllocationRuns /></>,
      };
    const runId = match(/^\/coordinator\/placements\/runs\/([^/]+)$/);
    if (runId)
      return {
        nav: "placements", title: "Allocation result", crumbs: ["Placements", "Allocation runs"],
        render: () => <><PlacementsTabs active="runs" /><AllocationResult runId={runId} user={user} /></>,
      };
    if (path === "/coordinator/placements/batches")
      return {
        nav: "placements", title: "Batch activity", crumbs: ["Placements"],
        render: () => <><PlacementsTabs active="batches" /><CoordinatorBatchManagement onOpen={(id) => go(`/coordinator/placements/batches/${id}`)} /></>,
      };
    const batchId = match(/^\/coordinator\/placements\/batches\/([^/]+)$/);
    if (batchId)
      return {
        nav: "placements", title: "Batch detail", crumbs: ["Placements", "Batch activity"],
        render: () => <CoordinatorBatchDetail id={batchId} onBack={() => go("/coordinator/placements/batches")} />,
      };
    const placementId = match(/^\/coordinator\/placements\/([^/]+)$/);
    if (placementId === "new")
      return {
        nav: "placements", title: "New placement", crumbs: ["Placements"],
        render: () => (
          <CoordinatorPlacementCreate
            onBack={() => go("/coordinator/placements")}
            onError={onError}
            onOpenBatch={(id) => go(`/coordinator/placements/batches/${id}`)}
          />
        ),
      };
    if (placementId)
      return {
        nav: "placements", title: "Placement", crumbs: ["Placements"],
        render: () => <CoordinatorPlacementDetail id={placementId} onBack={() => go("/coordinator/placements")} onError={onError} canOverride={Boolean(user.capabilities.override_arrangement)} />,
      };
    if (path === "/coordinator/placements")
      return {
        nav: "placements", title: "Placements",
        render: () => (
          <>
            <PlacementsTabs active="register" />
            <CoordinatorPlacementRegister
              user={user}
              onError={onError}
              onOpen={(id) => go(`/coordinator/placements/${id}`)}
              onCreate={() => go("/coordinator/placements/new")}
              onOpenBatches={() => go("/coordinator/placements/batches")}
            />
          </>
        ),
      };

    if (path === "/coordinator/safeguarding")
      return { nav: "safeguarding", title: "Safeguarding", render: () => <ConcernQueue user={user} onError={onError} /> };
    if (path === "/coordinator/reports")
      return {
        nav: "reports", title: "Reports",
        render: () => <ReportsDashboard user={user} onError={onError} onOpenSafeguarding={() => go("/coordinator/safeguarding")} />,
      };
    const libraryDetail = path.match(/^\/coordinator\/library\/(guide|module|document|external)\/([^/]+)$/);
    if (libraryDetail)
      return {
        nav: "library", title: "Library", crumbs: ["Library"],
        render: () => (
          <ContentDetailScreen kind={libraryDetail[1] as "guide" | "module" | "document" | "external"} id={decodeURIComponent(libraryDetail[2])} user={user} onBack={() => go("/coordinator/library")} onError={onError} />
        ),
      };
    if (path === "/coordinator/library")
      return { nav: "library", title: "Library", render: () => <ContentLibrary user={user} onError={onError} /> };
    if (path === "/coordinator/learning")
      return { nav: "learning", title: "Learning", render: () => <TrainingWorkspace onError={onError} role="staff" /> };
    if (path === "/coordinator/activity")
      return { nav: "activity", title: "Activity", render: () => <CoordinatorActivity user={user} /> };
    if (path === "/coordinator/account")
      return {
        nav: "account", title: "Account settings",
        render: () => (
          <AccountSettings user={user} onSignedOut={onSignedOut} onError={onError} onUserUpdated={onUserUpdated} initialTab={accountTab(location.search)} />
        ),
      };

    return {
      nav: "overview", title: "Overview",
      render: () => (
        <CoordinatorDashboard
          user={user}
          onNavigate={navigateTo}
          onCreatePlacement={() => go("/coordinator/placements/new")}
          onInvite={() => go("/coordinator/students/invite")}
          onOpenCohort={(id) => go(`/coordinator/cohorts/${id}`)}
          onOpenPlacements={placementState}
          onOpenPlanning={() => go("/coordinator/placements/planning")}
        />
      ),
    };
  }

  const route = resolve();
  return (
    <CoordinatorFrame
      user={user}
      active={route.nav}
      title={route.title}
      crumbs={route.crumbs}
      onNavigate={navigateTo}
      onAccount={openAccount}
      onSignedOut={onSignedOut}
      onError={onError}
    >
      {route.render()}
    </CoordinatorFrame>
  );
}
