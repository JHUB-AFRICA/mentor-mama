import type { HTMLAttributes, ReactNode } from "react";
import { spacing } from "../tokens/spacing";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "sm" | "md" | "lg";
}

const paddings = {
  sm: spacing["5"],
  md: spacing["8"],
  lg: spacing["10"],
};

export function Card({
  children,
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-white border border-teal/20 shadow-sm transition-shadow hover:shadow-md ${className}`}
      style={{ padding: paddings[padding] }}
      {...props}
    >
      {children}
    </div>
  );
}
