import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Card, Skeleton } from "@mentormama/ui";
import { getFeedbackAggregates } from "../../services/api";

export function MentorFeedbackSummary() {
  const query = useQuery({ queryKey: ["mentor-feedback-aggregates"], queryFn: getFeedbackAggregates, staleTime: 60_000 });
  if (query.isPending) return <Skeleton className="mb-7 h-28 rounded-2xl" />;
  if (query.isError || !query.data.length) return null;
  return <Card padding="lg" className="mb-7 border-teal/20 bg-teal-light/20"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-teal"><BarChart3 size={19} /></span><div><p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Your feedback</p><h2 className="mt-1 font-display text-xl font-bold text-navy">Mentor experience summary</h2><p className="mt-1 font-body text-sm text-navy-muted">Shown only after at least three responses are available.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{query.data.map((item) => <div key={item.question_code} className="rounded-xl bg-white px-4 py-3"><p className="font-body text-xs font-semibold capitalize text-navy-muted">{item.question_code.replaceAll("_", " ")}</p><p className="mt-1 font-display text-2xl font-bold text-navy">{item.mean_score.toFixed(1)}<span className="ml-1 font-body text-xs font-semibold text-navy-muted">/ 5 · {item.responses} responses</span></p></div>)}</div></Card>;
}
