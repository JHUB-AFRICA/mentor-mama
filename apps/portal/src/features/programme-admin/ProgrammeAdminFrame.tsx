import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  BookOpen,
  ChevronDown,
  ClipboardList,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { Container, Skeleton } from "@mentormama/ui";
import {
  getProgrammeSettings,
  logout,
  type CurrentUser,
} from "../../services/api";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import logoIcon from "../../assets/brand/logo-icon-dark.svg";
import { NotificationPopover } from "../notifications/NotificationPopover";

export type ProgrammeAdminNav =
  | "overview"
  | "people"
  | "setup"
  | "content"
  | "placements"
  | "reports"
  | "activity";

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
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const programme = useQuery({
    queryKey: ["programme-settings"],
    queryFn: getProgrammeSettings,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!accountOpen) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }
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
      onSignedOut();
    } catch {
      onError("We could not sign you out. Please try again.");
    }
  }

  function navigate(destination: ProgrammeAdminNav) {
    onNavigate(destination);
    setMobileOpen(false);
  }

  return (
    <div className="programme-admin-shell min-h-screen overflow-x-hidden text-navy">
      <aside
        className={`programme-admin-rail fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-white/10 bg-navy px-5 py-5 text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-1">
          <Link
            to="/admin"
            className="flex items-center gap-3"
            onClick={() => setMobileOpen(false)}
          >
            <img src={logoIcon} alt="" className="h-9 w-9" />
            <span>
              <span className="block font-display text-lg font-bold tracking-tight">
                Mentor<span className="text-teal-bright">MAMA</span>
              </span>
              <span className="mt-0.5 block font-body text-[0.58rem] uppercase tracking-[0.14em] text-slate-300">
                Programme workspace
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

        <div className="mt-8">
          <nav
            className="flex flex-col gap-5"
            aria-label="Programme administration"
          >
            <RailGroup label="Operate">
              <RailItem
                icon={<LayoutDashboard />}
                label="Overview"
                active={active === "overview"}
                onClick={() => navigate("overview")}
              />
              <RailItem
                icon={<ClipboardList />}
                label="Placements"
                active={active === "placements"}
                onClick={() => navigate("placements")}
              />
              <RailItem
                icon={<BarChart3 />}
                label="Reports"
                active={active === "reports"}
                onClick={() => navigate("reports")}
              />
            </RailGroup>
            <RailGroup label="Govern">
              <RailItem
                icon={<Users />}
                label="People & access"
                active={active === "people"}
                onClick={() => navigate("people")}
              />
              <RailItem
                icon={<Building2 />}
                label="Programme setup"
                active={active === "setup"}
                onClick={() => navigate("setup")}
              />
              <RailItem
                icon={<BookOpen />}
                label="Content library"
                active={active === "content"}
                onClick={() => navigate("content")}
              />
            </RailGroup>
            <RailGroup label="Review">
              <RailItem
                icon={<Activity />}
                label="Activity"
                active={active === "activity"}
                onClick={() => navigate("activity")}
              />
            </RailGroup>
          </nav>
        </div>

        <div className="mt-auto border-t border-white/10 pt-4">
          <RailItem
            icon={<Settings2 />}
            label="Settings"
            active={false}
            onClick={() => {
              onSettings();
              setMobileOpen(false);
            }}
          />
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 font-body text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-bright"
          >
            <LogOut size={17} />
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
        <header className="programme-admin-header fixed inset-x-0 top-0 z-30 border-b border-border/80 bg-white/95 backdrop-blur lg:left-[17rem]">
          <Container className="programme-admin-header-inner flex min-h-[4.5rem] items-center gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-navy transition hover:border-teal hover:text-teal lg:hidden"
                onClick={() => setMobileOpen((open) => !open)}
                aria-label="Toggle navigation"
              >
                <Menu size={20} />
              </button>
              <div className="hidden min-w-0 sm:block">
                <div className="flex items-center gap-2 font-body text-xs font-semibold text-navy-muted">
                  <span className="hidden sm:inline">
                    Programme Administration
                  </span>
                  <ChevronRight
                    size={14}
                    className="hidden text-navy-muted/60 sm:block"
                  />
                  <span className="truncate text-navy">{title}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
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
              <NotificationPopover />
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div ref={accountMenuRef} className="relative">
                <button
                  type="button"
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-1 py-1.5 text-left transition sm:px-2 ${accountOpen ? "border-teal/30 bg-teal-light/45" : "border-transparent hover:border-border hover:bg-mist"}`}
                  onClick={() => setAccountOpen((open) => !open)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  aria-label={`${user.name} account menu`}
                >
                  <span className="flex size-8 items-center justify-center rounded-xl bg-teal text-sm font-bold text-white sm:size-9">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-40 truncate font-body text-sm font-semibold text-navy">
                      {user.name}
                    </span>
                    <span className="block truncate font-body text-xs text-navy-muted">
                      {roleLabel}
                    </span>
                  </span>
                  <ChevronDown
                    size={15}
                    className={`text-navy-muted transition-transform ${accountOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {accountOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-64 overflow-hidden rounded-xl border border-border bg-white p-2 shadow-[0_18px_50px_rgba(13,27,51,0.14)]"
                    role="menu"
                    aria-label="Account menu"
                  >
                    <div className="border-b border-border px-3 pb-3 pt-2">
                      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
                        Signed in as
                      </p>
                      <p className="mt-1 truncate font-body text-sm font-semibold text-navy">
                        {user.email}
                      </p>
                    </div>
                    <AccountItem
                      icon={<Settings2 />}
                      label="Account & security"
                      onClick={() => {
                        onAccount("security");
                        setAccountOpen(false);
                      }}
                    />
                    <AccountItem
                      icon={<Bell />}
                      label="Notifications"
                      onClick={() => {
                        onAccount("notifications");
                        setAccountOpen(false);
                      }}
                    />
                    <div className="my-2 border-t border-border" />
                    <AccountItem
                      icon={<LogOut />}
                      label="Sign out"
                      danger
                      onClick={() => void signOut()}
                    />
                  </div>
                )}
              </div>
            </div>
          </Container>
        </header>
        <main className="min-h-screen bg-white pt-[4.5rem]">
          <div className="programme-admin-content w-full py-6 sm:py-7 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function RailItem({
  icon,
  label,
  active,
  disabled = false,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left font-body text-[0.8rem] font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-bright ${active ? "bg-teal/20 text-white" : disabled ? "cursor-not-allowed text-slate-500" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-teal-bright" />
      )}
      <span className="flex size-5 items-center justify-center [&>svg]:size-[18px]">
        {icon}
      </span>
      <span>{label}</span>
      {hint && (
        <span className="ml-auto text-[0.6rem] font-medium text-slate-500">
          {hint}
        </span>
      )}
      {active && <span className="ml-auto size-1.5 rounded-full bg-teal" />}
    </button>
  );
}

function RailGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="px-2.5 font-body text-[0.6rem] font-bold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <div className="mt-2 flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function AccountItem({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-body text-sm font-semibold transition hover:bg-mist ${danger ? "text-error" : "text-navy"}`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
