/**
 * Programme Admin design kit.
 *
 * Every Programme Admin screen composes these primitives so type sizes, card
 * shapes, control heights, tables and status colours stay identical. The look
 * is taken from the Content library page. Styles: ./admin-kit.css.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import "./admin-kit.css";

export type Tone = "teal" | "violet" | "blue" | "sky" | "amber" | "rose" | "green" | "slate";
export type PillTone = "success" | "warning" | "danger" | "info" | "teal" | "neutral";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("pa", className)}>{children}</div>;
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="pa-header">
      <div className="pa-header__copy">
        <p className="pa-eyebrow">{eyebrow}</p>
        <h2 className="pa-title">{title}</h2>
        {description && <p className="pa-description">{description}</p>}
        {meta && <div className="pa-header__meta">{meta}</div>}
      </div>
      {actions && <div className="pa-header__actions">{actions}</div>}
    </section>
  );
}

export function AdminButton({
  variant = "primary",
  size,
  icon,
  children,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cx("pa-btn", `pa-btn--${variant}`, size === "sm" && "pa-btn--sm", className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconTile({ tone = "teal", icon, size }: { tone?: Tone; icon: ReactNode; size?: "sm" }) {
  return (
    <span className={cx("pa-tile", `pa-tile--${tone}`, size === "sm" && "pa-tile--sm")} aria-hidden="true">
      {icon}
    </span>
  );
}

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <section className="pa-stats" style={{ ["--pa-stat-cols" as string]: columns }}>
      {children}
    </section>
  );
}

export function StatCard({
  icon,
  tone = "teal",
  value,
  label,
  hint,
  onClick,
  loading,
}: {
  icon: ReactNode;
  tone?: Tone;
  value: ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  const body = (
    <>
      <IconTile tone={tone} icon={icon} />
      <span className="pa-stat__body">
        <strong className="pa-stat__value">{loading ? "—" : value}</strong>
        <span className="pa-stat__label">{label}</span>
        {hint && (
          <span className="pa-stat__hint" title={hint}>
            {hint}
          </span>
        )}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className="pa-stat" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="pa-stat">{body}</div>
  );
}

export function AdminCard({
  title,
  description,
  action,
  footer,
  flush,
  children,
  className,
  titleId,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  children: ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <section className={cx("pa-card", className)} aria-labelledby={titleId}>
      {(title || action) && (
        <header className="pa-card__header">
          <div className="min-w-0">
            {title && (
              <h3 id={titleId} className="pa-card__title">
                {title}
              </h3>
            )}
            {description && <p className="pa-card__description">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cx("pa-card__body", flush && "pa-card__body--flush")}>{children}</div>
      {footer && <footer className="pa-card__footer">{footer}</footer>}
    </section>
  );
}

/** A tappable row with an icon tile, two lines of text, an optional value/trailing slot and a chevron. */
export function ListRow({
  icon,
  tone = "teal",
  title,
  meta,
  value,
  trailing,
  onClick,
}: {
  icon?: ReactNode;
  tone?: Tone;
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      {icon && <IconTile tone={tone} icon={icon} size="sm" />}
      <span className="pa-row__body">
        <span className="pa-row__title">{title}</span>
        {meta && <span className="pa-row__meta">{meta}</span>}
      </span>
      {value !== undefined && <span className="pa-row__value">{value}</span>}
      {trailing}
      {onClick && <ChevronRight size={16} className="pa-row__chevron" aria-hidden="true" />}
    </>
  );
  return onClick ? (
    <button type="button" className="pa-row" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="pa-row">{content}</div>
  );
}

export function StatusPill({ tone, children, dot = true }: { tone: PillTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("pa-pill", `pa-pill--${tone}`)}>
      {dot && <span className="pa-pill__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function AdminTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="pa-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className="pa-tab"
          onClick={() => onChange(tab.value)}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && <span className="pa-tab__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children, compact, filters = 3 }: { children: ReactNode; compact?: boolean; filters?: number }) {
  return (
    <section
      className={cx("pa-toolbar", compact && "pa-toolbar--compact")}
      style={{ ["--pa-filter-cols" as string]: filters }}
    >
      {children}
    </section>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="pa-search">
      <Search aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <label className="pa-select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" />
    </label>
  );
}

export function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="pa-notice" role="note">
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="pa-empty">
      <span className="pa-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="pa-empty__title">{title}</p>
      {text && <p className="pa-empty__text">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
