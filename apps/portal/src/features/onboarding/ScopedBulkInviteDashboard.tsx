import { useNavigate } from "react-router-dom";
import type { CurrentUser } from "../../services/api";
import { FacilityWorkspaceFrame } from "../nurse-manager/FacilityWorkspaceFrame";
import { InviteWizard } from "./InviteWizard";

export { parseRosterFile } from "./rosterParser";

/** Nurse manager: invite mentors to this facility. */
export function ScopedBulkInviteDashboard({ user, onError }: { user: CurrentUser; onError: (message: string) => void; memberType: "student" | "mentor" }) {
  const navigate = useNavigate();
  return (
    <FacilityWorkspaceFrame user={user} active="mentors" title="Invite mentors" onAccount={() => navigate("/facility/account")} onError={onError}>
      <InviteWizard memberType="mentor" scopeName="Facility workspace" onBack={() => navigate("/facility/mentors")} onError={onError} />
    </FacilityWorkspaceFrame>
  );
}
