import { useEffect, useState } from "react";
import { ClipboardList, Plus, Search } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import {
  ApiError,
  getPlacements,
  getPlacementOptions,
  type CurrentUser,
  type Placement,
  type PlacementPage,
  type PlacementOptions,
} from "../../services/api";

export function CoordinatorPlacementRegister({
  user,
  onError,
  onOpen,
  onCreate,
  onOpenBatches,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onOpenBatches?: () => void;
}) {
  const [rows, setRows] = useState<Placement[]>([]);
  const [pagination, setPagination] = useState<
    PlacementPage["pagination"] | null
  >(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [cohort, setCohort] = useState("");
  const [facility, setFacility] = useState("");
  const [options, setOptions] = useState<PlacementOptions | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    void getPlacementOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void getPlacements({ page, pageSize: 20, search, state, cohort, facility })
      .then((result) => {
        if (!active) return;
        setRows(result.results);
        setPagination(result.pagination);
      })
      .catch((cause) => {
        if (!active) return;
        setFailed(true);
        onError(
          cause instanceof ApiError
            ? cause.message
            : "We could not load your institution placements.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, search, state, cohort, facility, onError]);
  const hasFilters = Boolean(search || state || cohort || facility);
  return (
    <section
      className="space-y-8"
      aria-labelledby="coordinator-placements-heading"
    >
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Institution register
          </p>
          <h2
            id="coordinator-placements-heading"
            className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl"
          >
            Placements
          </h2>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">
            Follow each student’s handoff from cohort preparation to active
            placement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        {onOpenBatches && <Button type="button" size="sm" variant="tertiary" onClick={onOpenBatches}>Batch activity</Button>}
        {user.capabilities.create_placement && (
          <Button type="button" size="sm" onClick={onCreate}>
            <Plus size={16} className="mr-2" aria-hidden="true" />
            New placement
          </Button>
        )}</div>
      </header>
      <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-white px-3 focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20">
          <Search
            size={18}
            className="shrink-0 text-navy-muted"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student, cohort, or facility"
            className="min-w-0 flex-1 bg-transparent font-body text-sm text-navy outline-none placeholder:text-navy-muted/70"
            aria-label="Search placements"
          />
        </label>
        <select
          value={state}
          onChange={(event) => {
            setState(event.target.value);
            setPage(1);
          }}
          className="auth-control min-h-11 sm:w-52"
          aria-label="Filter placements by state"
        >
          <option value="">All placement stages</option>
          <option value="draft">Preparing</option>
          <option value="scheduled">Scheduled</option>
          <option value="awaiting_student">Awaiting student</option>
          <option value="orientation">Orientation</option>
          <option value="induction">Induction</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
        <select value={cohort} onChange={(event) => { setCohort(event.target.value); setPage(1); }} className="auth-control sm:w-52" aria-label="Filter placements by cohort">
          <option value="">All cohorts</option>
          {options?.cohorts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select value={facility} onChange={(event) => { setFacility(event.target.value); setPage(1); }} className="auth-control sm:w-52" aria-label="Filter placements by facility">
          <option value="">All facilities</option>
          {[...new Map((options?.wards ?? []).map((item) => [item.facility_id, item.facility_name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : failed ? (
          <Retry
            onRetry={() => {
              setPage((value) => value);
            }}
          />
        ) : rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <ClipboardList
              size={25}
              className="mx-auto text-teal"
              aria-hidden="true"
            />
            <p className="mt-3 font-display text-xl font-bold text-navy">
              {hasFilters ? "No placements match" : "No placements yet"}
            </p>
            <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-navy-muted">
              {hasFilters
                ? "Try another search or placement stage."
                : "Create a placement from an enrolled student when your cohort is ready."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-left">
              <thead className="border-b border-border bg-mist/40">
                <tr>
                  <th className="px-5 py-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
                    Student / cohort
                  </th>
                  <th className="px-5 py-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
                    Facility
                  </th>
                  <th className="px-5 py-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
                    Handoff
                  </th>
                  <th className="px-5 py-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
                    Dates
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((placement) => (
                  <tr
                    key={placement.id}
                    onClick={() => onOpen(placement.id)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(placement.id);
                      }
                    }}
                    className="cursor-pointer transition hover:bg-mist/35 focus:bg-mist/35 focus:outline-none"
                  >
                    <td className="px-5 py-4">
                      <p className="font-body text-sm font-semibold text-navy">
                        {placement.student?.name ?? "Student pending"}
                      </p>
                      <p className="mt-1 font-body text-xs text-navy-muted">
                        {placement.cohort_name ?? "Cohort pending"}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-body text-sm text-navy-muted">
                      {placement.facility_name ?? "Not allocated"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 font-body text-xs font-semibold capitalize ${placement.state === "active" ? "bg-teal-light text-teal" : placement.state === "paused" ? "bg-warning/15 text-warning" : "bg-mist text-navy-muted"}`}
                      >
                        {placement.state.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap font-body text-xs text-navy-muted">
                      {placement.planned_start} → {placement.planned_end}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && pagination.total_pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="font-body text-xs text-navy-muted">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="tertiary"
                disabled={!pagination.has_previous}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                disabled={!pagination.has_next}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-5 py-8"
    >
      <p className="font-body text-sm text-error">
        We could not load placements.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="font-body text-sm font-bold text-teal"
      >
        Try again
      </button>
    </div>
  );
}
