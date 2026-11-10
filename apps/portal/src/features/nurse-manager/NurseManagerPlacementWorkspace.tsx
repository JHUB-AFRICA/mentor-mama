import { isPlacementClosed } from "../placements/placementJourney";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardList,
  Check,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import {
  getPlacementOptions,
  getPlacements,
  reassignMentor,
  type CurrentUser,
  type Placement,
  type PlacementOptions,
} from "../../services/api";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { TablePagination } from "../../components/TablePagination";
import {
  isManagerActionablePlacement,
  managerPlacementAction,
} from "./managerPlacementLogic";

const states: Array<[string, string]> = [
  ["", "All handoffs"],
  ["draft", "Needs setup"],
  ["scheduled", "Ready to release"],
  ["awaiting_student", "Awaiting student"],
  ["orientation", "Orientation"],
  ["induction", "Induction"],
  ["active", "Active"],
  ["paused", "Paused"],
  ["completed", "Completed"],
];

export function NurseManagerPlacementWorkspace({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = params.get("state") ?? "";
  const ward = params.get("ward") ?? "";
  const mentor = params.get("mentor") ?? "";
  const search = params.get("search") ?? "";
  const [page, setPage] = useState(1);
  const placements = useQuery({
    queryKey: [
      "manager-placement-workspace",
      state,
      ward,
      mentor,
      search,
      page,
    ],
    queryFn: () =>
      getPlacements({ page, pageSize: 50, state, ward, mentor, search }),
    staleTime: 15_000,
  });
  const options = useQuery<PlacementOptions>({
    queryKey: ["manager-placement-options"],
    queryFn: getPlacementOptions,
    staleTime: 60_000,
  });
  const rows = placements.data?.results ?? [];
  const attention = rows.filter(isManagerActionablePlacement);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [replacementMentor, setReplacementMentor] = useState("");
  const [reassignmentReason, setReassignmentReason] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignResults, setReassignResults] = useState<ReassignmentResult[]>(
    [],
  );
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setPage(1);
    setParams(next);
  };
  const clear = () => {
    setPage(1);
    setParams({});
  };
  const selectedPlacements = rows.filter((item) =>
    selectedIds.includes(item.id),
  );
  const selectableRows = rows.filter(
    (item) => item.mentor && !isPlacementClosed(item.state),
  );
  const toggleSelection = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const selectAll = () =>
    setSelectedIds(
      selectedIds.length === selectableRows.length
        ? []
        : selectableRows.map((item) => item.id),
    );
  const closeReassign = () => {
    if (reassigning) return;
    setReassignOpen(false);
    setReplacementMentor("");
    setReassignmentReason("");
  };
  const applyReassignment = async () => {
    if (
      !replacementMentor ||
      !reassignmentReason.trim() ||
      selectedPlacements.length === 0
    )
      return;
    setReassigning(true);
    const results: ReassignmentResult[] = [];
    for (const placement of selectedPlacements) {
      try {
        await reassignMentor(
          placement.id,
          replacementMentor,
          reassignmentReason.trim(),
        );
        results.push({
          id: placement.id,
          student: placement.student?.name ?? "Student",
          ok: true,
        });
      } catch (cause) {
        results.push({
          id: placement.id,
          student: placement.student?.name ?? "Student",
          ok: false,
          message:
            cause instanceof Error ? cause.message : "Reassignment failed.",
        });
      }
    }
    setReassignResults(results);
    setSelectedIds(results.filter((item) => !item.ok).map((item) => item.id));
    setReassigning(false);
    await placements.refetch();
  };
  const navigateTo = (destination: string) =>
    navigate(
      destination === "overview"
        ? "/facility"
        : destination === "placements"
          ? "/placements"
          : `/facility/${destination}`,
    );

  return (
    <FacilityWorkspaceFrame
      user={user}
      active="placements"
      title="Placement operations"
      onNavigate={navigateTo}
      onAccount={() => navigate("/facility/account")}
      onError={onError}
    >
      <div className="space-y-7">
        <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Facility operations
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              Placement handoffs
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">
              Coordinate the students assigned to your facility and resolve the
              next ward or mentor decision.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void Promise.all([placements.refetch(), options.refetch()])
            }
            disabled={placements.isFetching}
            className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 font-body text-sm font-semibold text-teal transition hover:bg-teal-light disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw
              size={16}
              className={placements.isFetching ? "animate-spin" : ""}
              aria-hidden="true"
            />{" "}
            {placements.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        {placements.isPending ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : placements.isError ? (
          <ErrorState onRetry={() => void placements.refetch()} />
        ) : (
          <>
            <section
              aria-label="Placement operations summary"
              className="grid gap-3 sm:grid-cols-3"
            >
              <SummaryCard
                label="In facility scope"
                value={placements.data?.pagination.total_count ?? rows.length}
                detail="Placement records in this view"
                icon={<ClipboardList size={18} aria-hidden="true" />}
              />
              <SummaryCard
                label="Needs a decision"
                value={attention.length}
                detail="Handoffs requiring action"
                tone="teal"
                icon={<ArrowRight size={18} aria-hidden="true" />}
              />
              <SummaryCard
                label="Mentors assigned"
                value={rows.filter((item) => item.mentor).length}
                detail="Current active assignments"
                icon={<Users size={18} aria-hidden="true" />}
              />
            </section>
            <section aria-labelledby="manager-placement-heading">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
                    Your operating queue
                  </p>
                  <h2
                    id="manager-placement-heading"
                    className="mt-2 font-display text-2xl font-bold tracking-tight text-navy"
                  >
                    What needs moving
                  </h2>
                </div>
                {(state || ward || mentor || search) && (
                  <button
                    type="button"
                    onClick={clear}
                    className="font-body text-sm font-semibold text-teal underline underline-offset-4"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <div className="mt-5 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[minmax(16rem,1.4fr)_repeat(3,minmax(9rem,1fr))] sm:p-5">
                <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-3 transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
                  <Search
                    size={16}
                    className="text-navy-muted"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Search placements</span>
                  <input
                    value={search}
                    onChange={(event) =>
                      setFilter("search", event.target.value)
                    }
                    placeholder="Search student or mentor"
                    className="min-w-0 flex-1 rounded-full bg-transparent font-body text-sm text-navy outline-none ring-0 placeholder:text-navy-muted focus:outline-none focus:ring-0"
                  />
                </label>
                <Filter
                  label="Handoff"
                  value={state}
                  options={states}
                  onChange={(value) => setFilter("state", value)}
                />
                <Filter
                  label="Ward"
                  value={ward}
                  options={[
                    ["", "All wards"],
                    ...(options.data?.wards.map(
                      (item) => [item.id, item.name] as [string, string],
                    ) ?? []),
                  ]}
                  onChange={(value) => setFilter("ward", value)}
                />
                <Filter
                  label="Mentor"
                  value={mentor}
                  options={[
                    ["", "All mentors"],
                    ...(options.data?.mentors.map(
                      (item) => [item.id, item.name] as [string, string],
                    ) ?? []),
                  ]}
                  onChange={(value) => setFilter("mentor", value)}
                />
              </div>
              {rows.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-border bg-white px-5 py-14 text-center">
                  <ClipboardList
                    className="mx-auto text-teal"
                    size={25}
                    aria-hidden="true"
                  />
                  <p className="mt-3 font-body text-sm font-bold text-navy">
                    No placements match this view
                  </p>
                  <p className="mt-1 font-body text-sm text-navy-muted">
                    Try clearing a filter or wait for a new placement handoff.
                  </p>
                </div>
              ) : (
                <>
                  {mentor && selectableRows.length > 0 && (
                    <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-teal/20 bg-[#edf8f7] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div>
                        <p className="font-body text-sm font-bold text-navy">
                          Review this mentor’s workload
                        </p>
                        <p className="mt-1 font-body text-xs text-navy-muted">
                          Select students if the mentor is paused, full, or
                          needs a managed handoff.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAll}
                          className="rounded-full border border-teal/30 bg-white px-3 py-2 font-body text-xs font-bold text-teal hover:bg-teal-light"
                        >
                          {selectedIds.length === selectableRows.length
                            ? "Clear selection"
                            : "Select all"}
                        </button>
                        <button
                          type="button"
                          disabled={selectedIds.length === 0}
                          onClick={() => {
                            setReassignResults([]);
                            setReassignOpen(true);
                          }}
                          className="rounded-full bg-teal px-4 py-2 font-body text-xs font-bold text-white hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reassign {selectedIds.length || "students"}
                        </button>
                      </div>
                    </section>
                  )}
                  {reassignResults.length > 0 && (
                    <ReassignmentResults results={reassignResults} />
                  )}
                  <PlacementTable
                    placements={rows}
                    onOpen={(id) => navigate(`/placements/${id}`)}
                    selectable={Boolean(mentor)}
                    selectedIds={selectedIds}
                    onToggle={toggleSelection}
                  />
                  {placements.data && (
                    <TablePagination
                      page={placements.data.pagination.page}
                      totalPages={placements.data.pagination.total_pages}
                      totalCount={placements.data.pagination.total_count}
                      pageSize={placements.data.pagination.page_size}
                      onPage={setPage}
                    />
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
      {reassignOpen && (
        <ReassignmentDialog
          placements={selectedPlacements}
          mentors={options.data?.mentors ?? []}
          replacementMentor={replacementMentor}
          reason={reassignmentReason}
          busy={reassigning}
          results={reassignResults}
          onMentorChange={setReplacementMentor}
          onReasonChange={setReassignmentReason}
          onConfirm={() => void applyReassignment()}
          onClose={closeReassign}
        />
      )}
    </FacilityWorkspaceFrame>
  );
}

type ReassignmentResult = {
  id: string;
  student: string;
  ok: boolean;
  message?: string;
};

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
function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-white px-3 font-body text-sm font-normal normal-case tracking-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
      >
        {options.map(([key, text]) => (
          <option key={key || "all"} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function PlacementTable({
  placements,
  onOpen,
  selectable = false,
  selectedIds = [],
  onToggle,
}: {
  placements: Placement[];
  onOpen: (id: string) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <caption className="sr-only">
            Placement handoffs in this facility
          </caption>
          <thead className="border-b border-border bg-mist/45">
            <tr className="font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
              {selectable && (
                <th scope="col" className="w-12 px-3 py-4">
                  <span className="sr-only">Select</span>
                </th>
              )}
              <th scope="col" className="px-5 py-4">
                Student
              </th>
              <th scope="col" className="px-5 py-4">
                Ward
              </th>
              <th scope="col" className="px-5 py-4">
                Next action
              </th>
              <th scope="col" className="px-5 py-4">
                Mentor
              </th>
              <th scope="col" className="px-5 py-4">
                Status
              </th>
              <th scope="col" className="px-5 py-4">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {placements.map((placement) => (
              <tr
                key={placement.id}
                className={`group transition hover:bg-mist/30 ${selectedIds.includes(placement.id) ? "bg-teal-light/30" : ""}`}
              >
                {selectable && (
                  <td className="px-3 py-4 align-top">
                    {placement.mentor && !isPlacementClosed(placement.state) && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(placement.id)}
                        onChange={() => onToggle?.(placement.id)}
                        aria-label={`Select ${placement.student?.name ?? "student"} for reassignment`}
                        className="mt-1 size-4 rounded border-border text-teal accent-teal focus:ring-teal"
                      />
                    )}
                  </td>
                )}
                <td className="p-0">
                  <PlacementCell
                    onOpen={() => onOpen(placement.id)}
                    label={`Open ${placement.student?.name ?? "student"} placement`}
                    className="px-5 py-4"
                  >
                    <p className="font-body text-sm font-bold text-navy group-hover:text-teal">
                      {placement.student?.name ?? "Student pending"}
                    </p>
                    <p className="mt-1 max-w-[15rem] truncate font-body text-xs text-navy-muted">
                      {placement.cohort_name ?? "Cohort pending"}
                    </p>
                  </PlacementCell>
                </td>
                <td className="p-0">
                  <PlacementCell
                    onOpen={() => onOpen(placement.id)}
                    label={`Open ${placement.student?.name ?? "student"} placement`}
                    className="px-5 py-4 font-body text-sm text-navy"
                  >
                    {placement.ward?.name ?? "Not allocated"}
                  </PlacementCell>
                </td>
                <td className="p-0">
                  <PlacementCell
                    onOpen={() => onOpen(placement.id)}
                    label={`Open ${placement.student?.name ?? "student"} placement`}
                    className="px-5 py-4 font-body text-sm font-semibold text-navy"
                  >
                    {getNextAction(placement)}
                  </PlacementCell>
                </td>
                <td className="p-0">
                  <PlacementCell
                    onOpen={() => onOpen(placement.id)}
                    label={`Open ${placement.student?.name ?? "student"} placement`}
                    className="px-5 py-4 font-body text-sm text-navy"
                  >
                    {placement.mentor?.name ?? "Not assigned"}
                  </PlacementCell>
                </td>
                <td className="p-0">
                  <PlacementCell
                    onOpen={() => onOpen(placement.id)}
                    label={`Open ${placement.student?.name ?? "student"} placement`}
                    className="px-5 py-4"
                  >
                    <StatusPill placement={placement} />
                  </PlacementCell>
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(placement.id)}
                    aria-label={`Open ${placement.student?.name ?? "student"} placement`}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-teal transition hover:bg-teal-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  >
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {placements.map((placement) => (
          <div key={placement.id} className="flex items-start gap-2">
            {selectable && placement.mentor && !isPlacementClosed(placement.state) && (
              <input
                type="checkbox"
                checked={selectedIds.includes(placement.id)}
                onChange={() => onToggle?.(placement.id)}
                aria-label={`Select ${placement.student?.name ?? "student"} for reassignment`}
                className="mt-5 size-4 shrink-0 rounded border-border text-teal accent-teal focus:ring-teal"
              />
            )}
            <PlacementHandoff
              key={placement.id}
              placement={placement}
              onOpen={() => onOpen(placement.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
function PlacementCell({
  children,
  onOpen,
  label,
  className,
}: {
  children: React.ReactNode;
  onOpen: () => void;
  label: string;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={`block w-full text-left transition hover:bg-teal-light/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal ${className}`}
    >
      {children}
    </button>
  );
}
function getNextAction(placement: Placement) {
  return managerPlacementAction(placement).label;
}
function StatusPill({ placement }: { placement: Placement }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-body text-xs font-bold capitalize ${placement.state === "active" ? "bg-teal-light text-teal" : placement.state === "paused" ? "bg-warning/15 text-warning" : "bg-mist text-navy-muted"}`}
    >
      {placement.state.replaceAll("_", " ")}
    </span>
  );
}
function PlacementHandoff({
  placement,
  onOpen,
}: {
  placement: Placement;
  onOpen: () => void;
}) {
  const missing = getNextAction(placement);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-4 rounded-2xl border border-border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-[0_8px_24px_rgba(8,25,53,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:grid-cols-[minmax(15rem,1.4fr)_minmax(12rem,1fr)_auto] sm:items-center sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal">
          <Users size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-body text-sm font-bold text-navy group-hover:text-teal">
            {placement.student?.name ?? "Student pending"}
          </p>
          <p className="mt-1 truncate font-body text-xs text-navy-muted">
            {placement.cohort_name ?? "Cohort pending"} ·{" "}
            {placement.ward?.name ?? "Ward pending"}
          </p>
        </div>
      </div>
      <div>
        <p className="font-body text-sm font-semibold text-navy">{missing}</p>
        <p className="mt-1 truncate font-body text-xs text-navy-muted">
          {placement.mentor?.name ?? "No mentor assigned"}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <StatusPill placement={placement} />
        <ArrowRight
          size={17}
          className="text-teal transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
      </div>
    </button>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error"
    >
      We could not load facility placements.
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

function ReassignmentResults({ results }: { results: ReassignmentResult[] }) {
  const succeeded = results.filter((item) => item.ok).length;
  return (
    <div
      className="mt-4 rounded-2xl border border-border bg-white px-4 py-3"
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-sm font-bold text-navy">
          Reassignment results
        </p>
        <span className="font-body text-xs font-bold text-teal">
          {succeeded}/{results.length} applied
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {results
          .filter((item) => !item.ok)
          .map((item) => (
            <p key={item.id} className="font-body text-xs text-error">
              {item.student}: {item.message}
            </p>
          ))}
      </div>
    </div>
  );
}

function ReassignmentDialog({
  placements,
  mentors,
  replacementMentor,
  reason,
  busy,
  results,
  onMentorChange,
  onReasonChange,
  onConfirm,
  onClose,
}: {
  placements: Placement[];
  mentors: PlacementOptions["mentors"];
  replacementMentor: string;
  reason: string;
  busy: boolean;
  results: ReassignmentResult[];
  onMentorChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const eligibleMentors = mentors.filter(
    (item) =>
      item.accepting_students &&
      item.active_placements < item.max_active_placements &&
      !placements.some((placement) => placement.mentor?.id === item.id),
  );
  const canConfirm = Boolean(
    replacementMentor && reason.trim() && placements.length > 0 && !busy,
  );
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reassignment-title"
    >
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border-2 border-teal/20 bg-white shadow-[0_24px_80px_rgba(8,25,53,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Manager action
            </p>
            <h2
              id="reassignment-title"
              className="mt-2 font-display text-2xl font-bold tracking-tight text-navy"
            >
              Reassign selected students
            </h2>
            <p className="mt-2 font-body text-sm leading-5 text-navy-muted">
              This will close each current mentor assignment and create a new
              audited assignment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reassignment dialog"
            className="rounded-full p-2 text-navy-muted hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-5 px-5 py-5 sm:px-7">
          <div className="rounded-2xl bg-mist px-4 py-3">
            <p className="font-body text-sm font-bold text-navy">
              Impact: {placements.length} student
              {placements.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 font-body text-xs text-navy-muted">
              {placements
                .map((item) => item.student?.name ?? "Student")
                .join(", ")}
            </p>
          </div>
          <label className="block font-body text-sm font-bold text-navy">
            Replacement mentor
            <select
              value={replacementMentor}
              onChange={(event) => onMentorChange(event.target.value)}
              className="mt-2 h-12 w-full rounded-full border border-border bg-white px-4 font-body text-sm font-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            >
              <option value="">Choose an available mentor</option>
              {eligibleMentors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.active_placements}/
                  {item.max_active_placements} students
                </option>
              ))}
            </select>
          </label>
          {eligibleMentors.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-body text-sm text-amber-950">
              No other mentor currently has capacity and availability for these
              students.
            </p>
          )}
          <label className="block font-body text-sm font-bold text-navy">
            Reason{" "}
            <span className="font-normal text-navy-muted">(required)</span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              rows={3}
              placeholder="Explain why this workload is moving"
              className="mt-2 w-full rounded-2xl border border-border bg-white px-4 py-3 font-body text-sm font-normal text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </label>
          {results.length > 0 && <ReassignmentResults results={results} />}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-border px-4 py-2.5 font-body text-sm font-bold text-navy-muted hover:bg-mist disabled:opacity-50"
          >
            {results.some((item) => item.ok) ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-teal px-5 py-2.5 font-body text-sm font-bold text-white hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              "Applying…"
            ) : (
              <>
                <Check size={16} aria-hidden="true" /> Confirm reassignment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
