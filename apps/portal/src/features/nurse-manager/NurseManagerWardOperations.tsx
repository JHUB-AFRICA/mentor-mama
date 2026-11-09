import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hospital, RefreshCw, Users } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { getPlacements, getWards, type CurrentUser } from "../../services/api";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { TablePagination } from "../../components/TablePagination";

export function NurseManagerWardOperations({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const wards = useQuery({
    queryKey: ["facility-ward-operations"],
    queryFn: getWards,
    staleTime: 15_000,
  });
  const placements = useQuery({
    queryKey: ["facility-ward-placements"],
    queryFn: () => getPlacements({ pageSize: 50 }),
    staleTime: 15_000,
  });
  const busy = wards.isFetching || placements.isFetching;
  const refresh = () =>
    void Promise.all([wards.refetch(), placements.refetch()]);
  const allWards = wards.data ?? [];
  const allPlacements = placements.data?.results ?? [];
  const openSlots = allWards.reduce(
    (sum, ward) => sum + ward.available_slots,
    0,
  );
  const allocated = allWards.reduce(
    (sum, ward) => sum + ward.allocated_students,
    0,
  );
  const visibleWards = allWards.slice((page - 1) * pageSize, page * pageSize);

  return (
    <FacilityWorkspaceFrame
      user={user}
      active="wards"
      title="Ward operations"
      onNavigate={(destination) =>
        navigate(
          destination === "overview"
            ? "/facility"
            : destination === "placements"
              ? "/placements"
              : `/facility/${destination}`,
        )
      }
      onAccount={() => navigate("/facility/account")}
      onError={onError}
    >
      <div className="space-y-8">
        <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Facility operations
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              Ward readiness
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">
              Know where capacity is available, then move directly into the
              placement decisions that keep students progressing.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 font-body text-sm font-semibold text-teal transition hover:bg-teal-light disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw
              size={16}
              className={busy ? "animate-spin" : ""}
              aria-hidden="true"
            />{" "}
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        {wards.isPending ? (
          <div className="grid divide-y divide-border overflow-hidden rounded-xl border border-border bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : wards.isError ? (
          <ErrorState onRetry={() => void wards.refetch()} />
        ) : (
          <>
            <section
              aria-label="Facility capacity summary"
              className="grid gap-3 sm:grid-cols-3"
            >
              <SummaryCard
                label="Wards in scope"
                value={allWards.length}
                detail="Configured for this facility"
                icon={<Hospital size={18} aria-hidden="true" />}
              />
              <SummaryCard
                label="Open capacity"
                value={openSlots}
                detail="Spaces available now"
                icon={<span className="font-display text-lg font-bold">+</span>}
                tone="teal"
              />
              <SummaryCard
                label="Students allocated"
                value={allocated}
                detail={`${allPlacements.length} visible placements`}
                icon={<Users size={18} aria-hidden="true" />}
              />
            </section>
            <section aria-labelledby="wards-heading">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
                    Your facility
                  </p>
                  <h2
                    id="wards-heading"
                    className="mt-2 font-display text-2xl font-bold tracking-tight text-navy"
                  >
                    Wards on duty
                  </h2>
                </div>
                <p className="font-body text-sm text-navy-muted">
                  Operational view · configuration is managed by Programme Admin
                </p>
              </div>
              {allWards.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-border bg-white px-5 py-12 text-center">
                  <Hospital
                    className="mx-auto text-teal"
                    size={25}
                    aria-hidden="true"
                  />
                  <p className="mt-3 font-body text-sm font-bold text-navy">
                    No wards are configured
                  </p>
                  <p className="mt-1 font-body text-sm text-navy-muted">
                    Ask a Programme Administrator to configure a ward for this
                    facility.
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-xl border border-border bg-white">
                  <div className="overflow-x-auto">
                    <table className="min-w-[60rem] w-full text-left">
                      <caption className="sr-only">
                        Ward capacity and operational placement summary
                      </caption>
                      <thead className="border-b border-border bg-mist/45">
                        <tr className="font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                          <th scope="col" className="px-5 py-3">
                            Ward
                          </th>
                          <th scope="col" className="px-5 py-3">
                            Shift pattern
                          </th>
                          <th scope="col" className="px-5 py-3">
                            Occupancy
                          </th>
                          <th scope="col" className="px-5 py-3">
                            Open capacity
                          </th>
                          <th scope="col" className="px-5 py-3">
                            Placements
                          </th>
                          <th scope="col" className="px-5 py-3 text-right">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visibleWards.map((ward) => {
                          const wardPlacements = allPlacements.filter(
                            (placement) => placement.ward?.id === ward.id,
                          );
                          const occupancy = Math.min(
                            (ward.allocated_students /
                              Math.max(ward.max_students, 1)) *
                              100,
                            100,
                          );
                          return (
                            <tr
                              key={ward.id}
                              className="group transition hover:bg-mist/30"
                            >
                              <th
                                scope="row"
                                className="px-5 py-4 align-middle"
                              >
                                <span className="flex items-center gap-3">
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-teal">
                                    <Hospital size={17} aria-hidden="true" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate font-body text-sm font-bold text-navy group-hover:text-teal">
                                      {ward.name}
                                    </span>
                                    <span className="mt-1 block font-body text-xs text-navy-muted">
                                      Capacity enforced at allocation
                                    </span>
                                  </span>
                                </span>
                              </th>
                              <td className="px-5 py-4 font-body text-sm text-navy-muted">
                                {ward.shift_pattern || "Not recorded"}
                              </td>
                              <td className="min-w-48 px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-mist">
                                    <div
                                      className={`h-full rounded-full ${ward.available_slots > 0 ? "bg-teal" : "bg-error"}`}
                                      style={{ width: `${occupancy}%` }}
                                    />
                                  </div>
                                  <span className="whitespace-nowrap font-body text-sm font-semibold text-navy">
                                    {ward.allocated_students}/
                                    {ward.max_students}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 font-body text-xs font-bold ${ward.available_slots > 0 ? "bg-teal-light text-teal" : "bg-error/10 text-error"}`}
                                >
                                  {ward.available_slots} open
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <span className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-navy">
                                  <Users
                                    size={14}
                                    className="text-navy-muted"
                                    aria-hidden="true"
                                  />
                                  {wardPlacements.length} visible
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="tertiary"
                                  className="whitespace-nowrap"
                                  onClick={() =>
                                    navigate(
                                      `/placements?ward=${encodeURIComponent(ward.id)}`,
                                    )
                                  }
                                >
                                  Open placements{" "}
                                  <ArrowRight
                                    size={15}
                                    className="ml-2"
                                    aria-hidden="true"
                                  />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    page={page}
                    totalPages={Math.ceil(allWards.length / pageSize)}
                    totalCount={allWards.length}
                    pageSize={pageSize}
                    onPage={setPage}
                  />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </FacilityWorkspaceFrame>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone?: "default" | "teal";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${tone === "teal" ? "border-teal/20 bg-[#edf8f7]" : "border-border bg-white"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-teal-light text-teal">
          {icon}
        </span>
        <span className="font-display text-3xl font-bold tabular-nums text-navy">
          {value}
        </span>
      </div>
      <p className="mt-4 font-body text-sm font-bold text-navy">{label}</p>
      <p className="mt-1 font-body text-xs text-navy-muted">{detail}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error"
    >
      We could not load your ward records.
      <button
        type="button"
        className="ml-2 font-bold underline"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}
