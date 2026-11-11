import type { CurrentUser } from "../../services/api";
import { InviteWizard } from "../onboarding/InviteWizard";

/** Coordinator: invite students to this institution. */
export function CoordinatorStudentInvites({ user, onBack, onError }: { user: CurrentUser; onBack: () => void; onError: (message: string) => void }) {
  return <InviteWizard memberType="student" scopeName={user.scope?.institution_name ?? "Your institution"} onBack={onBack} onError={onError} />;
}
