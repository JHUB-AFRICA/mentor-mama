import { useState, type ReactNode } from "react";
import {
  ClipboardList,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import { logout, type CurrentUser } from "../../services/api";
import logoIcon from "../../assets/brand/logo-icon-dark.svg";
import { NotificationPopover } from "../notifications/NotificationPopover";
import "./RoleWorkspace.css";

interface RoleWorkspaceFrameProps {
  user: CurrentUser;
  children: ReactNode;
  title: string;
  eyebrow: string;

  active?:
    | "overview"
    | "placements"
    | "people"
    | "today"
    | "students"
    | "log"
    | "training"
    | "library"
    | "more";

  secondaryLabel?: string;
  secondaryHref?: string;

  homeHref?: string;
  placementsHref?: string;
}

const roleLabels: Record<string, string> = {
  coordinator: "University Coordinator",
  nurse_manager: "Nurse Manager",
  mentor: "Clinical Mentor",
  student: "Student",
};

export function RoleWorkspaceFrame({
  user,
  children,
  title,
  eyebrow,
  active = "overview",
  secondaryLabel,
  secondaryHref,
  homeHref = "/",
  placementsHref = "/placements",
}: RoleWorkspaceFrameProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleLabel =
    roleLabels[user.role] ??
    user.role.replaceAll("_", " ");

  async function signOut() {
    try {
      await logout();
    } finally {
      window.location.assign("/");
    }
  }

  const isMentor = user.role === "mentor";

  return (
    <div className="workspace-shell">
      {/* ============================================================
          DESKTOP SIDEBAR
      ============================================================ */}

      <aside
        className={`workspace-sidebar ${
          mobileOpen ? "workspace-sidebar--open" : ""
        }`}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className="workspace-brand">
          <Link
            to="/"
            className="workspace-brand__link"
            onClick={() => setMobileOpen(false)}
          >
            <span className="workspace-brand__mark">
              <img
                src={logoIcon}
                alt=""
                aria-hidden="true"
              />
            </span>

            <span className="workspace-brand__copy">
              <span className="workspace-brand__name">
                Mentor<span>MAMA</span>
              </span>

              <span className="workspace-brand__sub">
                Clinical programme
              </span>
            </span>
          </Link>

          <button
            type="button"
            className="workspace-mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        {/* Workspace navigation */}
        <div className="workspace-navigation">
          <div className="workspace-navigation__label">
            {isMentor ? "Clinical practice" : "Workspace"}
          </div>

          <nav aria-label="Workspace navigation">
            {isMentor ? (
              <>
                <WorkspaceLink
                  href="/mentor"
                  label="Overview"
                  icon={<LayoutDashboard size={18} />}
                  active={active === "today"}
                  onNavigate={() => setMobileOpen(false)}
                />

                <WorkspaceLink
                  href="/mentor?view=students"
                  label="Students"
                  icon={<Users size={18} />}
                  active={active === "students"}
                  onNavigate={() => setMobileOpen(false)}
                />

                <WorkspaceLink
                  href="/mentor?view=log"
                  label="Log session"
                  icon={<ClipboardList size={18} />}
                  active={active === "log"}
                  onNavigate={() => setMobileOpen(false)}
                />

                <WorkspaceLink
                  href="/mentor?view=training"
                  label="Training"
                  icon={<GraduationCap size={18} />}
                  active={active === "training"}
                  onNavigate={() => setMobileOpen(false)}
                />

                <WorkspaceLink
                  href="/mentor?view=library"
                  label="Library"
                  icon={<BookOpen size={18} />}
                  active={active === "library"}
                  onNavigate={() => setMobileOpen(false)}
                />

                <WorkspaceLink
                  href="/mentor?view=more"
                  label="More"
                  icon={<Settings2 size={18} />}
                  active={active === "more"}
                  onNavigate={() => setMobileOpen(false)}
                />
              </>
            ) : (
              <>
                <WorkspaceLink
                  href={homeHref}
                  label="Overview"
                  icon={<LayoutDashboard size={18} />}
                  active={active === "overview"}
                  onNavigate={() => setMobileOpen(false)}
                />

                <WorkspaceLink
                  href={placementsHref}
                  label={
                    user.role === "student"
                      ? "My placements"
                      : "Placements"
                  }
                  icon={<ClipboardList size={18} />}
                  active={active === "placements"}
                  onNavigate={() => setMobileOpen(false)}
                />

                {user.role === "student" && (
                  <>
                    <WorkspaceLink
                      href="/student?view=library"
                      label="Library"
                      icon={<BookOpen size={18} />}
                      active={active === "library"}
                      onNavigate={() => setMobileOpen(false)}
                    />
                    <WorkspaceLink
                      href="/student?view=sessions"
                      label="Sessions"
                      icon={<ClipboardList size={18} />}
                      active={active === "log"}
                      onNavigate={() => setMobileOpen(false)}
                    />
                    <WorkspaceLink
                      href="/student?view=more"
                      label="More"
                      icon={<Settings2 size={18} />}
                      active={active === "more"}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </>
                )}

                {secondaryLabel && secondaryHref && (
                  <WorkspaceLink
                    href={secondaryHref}
                    label={secondaryLabel}
                    icon={<Users size={18} />}
                    active={active === "people"}
                    onNavigate={() => setMobileOpen(false)}
                  />
                )}
              </>
            )}
          </nav>
        </div>

        {/* Sidebar bottom */}
        <div className="workspace-sidebar__bottom">
          <Link
            to="/account"
            className="workspace-account-link"
            onClick={() => setMobileOpen(false)}
          >
            <Settings2 size={17} />
            <span>Settings</span>
          </Link>

          <div className="workspace-user">
            <Avatar name={user.name} />

            <div className="workspace-user__details">
              <div className="workspace-user__name">
                {user.name}
              </div>

              <div className="workspace-user__role">
                {roleLabel}
              </div>
            </div>

            <span
              className="workspace-user__status"
              title="Active"
              aria-label="Active"
            />
          </div>

          <button
            type="button"
            className="workspace-signout"
            onClick={() => void signOut()}
          >
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ============================================================
          MOBILE OVERLAY
      ============================================================ */}

      {mobileOpen && (
        <button
          type="button"
          className="workspace-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ============================================================
          MAIN AREA
      ============================================================ */}

      <div className="workspace-main">
        {/* Top header */}
        <header className="workspace-header">
          <div className="workspace-header__inner">
            <div className="workspace-header__left">
              <button
                type="button"
                className="workspace-menu-button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>

              <div className="workspace-page-heading">
                <div className="workspace-page-heading__eyebrow">
                  {eyebrow}
                </div>

                <h1 className="workspace-page-heading__title">
                  {title}
                </h1>
              </div>
            </div>

            <div className="workspace-header__right">
              <NotificationPopover />

              <div className="workspace-header__divider" />

              <div className="workspace-header-user">
                <Avatar name={user.name} size="small" />

                <div className="workspace-header-user__details">
                  <div className="workspace-header-user__name">
                    {user.name}
                  </div>

                  <div className="workspace-header-user__role">
                    {roleLabel}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main
          className={`workspace-content ${
            isMentor
              ? "workspace-content--mentor"
              : ""
          } ${
            user.role === "student"
              ? "workspace-content--student"
              : ""
          }`}
        >
          {children}
        </main>
      </div>

      {/* ============================================================
          MOBILE BOTTOM NAV
      ============================================================ */}

      {isMentor && !mobileOpen && (
        <nav
          className="workspace-mobile-nav"
          aria-label="Mentor primary navigation"
        >
          <MobileLink
            href="/mentor"
            label="Overview"
            icon={<LayoutDashboard size={19} />}
            active={active === "today"}
          />

          <MobileLink
            href="/mentor?view=students"
            label="Students"
            icon={<Users size={19} />}
            active={active === "students"}
          />

          <MobileLink
            href="/mentor?view=log"
            label="Log"
            icon={<ClipboardList size={19} />}
            active={active === "log"}
          />

          <MobileLink
            href="/mentor?view=more"
            label="More"
            icon={<Settings2 size={19} />}
            active={active === "more"}
          />
        </nav>
      )}
      {user.role === "student" && !mobileOpen && (
        <nav className="workspace-mobile-nav" aria-label="Student primary navigation">
          <MobileLink href="/student" label="Overview" icon={<LayoutDashboard size={19} />} active={active === "overview"} />
          <MobileLink href="/student?view=placements" label="Placements" icon={<ClipboardList size={19} />} active={active === "placements"} />
          <MobileLink href="/student?view=library" label="Library" icon={<BookOpen size={19} />} active={active === "library"} />
          <MobileLink href="/student?view=sessions" label="Sessions" icon={<ClipboardList size={19} />} active={active === "log"} />
          <MobileLink href="/student?view=more" label="More" icon={<Settings2 size={19} />} active={active === "more"} />
        </nav>
      )}
    </div>
  );
}

/* ================================================================
   COMPONENTS
================================================================ */

function WorkspaceLink({
  href,
  label,
  icon,
  active = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`workspace-nav-link ${
        active ? "workspace-nav-link--active" : ""
      }`}
    >
      <span className="workspace-nav-link__icon">
        {icon}
      </span>

      <span className="workspace-nav-link__label">
        {label}
      </span>

      {active && (
        <span
          className="workspace-nav-link__indicator"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

function MobileLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      to={href}
      aria-current={active ? "page" : undefined}
      className={`workspace-mobile-link ${
        active ? "workspace-mobile-link--active" : ""
      }`}
    >
      <span className="workspace-mobile-link__icon">
        {icon}
      </span>

      <span>{label}</span>
    </Link>
  );
}

function Avatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: "normal" | "small";
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <span
      className={`workspace-avatar ${
        size === "small"
          ? "workspace-avatar--small"
          : ""
      }`}
      aria-hidden="true"
    >
      {initials || "U"}
    </span>
  );
}
