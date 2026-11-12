import { useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import {
  getProgrammeSettings,
  logout,
  type CurrentUser,
} from "../../services/api";
import { useQuery } from "@tanstack/react-query";
import { PortalSidebar } from "../workspaces/PortalSidebar";
import { PortalHeader } from "../workspaces/PortalHeader";

export type ProgrammeAdminNav =
  | "overview"
  | "people"
  | "setup"
  | "content"
  | "placements"
  | "reports"
  | "safeguarding"
  | "consent"
  | "induction"
  | "activity"
  | "settings";

interface ProgrammeAdminFrameProps {
  user: CurrentUser;
  active: ProgrammeAdminNav;
  title: string;
  children: ReactNode;
  onNavigate: (destination: ProgrammeAdminNav) => void;
  onSettings: () => void;
  onAccount: (
    tab?: "security" | "profile" | "notifications" | "recovery",
  ) => void;
  onSignedOut: () => void;
  onError: (message: string) => void;
}

const roleLabel = "Programme Administrator";

export function ProgrammeAdminFrame({
  user,
  active,
  title,
  children,
  onNavigate,
  onSettings,
  onAccount,
  onSignedOut,
  onError,
}: ProgrammeAdminFrameProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const programme = useQuery({
    queryKey: ["programme-settings"],
    queryFn: getProgrammeSettings,
    staleTime: 60_000,
  });


  async function signOut() {
    try {
      await logout();
      onSignedOut();
    } catch {
      onError("We could not sign you out. Please try again.");
    }
  }

  function navigate(destination: ProgrammeAdminNav) {
    onNavigate(destination);
    setMobileOpen(false);
  }

  const programmeChip = (
              <div
                  className="flex min-h-10 max-w-20 min-w-0 items-center gap-1.5 px-0.5 sm:min-h-11 sm:max-w-44 sm:gap-2 sm:px-1"
                  role="group"
                  aria-label="Current programme"
                >
                  {programme.data?.name ? (
                    <>
                      <Building2
                        size={17}
                        className="shrink-0 text-teal"
                        aria-hidden="true"
                      />
                      <span
                        title={programme.data.name}
                        className="truncate font-body text-[0.65rem] font-semibold text-navy sm:max-w-44 sm:text-xs"
                      >
                        {programme.data.name}
                      </span>
                    </>
                  ) : programme.isPending ? (
                    <span role="status" aria-label="Loading programme name">
                      <Skeleton className="h-3 w-20 sm:w-32" />
                    </span>
                  ) : programme.isError ? (
                    <button
                      type="button"
                      onClick={() => void programme.refetch()}
                      className="max-w-full truncate font-body text-[0.65rem] font-semibold text-error underline-offset-2 hover:underline sm:text-xs"
                      aria-label="Programme name unavailable. Retry loading it."
                      title="Programme name unavailable. Select to retry."
                    >
                      Retry programme
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate("setup")}
                      className="max-w-full truncate font-body text-[0.65rem] font-semibold text-error underline-offset-2 hover:underline sm:text-xs"
                      aria-label="Programme name is not set. Open Programme setup."
                      title="Programme name not set. Open Programme setup."
                    >
                      Name not set
                    </button>
                  )}
                </div>
  );

  return (
    <div className="programme-admin-shell min-h-screen overflow-x-clip text-navy">
      <PortalSidebar
        brandHref="/admin"
        workspaceLabel="Programme workspace"
        navLabel="Programme administration"
        activeId={active}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        user={{ name: user.name, roleLabel }}
        onSignOut={() => void signOut()}
        groups={[
          {
            label: "Operate",
            items: [
              { id: "overview", label: "Overview", icon: <LayoutDashboard />, onSelect: () => navigate("overview") },
              { id: "placements", label: "Placements", icon: <ClipboardList />, onSelect: () => navigate("placements") },
              { id: "reports", label: "Reports", icon: <BarChart3 />, onSelect: () => navigate("reports") },
            ],
          },
          {
            label: "Govern",
            items: [
              { id: "people", label: "People & access", icon: <Users />, onSelect: () => navigate("people") },
              { id: "setup", label: "Programme setup", icon: <Building2 />, onSelect: () => navigate("setup") },
              { id: "content", label: "Content library", icon: <BookOpen />, onSelect: () => navigate("content") },
              { id: "consent", label: "Consent", icon: <ShieldCheck />, onSelect: () => navigate("consent") },
              { id: "induction", label: "Induction checklist", icon: <ListChecks />, onSelect: () => navigate("induction") },
            ],
          },
          {
            label: "Review",
            items: [
              { id: "safeguarding", label: "Safeguarding", icon: <ShieldAlert />, onSelect: () => navigate("safeguarding") },
              { id: "activity", label: "Activity", icon: <Activity />, onSelect: () => navigate("activity") },
            ],
          },
        ]}
        footerItems={[{ id: "settings", label: "Settings", icon: <Settings2 />, onSelect: onSettings }]}
      />

      <div className="min-h-screen min-w-0 lg:pl-[17rem]">
        <PortalHeader
          onOpenNav={() => setMobileOpen(true)}
          crumbs={["Programme Administration", title]}
          context={programmeChip}
          user={{ name: user.name, email: user.email, roleLabel }}
          accountItems={[
            { label: "Account & security", icon: <Settings2 aria-hidden="true" />, onSelect: () => onAccount("security") },
            { label: "Notifications", icon: <Bell aria-hidden="true" />, onSelect: () => onAccount("notifications") },
          ]}
          onSignOut={() => void signOut()}
        />
        <main className="min-h-[calc(100vh-4.25rem)] bg-white">
          <div className="programme-admin-content w-full py-6 sm:py-7 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}



