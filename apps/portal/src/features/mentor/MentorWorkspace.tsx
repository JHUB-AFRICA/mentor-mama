import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { WorkspaceProps } from "../workspaces/WorkspaceTypes";
import { MentorToday } from "./MentorToday";
import { MentorStudents } from "./MentorStudents";
import { MentorLog } from "./MentorLog";
import { MentorInductionBatch } from "./MentorInductionBatch";
import { MentorStudentDetail } from "./MentorStudentDetail";
import { MentorMore } from "./MentorMore";
import { AccountSettings } from "../auth/AccountSettings";
import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";
import { TrainingWorkspace } from "../training/TrainingWorkspace";
import { ContentLibrary } from "../content/ContentLibrary";
import { ContentDetailScreen } from "../content/ContentDetailScreen";

export function MentorWorkspace(props: WorkspaceProps & { onSignedOut: () => void; onUserUpdated: (user: WorkspaceProps["user"]) => void }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  if (location.pathname === "/account") {
    const tab = new URLSearchParams(location.search).get("tab");
    return <MentorWorkspaceFrame user={props.user} title="Settings" active="more"><div className="mx-auto w-full max-w-[74rem] px-5 py-8 sm:px-8 lg:px-12"><AccountSettings user={props.user} onSignedOut={props.onSignedOut} onError={props.onError} onUserUpdated={props.onUserUpdated} initialTab={tab as "security" | "profile" | "notifications" | "recovery" | null} /></div></MentorWorkspaceFrame>;
  }
  const detailMatch = location.pathname.match(/^\/mentor\/students\/([^/]+)$/);
  const libraryDetail = location.pathname.match(
    /^\/mentor\/library\/(guide|module|document|external)\/([^/]+)$/,
  );
  if (libraryDetail) {
    const [, kind, id] = libraryDetail;
    return <MentorWorkspaceFrame user={props.user} title="Library" active="library"><div className="mx-auto w-full max-w-[74rem] px-5 py-8 sm:px-8 lg:px-12"><ContentDetailScreen kind={kind as "guide" | "module" | "document" | "external"} id={decodeURIComponent(id)} user={props.user} onBack={() => navigate("/mentor?view=library")} onError={props.onError} /></div></MentorWorkspaceFrame>;
  }
  if (detailMatch) {
    const placement = props.placements.find((item) => item.id === detailMatch[1]);
    if (!placement) return <MentorStudents user={props.user} placements={props.placements} />;
    return <MentorStudentDetail user={props.user} placement={placement} onError={props.onError} onPlacementUpdated={props.onPlacementsUpdated} />;
  }
  const view = params.get("view");
  if (view === "training") return <MentorWorkspaceFrame user={props.user} title="Training" active="training"><div className="mx-auto w-full max-w-[74rem] px-5 py-8 sm:px-8 lg:px-12"><TrainingWorkspace onError={props.onError} /></div></MentorWorkspaceFrame>;
  if (view === "library") return <MentorWorkspaceFrame user={props.user} title="Library" active="library"><div className="mx-auto w-full max-w-[74rem] px-5 py-8 sm:px-8 lg:px-12"><ContentLibrary user={props.user} onError={props.onError} /></div></MentorWorkspaceFrame>;
  if (!view || view === "today") {
    return <MentorToday user={props.user} placements={props.placements} error={props.error} onClearError={props.onClearError} />;
  }
  if (view === "students") {
    return <MentorStudents user={props.user} placements={props.placements} />;
  }
  if (view === "log") {
    return <MentorLog user={props.user} placements={props.placements} onError={props.onError} />;
  }
  if (view === "induction-batch") {
    return <MentorInductionBatch user={props.user} placements={props.placements} onError={props.onError} onPlacementUpdated={props.onPlacementsUpdated} />;
  }
  if (view === "more") {
    return <MentorMore user={props.user} />;
  }
  return <MentorToday user={props.user} placements={props.placements} error={props.error} onClearError={props.onClearError} />;
}
