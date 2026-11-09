import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import {
  ApiError,
  getInstitutionStudents,
  resendInvitation,
  updateAccountStatus,
  type CurrentUser,
  type InstitutionStudent,
} from "../../services/api";

export function CoordinatorStudentManagement({
  user,
  onInvite,
  onBack,
  onError,
}: {
  user: CurrentUser;
  onInvite: () => void;
  onBack: () => void;
  onError: (message: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<InstitutionStudent | null>(null);
  const [resending, setResending] = useState(false);
  const [suspendConfirming, setSuspendConfirming] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const students = useQueryStudents(page, search, status);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  useEffect(() => setPage(1), [search, status]);
  async function resend() {
    if (!selected) return;
    setResending(true);
    try {
      await resendInvitation(selected.id);
      pushToast({
        kind: "success",
        title: "Invitation resent",
        message: `A fresh invitation was queued for ${selected.email}.`,
      });
      setSelected(null);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not resend this invitation.",
      );
    } finally {
      setResending(false);
    }
  }
  async function suspend() {
    if (!selected) return;
    setSuspending(true);
    try {
      await updateAccountStatus(selected.id, "suspended", "Coordinator initiated student access review");
      pushToast({ kind: "success", title: "Student access suspended", message: `${selected.name} can no longer sign in.` });
      await queryClient.invalidateQueries({ queryKey: ["coordinator-students-management"] });
      setSelected(null);
      setSuspendConfirming(false);
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not suspend this student.");
    } finally {
      setSuspending(false);
    }
  }
  const data = students.data;
  return (
    <section
      className="mx-auto max-w-6xl space-y-7"
      aria-labelledby="student-management-heading"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-semibold text-teal hover:text-navy"
      >
        <ArrowLeft size={16} />
        Back to cohorts & students
      </button>
      <header className="relative overflow-hidden rounded-2xl bg-navy px-6 py-8 text-white shadow-[0_18px_42px_rgb(11_27_58/12%)] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full border-[3rem] border-teal/15" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Student register ·{" "}
              {user.scope?.institution_name ?? "Your institution"}
            </p>
            <h2
              id="student-management-heading"
              className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Manage your students
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-slate-300">
              Find student records, check account status, and recover
              invitations from one institution-scoped register.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onInvite}>
            <UserPlus size={16} className="mr-2" />
            Invite students
          </Button>
        </div>
      </header>
      <div className="grid overflow-hidden rounded-2xl border border-border bg-white sm:grid-cols-3">
        <Stat
          label="Students shown"
          value={data?.results.length ?? 0}
          loading={students.isPending}
        />
        <Stat
          label="Total students"
          value={data?.pagination.total_count ?? 0}
          loading={students.isPending}
        />
        <Stat
          label="Current view"
          value={
            data
              ? `Page ${data.pagination.page} of ${data.pagination.total_pages}`
              : "—"
          }
          loading={students.isPending}
        />
      </div>
      <section
        className="overflow-hidden rounded-2xl border border-border bg-white"
        aria-label="Institution students"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              size={17}
              className="absolute left-4 top-3.5 text-navy-muted"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-mist/30 pl-11 pr-4 font-body text-sm text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              placeholder="Search name, email, or registration number"
              aria-label="Search students"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-11 rounded-xl border border-border bg-white px-4 font-body text-sm text-navy outline-none focus:border-teal"
            aria-label="Filter students by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => void students.refetch()}
            disabled={students.isFetching}
          >
            <RefreshCw
              size={15}
              className={students.isFetching ? "mr-2 animate-spin" : "mr-2"}
            />
            Refresh
          </Button>
        </div>
        {students.isError ? (
          <div className="px-5 py-12 text-center">
            <p className="font-body text-sm text-error">
              We could not load student records.
            </p>
            <button
              type="button"
              onClick={() => void students.refetch()}
              className="mt-2 font-body text-sm font-semibold text-teal"
            >
              Try again
            </button>
          </div>
        ) : students.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : data?.results.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left">
                <thead className="bg-mist/45">
                  <tr>
                    {["Student", "Registration", "Status", "Contact"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-5 py-3 font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((student) => (
                    <tr
                      key={student.id}
                      className="cursor-pointer border-t border-border transition hover:bg-mist/35"
                      onClick={() => setSelected(student)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-xl bg-teal-light font-body text-sm font-bold text-teal">
                            {student.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span>
                            <span className="block font-body text-sm font-semibold text-navy">
                              {student.name}
                            </span>
                            <span className="block font-body text-xs text-navy-muted">
                              {student.email}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-body text-sm text-navy-muted">
                        {student.registration_number}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-mist px-2.5 py-1 font-body text-xs font-semibold capitalize text-navy-muted">
                          {student.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-body text-sm text-navy-muted">
                        {student.phone || "Not provided"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-body text-xs text-navy-muted">
                Showing {data.results.length} of {data.pagination.total_count}{" "}
                students
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={
                    !data.pagination.has_previous || students.isFetching
                  }
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={16} />
                  Previous
                </Button>
                <span className="font-body text-xs font-semibold text-navy">
                  {data.pagination.page} / {data.pagination.total_pages}
                </span>
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={!data.pagination.has_next || students.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                  <ChevronRight size={16} />
                </Button>
              </div>
            </footer>
          </>
        ) : (
          <div className="px-5 py-14 text-center">
            <Users size={24} className="mx-auto text-teal" />
            <p className="mt-3 font-body text-sm font-semibold text-navy">
              {search || status
                ? "No students match these filters"
                : "No students in your institution yet"}
            </p>
            <p className="mt-1 font-body text-sm text-navy-muted">
              {search || status
                ? "Try a different search or clear the status filter."
                : "Invite students to start building your institution register."}
            </p>
          </div>
        )}
      </section>
      {selected && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-end bg-navy/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-drawer-heading"
            className="h-full w-full max-w-md overflow-y-auto rounded-2xl border-2 border-teal/25 bg-white p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                  Student profile
                </p>
                <h3
                  id="student-drawer-heading"
                  className="mt-2 font-display text-2xl font-bold text-navy"
                >
                  {selected.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex size-10 items-center justify-center rounded-full text-navy-muted hover:bg-mist"
                aria-label="Close student details"
              >
                <X size={18} />
              </button>
            </div>
            <dl className="mt-8 grid gap-5 border-t border-border pt-6">
              <Detail label="Email" value={selected.email} />
              <Detail
                label="Registration number"
                value={selected.registration_number}
              />
              <Detail label="Phone" value={selected.phone || "Not provided"} />
              <Detail label="Account status" value={selected.status} />
            </dl>
            {selected.status === "invited" && (
              <Button
                size="sm"
                className="mt-8"
                onClick={() => void resend()}
                disabled={resending}
              >
                {resending ? "Resending…" : "Resend invitation"}
              </Button>
            )}
            {selected.status === "active" && (
              <div className="mt-8 border-t border-border pt-6">
                <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">Access control</p>
                {!suspendConfirming ? (
                  <Button size="sm" variant="tertiary" className="mt-3 border border-error/30 bg-error/5 text-error no-underline hover:bg-error/10 hover:no-underline" onClick={() => setSuspendConfirming(true)}><UserX size={15} className="mr-2" aria-hidden="true" /> Suspend portal access</Button>
                ) : (
                  <div className="mt-3 rounded-xl border border-error/20 bg-error/5 p-4">
                    <p className="font-body text-sm font-semibold text-navy">Suspend {selected.name}?</p>
                    <p className="mt-1 font-body text-xs leading-5 text-navy-muted">Their active sessions will be revoked. Their student record and placement history are retained.</p>
                    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void suspend()} disabled={suspending}>{suspending ? "Suspending…" : "Confirm suspension"}</Button><Button size="sm" variant="tertiary" onClick={() => setSuspendConfirming(false)} disabled={suspending}>Cancel</Button></div>
                  </div>
                )}
              </div>
            )}
            {(selected.status === "suspended" || selected.status === "deactivated") && (
              <div className="mt-8 border-t border-border pt-6">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                    <div>
                      <p className="font-body text-sm font-semibold text-amber-950">Access is {selected.status}</p>
                      <p className="mt-1 font-body text-xs leading-5 text-amber-900/80">The student cannot sign in, but their institution record and placement history are preserved.</p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-amber-200 pt-3">
                    <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Recovery owner</p>
                    <p className="mt-1 font-body text-sm font-semibold text-amber-950">Programme Administrator</p>
                    <p className="mt-1 font-body text-xs leading-5 text-amber-900/80">A Programme Administrator must review and restore portal access. Coordinators cannot reactivate suspended accounts.</p>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function useQueryStudents(page: number, search: string, status: string) {
  return useQuery({
    queryKey: ["coordinator-students-management", page, search, status],
    queryFn: () =>
      getInstitutionStudents({ page, page_size: 20, search, status }),
    placeholderData: (previous) => previous,
  });
}
function Stat({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <div className="border-b border-border px-5 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-16" />
      ) : (
        <p className="mt-1 font-display text-xl font-bold text-navy">{value}</p>
      )}
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-body text-sm font-semibold text-navy">
        {value}
      </dd>
    </div>
  );
}
