import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { WorkspaceProps } from "../workspaces/WorkspaceTypes";
import { StudentWorkspaceFrame } from "./StudentWorkspaceFrame";
import { StudentOverview } from "./StudentOverview";
import { StudentPlacementDetail } from "./StudentPlacementDetail";
import { AccountSettings } from "../auth/AccountSettings";
import { StudentSessions } from "./StudentSessions";
import { StudentMore } from "./StudentMore";
import { StudentConcerns } from "./StudentConcerns";
import { StudentConcernDetail } from "./StudentConcernDetail";
import { getStudentProfile, type StudentProfile } from "../../services/api";
import { Button, Skeleton } from "@mentormama/ui";
import { ContentLibrary } from "../content/ContentLibrary";
import { MyActivity } from "../activity/MyActivity";
import { ContentDetailScreen } from "../content/ContentDetailScreen";

type Props = WorkspaceProps & {
  onSignedOut: () => void;
  onUserUpdated: (user: WorkspaceProps["user"]) => void;
};

function profileIsComplete(profile: StudentProfile) {
  return Boolean(
    profile.course_name.trim() &&
    profile.year_of_study &&
    profile.emergency_contact_name.trim() &&
    profile.emergency_contact_phone.trim() &&
    profile.emergency_contact_relationship.trim(),
  );
}

export function StudentWorkspace(props: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [profileCheckError, setProfileCheckError] = useState(false);
  const [profileCheckAttempt, setProfileCheckAttempt] = useState(0);
  const placementFromPath = location.pathname.match(
    /^\/student\/placements\/([^/]+)$/,
  )?.[1];
  const concernDetail = location.pathname.match(/^\/student\/concerns\/([^/]+)$/)?.[1];
  const libraryDetail = location.pathname.match(
    /^\/student\/library\/(guide|module|document|external)\/([^/]+)$/,
  );
  useEffect(
    () => setSelectedId(placementFromPath ?? null),
    [placementFromPath],
  );
  const profileRoute =
    location.pathname === "/account" ||
    location.pathname === "/student/profile";
  useEffect(() => {
    let active = true;
    setProfileComplete(null);
    setProfileCheckError(false);
    void getStudentProfile()
      .then((profile) => {
        if (active) {
          setProfileComplete(profileIsComplete(profile));
          setProfileCheckError(false);
        }
      })
      .catch(() => {
        if (active) {
          setProfileComplete(null);
          setProfileCheckError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [props.user.id, profileCheckAttempt]);

  if (!profileRoute && profileComplete === null && !profileCheckError) {
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Your student workspace"
        active="overview"
      >
        <div className="student-profile-gate">
          <section
            className="student-profile-gate__modal space-y-4"
            role="status"
            aria-label="Checking your student profile"
          >
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
            <Skeleton className="h-10 w-40 rounded-xl" />
          </section>
        </div>
      </StudentWorkspaceFrame>
    );
  }

  if (!profileRoute && profileCheckError) {
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Profile check unavailable"
        active="more"
      >
        <ProfileRequiredScreen
          onOpen={() => navigate("/student/profile")}
          onRetry={() => setProfileCheckAttempt((attempt) => attempt + 1)}
          unavailable
        />
      </StudentWorkspaceFrame>
    );
  }

  if (!profileRoute && profileComplete === false) {
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Complete your profile"
        active="more"
      >
        <ProfileRequiredScreen onOpen={() => navigate("/student/profile")} />
      </StudentWorkspaceFrame>
    );
  }

  if (location.pathname === "/account") {
    const tab = params.get("tab");
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Your account"
        active="more"
      >
        <div className="student-page-container">
          <AccountSettings
            user={props.user}
            onSignedOut={props.onSignedOut}
            onError={props.onError}
            onUserUpdated={props.onUserUpdated}
            onStudentProfileComplete={(profile) =>
              setProfileComplete(profileIsComplete(profile))
            }
            initialTab={
              profileComplete === false && !tab
                ? "profile"
                : (tab as
                    | "security"
                    | "profile"
                    | "notifications"
                    | "recovery"
                    | null)
            }
            workspaceRole="student"
          />
        </div>
      </StudentWorkspaceFrame>
    );
  }
  if (location.pathname === "/student/profile") {
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Your profile"
        active="more"
      >
        <div className="student-page-container">
          <AccountSettings
            user={props.user}
            onSignedOut={props.onSignedOut}
            onError={props.onError}
            onUserUpdated={props.onUserUpdated}
            onStudentProfileComplete={(profile) =>
              setProfileComplete(profileIsComplete(profile))
            }
            workspaceRole="student"
            profileOnly
          />
        </div>
      </StudentWorkspaceFrame>
    );
  }
  if (concernDetail) {
    return (
      <StudentWorkspaceFrame user={props.user} title="Concern details" active="concerns">
        <div className="student-page-container">
          <StudentConcernDetail key={concernDetail} id={decodeURIComponent(concernDetail)} placements={props.placements} onError={props.onError} />
        </div>
      </StudentWorkspaceFrame>
    );
  }
  if (libraryDetail) {
    const [, kind, id] = libraryDetail;
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Learning library"
        active="library"
      >
        <div className="student-page-container">
          <ContentDetailScreen
            kind={kind as "guide" | "module" | "document" | "external"}
            id={decodeURIComponent(id)}
            user={props.user}
            onBack={() => navigate("/student?view=library")}
            onError={props.onError}
          />
        </div>
      </StudentWorkspaceFrame>
    );
  }
  const selected = selectedId
    ? props.placements.find((item) => item.id === selectedId)
    : null;
  if (selectedId && selected) {
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Placement details"
        active="placements"
      >
        <StudentPlacementDetail
          key={selected.id}
          {...props}
          placement={selected}
          onBack={() => navigate("/student?view=placements")}
        />
      </StudentWorkspaceFrame>
    );
  }
  if (params.get("view") === "placements")
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="My placements"
        active="placements"
      >
        <StudentOverview
          {...props}
          mode="placements"
          onOpen={(id) => navigate(`/student/placements/${id}`)}
        />
      </StudentWorkspaceFrame>
    );
  if (params.get("view") === "sessions")
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Sessions received"
        active="log"
      >
        <StudentSessions
          placements={props.placements}
          onOpen={(id) => navigate(`/student/placements/${id}`)}
        />
      </StudentWorkspaceFrame>
    );
  if (params.get("view") === "concerns")
    return (
      <StudentWorkspaceFrame user={props.user} title="My concerns" active="concerns">
        <div className="student-page-container">
          <StudentConcerns placements={props.placements} onError={props.onError} initialPlacementId={params.get("raise")} />
        </div>
      </StudentWorkspaceFrame>
    );
  if (params.get("view") === "library")
    return (
      <StudentWorkspaceFrame
        user={props.user}
        title="Learning library"
        active="library"
      >
        <div className="student-page-container">
          <ContentLibrary user={props.user} onError={props.onError} />
        </div>
      </StudentWorkspaceFrame>
    );
  if (params.get("view") === "activity")
    return (
      <StudentWorkspaceFrame user={props.user} title="Activity" active="more">
        <div className="student-page-container">
          <MyActivity eyebrow="Student workspace" />
        </div>
      </StudentWorkspaceFrame>
    );
  if (params.get("view") === "more")
    return (
      <StudentWorkspaceFrame user={props.user} title="More" active="more">
        <StudentMore user={props.user} placements={props.placements} />
      </StudentWorkspaceFrame>
    );
  return (
    <StudentWorkspaceFrame
      user={props.user}
      title="Your placement journey"
      active="overview"
    >
      <StudentOverview
        {...props}
        mode="overview"
        onOpen={(id) => navigate(`/student/placements/${id}`)}
      />
    </StudentWorkspaceFrame>
  );
}

