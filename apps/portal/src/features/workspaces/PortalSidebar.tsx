/**
 * The one sidebar used by every role's workspace.
 *
 * Each workspace passes its own groups. An item with `href` renders as a link;
 * an item with `onSelect` renders as a button, so each workspace keeps its
 * existing navigation behaviour (and accessible roles) exactly.
 */
import { useEffect, useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { LogOut, X } from "lucide-react";
import { getAIStatus } from "../../services/api";
import logoIcon from "../../assets/brand/logo-icon-dark.svg";
import { MentaMascot } from "../assistant/MentaMascot";
import { openMenta } from "../assistant/events";
import "./PortalSidebar.css";

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  href?: string;
  onSelect?: () => void;
  /** Items waiting for the person (shown as a count next to the label; announced to screen readers). */
  badge?: number;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function PortalSidebar({
  brandHref,
  workspaceLabel,
  navLabel,
  groups,
  activeId,
  footerItems = [],
  user,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: {
  brandHref: string;
  workspaceLabel: string;
  navLabel: string;
  groups: SidebarGroup[];
  activeId?: string;
  footerItems?: SidebarItem[];
  user: { name: string; roleLabel: string };
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const layoutId = useId();
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus, staleTime: 5 * 60_000, retry: false });

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "U";

  return (
    <>
      <aside className={`portal-sidebar${mobileOpen ? " is-open" : ""}`} aria-label="Main navigation">
        <div className="portal-sidebar__brand">
          <Link to={brandHref} className="portal-sidebar__brand-link" onClick={onCloseMobile}>
            <span className="portal-sidebar__logo">
              <img src={logoIcon} alt="" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="portal-sidebar__name">
                Mentor<span>MAMA</span>
              </span>
              <span className="portal-sidebar__workspace">{workspaceLabel}</span>
            </span>
          </Link>
          <button type="button" className="portal-sidebar__close" onClick={onCloseMobile} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="portal-sidebar__scroll">
          <LayoutGroup id={layoutId}>
            <nav aria-label={navLabel} className="portal-sidebar__nav">
              {groups.map((group) => (
                <section key={group.label} className="portal-sidebar__group">
                  <p className="portal-sidebar__group-label">{group.label}</p>
                  <div className="portal-sidebar__items">
                    {group.items.map((item) => (
                      <SidebarEntry
                        key={item.id}
                        item={item}
                        active={item.id === activeId}
                        layoutId={layoutId}
                        reduce={reduce}
                        onNavigate={onCloseMobile}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </nav>
          </LayoutGroup>
        </div>

        <div className="portal-sidebar__bottom">
          {ai.data?.assistant && (
            <button
              type="button"
              className="portal-sidebar__menta"
              onClick={() => {
                onCloseMobile();
                openMenta();
              }}
            >
              <span className="portal-sidebar__menta-avatar" aria-hidden="true">
                <MentaMascot mood="idle" reduce size={34} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="portal-sidebar__menta-title">Ask Menta</span>
                <span className="portal-sidebar__menta-sub">Find anything, fast</span>
              </span>
              <kbd className="portal-sidebar__kbd" aria-label={isMac ? "Command K" : "Control K"}>
                {isMac ? "⌘" : "Ctrl"} K
              </kbd>
            </button>
          )}

          <div className="portal-sidebar__user">
            <span className="portal-sidebar__avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="portal-sidebar__user-name">{user.name}</span>
              <span className="portal-sidebar__user-role">{user.roleLabel}</span>
            </span>
            <span className="portal-sidebar__user-actions">
              {footerItems.map((item) => (
                <FooterAction key={item.id} item={item} active={item.id === activeId} onNavigate={onCloseMobile} />
              ))}
              <button type="button" className="portal-sidebar__action" onClick={onSignOut} aria-label="Sign out" title="Sign out">
                <LogOut aria-hidden="true" />
              </button>
            </span>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button type="button" className="portal-sidebar__overlay" aria-label="Close navigation overlay" onClick={onCloseMobile} />
      )}
    </>
  );
}

function FooterAction({ item, active, onNavigate }: { item: SidebarItem; active: boolean; onNavigate: () => void }) {
  const className = `portal-sidebar__action${active ? " is-active" : ""}`;
  if (item.href && !item.onSelect) {
    return (
      <Link to={item.href} className={className} aria-label={item.label} title={item.label} onClick={onNavigate}>
        {item.icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={item.label}
      title={item.label}
      onClick={() => {
        item.onSelect?.();
        onNavigate();
      }}
    >
      {item.icon}
    </button>
  );
}

function SidebarEntry({
  item,
  active,
  layoutId,
  reduce,
  onNavigate,
  compact,
}: {
  item: SidebarItem;
  active: boolean;
  layoutId: string;
  reduce: boolean;
  onNavigate: () => void;
  compact?: boolean;
}) {
  const className = `portal-sidebar__item${active ? " is-active" : ""}${compact ? " portal-sidebar__item--compact" : ""}`;
  const content = (
    <>
      {active && (
        <motion.span
          layoutId={reduce ? undefined : `${layoutId}-active`}
          className="portal-sidebar__active-bg"
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
          aria-hidden="true"
        />
      )}
      <span className="portal-sidebar__icon">{item.icon}</span>
      <span className="portal-sidebar__label">{item.label}</span>
      {item.badge ? (
        <span className="portal-sidebar__badge">
          {item.badge > 99 ? "99+" : item.badge}
          <span className="sr-only"> waiting</span>
        </span>
      ) : null}
    </>
  );
  if (item.href && !item.onSelect) {
    return (
      <Link to={item.href} className={className} aria-current={active ? "page" : undefined} onClick={onNavigate}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        item.onSelect?.();
        onNavigate();
      }}
    >
      {content}
    </button>
  );
}
