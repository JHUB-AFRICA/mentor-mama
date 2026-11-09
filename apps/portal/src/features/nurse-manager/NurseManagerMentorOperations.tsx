import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, RefreshCw, Search, Users, ArrowRight } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getFacilityMentors,
  resendInvitation,
  type CurrentUser,
  type FacilityMentor,
} from "../../services/api";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { TablePagination } from "../../components/TablePagination";

export function NurseManagerMentorOperations({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "";
  const [input, setInput] = useState(search);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mentors = useQueryMentors(search, status, page);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      const next = new URLSearchParams(params);
      if (input) next.set("search", input);
      else next.delete("search");
      setParams(next);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [input]);
  const rows = mentors.data?.results ?? [];
  const active = rows.filter((mentor) => mentor.status === "active").length;
  const paused = rows.filter((mentor) => !mentor.accepting_students).length;
  const atCapacity = rows.filter(
    (mentor) => mentor.active_placements >= mentor.max_active_placements,
  ).length;
  const assigned = rows.reduce(
    (total, mentor) => total + mentor.active_placements,
    0,
  );
  const invite = () => navigate("/facility/mentors/invite");
  const resend = async (mentor: FacilityMentor) => {
    setBusyId(mentor.id);
    try {
      await resendInvitation(mentor.id);
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not resend that invitation.",
      );
    } finally {
      setBusyId(null);
    }
  };
  const nav = (destination: string) =>
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
      active="mentors"
      title="Mentor operations"
      onNavigate={nav}
      onAccount={() => navigate("/facility/account")}
      onError={onError}
    >
      <main className="mx-auto w-full min-w-0 max-w-6xl space-y-7 pb-8">
        <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Facility operations
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              Mentor readiness
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">
              Keep the mentors at your facility ready, visible, and matched to
              the students they support.
            </p>
          </div>
          <Button size="sm" onClick={invite}>
            <Mail size={16} className="mr-2" aria-hidden="true" />
            Invite mentors
          </Button>
        </header>
        <section
          aria-label="Mentor operations summary"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Metric
            label="Mentors in scope"
            value={mentors.data?.pagination.total_count ?? rows.length}
            detail="Facility mentor register"
            icon={<Users size={18} aria-hidden="true" />}
          />
          <Metric
            label="Active mentors"
            value={active}
            detail="Ready for assignment"
            tone="teal"
            icon={<Users size={18} aria-hidden="true" />}
          />
          <Metric
            label="Student assignments"
            value={assigned}
            detail="Across this view"
            icon={<ArrowRight size={18} aria-hidden="true" />}
          />
          <Metric
            label="Needs review"
            value={paused + atCapacity}
            detail={`${paused} paused · ${atCapacity} at capacity`}
            tone={paused + atCapacity > 0 ? "amber" : "default"}
            icon={<RefreshCw size={18} aria-hidden="true" />}
          />
        </section>
        <section aria-labelledby="mentor-register-heading">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
                Your facility register
              </p>
              <h2
                id="mentor-register-heading"
                className="mt-2 font-display text-2xl font-bold tracking-tight text-navy"
              >
                Mentors and workload
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void mentors.refetch()}
              disabled={mentors.isFetching}
              className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 font-body text-sm font-semibold text-teal hover:bg-teal-light disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={mentors.isFetching ? "animate-spin" : ""}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
          <div className="mt-5 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[minmax(16rem,1fr)_12rem] sm:p-5">
            <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-3 transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
              <Search
                size={16}
                className="text-navy-muted"
                aria-hidden="true"
              />
              <span className="sr-only">Search mentors</span>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Search name or email"
                className="min-w-0 flex-1 rounded-full bg-transparent font-body text-sm text-navy outline-none ring-0 placeholder:text-navy-muted focus:outline-none focus:ring-0"
              />
            </label>
            <label className="font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
              Status
              <select
                value={status}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value)
                    next.set("status", event.target.value);
                  else next.delete("status");
                  setParams(next);
                  setPage(1);
                }}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-white px-3 font-body text-sm font-normal normal-case tracking-normal text-navy outline-none focus:border-teal"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="suspended">Suspended</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </label>
          </div>
          {mentors.isPending ? (
            <div className="mt-5 space-y-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : mentors.isError ? (
            <ErrorState onRetry={() => void mentors.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState onInvite={invite} />
          ) : (
            <>
              <MentorTable
                rows={rows}
                busyId={busyId}
                onResend={resend}
                onOpen={(id) => navigate(`/facility/mentors/${id}`)}
              />
              {mentors.data && <TablePagination page={mentors.data.pagination.page} totalPages={mentors.data.pagination.total_pages} totalCount={mentors.data.pagination.total_count} pageSize={mentors.data.pagination.page_size} onPage={setPage} />}
            </>
          )}
        </section>
      </main>
    </FacilityWorkspaceFrame>
  );
}

