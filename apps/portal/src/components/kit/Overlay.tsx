/**
 * Modal and Drawer shells used by every dialog in the portal.
 *
 * - Rendered in a portal above the sidebar, header and Menta (z-index 70),
 *   so a modal always covers the whole app.
 * - Focus is trapped and restored, Escape and a backdrop press close it
 *   (unless `dismissible` is false), and the page behind does not scroll.
 * - Enter/exit animations respect reduced-motion settings.
 */
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useAccessibleDialog } from "../../hooks/useAccessibleDialog";
import "./kit.css";

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [active]);
}

interface ShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Prevent closing by Escape/backdrop, e.g. while a request is in flight. */
  dismissible?: boolean;
  closeLabel?: string;
}

function DialogBody({
  kind,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  dismissible = true,
  closeLabel = "Close",
  size,
  header,
  tabs,
}: ShellProps & { kind: "modal" | "drawer"; size?: "sm" | "md" | "lg"; header?: ReactNode; tabs?: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useAccessibleDialog<HTMLDivElement>(() => {
    if (dismissible) onClose();
  });
  useScrollLock(true);

  const panelMotion =
    kind === "drawer"
      ? reduce
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } }
      : reduce
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : { initial: { opacity: 0, y: 16, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 10, scale: 0.98 } };

  return (
    <div className={`ui-overlay ui-overlay--${kind}`}>
      <motion.div
        className="ui-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onMouseDown={() => {
          if (dismissible) onClose();
        }}
        aria-hidden="true"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`ui-dialog ui-dialog--${kind}${size ? ` ui-dialog--${size}` : ""}`}
        transition={kind === "drawer" ? { type: "spring", stiffness: 380, damping: 38 } : { type: "spring", stiffness: 420, damping: 34 }}
        {...panelMotion}
      >
        <header className="ui-dialog__header">
          {header ?? (
            <div className="ui-dialog__heading">
              {icon && (
                <span className="ui-dialog__icon" aria-hidden="true">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                <h2 id={titleId} className="ui-dialog__title">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="ui-dialog__description">
                    {description}
                  </p>
                )}
              </div>
            </div>
          )}
          {header && (
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
          )}
          <button type="button" className="ui-dialog__close" onClick={onClose} aria-label={closeLabel} disabled={!dismissible}>
            <X aria-hidden="true" />
          </button>
        </header>
        {tabs && <div className="ui-dialog__tabs">{tabs}</div>}
        <div className="ui-dialog__body">{children}</div>
        {footer && <footer className="ui-dialog__footer">{footer}</footer>}
      </motion.div>
    </div>
  );
}

export function Modal({ open, size = "md", ...props }: ShellProps & { size?: "sm" | "md" | "lg" }) {
  return createPortal(
    <AnimatePresence>{open && <DialogBody key="modal" kind="modal" size={size} open {...props} />}</AnimatePresence>,
    document.body,
  );
}

/** A right-hand sheet for record details. `header` replaces the default title block (e.g. avatar + name). */
export function Drawer({ open, header, tabs, ...props }: ShellProps & { header?: ReactNode; tabs?: ReactNode }) {
  return createPortal(
    <AnimatePresence>
      {open && <DialogBody key="drawer" kind="drawer" header={header} tabs={tabs} open {...props} />}
    </AnimatePresence>,
    document.body,
  );
}

/** Label/value rows for record details, with an optional icon per row. */
export function DetailList({ items }: { items: Array<{ label: string; value: ReactNode; icon?: ReactNode }> }) {
  return (
    <dl className="ui-details">
      {items.map((item) => (
        <div key={item.label} className="ui-details__row">
          {item.icon && (
            <span className="ui-details__icon" aria-hidden="true">
              {item.icon}
            </span>
          )}
          <dt>{item.label}</dt>
          <dd>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-detail-section">
      <div className="ui-detail-section__head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
