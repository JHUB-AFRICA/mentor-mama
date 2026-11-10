import { useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { logout, type CurrentUser } from "../../services/api";
import { PortalSidebar } from "../workspaces/PortalSidebar";
import { PortalHeader } from "../workspaces/PortalHeader";
import { useNavigate } from "react-router-dom";

export type FacilityNav =
  | "overview"
  | "placements"
  | "mentors"
  | "wards"
  | "safeguarding"
  | "reports"
  | "activity";

interface FacilityWorkspaceFrameProps {
  user: CurrentUser;
  /** `account` highlights the Account & security action. */
  active: FacilityNav | "account";
  title: string;
  children: ReactNode;
  onNavigate?: (destination: FacilityNav) => void;
  onAccount?: () => void;
  onSignedOut?: () => void;
  onError?: (message: string) => void;
}

const navGroups: Array<{
  label: string;
  items: Array<{ id: FacilityNav; label: string; icon: ReactNode }>;
}> = [
  {
    label: "Operate",
    items: [
      {
        id: "overview",
        label: "Overview",
        icon: <LayoutDashboard size={17} aria-hidden="true" />,
      },
      {
        id: "placements",
        label: "Placements",
        icon: <ClipboardList size={17} aria-hidden="true" />,
      },
      {
        id: "mentors",
        label: "Mentors",
        icon: <Users size={17} aria-hidden="true" />,
      },
      {
        id: "wards",
        label: "Ward operations",
        icon: <Building2 size={17} aria-hidden="true" />,
      },
    ],
  },
  {
    label: "Review",
    items: [
      {
        id: "safeguarding",
        label: "Safeguarding",
        icon: <ShieldCheck size={17} aria-hidden="true" />,
      },
      {
        id: "reports",
        label: "Reports",
        icon: <BarChart3 size={17} aria-hidden="true" />,
      },
      {
        id: "activity",
        label: "Activity",
        icon: <Activity size={17} aria-hidden="true" />,
      },
    ],
  },
];

export function FacilityWorkspaceFrame({
  user,
  active,
  title,
  children,
  onNavigate,
  onAccount,
  onSignedOut,
  onError,
}: FacilityWorkspaceFrameProps) {
  const routerNavigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const facilityName =
    typeof user.scope?.facility_name === "string"
      ? user.scope.facility_name
      : "Your facility";


  async function signOut() {
    try {
      await logout();
      onSignedOut?.();
    } catch (cause) {
      onError?.(
        cause instanceof Error ? cause.message : "We could not sign you out.",
      );
    } finally {
      // Sign-out is a local navigation guarantee even when the server session
      // has already expired or the network is unavailable.
      window.location.assign("/");
    }
  }

  function navigate(destination: FacilityNav) {
    if (onNavigate) onNavigate(destination);
    else routerNavigate(facilityRoute(destination));
    setMobileOpen(false);
  }

  function openAccount() {
    if (onAccount) onAccount();
    else routerNavigate("/facility/account");
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f7fbfb] text-navy">
      <a
        href="#facility-main"
        className="sr-only z-[60] rounded-md bg-white px-3 py-2 text-sm font-semibold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <PortalSidebar
        brandHref="/facility"
        workspaceLabel="Facility workspace"
        navLabel="Facility navigation"
        activeId={active}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        user={{ name: user.name, roleLabel: "Nurse Manager" }}
        onSignOut={() => void signOut()}
        groups={navGroups.map((group) => ({
          label: group.label,
          items: group.items.map((item) => ({ ...item, onSelect: () => navigate(item.id) })),
        }))}
        footerItems={[{ id: "account", label: "Account & security", icon: <Settings2 />, onSelect: openAccount }]}
      />
      <div className="min-h-screen min-w-0 lg:pl-[17rem]">
        <PortalHeader
          onOpenNav={() => setMobileOpen(true)}
          eyebrow={`Facility operations · ${facilityName}`}
          title={title}
          user={{ name: user.name, email: user.email, roleLabel: "Nurse Manager" }}
          accountItems={[{ label: "Account & security", icon: <Settings2 aria-hidden="true" />, onSelect: openAccount }]}
          onSignOut={() => void signOut()}
        />
        <main
          id="facility-main"
          className="mx-auto max-w-[94rem] px-5 pb-8 pt-8 sm:px-8 sm:pb-10 sm:pt-10 lg:pb-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function facilityRoute(destination: FacilityNav) {
  if (destination === "overview") return "/facility";
  if (destination === "placements") return "/placements";
  return `/facility/${destination}`;
}

