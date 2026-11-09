import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Card, Skeleton } from "@mentormama/ui";
import { getInterruptionReport } from "../../services/api";

function label(reason: string) {
  return reason
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function InterruptionReport({
  compact = false,
  scopeLabel = "Programme monitoring",
}: {
  compact?: boolean;
  scopeLabel?: string;
}) {
  const query = useQuery({
    queryKey: ["dashboard-interruptions"],
    queryFn: getInterruptionReport,
    staleTime: 60_000,
  });
  return (
    <Card
      padding={compact ? "sm" : "lg"}
      className={
        compact
          ? "rounded-[1rem] border-border/70 bg-white shadow-none"
          : "border-border/70 bg-white shadow-sm"
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-light text-teal">
          <CalendarClock size={19} />
        </span>
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
            {scopeLabel}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-navy">
            Why training is interrupted
          </h2>
          <p className="mt-1 font-body text-sm text-navy-muted">
            Controlled pause reasons and elapsed days within your scope.
          </p>
        </div>
      </div>
      {query.isPending && <Skeleton className="mt-6 h-20 rounded-xl" />}
      {query.isError && (
        <p className="mt-6 rounded-xl bg-error/5 px-4 py-3 font-body text-sm text-error">
          Interruption data is temporarily unavailable.
        </p>
      )}
      {query.isSuccess && query.data.length === 0 && (
        <p className="mt-6 rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">
          No recorded interruptions in this scope.
        </p>
      )}
      {query.isSuccess && query.data.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-3 font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
                  Facility / cohort
                </th>
                <th className="px-3 py-3 font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
                  Cause
                </th>
                <th className="px-3 py-3 text-right font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
                  Events
                </th>
                <th className="px-3 py-3 text-right font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
                  Days
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((row) => (
                <tr
                  key={`${row.facility_id}-${row.cohort_id}-${row.reason}`}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-3 font-body text-sm">
                    <span className="font-semibold text-navy">
                      {row.facility_name}
                    </span>
                    <span className="block text-xs text-navy-muted">
                      {row.cohort_name}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-body text-sm capitalize text-navy-muted">
                    {label(row.reason)}
                  </td>
                  <td className="px-3 py-3 text-right font-body text-sm text-navy">
                    {row.interruptions}
                  </td>
                  <td className="px-3 py-3 text-right font-body text-sm font-semibold text-navy">
                    {row.days_interrupted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
