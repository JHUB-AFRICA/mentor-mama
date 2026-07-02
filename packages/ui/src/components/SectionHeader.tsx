import type { ReactNode } from "react";

export interface SectionHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
  maxWidth?: "sm" | "md" | "lg" | "full";
}

const widths = {
  sm: "max-w-xl",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  full: "max-w-none",
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
  maxWidth = "md",
}: SectionHeaderProps) {
  return (
    <div className={`mb-14 ${align === "center" ? "text-center" : "text-left"}`}>
      <div className={`${widths[maxWidth]} ${align === "center" ? "mx-auto" : ""}`}>
        {eyebrow && (
          <div className="inline-flex items-center gap-3 mb-4">
            <span className="inline-block h-1.5 w-10 rounded-full bg-teal/70" />
            <p className="font-body text-caption font-semibold uppercase tracking-wide text-teal">
              {eyebrow}
            </p>
          </div>
        )}

        <h2 className="font-display text-display font-semibold text-navy">
          {title}
        </h2>

        {subtitle && (
          <div className="mx-auto mt-4 max-w-2xl font-body text-body text-navy/70">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
