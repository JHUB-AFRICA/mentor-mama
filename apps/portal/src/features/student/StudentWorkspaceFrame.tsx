import type { ReactNode } from "react";
import type { CurrentUser } from "../../services/api";
import { RoleWorkspaceFrame } from "../workspaces/RoleWorkspaceFrame";

export function StudentWorkspaceFrame({ user, title, active = "overview", children }: { user: CurrentUser; title: string; active?: "overview" | "placements" | "log" | "learning" | "library" | "concerns" | "more"; children: ReactNode }) {
  return <RoleWorkspaceFrame user={user} title={title} eyebrow="Student workspace" active={active} homeHref="/student" placementsHref="/student?view=placements">{children}</RoleWorkspaceFrame>;
}
