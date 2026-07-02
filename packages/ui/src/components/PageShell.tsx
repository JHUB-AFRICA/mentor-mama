import type { ReactNode } from "react";

export interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return <div className="flex min-h-screen flex-col bg-mist">{children}</div>;
}
