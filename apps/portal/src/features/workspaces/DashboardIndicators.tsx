import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, ClipboardList, Clock3 } from "lucide-react";
import { Card, Skeleton } from "@mentormama/ui";
import { getDashboardIndicators } from "../../services/api";

const cards = [
  { key: "placements_active", label: "Active placements", icon: Activity, tone: "text-teal" },
  { key: "placements_awaiting_student", label: "Awaiting confirmation", icon: Clock3, tone: "text-amber-700" },
  { key: "placements_induction", label: "In induction", icon: ClipboardList, tone: "text-indigo-700" },
  { key: "open_concerns", label: "Open concerns", icon: AlertTriangle, tone: "text-error" },
  { key: "placements_completed", label: "Completed placements", icon: CheckCircle2, tone: "text-emerald-700" },
] as const;

export function DashboardIndicators() {
  const query = useQuery({
    queryKey: ["dashboard-indicators"],
    queryFn: getDashboardIndicators,
    staleTime: 15_000,
  });
  if (query.isPending) {
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map((card) => <Skeleton key={card.key} className="h-32 rounded-2xl" />)}</div>;
  }
  if (query.isError) {
    return <p className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 font-body text-sm text-error">Programme indicators are temporarily unavailable.</p>;
  }
  const values = query.data.indicators;
  return (
    <div aria-label="Programme indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(({ key, label, icon: Icon, tone }) => (
        <Card key={key} className="rounded-2xl border-border/70 bg-white p-5 shadow-sm">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-mist ${tone}`}><Icon size={18} /></div>
          <p className="mt-5 font-display text-3xl font-bold text-navy">{values[key] ?? 0}</p>
          <p className="mt-1 font-body text-xs font-semibold text-navy-muted">{label}</p>
        </Card>
      ))}
    </div>
  );
}
