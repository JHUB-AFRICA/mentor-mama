import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { Container } from "@mentormama/ui";
import { logout, type CurrentUser } from "../../services/api";
import { Link } from "react-router-dom";
import logoIcon from "../../assets/brand/logo-icon-dark.svg";
import { NotificationPopover } from "../notifications/NotificationPopover";

export type CoordinatorNav =
  "overview" | "cohorts" | "placements" | "reports" | "activity";

export function CoordinatorFrame({
  user,
  active,
  title,
  children,
  onNavigate,
  onAccount,
  onSignedOut,
  onError,
}: {
  user: CurrentUser;
  active: CoordinatorNav;
  title: string;
  children: ReactNode;
  onNavigate: (destination: CoordinatorNav) => void;
  onAccount: (
    tab?: "security" | "profile" | "notifications" | "recovery",
  ) => void;
  onSignedOut: () => void;
  onError: (message: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
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
  function go(destination: CoordinatorNav) {
    onNavigate(destination);
    setMobileOpen(false);
  }
  return (
    <div className="coordinator-shell min-h-screen overflow-x-hidden bg-[#f7fbfb] text-navy">
      <a
        href="#coordinator-main"
        className="sr-only z-[60] rounded-md bg-white px-3 py-2 text-sm font-semibold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <aside
        className={`programme-admin-rail fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-white/10 bg-navy px-5 py-6 text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <Link
            to="/coordinator"
            className="flex items-center gap-3"
            onClick={() => setMobileOpen(false)}
          >
            <img src={logoIcon} alt="" className="h-10 w-10" />
            <span>
              <span className="block font-display text-xl font-bold tracking-tight">
                Mentor<span className="text-teal-bright">MAMA</span>
              </span>
              <span className="mt-1 block font-body text-[0.66rem] uppercase tracking-[0.16em] text-slate-300">
                Institution workspace
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-300 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-11">
          <p className="px-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">
            Coordinator workspace
          </p>
          <nav
            className="mt-3 flex flex-col gap-1"
            aria-label="Coordinator navigation"
          >
            <RailItem
              icon={<LayoutDashboard />}
              label="Overview"
              active={active === "overview"}
              onClick={() => go("overview")}
            />
            <RailItem
              icon={<Users />}
              label="Cohorts & students"
              active={active === "cohorts"}
              onClick={() => go("cohorts")}
            />
            <RailItem
              icon={<ClipboardList />}
              label="Placements"
              active={active === "placements"}
              onClick={() => go("placements")}
            />
            <RailItem
              icon={<BarChart3 />}
              label="Reports"
              active={active === "reports"}
              onClick={() => go("reports")}
            />
            <RailItem
              icon={<Activity />}
              label="Activity"
              active={active === "activity"}
              onClick={() => go("activity")}
            />
          </nav>
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
                University Coordinator
              </span>
            </span>
          </div>
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-body text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => onAccount("security")}
          >
            <Settings2 size={17} />
            Account & security
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-body text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
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
        <header className="programme-admin-header sticky top-0 z-20 border-b border-border/80 bg-white/95 backdrop-blur">
          <Container className="flex min-h-[5.3rem] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-navy lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <p className="truncate font-body text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal">
                  Institution administration
                </p>
                <h1 className="mt-1 truncate font-display text-xl font-bold tracking-tight text-navy sm:text-2xl">
                  {title}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <NotificationPopover />
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div ref={menuRef} className="relative">
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
                      University Coordinator
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
        <main
          id="coordinator-main"
          className="min-h-[calc(100vh-5.3rem)] bg-white"
        >
          <Container className="py-8 sm:py-10 lg:py-12">{children}</Container>
        </main>
      </div>
    </div>
  );
}

function RailItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-body text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-bright ${active ? "bg-white text-navy" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
      {active && <span className="ml-auto size-1.5 rounded-full bg-teal" />}
    </button>
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
