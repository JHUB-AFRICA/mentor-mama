import { MyActivity } from "../activity/MyActivity";
import type { CurrentUser } from "../../services/api";

/** Coordinators see only their own activity, like every other role. */
export function CoordinatorActivity({ user }: { user: CurrentUser }) {
  return <MyActivity eyebrow={user.scope?.institution_name ?? "Your institution"} />;
}
