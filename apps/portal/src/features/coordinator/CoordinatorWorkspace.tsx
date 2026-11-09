import type { CurrentUser } from "../../services/api";
import { AccountSettings } from "../auth/AccountSettings";
import { CoordinatorDashboard } from "./CoordinatorDashboard";
import { CohortManagement } from "./CohortManagement";
import { CoordinatorPlacementRegister } from "./CoordinatorPlacementRegister";
import { CoordinatorPlacementDetail } from "./CoordinatorPlacementDetail";
import { CoordinatorPlacementCreate } from "./CoordinatorPlacementCreate";
import { CoordinatorActivity } from "./CoordinatorActivity";
import { CoordinatorReports } from "./CoordinatorReports";
import { CoordinatorStudentInvites } from "./CoordinatorStudentInvites";
import { CoordinatorStudentManagement } from "./CoordinatorStudentManagement";
import { CoordinatorBatchManagement } from "./CoordinatorBatchManagement";
import { CoordinatorBatchDetail } from "./CoordinatorBatchDetail";
import { CoordinatorCohortDetail } from "./CoordinatorCohortDetail";
import { CoordinatorFrame, type CoordinatorNav } from "./CoordinatorFrame";
import { useLocation, useNavigate } from "react-router-dom";

type View = CoordinatorNav | "account";
type AccountTab = "security" | "profile" | "notifications" | "recovery";
function viewFromPath(path: string): View {
  if (path.endsWith("/cohorts")) return "cohorts";
  if (path.endsWith("/reports")) return "reports";
  if (path.endsWith("/activity")) return "activity";
  if (path.endsWith("/account")) return "account";
  return "overview";
}
function accountTab(search: string): AccountTab {
  const value = new URLSearchParams(search).get("tab");
  return value === "profile" ||
    value === "notifications" ||
    value === "recovery"
    ? value
    : "security";
}

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
  const routerNavigate = useNavigate();
  function navigateTo(destination: CoordinatorNav) {
    routerNavigate(
      destination === "overview"
        ? "/coordinator"
        : `/coordinator/${destination}`,
    );
  }
  function openAccount(nextTab: AccountTab = "security") {
    routerNavigate(`/coordinator/account?tab=${nextTab}`);
  }
  if (location.pathname === "/coordinator/placements")
    return (
      <CoordinatorFrame
        user={user}
        active="placements"
        title="Placements"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorPlacementRegister
          user={user}
          onError={onError}
          onOpen={(id) => routerNavigate(`/coordinator/placements/${id}`)}
          onCreate={() => routerNavigate("/coordinator/placements/new")}
          onOpenBatches={() =>
            routerNavigate("/coordinator/placements/batches")
          }
        />
      </CoordinatorFrame>
    );
  const coordinatorPlacementId = location.pathname.match(
    /^\/coordinator\/placements\/([^/]+)$/,
  )?.[1];
  const coordinatorBatchId = location.pathname.match(
    /^\/coordinator\/placements\/batches\/([^/]+)$/,
  )?.[1];
  const coordinatorCohortId = location.pathname.match(
    /^\/coordinator\/cohorts\/([^/]+)$/,
  )?.[1];
  if (location.pathname === "/coordinator/placements/batches")
    return (
      <CoordinatorFrame
        user={user}
        active="placements"
        title="Batch activity"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorBatchManagement
          onOpen={(id) =>
            routerNavigate(`/coordinator/placements/batches/${id}`)
          }
        />
      </CoordinatorFrame>
    );
  if (coordinatorBatchId)
    return (
      <CoordinatorFrame
        user={user}
        active="placements"
        title="Batch detail"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorBatchDetail
          id={coordinatorBatchId}
          onBack={() => routerNavigate("/coordinator/placements/batches")}
        />
      </CoordinatorFrame>
    );
  if (coordinatorCohortId)
    return (
      <CoordinatorFrame
        user={user}
        active="cohorts"
        title="Cohort detail"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorCohortDetail
          id={coordinatorCohortId}
          onBack={() => routerNavigate("/coordinator/cohorts")}
          onManageStudents={() => routerNavigate("/coordinator/students")}
          onInviteStudents={() =>
            routerNavigate("/coordinator/students/invite")
          }
        />
      </CoordinatorFrame>
    );
  if (location.pathname === "/coordinator/students/invite")
    return (
      <CoordinatorFrame
        user={user}
        active="cohorts"
        title="Invite students"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorStudentInvites
          user={user}
          onBack={() => routerNavigate("/coordinator/cohorts")}
          onError={onError}
        />
      </CoordinatorFrame>
    );
  if (location.pathname === "/coordinator/students")
    return (
      <CoordinatorFrame
        user={user}
        active="cohorts"
        title="Manage students"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorStudentManagement
          user={user}
          onInvite={() => routerNavigate("/coordinator/students/invite")}
          onBack={() => routerNavigate("/coordinator/cohorts")}
          onError={onError}
        />
      </CoordinatorFrame>
    );
  if (coordinatorPlacementId === "new")
    return (
      <CoordinatorFrame
        user={user}
        active="placements"
        title="Create placement"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorPlacementCreate
          onBack={() => routerNavigate("/coordinator/placements")}
          onError={onError}
          onOpenBatch={(id) =>
            routerNavigate(`/coordinator/placements/batches/${id}`)
          }
        />
      </CoordinatorFrame>
    );
  if (coordinatorPlacementId && coordinatorPlacementId !== "new")
    return (
      <CoordinatorFrame
        user={user}
        active="placements"
        title="Placement detail"
        onNavigate={navigateTo}
        onAccount={openAccount}
        onSignedOut={onSignedOut}
        onError={onError}
      >
        <CoordinatorPlacementDetail
          id={coordinatorPlacementId}
          onBack={() => routerNavigate("/coordinator/placements")}
          onError={onError}
        />
      </CoordinatorFrame>
    );
  const view = viewFromPath(location.pathname);
  const tab = accountTab(location.search);
  const navigate = navigateTo;
  const title =
    view === "overview"
      ? "Institution overview"
      : view === "cohorts"
        ? "Cohorts & students"
        : view === "reports"
          ? "Reports"
          : view === "activity"
            ? "Institution activity"
            : "Account settings";
  const content =
    view === "account" ? (
      <AccountSettings
        user={user}
        onSignedOut={onSignedOut}
        onError={onError}
        onUserUpdated={onUserUpdated}
        initialTab={tab}
      />
    ) : view === "cohorts" ? (
      <CohortManagement
        onError={onError}
        onInviteStudents={() => routerNavigate("/coordinator/students/invite")}
        onManageStudents={() => routerNavigate("/coordinator/students")}
        onOpenCohort={(id) => routerNavigate(`/coordinator/cohorts/${id}`)}
      />
    ) : view === "reports" ? (
      <CoordinatorReports user={user} onError={onError} />
    ) : view === "activity" ? (
      <CoordinatorActivity user={user} />
    ) : (
      <CoordinatorDashboard
        user={user}
        onError={onError}
        onNavigate={navigate}
      />
    );
  return (
    <CoordinatorFrame
      user={user}
      active={view === "account" ? "overview" : view}
      title={title}
      onNavigate={navigateTo}
      onAccount={openAccount}
      onSignedOut={onSignedOut}
      onError={onError}
    >
      {content}
    </CoordinatorFrame>
  );
}
