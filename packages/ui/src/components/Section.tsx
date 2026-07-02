import type { ReactNode } from "react";
import { Container } from "./Container";
import { layout } from "../tokens/layout";

export interface SectionProps {
  children: ReactNode;
  background?: "white" | "mist" | "navy";
  size?: "default" | "hero";
  className?: string;
}

const backgrounds = {
  white: "bg-white",
  mist: "bg-mist",
  navy: "bg-navy text-white",
};

export function Section({
  children,
  background = "white",
  size = "default",
  className = "",
}: SectionProps) {
  const verticalPadding = size === "hero" ? layout.heroY : layout.sectionY;

  return (
    <section
      className={`${backgrounds[background]} ${className}`}
      style={{
        paddingTop: verticalPadding,
        paddingBottom: verticalPadding,
      }}
    >
      <Container>{children}</Container>
    </section>
  );
}
