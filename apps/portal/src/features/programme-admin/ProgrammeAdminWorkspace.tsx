import { lazy, Suspense } from "react";
import type { CurrentUser } from "../../services/api";
import { ProgramAdminDashboard } from "./ProgramAdminDashboard";
import { useLocation } from "react-router-dom";
import { PortalWorkspaceSkeleton } from "../../components/PortalWorkspaceSkeleton";

const ProgrammeAdminPlacementManagement = lazy(() =>
  import("../placements/PlacementManagement").then((module) => ({
    default: module.ProgrammeAdminPlacementManagement,
  })),
);

interface ProgrammeAdminWorkspaceProps {
  user: CurrentUser;
  onSignedOut: () => void;
  onError: (message: string) => void;
  onUserUpdated: (user: CurrentUser) => void;
}

export function ProgrammeAdminWorkspace({
  user,
  onSignedOut,
  onError,
  onUserUpdated,
}: ProgrammeAdminWorkspaceProps) {
  const { pathname } = useLocation();
  if (pathname.startsWith("/placements")) {
    return (
      <Suspense
        fallback={
          <PortalWorkspaceSkeleton role="program_admin" pathname={pathname} />
        }
      >
        <ProgrammeAdminPlacementManagement user={user} onError={onError} />
      </Suspense>
    );
  }
  return (
    <ProgramAdminDashboard
      user={user}
      onSignedOut={onSignedOut}
      onError={onError}
      onUserUpdated={onUserUpdated}
    />
  );
}
