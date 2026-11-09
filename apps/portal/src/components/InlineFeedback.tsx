import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";

type FeedbackKind = "success" | "error" | "info";

const appearance = {
  success: {
    Icon: CheckCircle2,
    panel: "border-success/25 bg-success/5",
    icon: "bg-success/10 text-success",
    title: "text-success",
  },
  error: {
    Icon: CircleAlert,
    panel: "border-error/25 bg-error/5",
    icon: "bg-error/10 text-error",
    title: "text-error",
  },
  info: {
    Icon: Info,
    panel: "border-teal/20 bg-teal-light",
    icon: "bg-white text-teal",
    title: "text-navy",
  },
} satisfies Record<FeedbackKind, { Icon: typeof CheckCircle2; panel: string; icon: string; title: string }>;

export function InlineFeedback({
  kind,
  title,
  children,
}: {
  kind: FeedbackKind;
  title: string;
  children?: ReactNode;
}) {
  const style = appearance[kind];
  const Icon = style.Icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${style.panel}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${style.icon}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={`font-body text-sm font-semibold ${style.title}`}>{title}</p>
        {children && <div className="mt-1 font-body text-xs leading-5 text-navy-muted">{children}</div>}
      </div>
    </div>
  );
}
