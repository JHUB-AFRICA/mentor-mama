import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg";
  to?: string;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  to,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center rounded-lg font-display font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  const sizes = {
    sm: "px-4 py-2 text-caption",
    md: "px-5 py-2.5 text-caption",
    lg: "px-6 py-3 text-body",
  };

  const variants = {
    primary: "bg-teal text-white hover:bg-teal/90 hover:shadow-md hover:shadow-teal/20",
    secondary: "bg-navy text-white hover:bg-navy/90 shadow-sm shadow-navy/10",
    tertiary: "bg-transparent text-navy underline-offset-4 hover:underline",
  };

  const classes = `${baseStyles} ${sizes[size]} ${variants[variant]} ${className}`;

  if (to) {
    return (
      <a href={to} className={classes} {...(props as any)}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
