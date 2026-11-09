import type { ReactNode } from "react";

import type { CurrentUser } from "../../services/api";
import { RoleWorkspaceFrame } from "../workspaces/RoleWorkspaceFrame";

export type MentorView = "today" | "students" | "log" | "training" | "library" | "more";

interface MentorWorkspaceFrameProps {
  user: CurrentUser;
  children: ReactNode;
  title: string;
  active?: MentorView;
}

/**
 * Mentor-owned workspace boundary.
 *
 * The shared RoleWorkspaceFrame provides the structural shell,
 * responsive navigation, account chrome, notifications, and
 * accessibility behavior.
 *
 * This component deliberately owns only mentor-specific configuration
 * and acts as the stable shell boundary for mentor pages.
 */
export function MentorWorkspaceFrame({
  user,
  children,
  title,
  active = "today",
}: MentorWorkspaceFrameProps) {
  return (
    <RoleWorkspaceFrame
      user={user}
      title={title}
      eyebrow="Mentor workspace"
      active={active}
      homeHref="/mentor"
      placementsHref="/mentor?view=students"
    >
      {children}
    </RoleWorkspaceFrame>
  );
}
