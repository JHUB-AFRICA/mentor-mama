import type { ReactNode } from "react";

export interface ContainerProps {
  children: ReactNode;
  size?: "reading" | "default" | "wide" | "full";
  className?: string;
}

const sizes = {
  reading: "max-w-3xl",
  default: "max-w-7xl",
  wide: "max-w-[88rem]",
  full: "max-w-none",
};

export function Container({
  children,
  size = "default",
  className = "",
}: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full ${sizes[size]} px-6 sm:px-8 lg:px-12 xl:px-16 ${className}`}
    >
      {children}
    </div>
  );
}
