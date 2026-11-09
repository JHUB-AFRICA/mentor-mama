import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { logout, type CurrentUser } from "../../services/api";
import { NotificationPopover } from "../notifications/NotificationPopover";
import logoIcon from "../../assets/brand/logo-icon-dark.svg";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

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
  active: FacilityNav;
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
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const firstName = user.name.split(" ")[0];
  const facilityName =
    typeof user.scope?.facility_name === "string"
      ? user.scope.facility_name
      : "Your facility";

  useEffect(() => {
    if (!accountOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

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
    setAccountOpen(false);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7fbfb] text-navy">
      <a
        href="#facility-main"
        className="sr-only z-[60] rounded-md bg-white px-3 py-2 text-sm font-semibold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-white/10 bg-navy px-5 py-6 text-white shadow-[12px_0_32px_rgba(8,25,53,0.08)] transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <Link
            to="/facility"
            className="flex items-center gap-3"
            onClick={() => setMobileOpen(false)}
          >
            <img src={logoIcon} alt="MentorMAMA" className="size-10" />
            <span>
              <span className="block font-display text-xl font-bold tracking-tight">
                Mentor<span className="text-teal-bright">MAMA</span>
              </span>
              <span className="mt-1 block font-body text-[0.66rem] uppercase tracking-[0.16em] text-slate-300">
                Facility workspace
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-10 space-y-7 overflow-y-auto pr-1">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">
                {group.label}
              </p>
              <nav
                className="mt-3 space-y-1"
                aria-label={`${group.label} navigation`}
              >
                {group.items.map((item) => (
                  <FacilityNavItem
                    key={item.id}
                    item={item}
                    active={active === item.id}
                    onClick={() => navigate(item.id)}
                  />
                ))}
              </nav>
            </div>
          ))}
        </div>
        <div className="mt-auto border-t border-white/10 pt-5">
          <div className="mb-4 flex items-center gap-3 px-2">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal font-body text-sm font-bold">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-body text-sm font-semibold">
                {user.name}
              </span>
              <span className="mt-0.5 block truncate font-body text-[0.68rem] text-slate-400">
                Nurse Manager
              </span>
            </span>
          </div>
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-body text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-bright"
            onClick={openAccount}
          >
            <Settings2 size={17} aria-hidden="true" />
            Account & security
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-body text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-bright"
          >
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-navy/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="min-h-screen min-w-0 lg:pl-[17rem]">
        <header className="facility-workspace-header border-b border-border/80 bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-[5.3rem] max-w-[94rem] items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-navy transition hover:border-teal hover:text-teal lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <p className="truncate font-body text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal">
                  Facility operations · {facilityName}
                </p>
                <h1 className="mt-1 truncate font-display text-xl font-bold tracking-tight text-navy sm:text-2xl">
                  {title}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <NotificationPopover />
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div ref={accountRef} className="relative">
                <button
                  type="button"
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition ${accountOpen ? "border-teal/30 bg-teal-light/45" : "border-transparent hover:border-border hover:bg-mist"}`}
                  onClick={() => setAccountOpen((value) => !value)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  aria-label={`${user.name} account menu`}
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-teal text-sm font-bold text-white">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-40 truncate font-body text-sm font-semibold text-navy">
                      {user.name}
                    </span>
                    <span className="block truncate font-body text-xs text-navy-muted">
                      Nurse Manager
                    </span>
                  </span>
                  <ChevronDown
                    size={15}
                    className={`text-navy-muted transition-transform ${accountOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-14 z-30 w-56 rounded-2xl border border-border bg-white p-2 shadow-xl"
                  >
                    <p className="px-3 py-2 font-body text-xs text-navy-muted">
                      Signed in as {firstName}
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-body text-sm font-semibold text-navy hover:bg-mist"
                      onClick={() => {
                        setAccountOpen(false);
                        openAccount();
                      }}
                    >
                      <Settings2 size={16} aria-hidden="true" />
                      Account & security
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main
          id="facility-main"
          className="mx-auto max-w-[94rem] px-5 pb-8 pt-[7.3rem] sm:px-8 sm:pb-10 sm:pt-[7.8rem] lg:pb-12"
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

function FacilityNavItem({
  item,
  active,
  onClick,
}: {
  item: { id: FacilityNav; label: string; icon: ReactNode };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-body text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-bright ${active ? "bg-white text-navy shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
    >
      {item.icon}
      <span>{item.label}</span>
      {active && <span className="ml-auto size-1.5 rounded-full bg-teal" />}
    </button>
  );
}
