import { MyActivity } from "../activity/MyActivity";

/** Programme admins see their own activity, like every other role. */
export function ActivityTimeline() {
  return <MyActivity eyebrow="Workspace" />;
}
