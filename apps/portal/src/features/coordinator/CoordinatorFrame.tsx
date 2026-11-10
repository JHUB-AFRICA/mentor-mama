import { useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { logout, type CurrentUser } from "../../services/api";
import { PortalSidebar } from "../workspaces/PortalSidebar";
import { PortalHeader } from "../workspaces/PortalHeader";

export type CoordinatorNav =
  | "overview"
  | "students"
  | "cohorts"
  | "placements"
  | "safeguarding"
  | "reports"
  | "activity"
  | "account";

/**
 * Coordinator workspace shell. Navigation follows the coordinator's job:
 * prepare people (students, cohorts), release and follow placements, then
 * review (safeguarding, reports, activity).
 */
export function CoordinatorFrame({
  user,
  active,
  title,
  crumbs,
  children,
  onNavigate,
  onAccount,
  onSignedOut,
  onError,
}: {
  user: CurrentUser;
  active: CoordinatorNav;
  title: string;
  /** Optional parent trail, e.g. ["Placements"] for a placement detail page. */
  crumbs?: string[];
  children: ReactNode;
  onNavigate: (destination: CoordinatorNav) => void;
  onAccount: (tab?: "security" | "profile" | "notifications" | "recovery") => void;
  onSignedOut: () => void;
  onError: (message: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  async function signOut() {
    try {
      await logout();
      onSignedOut();
    } catch {
      onError("We could not sign you out. Please try again.");
    }
  }
  function go(destination: CoordinatorNav) {
    onNavigate(destination);
    setMobileOpen(false);
  }
  const institution = typeof user.scope?.institution_name === "string" ? user.scope.institution_name : "Institution workspace";
  return (
    <div className="coordinator-shell min-h-screen overflow-x-clip bg-white text-navy">
      <a
        href="#coordinator-main"
        className="sr-only z-[60] rounded-md bg-white px-3 py-2 text-sm font-semibold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <PortalSidebar
        brandHref="/coordinator"
        workspaceLabel="Institution workspace"
        navLabel="Coordinator navigation"
        activeId={active}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        user={{ name: user.name, roleLabel: "University Coordinator" }}
        onSignOut={() => void signOut()}
        groups={[
          {
            label: "Operate",
            items: [
              { id: "overview", label: "Overview", icon: <LayoutDashboard />, onSelect: () => go("overview") },
              { id: "students", label: "Students", icon: <Users />, onSelect: () => go("students") },
              { id: "cohorts", label: "Cohorts", icon: <GraduationCap />, onSelect: () => go("cohorts") },
              { id: "placements", label: "Placements", icon: <ClipboardList />, onSelect: () => go("placements") },
            ],
          },
          {
            label: "Review",
            items: [
              { id: "safeguarding", label: "Safeguarding", icon: <ShieldAlert />, onSelect: () => go("safeguarding") },
              { id: "reports", label: "Reports", icon: <BarChart3 />, onSelect: () => go("reports") },
              { id: "activity", label: "Activity", icon: <Activity />, onSelect: () => go("activity") },
            ],
          },
        ]}
        footerItems={[{ id: "account", label: "Account & security", icon: <Settings2 />, onSelect: () => onAccount("security") }]}
      />
      <div className="min-h-screen min-w-0 lg:pl-[17rem]">
        <PortalHeader
          onOpenNav={() => setMobileOpen(true)}
          crumbs={crumbs?.length ? [...crumbs, title] : ["University Coordinator", title]}
          context={<span className="pa-chip-context">{institution}</span>}
          user={{ name: user.name, email: user.email, roleLabel: "University Coordinator" }}
          accountItems={[
            { label: "Account & security", icon: <Settings2 aria-hidden="true" />, onSelect: () => onAccount("security") },
            { label: "Notifications", icon: <Bell aria-hidden="true" />, onSelect: () => onAccount("notifications") },
          ]}
          onSignOut={() => void signOut()}
        />
        <main id="coordinator-main" className="min-h-[calc(100vh-4.25rem)] bg-white">
          <div className="programme-admin-content w-full py-6 sm:py-7 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
