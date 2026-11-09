import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "@mentormama/ui";
import { getAnonymousFeedbackReport } from "../../services/api";

export function AnonymousFeedbackReport() {
  const query = useQuery({
    queryKey: ["anonymous-feedback-report"],
    queryFn: getAnonymousFeedbackReport,
    staleTime: 60_000,
  });

  return (
    <section aria-labelledby="anonymous-feedback-report-heading" className="space-y-4">
      <div>
        <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Student voice</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="anonymous-feedback-report-heading" className="mt-2 font-display text-2xl font-bold text-navy">Anonymous feedback</h2>
            <p className="mt-1 max-w-3xl font-body text-sm leading-6 text-navy-muted">Responses are grouped by cohort, facility, and ward. Groups appear only after three submissions; individual comments and placements are never shown.</p>
          </div>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="font-body text-sm font-semibold text-teal disabled:opacity-60">{query.isFetching ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>
      {query.isPending ? <Skeleton className="h-32" /> : query.isError ? (
        <div role="alert" className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error">
          Could not load anonymous feedback. <button type="button" className="font-bold underline" onClick={() => void query.refetch()}>Try again</button>
        </div>
      ) : query.data.length === 0 ? (
        <Card padding="lg"><p className="font-body text-sm leading-6 text-navy-muted">No group has reached the minimum of three submissions yet.</p></Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {query.data.map((group) => (
            <Card key={`${group.cohort_id}-${group.facility_id}-${group.ward_id}`} padding="lg" className="border-border bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-navy">{group.ward_name}</h3>
                  <p className="mt-1 font-body text-sm text-navy-muted">{group.cohort_name} · {group.facility_name}</p>
                </div>
                <span className="rounded-full bg-teal-light px-3 py-1 font-body text-xs font-bold text-teal">{group.submissions} submissions</span>
              </div>
              {group.scores.length > 0 ? (
                <dl className="mt-5 divide-y divide-border border-t border-border">
                  {group.scores.map((score) => <div key={`${score.question_code}-${score.scale}`} className="flex items-center justify-between gap-4 py-3">
                    <dt className="font-body text-sm font-medium capitalize text-navy">{score.question_code.replaceAll("_", " ")}</dt>
                    <dd className="text-right font-body text-sm font-bold tabular-nums text-navy">{score.mean_score === null ? "—" : `${score.mean_score.toFixed(1)} / 5`} <span className="font-normal text-navy-muted">· {score.responses} responses</span></dd>
                  </div>)}
                </dl>
              ) : <p className="mt-5 border-t border-border pt-4 font-body text-sm text-navy-muted">No scored responses are available for this group.</p>}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
