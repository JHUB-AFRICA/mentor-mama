/**
 * Small adapters so the Programme setup screens and their dialogs use the
 * Programme Admin kit button, with the same call shape as the shared Button.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AdminButton } from "./ui/AdminKit";
import "./programme-setup-kit.css";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: "primary" | "secondary" | "tertiary" | "danger";
  size?: "sm" | "md";
  to?: string;
  className?: string;
  children: ReactNode;
};

export function Button({ variant = "primary", size, to, className, children, ...rest }: Props) {
  const kitVariant = variant === "primary" || variant === "danger" ? "primary" : "secondary";
  const cls = [variant === "danger" && "pa-btn--danger", className].filter(Boolean).join(" ");
  if (to) {
    return (
      <a
        href={to}
        className={`pa-btn pa-btn--${kitVariant}${size === "sm" ? " pa-btn--sm" : ""} ${cls}`}
        onClick={rest.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
      >
        {children}
      </a>
    );
  }
  return (
    <AdminButton variant={kitVariant} size={size === "sm" ? "sm" : undefined} className={cls} {...rest}>
      {children}
    </AdminButton>
  );
}
