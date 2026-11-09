import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, Skeleton } from "@mentormama/ui";
import { getApprovedFeedback, type CurrentUser } from "../../services/api";

export function ApprovedFeedbackPanel({
  user,
}: {
  user: CurrentUser;
}) {
  const query = useQuery({
    queryKey: ["approved-feedback", user.role, user.scope?.institution_id, user.scope?.facility_id],
    queryFn: getApprovedFeedback,
  });

  return (
    <section aria-labelledby="approved-feedback-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Approved feedback</p>
          <h2 id="approved-feedback-heading" className="mt-2 font-display text-2xl font-bold text-navy">What students need the team to hear</h2>
          <p className="mt-1 max-w-2xl font-body text-sm leading-6 text-navy-muted">Confidential feedback is visible here because your role is authorised to review it. Mentorship notes and safeguarding narratives stay separate.</p>
        </div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-body text-sm font-bold text-teal hover:bg-teal-light disabled:opacity-60">
          <RefreshCw size={15} className={query.isFetching ? "animate-spin" : undefined} aria-hidden="true" />
          {query.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {query.isPending ? (
        <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
      ) : query.isError ? (
        <div role="alert" className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error">We could not load approved feedback.<button type="button" onClick={() => void query.refetch()} className="ml-2 font-bold underline">Try again</button></div>
      ) : query.data.length === 0 ? (
        <Card padding="lg"><ShieldCheck className="text-teal" aria-hidden="true" /><h3 className="mt-4 font-display text-xl font-bold text-navy">No approved feedback yet</h3><p className="mt-2 font-body text-sm leading-6 text-navy-muted">New confidential feedback will appear here when students choose to share it with authorised reviewers.</p></Card>
      ) : (
        <div className="space-y-3">
          {query.data.map((item) => (
            <article key={item.id} className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal"><MessageSquareText size={18} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h3 className="font-body text-sm font-bold text-navy">{item.student_name}</h3><p className="mt-1 font-body text-xs text-navy-muted">{item.cohort_name} · {item.facility_name} · {item.ward_name}</p></div><time className="shrink-0 font-body text-xs text-navy-muted" dateTime={item.submitted_at}>{new Date(item.submitted_at).toLocaleDateString("en-GB")}</time></div>
                  <p className="mt-4 whitespace-pre-wrap font-body text-sm leading-6 text-navy">{item.comments || "The student submitted feedback without written comments."}</p>
                  {item.unresolved_concern && <p className="mt-4 inline-flex rounded-full bg-warning/10 px-3 py-1 font-body text-xs font-bold text-warning">Student marked this as needing follow-up</p>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