function useQueryMentors(search: string, status: string, page: number) {
  return useQuery({
    queryKey: ["facility-mentors", search, status, page],
    queryFn: () => getFacilityMentors({ search, status, page, page_size: 20 }),
    staleTime: 15_000,
  });
}
function Metric({
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
  tone?: "default" | "teal" | "amber";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${tone === "teal" ? "border-teal/20 bg-[#edf8f7]" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-border bg-white"}`}
    >
      <div className="flex items-center justify-between">
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
function MentorTable({
  rows,
  busyId,
  onResend,
  onOpen,
}: {
  rows: FacilityMentor[];
  busyId: string | null;
  onResend: (mentor: FacilityMentor) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left">
          <caption className="sr-only">
            Facility mentors and active student workload
          </caption>
          <thead className="border-b border-border bg-mist/45">
            <tr className="font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
              <th className="px-5 py-4">Mentor</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Active students</th>
              <th className="px-5 py-4">Contact</th>
              <th className="px-5 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((mentor) => (
              <tr key={mentor.id} className="transition hover:bg-mist/30">
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => onOpen(mentor.id)}
                    className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  >
                    <p className="font-body text-sm font-bold text-navy hover:text-teal">
                      {mentor.name}
                    </p>
                    <p className="mt-1 font-body text-xs text-navy-muted">
                      {mentor.email}
                    </p>
                  </button>
                </td>
                <td className="px-5 py-4">
                  <Status status={mentor.status} />
                </td>
                <td className="px-5 py-4 font-body text-sm font-semibold text-navy">
                  <span>
                    {mentor.active_placements}/{mentor.max_active_placements}
                  </span>
                  <span
                    className={`ml-2 rounded-full px-2 py-1 text-[0.68rem] font-bold ${mentor.accepting_students ? "bg-teal-light text-teal" : "bg-mist text-navy-muted"}`}
                  >
                    {mentor.accepting_students ? "Open" : "Paused"}
                  </span>
                </td>
                <td className="px-5 py-4 font-body text-sm text-navy">
                  {mentor.phone || "No phone recorded"}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(mentor.id)}
                      className="rounded-lg px-2 py-2 font-body text-xs font-bold text-teal hover:bg-teal-light"
                    >
                      View details
                    </button>
                    {mentor.status === "invited" && (
                      <button
                        type="button"
                        disabled={busyId === mentor.id}
                        onClick={() => onResend(mentor)}
                        className="rounded-lg px-2 py-2 font-body text-xs font-bold text-teal hover:bg-teal-light disabled:opacity-50"
                      >
                        {busyId === mentor.id ? "Sending…" : "Resend invite"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {rows.map((mentor) => (
          <button
            key={mentor.id}
            type="button"
            onClick={() => onOpen(mentor.id)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-mist"
          >
            <span className="min-w-0">
              <span className="block truncate font-body text-sm font-bold text-navy">
                {mentor.name}
              </span>
              <span className="mt-1 block truncate font-body text-xs text-navy-muted">
                {mentor.email}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <Status status={mentor.status} />
              <span className="mt-1 block font-body text-xs text-navy-muted">
                {mentor.active_placements}/{mentor.max_active_placements}{" "}
                students · {mentor.accepting_students ? "Open" : "Paused"}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
function Status({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-body text-xs font-bold capitalize ${status === "active" ? "bg-teal-light text-teal" : status === "invited" ? "bg-amber-50 text-amber-800" : "bg-mist text-navy-muted"}`}
    >
      {status}
    </span>
  );
}
function EmptyState({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-white px-5 py-14 text-center">
      <Users className="mx-auto text-teal" size={25} aria-hidden="true" />
      <p className="mt-3 font-body text-sm font-bold text-navy">
        No mentors match this view
      </p>
      <p className="mt-1 font-body text-sm text-navy-muted">
        Invite a facility mentor or clear the filters.
      </p>
      <button
        type="button"
        onClick={onInvite}
        className="mt-4 font-body text-sm font-bold text-teal hover:underline"
      >
        Invite a mentor
      </button>
    </div>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-5 rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error"
    >
      We could not load your mentor register.
      <button
        type="button"
        onClick={onRetry}
        className="ml-2 font-bold underline"
      >
        Try again
      </button>
    </div>
  );
}
