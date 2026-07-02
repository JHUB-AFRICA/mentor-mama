import type { ReactNode } from "react";
import { spacing } from "../tokens/spacing";

type SpacingKey = keyof typeof spacing;

export interface StackProps {
  children: ReactNode;
  gap?: SpacingKey;
  className?: string;
}

export function Stack({ children, gap = "4", className = "" }: StackProps) {
  return (
    <div className={`flex flex-col ${className}`} style={{ gap: spacing[gap] }}>
      {children}
    </div>
  );
}