function ProfileRequiredScreen({
  onOpen,
  onRetry,
  unavailable = false,
}: {
  onOpen: () => void;
  onRetry?: () => void;
  unavailable?: boolean;
}) {
  return (
    <div className="student-profile-gate" role="presentation">
      <section
        className="student-profile-gate__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-profile-gate-title"
      >
        <div className="student-profile-gate__mark" aria-hidden="true">
          M
        </div>
        <p className="student-kicker">{unavailable ? "Connection issue" : "Before you begin"}</p>
        <h1 id="student-profile-gate-title">{unavailable ? "We couldn’t check your profile" : "Complete your student profile"}</h1>
        <p>
          {unavailable
            ? "Your profile details are temporarily unavailable. Check your connection and try again. Your information has not been changed."
            : "Take a moment to add your programme and emergency contact details. This helps your institution support you safely throughout your placement."}
        </p>
        {!unavailable && (
          <div className="student-profile-gate__items">
            <span>
              <strong>Programme details</strong>
              <small>Course and year of study</small>
            </span>
            <span>
              <strong>Emergency contact</strong>
              <small>Someone we can reach when needed</small>
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {unavailable && onRetry && (
            <Button size="sm" variant="tertiary" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button size="sm" onClick={onOpen}>
            Open my profile <span aria-hidden="true">→</span>
          </Button>
        </div>
      </section>
    </div>
  );
}
