import { useEffect, useState, type ReactNode } from "react";
import {
  ClipboardList,
  BookOpen,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Settings2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { resetScrollLockIfIdle } from "../../lib/scrollLock";
import { logout, type CurrentUser } from "../../services/api";
import { useFollowUpCounts } from "../../services/follow-ups";
import "./RoleWorkspace.css";
import { PortalSidebar, type SidebarItem } from "./PortalSidebar";
import { PortalHeader } from "./PortalHeader";

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
    | "followups"
    | "log"
    | "training"
    | "learning"
    | "library"
    | "concerns"
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
  const navigate = useNavigate();
  const location = useLocation();
  // Safety net: a route change with no dialog open must never leave the page scroll-locked.
  useEffect(() => resetScrollLockIfIdle(), [location.pathname, location.search]);

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
  const followUpCounts = useFollowUpCounts(isMentor);
  const pendingFollowUps = followUpCounts.data?.pending ?? 0;

  const navItems: SidebarItem[] = isMentor
    ? [
        { id: "today", label: "Overview", icon: <LayoutDashboard size={18} />, href: "/mentor" },
        { id: "students", label: "Students", icon: <Users size={18} />, href: "/mentor?view=students" },
        { id: "followups", label: "Follow-ups", icon: <ListChecks size={18} />, href: "/mentor?view=follow-ups", badge: pendingFollowUps },
        { id: "log", label: "Log session", icon: <ClipboardList size={18} />, href: "/mentor?view=log" },
        { id: "training", label: "Training", icon: <GraduationCap size={18} />, href: "/mentor?view=training" },
        { id: "library", label: "Library", icon: <BookOpen size={18} />, href: "/mentor?view=library" },
        { id: "more", label: "More", icon: <Settings2 size={18} />, href: "/mentor?view=more" },
      ]
    : [
        { id: "overview", label: "Overview", icon: <LayoutDashboard size={18} />, href: homeHref },
        {
          id: "placements",
          label: user.role === "student" ? "My placements" : "Placements",
          icon: <ClipboardList size={18} />,
          href: placementsHref,
        },
        ...(user.role === "student"
          ? [
              { id: "learning", label: "Learning", icon: <GraduationCap size={18} />, href: "/student?view=learning" },
              { id: "library", label: "Library", icon: <BookOpen size={18} />, href: "/student?view=library" },
              { id: "log", label: "Sessions", icon: <CalendarDays size={18} />, href: "/student?view=sessions" },
              { id: "concerns", label: "Concerns", icon: <ShieldAlert size={18} />, href: "/student?view=concerns" },
              { id: "more", label: "More", icon: <Settings2 size={18} />, href: "/student?view=more" },
            ]
          : []),
        ...(secondaryLabel && secondaryHref
          ? [{ id: "people", label: secondaryLabel, icon: <Users size={18} />, href: secondaryHref }]
          : []),
      ];

  return (
    <div className="workspace-shell">
      <PortalSidebar
        brandHref={isMentor ? "/mentor" : homeHref}
        workspaceLabel={isMentor ? "Clinical practice" : user.role === "student" ? "Student workspace" : "Workspace"}
        navLabel="Workspace navigation"
        activeId={active}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        user={{ name: user.name, roleLabel }}
        onSignOut={() => void signOut()}
        groups={[{ label: isMentor ? "Clinical practice" : "Workspace", items: navItems }]}
        footerItems={[{ id: "settings", label: "Settings", icon: <Settings2 size={18} />, href: "/account" }]}
      />

      {/* ============================================================
          MAIN AREA
      ============================================================ */}

      <div className="workspace-main">
        {/* Top header */}
        <PortalHeader
          onOpenNav={() => setMobileOpen(true)}
          eyebrow={eyebrow}
          title={title}
          user={{ name: user.name, email: user.email, roleLabel }}
          accountItems={[{ label: "Settings", icon: <Settings2 aria-hidden="true" />, onSelect: () => navigate("/account") }]}
          onSignOut={() => void signOut()}
        />

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
            href="/mentor?view=follow-ups"
            label="Follow-ups"
            icon={<ListChecks size={19} />}
            active={active === "followups"}
            badge={pendingFollowUps}
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


function MobileLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={href}
      aria-current={active ? "page" : undefined}
      className={`workspace-mobile-link ${
        active ? "workspace-mobile-link--active" : ""
      }`}
    >
      <span className="workspace-mobile-link__icon" style={badge ? { position: "relative" } : undefined}>
        {icon}
        {badge ? (
          <span
            style={{
              position: "absolute", top: -6, right: -10, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
              background: "#1d8c8c", color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center",
            }}
          >
            {badge > 99 ? "99+" : badge}
            <span className="sr-only"> waiting</span>
          </span>
        ) : null}
      </span>

      <span>{label}</span>
    </Link>
  );
}
