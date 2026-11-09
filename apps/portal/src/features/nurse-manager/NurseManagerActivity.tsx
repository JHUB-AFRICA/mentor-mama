import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getActivity, type CurrentUser } from "../../services/api";
import { TablePagination } from "../../components/TablePagination";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";

export function NurseManagerActivity({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const action = params.get("action") ?? "";
  const dateFrom = params.get("date_from") ?? "";
  const dateTo = params.get("date_to") ?? "";
  const page = Math.max(Number(params.get("page") ?? "1") || 1, 1);
  const query = useQuery({
    queryKey: ["manager-facility-activity", action, dateFrom, dateTo, page],
    queryFn: () =>
      getActivity(page, 25, { action, date_from: dateFrom, date_to: dateTo }),
    staleTime: 15_000,
  });
  const nav = (destination: string) =>
    navigate(
      destination === "overview"
        ? "/facility"
        : destination === "placements"
          ? "/placements"
          : `/facility/${destination}`,
    );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  return (
    <FacilityWorkspaceFrame
      user={user}
      active="activity"
      title="Facility activity"
      onNavigate={nav}
      onAccount={() => navigate("/facility/account")}
      onError={onError}
    >
      <main className="mx-auto w-full min-w-0 max-w-6xl space-y-7 pb-10">
        <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Facility operations · traceability
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              Facility activity
            </h1>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">
              Trace operational changes made in your facility. Sensitive
              safeguarding narrative is never exposed in this timeline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 font-body text-sm font-bold text-teal hover:bg-teal-light sm:self-auto"
          >
            <RefreshCw size={16} aria-hidden="true" /> Refresh activity
          </button>
        </header>
        <section className="rounded-3xl border border-teal/20 bg-[#edf8f7] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-teal">
              <Activity size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
                Manager audit view
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-navy">
                What changed, and who changed it?
              </h2>
              <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-navy-muted">
                Use the filters to narrow the timeline when reviewing a
                placement handoff, mentor allocation, or availability change.
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(10rem,0.4fr))]">
            <label className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
              Action contains
              <input
                value={action}
                onChange={(event) => update("action", event.target.value)}
                placeholder="e.g. mentor or placement"
                className="mt-2 h-11 w-full rounded-full border border-border px-4 font-body text-sm font-normal normal-case tracking-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
            <label className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => update("date_from", event.target.value)}
                className="mt-2 h-11 w-full rounded-full border border-border px-3 font-body text-sm font-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
            <label className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(event) => update("date_to", event.target.value)}
                className="mt-2 h-11 w-full rounded-full border border-border px-3 font-body text-sm font-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
          </div>
        </section>
        {query.isPending ? (
          <Skeleton className="h-72 rounded-2xl" />
        ) : query.isError ? (
          <div
            role="alert"
            className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error"
          >
            We could not load facility activity.{" "}
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="font-bold underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="border-b border-border px-5 py-4">
              <p className="font-body text-sm font-bold text-navy">
                {query.data?.pagination.total_count ?? 0} recorded changes
              </p>
            </div>
            {query.data?.results.length ? (
              <div className="divide-y divide-border">
                {query.data.results.map((entry) => (
                  <article
                    key={entry.id}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0">
                      <p className="font-body text-sm font-bold text-navy">
                        {entry.action.replaceAll(".", " · ")}
                      </p>
                      <p className="mt-1 font-body text-xs text-navy-muted">
                        By {entry.actor} ·{" "}
                        {entry.actor_role.replaceAll("_", " ")}
                      </p>
                    </div>
                    <time
                      dateTime={entry.occurred_at}
                      className="shrink-0 font-body text-xs text-navy-muted"
                    >
                      {new Date(entry.occurred_at).toLocaleString("en-GB")}
                    </time>
                  </article>
                ))}
              </div>
            ) : (
              <p className="px-5 py-12 text-center font-body text-sm text-navy-muted">
                No facility changes match these filters.
              </p>
            )}
            {query.data && (
              <TablePagination
                page={query.data.pagination.page}
                totalPages={query.data.pagination.total_pages}
                totalCount={query.data.pagination.total_count}
                pageSize={query.data.pagination.page_size}
                onPage={(nextPage) => update("page", String(nextPage))}
              />
            )}
          </section>
        )}
      </main>
    </FacilityWorkspaceFrame>
  );
}
