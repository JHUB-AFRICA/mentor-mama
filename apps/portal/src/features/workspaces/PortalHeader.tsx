/**
 * The one top header used by every role's workspace: page context on the left;
 * "Search or ask Menta", notifications and the account menu on the right.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, LifeBuoy, LogOut, Menu, Search } from "lucide-react";
import { getAIStatus } from "../../services/api";
import { openMenta } from "../assistant/events";
import { HelpDialog } from "./HelpDialog";
import { NotificationPopover } from "../notifications/NotificationPopover";
import "./PortalHeader.css";

export interface HeaderAccountItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function PortalHeader({
  onOpenNav,
  crumbs,
  eyebrow,
  title,
  context,
  user,
  accountItems = [],
  onSignOut,
  help = true,
}: {
  onOpenNav: () => void;
  /** Breadcrumb trail; the last entry is the current page. */
  crumbs?: string[];
  eyebrow?: string;
  title?: string;
  /** Small chip such as the programme or facility name. */
  context?: ReactNode;
  user: { name: string; email?: string; roleLabel: string };
  accountItems?: HeaderAccountItem[];
  onSignOut?: () => void;
  /** Show "Get help" in the account menu (everyone except platform administrators, who answer the requests). */
  help?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus, staleTime: 5 * 60_000, retry: false });
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Browser tab: "Placement details · MentorMAMA". The page name comes first so it survives tab truncation.
  const pageName = title ?? crumbs?.[crumbs.length - 1];
  useEffect(() => {
    document.title = pageName ? `${pageName} · MentorMAMA` : "MentorMAMA";
  }, [pageName]);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);

  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "U";

  return (
    <header className="portal-header">
      <div className="portal-header__inner">
        <div className="portal-header__left">
          <button type="button" className="portal-header__menu" onClick={onOpenNav} aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </button>
          {crumbs?.length ? (
            <nav aria-label="Breadcrumb" className="portal-header__crumbs">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`} className="portal-header__crumb">
                  {index > 0 && <ChevronRight aria-hidden="true" className="portal-header__crumb-sep" />}
                  <span aria-current={index === crumbs.length - 1 ? "page" : undefined}>{crumb}</span>
                </span>
              ))}
            </nav>
          ) : (
            <div className="portal-header__heading">
              {eyebrow && <p className="portal-header__eyebrow">{eyebrow}</p>}
              {title && <h1 className="portal-header__title">{title}</h1>}
            </div>
          )}
        </div>

        <div className="portal-header__right">
          {ai.data?.assistant && (
            <button type="button" className="portal-header__command" onClick={() => openMenta()}>
              <Search aria-hidden="true" />
              <span className="portal-header__command-label">Search or ask Menta</span>
              <kbd aria-hidden="true">{isMac ? "⌘" : "Ctrl"} K</kbd>
            </button>
          )}
          {context && <div className="portal-header__context">{context}</div>}
          <NotificationPopover />
          <span className="portal-header__divider" aria-hidden="true" />
          <div ref={menuRef} className="portal-header__account">
            <button
              ref={buttonRef}
              type="button"
              className={`portal-header__account-button${open ? " is-open" : ""}`}
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label={`${user.name} account menu`}
            >
              <span className="portal-header__avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="portal-header__who">
                <span className="portal-header__name">{user.name}</span>
                <span className="portal-header__role">{user.roleLabel}</span>
              </span>
              <ChevronDown aria-hidden="true" className="portal-header__chevron" />
            </button>
            <AnimatePresence>
              {open && (
                <motion.div
                  role="menu"
                  aria-label="Account menu"
                  className="portal-header__menu-panel"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                >
                  <div className="portal-header__menu-who">
                    <span className="portal-header__avatar portal-header__avatar--lg" aria-hidden="true">
                      {initials}
                    </span>
                    <span className="min-w-0">
                      <span className="portal-header__name">{user.name}</span>
                      {user.email && <span className="portal-header__email">{user.email}</span>}
                      <span className="portal-header__role">{user.roleLabel}</span>
                    </span>
                  </div>
                  {accountItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      className="portal-header__menu-item"
                      onClick={() => {
                        setOpen(false);
                        item.onSelect();
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                  {help && (
                    <button
                      type="button"
                      role="menuitem"
                      className="portal-header__menu-item"
                      onClick={() => {
                        setOpen(false);
                        setHelpOpen(true);
                      }}
                    >
                      <LifeBuoy aria-hidden="true" />
                      Get help
                    </button>
                  )}
                  {onSignOut && (
                    <>
                      <span className="portal-header__menu-sep" aria-hidden="true" />
                      <button
                        type="button"
                        role="menuitem"
                        className="portal-header__menu-item portal-header__menu-item--danger"
                        onClick={() => {
                          setOpen(false);
                          onSignOut();
                        }}
                      >
                        <LogOut aria-hidden="true" />
                        Sign out
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      {help && <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />}
    </header>
  );
}
