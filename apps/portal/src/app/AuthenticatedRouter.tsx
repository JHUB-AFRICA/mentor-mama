import { lazy, Suspense } from "react";
import type { CurrentUser, Placement } from "../services/api";
const ProgrammeAdminWorkspace = lazy(() =>
  import("../features/programme-admin/ProgrammeAdminWorkspace").then(
    (module) => ({ default: module.ProgrammeAdminWorkspace }),
  ),
);
const CoordinatorWorkspace = lazy(() =>
  import("../features/coordinator/CoordinatorWorkspace").then((module) => ({
    default: module.CoordinatorWorkspace,
  })),
);
const NurseManagerWorkspace = lazy(() =>
  import("../features/nurse-manager/NurseManagerWorkspace").then((module) => ({
    default: module.NurseManagerWorkspace,
  })),
);
const MentorWorkspace = lazy(() =>
  import("../features/mentor/MentorWorkspace").then((module) => ({
    default: module.MentorWorkspace,
  })),
);
const StudentWorkspace = lazy(() =>
  import("../features/student/StudentWorkspace").then((module) => ({
    default: module.StudentWorkspace,
  })),
);
import { Navigate, useLocation } from "react-router-dom";
import { MentaBuddy } from "../features/assistant/MentaBuddy";
import { ConsentGate } from "../features/consent/ConsentGate";
import {
  PortalWorkspaceSkeleton,
  type PortalWorkspaceRole,
} from "../components/PortalWorkspaceSkeleton";

interface AuthenticatedRouterProps {
  user: CurrentUser;
  placements: Placement[];
  onPlacementsUpdated: (placement: Placement) => void;
  onSignedOut: () => void;
  onUserUpdated: (user: CurrentUser) => void;
  error: string | null;
  onError: (message: string) => void;
  onClearError: () => void;
}

export function AuthenticatedRouter({
  user,
  placements,
  onPlacementsUpdated,
  onSignedOut,
  onUserUpdated,
  error,
  onError,
  onClearError,
}: AuthenticatedRouterProps) {
  const location = useLocation();
  const canonicalRoots: Record<string, string> = {
    program_admin: "/admin",
    coordinator: "/coordinator",
    nurse_manager: "/facility",
    mentor: "/mentor",
    student: "/student",
  };
  const allowedPrefixes: Record<string, string[]> = {
    program_admin: ["/admin", "/placements"],
    coordinator: ["/coordinator"],
    nurse_manager: ["/facility", "/placements"],
    mentor: ["/mentor", "/account"],
    student: ["/student", "/account"],
  };
  const root = canonicalRoots[user.role];
  if (root && location.pathname === "/") return <Navigate to={root} replace />;
  const canAccessPath = (allowedPrefixes[user.role] ?? []).some(
    (prefix) =>
      location.pathname === prefix ||
      location.pathname.startsWith(`${prefix}/`),
  );
  if (root && location.pathname !== "/" && !canAccessPath)
    return <Navigate to={root} replace />;
  const workspace = (() => {
    switch (user.role) {
      case "program_admin":
        return (
          <ProgrammeAdminWorkspace
            user={user}
            onSignedOut={onSignedOut}
            onError={onError}
            onUserUpdated={onUserUpdated}
          />
        );
      case "coordinator":
        return (
          <CoordinatorWorkspace
            user={user}
            onError={onError}
            onSignedOut={onSignedOut}
            onUserUpdated={onUserUpdated}
          />
        );
      case "nurse_manager":
        return (
          <NurseManagerWorkspace
            user={user}
            onError={onError}
            onSignedOut={onSignedOut}
            onUserUpdated={onUserUpdated}
          />
        );
      case "mentor":
        return (
          <MentorWorkspace
            user={user}
            placements={placements}
            onPlacementsUpdated={onPlacementsUpdated}
            error={error}
            onError={onError}
            onClearError={onClearError}
            onSignedOut={onSignedOut}
            onUserUpdated={onUserUpdated}
          />
        );
      case "student":
        return (
          <StudentWorkspace
            user={user}
            placements={placements}
            onPlacementsUpdated={onPlacementsUpdated}
            error={error}
            onError={onError}
            onClearError={onClearError}
            onSignedOut={onSignedOut}
            onUserUpdated={onUserUpdated}
          />
        );
      default:
        return <UnsupportedWorkspace role={user.role} />;
    }
  })();
  const skeletonRole = workspaceRoleFor(user.role);
  return (
    <>
      <Suspense
        fallback={
          <PortalWorkspaceSkeleton
            role={skeletonRole}
            pathname={location.pathname}
          />
        }
      >
        {workspace}
      </Suspense>
      <MentaBuddy user={user} />
      <ConsentGate user={user} onUserUpdated={onUserUpdated} />
    </>
  );
}

function workspaceRoleFor(role: string): PortalWorkspaceRole {
  if (
    role === "program_admin" ||
    role === "coordinator" ||
    role === "nurse_manager" ||
    role === "mentor" ||
    role === "student"
  ) {
    return role;
  }
  return "student";
}

function UnsupportedWorkspace({ role }: { role: string }) {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="font-display text-2xl font-bold text-navy">
        Workspace unavailable
      </h1>
      <p className="mt-3 font-body text-sm text-navy-muted">
        The {role.replaceAll("_", " ")} workspace is not available in this
        portal yet.
      </p>
    </main>
  );
}
