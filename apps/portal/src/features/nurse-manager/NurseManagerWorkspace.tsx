import type { CurrentUser } from "../../services/api";
import { ScopedBulkInviteDashboard } from "../onboarding/ScopedBulkInviteDashboard";
import { NurseManagerDashboard } from "./NurseManagerDashboard";
import { AccountSettings } from "../auth/AccountSettings";
import { NurseManagerWardOperations } from "./NurseManagerWardOperations";
import { NurseManagerPlacementWorkspace } from "./NurseManagerPlacementWorkspace";
import { NurseManagerPlacementDetail } from "./NurseManagerPlacementDetail";
import { NurseManagerMentorOperations } from "./NurseManagerMentorOperations";
import { NurseManagerMentorDetail } from "./NurseManagerMentorDetail";
import { NurseManagerReports } from "./NurseManagerReports";
import { NurseManagerSafeguarding } from "./NurseManagerSafeguarding";
import { NurseManagerActivity } from "./NurseManagerActivity";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { useLocation } from "react-router-dom";

interface NurseManagerWorkspaceProps {
  user: CurrentUser;
  onError: (message: string) => void;
  onSignedOut: () => void;
  onUserUpdated: (user: CurrentUser) => void;
}

export function NurseManagerWorkspace({
  user,
  onError,
  onSignedOut,
  onUserUpdated,
}: NurseManagerWorkspaceProps) {
  const location = useLocation();
  const path = location.pathname;
  const normalizedPath = path.replace(/\/+$/, "");
  if (path.startsWith("/placements")) {
    if (path.match(/^\/placements\/[^/]+$/)) {
      return <NurseManagerPlacementDetail user={user} onError={onError} />;
    }
    if (path === "/placements" || path === "/placements/") {
      return <NurseManagerPlacementWorkspace user={user} onError={onError} />;
    }
    return <NurseManagerPlacementWorkspace user={user} onError={onError} />;
  }
  if (path.startsWith("/facility/mentors")) {
    if (normalizedPath.endsWith("/invite")) {
      return (
        <ScopedBulkInviteDashboard
          user={user}
          onError={onError}
          memberType="mentor"
        />
      );
    }
    if (normalizedPath.match(/^\/facility\/mentors\/[^/]+$/)) {
      return <NurseManagerMentorDetail user={user} onError={onError} />;
    }
    return <NurseManagerMentorOperations user={user} onError={onError} />;
  }
  if (path.startsWith("/facility/wards")) {
    return <NurseManagerWardOperations user={user} onError={onError} />;
  }
  if (normalizedPath === "/facility/reports") {
    return <NurseManagerReports user={user} onError={onError} />;
  }
  if (normalizedPath === "/facility/safeguarding") {
    return <NurseManagerSafeguarding user={user} onError={onError} />;
  }
  if (normalizedPath === "/facility/activity") {
    return <NurseManagerActivity user={user} onError={onError} />;
  }
  if (path.startsWith("/facility/account"))
    return (
      <FacilityWorkspaceFrame
        user={user}
        active="overview"
        title="Account & security"
        onAccount={() => undefined}
        onError={onError}
      >
        <AccountSettings
          user={user}
          onSignedOut={onSignedOut}
          onError={onError}
          onUserUpdated={onUserUpdated}
          initialTab={
            new URLSearchParams(location.search).get("tab") as
              "security" | "profile" | "notifications" | "recovery" | undefined
          }
        />
      </FacilityWorkspaceFrame>
    );
  return <NurseManagerDashboard user={user} onError={onError} />;
}
