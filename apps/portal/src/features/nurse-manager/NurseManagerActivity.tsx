import { useNavigate } from "react-router-dom";
import type { CurrentUser } from "../../services/api";
import { MyActivity } from "../activity/MyActivity";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";

/** Nurse managers see their own activity, like every other role. */
export function NurseManagerActivity({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const nav = (destination: string) =>
    navigate(destination === "overview" ? "/facility" : destination === "placements" ? "/placements" : `/facility/${destination}`);
  return (
    <FacilityWorkspaceFrame
      user={user}
      active="activity"
      title="Activity"
      onNavigate={nav}
      onAccount={() => navigate("/facility/account")}
      onError={onError}
    >
      <MyActivity eyebrow="Facility workspace" />
    </FacilityWorkspaceFrame>
  );
}
