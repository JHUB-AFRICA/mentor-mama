import { useState, type ReactNode } from "react";
import {
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  X,
} from "lucide-react";
import { logout, type CurrentUser } from "../../services/api";
import { NotificationPopover } from "../notifications/NotificationPopover";
import { Link } from "react-router-dom";

export function PortalWorkspaceLayout({
  user,
  children,
}: {
  user: CurrentUser;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const roleLabel =
    user.role === "coordinator"
      ? "University Coordinator"
      : user.role === "nurse_manager"
        ? "Nurse Manager"
        : "Programme Administrator";
  const workspace =
    user.role === "coordinator"
      ? "Institution workspace"
      : user.role === "nurse_manager"
        ? "Facility workspace"
        : "Programme workspace";
  async function signOut() {
    try {
      await logout();
    } finally {
      window.location.assign("/");
    }
  }
  return (
    <div className="min-h-screen bg-[#edf4f5] text-navy">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col bg-navy px-5 py-6 text-white shadow-[12px_0_32px_rgba(8,25,53,0.08)] transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal/60 text-xl font-bold text-teal-bright">
              m
            </span>
            <span>
              <span className="block font-display text-xl font-bold tracking-tight">
                Mentor<span className="text-teal-bright">MAMA</span>
              </span>
              <span className="mt-1 block font-body text-[0.66rem] uppercase tracking-[0.16em] text-slate-300">
                Programme portal
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <nav className="mt-12 space-y-1" aria-label="Workspace navigation">
          <NavLink
            href="/"
            icon={<LayoutDashboard size={17} />}
            label="Overview"
          />
          <NavLink
            href="/placements"
            icon={<ClipboardList size={17} />}
            label="Placements"
            active
          />
        </nav>
        <div className="mt-auto border-t border-white/10 pt-5">
          <div className="mb-5 flex items-center gap-3 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal font-body text-sm font-bold">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-body text-sm font-semibold">
                {user.name}
              </span>
              <span className="mt-0.5 block font-body text-[0.68rem] text-slate-400">
                {roleLabel}
              </span>
            </span>
          </div>
          <NavLink
            href="/account"
            icon={<Settings2 size={17} />}
            label="Settings"
          />
          <a href="mailto:support@mentormama.org" className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-body text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white">
            <CircleHelp size={17} />
            Support
          </a>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 font-body text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      {open && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-navy/45 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="min-h-screen min-w-0 lg:pl-[17rem]">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-[5.4rem] max-w-[90rem] items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-border p-2.5 text-navy lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <div>
                <p className="font-body text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal">
                  {workspace}
                </p>
                <h1 className="mt-1 font-display text-xl font-bold text-navy sm:text-2xl">
                  Placement management
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <NotificationPopover />
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal font-body text-sm font-bold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:block">
                  <span className="block font-body text-sm font-semibold text-navy">
                    {user.name}
                  </span>
                  <span className="mt-0.5 block font-body text-xs text-navy-muted">
                    {roleLabel}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 sm:py-10 lg:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to={href}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 font-body text-sm font-semibold transition ${active ? "bg-white text-navy shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
    >
      {icon}
      {label}
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal" />}
    </Link>
  );
}
