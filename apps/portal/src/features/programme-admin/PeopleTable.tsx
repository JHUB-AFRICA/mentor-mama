import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { Button, TableSkeleton } from "@mentormama/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/ToastProvider";
import {
  getFacilities,
  getDashboardSummary,
  getInstitutions,
  getPeople,
  getPersonActivity,
  revokeAccountSessions,
  resendInvitation,
  updateAccountAccess,
  updateAccountStatus,
  type Facility,
  type Institution,
  type Person,
} from "../../services/api";

type Props = { onInvite: () => void; onOpenRecovery: () => void };
const roleLabels: Record<string, string> = {
  coordinator: "University Coordinator",
  nurse_manager: "Nurse Manager",
  mentor: "Clinical Mentor",
  student: "Student",
  program_admin: "Programme Admin",
};
const statusLabels: Record<string, string> = {
  invited: "Invitation pending",
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};
type PendingAction = {
  person: Person;
  status: "active" | "suspended" | "deactivated";
  reason: string;
};
type Feedback = { message: string; kind: "success" | "error" };

export function PeopleTable({ onInvite, onOpenRecovery }: Props) {
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });
  return (
    <div className="people-access-shell">
      <header className="people-access-heading">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Access management
          </p>
          <h1>People &amp; access</h1>
          <p>
            Review programme roles, account access, and invitations in one
            place.
          </p>
        </div>
        <Button onClick={onInvite}>
          <Users size={17} className="mr-2" />
          Invite person
        </Button>
      </header>
      <PeopleKpis summary={summary.data} loading={summary.isPending} error={summary.isError} />
      <div className="mb-5 flex justify-end"><Button variant="tertiary" onClick={onOpenRecovery}>Authenticator recovery</Button></div>
      <PeopleTableContent onInvite={onInvite} />
    </div>
  );
}

function PeopleKpis({
  summary,
  loading,
  error,
}: {
  summary?: {
    people_total: number;
    students: number;
    mentors: number;
    programme_staff: number;
  };
  loading: boolean;
  error: boolean;
}) {
  const metrics = [
    {
      label: "Other programme accounts",
      value: summary?.people_total ?? 0,
      detail: "All roles and statuses; excludes your account",
      icon: <Users size={22} />,
      tone: "teal",
    },
    {
      label: "Students",
      value: summary?.students ?? 0,
      detail: "Active in programme",
      icon: <UserCheck size={22} />,
      tone: "blue",
    },
    {
      label: "Mentors",
      value: summary?.mentors ?? 0,
      detail: "Active in programme",
      icon: <BriefcaseBusiness size={22} />,
      tone: "violet",
    },
    {
      label: "Other programme staff",
      value: summary?.programme_staff ?? 0,
      detail: "Active Programme Admins, Coordinators, Nurse Managers",
      icon: <ShieldCheck size={22} />,
      tone: "green",
    },
  ];
  return (
    <section className="people-access-kpis" aria-label="People summary">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className={`people-access-kpi people-access-kpi--${metric.tone}`}
        >
          <span>{metric.icon}</span>
          <div>
            <p>{metric.label}</p>
            <strong>{loading || error ? "—" : metric.value}</strong>
            <small>{error ? "Counts could not be loaded" : metric.detail}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

function PeopleTableContent({ onInvite }: Pick<Props, "onInvite">) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  useEffect(() => {
    function closeActionMenus(event: MouseEvent) {
      document
        .querySelectorAll<HTMLDetailsElement>(
          ".people-access-shell details[open]",
        )
        .forEach((menu) => {
          if (!menu.contains(event.target as Node))
            menu.removeAttribute("open");
        });
    }
    function closeActionMenusOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape")
        document
          .querySelectorAll<HTMLDetailsElement>(
            ".people-access-shell details[open]",
          )
          .forEach((menu) => menu.removeAttribute("open"));
    }
    document.addEventListener("click", closeActionMenus);
    document.addEventListener("keydown", closeActionMenusOnEscape);
    return () => {
      document.removeEventListener("click", closeActionMenus);
      document.removeEventListener("keydown", closeActionMenusOnEscape);
    };
  }, []);
  const people = useQuery({
    queryKey: ["programme-people", page, search, role, status],
    queryFn: () => getPeople({ page, pageSize: 10, search, role, status }),
    placeholderData: (previous) => previous,
  });


  async function resend(person: Person) {
    setBusyId(person.id);
    setFeedback(null);
    try {
      await resendInvitation(person.id);
      pushToast({ kind: "success", title: "Invitation resent", message: `A fresh invitation was queued for ${person.email}.` });
      setFeedback({
        message: `A fresh invitation was queued for ${person.email}. Their account remains pending until they accept it.`,
        kind: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["programme-people"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-indicators"] }),
      ]);
    } catch (cause) {
      pushToast({ kind: "error", title: "Invitation not sent", message: cause instanceof Error ? cause.message : "We could not resend this invitation." });
      setFeedback({
        message:
          cause instanceof Error
            ? cause.message
            : "We could not resend this invitation.",
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(
    person: Person,
    nextStatus: "active" | "suspended" | "deactivated",
  ) {
    setPendingAction({ person, status: nextStatus, reason: "" });
  }

  async function confirmStatusChange() {
    if (!pendingAction) return;
    const { person, status: nextStatus, reason } = pendingAction;
    setPendingAction(null);
    setBusyId(person.id);
    setFeedback(null);
    try {
      await updateAccountStatus(person.id, nextStatus, reason);
      pushToast({ kind: "success", title: "Account access updated", message: `${person.name} is now ${nextStatus}.` });
      setFeedback({
        message: `${person.name} is now ${nextStatus}.`,
        kind: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["programme-people"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-indicators"] }),
      ]);
    } catch (cause) {
      pushToast({ kind: "error", title: "Account not updated", message: cause instanceof Error ? cause.message : "We could not update this account." });
      setFeedback({
        message:
          cause instanceof Error
            ? cause.message
            : "We could not update this account.",
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }
  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setRole("");
    setStatus("");
    setPage(1);
  }

  return (
    <div className="space-y-9">
      <section
        aria-label="Programme people"
        className="overflow-hidden border-y border-border"
      >
        <div className="flex flex-col gap-4 border-b border-border py-5 lg:flex-row lg:items-center">
          <form className="relative flex-1" onSubmit={applySearch}>
            <Search
              size={17}
              className="absolute left-4 top-3.5 text-navy-muted"
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-white pl-11 pr-4 font-body text-sm text-navy outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              placeholder="Search by name or email"
              aria-label="Search people"
            />
          </form>
          <div className="grid grid-cols-2 gap-3 lg:flex">
            <select
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              className="h-11 min-w-0 rounded-xl border border-border bg-white px-3 font-body text-sm text-navy outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              <option value="coordinator">University Coordinator</option>
              <option value="nurse_manager">Nurse Manager</option>
              <option value="mentor">Clinical Mentor</option>
              <option value="student">Student</option>
            </select>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-11 min-w-0 rounded-xl border border-border bg-white px-3 font-body text-sm text-navy outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="invited">Invitation pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>
          {(search || role || status) && (
            <Button variant="tertiary" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
        {feedback && (
          <div
            role={feedback.kind === "error" ? "alert" : "status"}
            className={`my-5 border-l-2 px-4 py-3 font-body text-sm ${feedback.kind === "error" ? "border-error bg-error/5 text-error" : "border-teal bg-teal-light/50 text-teal"}`}
          >
            {feedback.message}
          </div>
        )}
        {people.isError ? (
          <p className="py-12 text-center font-body text-sm text-danger">
            We could not load programme people. Please try again.
          </p>
        ) : people.isPending ? (
          <TableSkeleton rows={6} />
        ) : people.data.results.length === 0 ? (
          <EmptyPeople onInvite={onInvite} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[56rem] text-left">
                <thead>
                  <tr className="border-b border-border">
                    <Header>Person</Header>
                    <Header>Role</Header>
                    <Header>Scope basis</Header>
                    <Header>Status</Header>
                    <Header>Added</Header>
                    <Header>Actions</Header>
                  </tr>
                </thead>
                <tbody>
                  {people.data.results.map((person) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      busy={busyId === person.id}
                      onOpen={() => setSelectedPerson(person)}
                      onResend={() => void resend(person)}
                      onStatus={(nextStatus) =>
                        void changeStatus(person, nextStatus)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {people.data.results.map((person) => (
                <MobilePersonRow
                  key={person.id}
                  person={person}
                  busy={busyId === person.id}
                  onOpen={() => setSelectedPerson(person)}
                  onResend={() => void resend(person)}
                  onStatus={(nextStatus) =>
                    void changeStatus(person, nextStatus)
                  }
                />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-border px-1 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-body text-xs text-navy-muted">
                Showing{" "}
                {(people.data.pagination.page - 1) *
                  people.data.pagination.page_size +
                  1}
                –
                {Math.min(
                  people.data.pagination.page *
                    people.data.pagination.page_size,
                  people.data.pagination.total_count,
                )}{" "}
                of {people.data.pagination.total_count}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={
                    !people.data.pagination.has_previous || people.isFetching
                  }
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft size={16} className="mr-1" />
                  Previous
                </Button>
                <span className="font-body text-xs font-semibold text-navy">
                  Page {people.data.pagination.page} of{" "}
                  {people.data.pagination.total_pages}
                </span>
                <Button
                  variant="tertiary"
                  size="sm"
                  disabled={
                    !people.data.pagination.has_next || people.isFetching
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      {pendingAction && (
        <StatusConfirmModal
          action={pendingAction}
          onReasonChange={(reason) =>
            setPendingAction((current) =>
              current ? { ...current, reason } : current,
            )
          }
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmStatusChange()}
          busy={busyId === pendingAction.person.id}
        />
      )}
      {selectedPerson && (
        <PersonDrawer
          person={selectedPerson}
          busy={busyId === selectedPerson.id}
          onClose={() => setSelectedPerson(null)}
          onResend={() => void resend(selectedPerson)}
          onStatus={(nextStatus) =>
            void changeStatus(selectedPerson, nextStatus)
          }
          onAccessSaved={(changes) =>
            setSelectedPerson((current) =>
              current ? { ...current, ...changes } : current,
            )
          }
          onSessionsRevoked={() =>
            setFeedback({
              message: "Their other signed-in devices have been signed out.",
              kind: "success",
            })
          }
        />
      )}
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <>
      <th
        scope="col"
        className="px-3 py-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted"
      >
        {children === "Added"
          ? "Last active"
          : children === "Scope basis"
            ? "Scope / ward"
            : children}
      </th>
    </>
  );
}
function PersonRow({
  person,
  busy,
  onOpen,
  onResend,
  onStatus,
}: {
  person: Person;
  busy: boolean;
  onOpen: () => void;
  onResend: () => void;
  onStatus: (status: "active" | "suspended" | "deactivated") => void;
}) {
  return (
    <tr className="border-b border-border transition last:border-0 hover:bg-mist/45">
      <td className="px-3 py-4">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open details for ${person.name}`}
          className="flex min-w-0 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-light font-body text-xs font-bold text-teal">
            {person.name
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-body text-sm font-semibold text-navy hover:text-teal">
              {person.name}
            </span>
            <span className="mt-1 block truncate font-body text-xs text-navy-muted">
              {person.email}
            </span>
          </span>
        </button>
      </td>
      <td className="px-3 py-4 font-body text-sm text-navy-muted">
        {roleLabels[person.role] ?? person.role}
      </td>
      <td className="px-3 py-4 font-body text-xs text-navy-muted">
        {person.scope ?? scopeBasis(person.role)}
      </td>
      <td className="px-3 py-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 font-body text-xs font-semibold ${person.status === "active" ? "bg-teal-light text-teal" : person.status === "invited" ? "bg-warning/15 text-warning" : "bg-mist text-navy-muted"}`}
        >
          {statusLabels[person.status] ?? person.status}
        </span>
      </td>
      <td className="px-3 py-4 font-body text-sm text-navy-muted">
        {person.last_active
          ? new Date(person.last_active).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </td>
      <td className="px-3 py-4 text-right">
        <details className="relative inline-block">
          <summary
            className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-border text-navy-muted transition hover:border-teal hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            aria-label={`Actions for ${person.name}`}
          >
            •••
          </summary>
          <div className="absolute right-0 z-10 mt-2 grid min-w-40 gap-1 rounded-xl border border-border bg-white p-1 text-left shadow-xl">
            {person.status === "invited" && (
              <ActionButton
                disabled={busy}
                onClick={onResend}
                label="Resend invitation"
                icon={<RefreshCw size={14} />}
              />
            )}
            {person.status === "active" && (
              <>
                <ActionButton
                  disabled={busy}
                  onClick={() => onStatus("suspended")}
                  label="Suspend access"
                  icon={<UserX size={14} />}
                />
                <ActionButton
                  disabled={busy}
                  onClick={() => onStatus("deactivated")}
                  label="Deactivate access"
                  icon={<UserX size={14} />}
                />
              </>
            )}
            {(person.status === "suspended" ||
              person.status === "deactivated") && (
              <ActionButton
                disabled={busy}
                onClick={() => onStatus("active")}
                label="Activate access"
                icon={<UserCheck size={14} />}
              />
            )}
          </div>
        </details>
      </td>
    </tr>
  );
}
function scopeBasis(role: string) {
  return role === "program_admin"
    ? "Programme-wide"
    : role === "mentor" || role === "nurse_manager"
      ? "Facility-based"
      : "Institution-based";
}
function MobilePersonRow({
  person,
  busy,
  onOpen,
  onResend,
  onStatus,
}: {
  person: Person;
  busy: boolean;
  onOpen: () => void;
  onResend: () => void;
  onStatus: (status: "active" | "suspended" | "deactivated") => void;
}) {
  return (
    <article className="space-y-4 py-5 first:pt-6">
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open details for ${person.name}`}
          className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          <p className="truncate font-body text-sm font-semibold text-navy">
            {person.name}
          </p>
          <p className="mt-1 truncate font-body text-xs text-navy-muted">
            {person.email}
          </p>
        </button>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 font-body text-xs font-semibold ${person.status === "active" ? "bg-teal-light text-teal" : person.status === "invited" ? "bg-warning/15 text-warning" : "bg-mist text-navy-muted"}`}
        >
          {statusLabels[person.status] ?? person.status}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
            Role
          </dt>
          <dd className="mt-1 font-body text-sm text-navy-muted">
            {roleLabels[person.role] ?? person.role}
          </dd>
        </div>
        <div>
          <dt className="font-body text-[0.68em] font-bold uppercase tracking-[0.12em] text-navy-muted">
            Scope
          </dt>
          <dd className="mt-1 font-body text-sm text-navy-muted">
            {scopeBasis(person.role)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {person.status === "invited" && (
          <ActionButton
            disabled={busy}
            onClick={onResend}
            label="Resend invitation"
            icon={<RefreshCw size={14} />}
          />
        )}
        {person.status === "active" && (
          <ActionButton
            disabled={busy}
            onClick={() => onStatus("suspended")}
            label="Suspend"
            icon={<UserX size={14} />}
          />
        )}
        {(person.status === "suspended" || person.status === "deactivated") && (
          <ActionButton
            disabled={busy}
            onClick={() => onStatus("active")}
            label="Activate"
            icon={<UserCheck size={14} />}
          />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto min-h-8 font-body text-xs font-semibold text-teal"
        >
          View details <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  );
}
function ActionButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  const destructive =
    label.toLowerCase().includes("remove") ||
    label.toLowerCase().includes("deactivate");
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 font-body text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${destructive ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100" : "border-border text-navy-muted hover:border-teal hover:text-teal"}`}
    >
      {icon}
      {label}
    </button>
  );
}
function StatusConfirmModal({
  action,
  onReasonChange,
  onCancel,
  onConfirm,
  busy,
}: {
  action: PendingAction;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const isRemoval = action.status === "deactivated";
  const label = isRemoval
    ? "remove from the programme"
    : action.status === "suspended"
      ? "suspend access"
      : "activate access";
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-action-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <p
          className={`font-body text-xs font-bold uppercase tracking-[0.14em] ${isRemoval ? "text-error" : "text-teal"}`}
        >
          {isRemoval ? "Destructive access action" : "Account access"}
        </p>
        <h2
          id="status-action-title"
          className="mt-3 font-display text-2xl font-bold text-navy"
        >
          {isRemoval
            ? "Remove"
            : action.status === "suspended"
              ? "Suspend"
              : "Activate"}{" "}
          {action.person.name}?
        </h2>
        <p className="mt-3 font-body text-sm leading-6 text-navy-muted">
          {isRemoval
            ? "This will revoke this person’s programme access and sign out their active sessions. You can restore access later from the account actions."
            : action.status === "active"
              ? "This will restore their access to the programme portal."
              : "Their active sessions will be signed out and access will be restricted."}
        </p>
        <label className="mt-4 block font-body text-sm font-semibold text-navy">
          Why are you changing access?
          <textarea
            value={action.reason}
            onChange={(event) => onReasonChange(event.target.value)}
            required
            minLength={5}
            maxLength={500}
            rows={3}
            className="mt-2 w-full rounded-xl border border-border p-3 font-normal"
            placeholder="Add a short reason for the audit record"
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="tertiary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={isRemoval ? "secondary" : "primary"}
            onClick={onConfirm}
            disabled={busy || action.reason.trim().length < 5}
          >
            {busy
              ? "Updating…"
              : isRemoval
                ? "Remove access"
                : label[0].toUpperCase() + label.slice(1)}
          </Button>
        </div>
      </section>
    </div>
  );
}
function PersonDrawer(props: {
  person: Person;
  busy: boolean;
  onClose: () => void;
  onResend: () => void;
  onStatus: (status: "active" | "suspended" | "deactivated") => void;
  onAccessSaved: (changes: Partial<Person>) => void;
  onSessionsRevoked: () => void;
}) {
  const { pushToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [accessReason, setAccessReason] = useState("");
  const queryClient = useQueryClient();
  async function saveAccess(input: {
    role: string;
    institution_id?: string | null;
    facility_id?: string | null;
    scope?: string;
  }) {
    await updateAccountAccess(props.person.id, {
      role: input.role,
      institution_id: input.institution_id,
      facility_id: input.facility_id,
      reason: accessReason,
    });
    props.onAccessSaved(input);
    await queryClient.invalidateQueries({ queryKey: ["programme-people"] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-indicators"] }),
    ]);
    setEditing(false);
    pushToast({ kind: "success", title: "Access updated", message: `${props.person.name}'s role and programme scope were saved.` });
  }
  async function revokeSessions(reason: string) {
    await revokeAccountSessions(props.person.id, reason);
    props.onSessionsRevoked();
    pushToast({ kind: "success", title: "Devices signed out", message: `${props.person.name} will need to sign in again.` });
  }
  return createPortal(
    <>
      <InlinePersonDrawer
        {...props}
        onEditAccess={() => setEditing(true)}
        onRevokeSessions={revokeSessions}
      />
      {editing && (
        <EditAccessModal
          person={props.person}
          reason={accessReason}
          onReasonChange={setAccessReason}
          onClose={() => setEditing(false)}
          onSave={saveAccess}
        />
      )}
    </>,
    document.body,
  );
}

function InlinePersonDrawer({
  person,
  busy,
  onClose,
  onResend,
  onStatus,
  onEditAccess,
  onRevokeSessions,
}: {
  person: Person;
  busy: boolean;
  onClose: () => void;
  onResend: () => void;
  onStatus: (status: "active" | "suspended" | "deactivated") => void;
  onEditAccess: () => void;
  onRevokeSessions: (reason: string) => Promise<void>;
}) {
  const [tab, setTab] = useState("Overview");
  const [sessionReason, setSessionReason] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const activity = useQuery({
    queryKey: ["person-activity", person.id],
    queryFn: () => getPersonActivity(person.id),
    enabled: tab === "Activity",
  });
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const canResend =
    person.can_reissue_invitation ?? person.status === "invited";
  const canActivate =
    person.status === "suspended" ||
    (person.status === "deactivated" && !person.can_reissue_invitation);
  const canSuspend = person.status === "active";
  const initials = person.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="fixed inset-0 z-40 bg-navy/35"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-drawer-title"
        className="people-person-drawer ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <header className="border-b border-border px-6 pb-5 pt-7 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-lilac font-body text-lg font-bold text-navy">
                {initials}
              </span>
              <div className="min-w-0">
                <h2
                  id="person-drawer-title"
                  className="truncate font-display text-2xl font-bold text-navy"
                >
                  {person.name}
                </h2>
                <p className="mt-1 truncate font-body text-sm text-navy-muted">
                  {person.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-navy-muted transition hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              aria-label="Close person details"
            >
              <X size={19} />
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 font-body text-xs font-semibold ${person.status === "active" ? "bg-teal-light text-teal" : person.status === "invited" ? "bg-warning/15 text-warning" : "bg-mist text-navy-muted"}`}
            >
              {statusLabels[person.status] ?? person.status}
            </span>
            <span className="font-body text-xs text-navy-muted">
              Added{" "}
              {new Date(person.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </header>
        <nav
          className="flex gap-6 border-b border-border px-6 sm:px-8"
          role="tablist"
          aria-label="Person details sections"
        >
          {["Overview", "Access", "Activity"].map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`min-h-12 border-b-2 font-body text-sm font-semibold ${tab === item ? "border-teal text-teal" : "border-transparent text-navy-muted"}`}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="flex-1 px-6 py-7 sm:px-8">
          {tab === "Overview" && (
            <div className="space-y-7">
              <section>
                <h3 className="font-display text-lg font-bold text-navy">
                  Basic information
                </h3>
                <div className="mt-5 space-y-5">
                  <Detail
                    icon={<Users size={17} />}
                    label="Full name"
                    value={person.name}
                  />
                  <Detail
                    icon={<Mail size={17} />}
                    label="Email"
                    value={person.email}
                  />
                  <Detail
                    icon={<Phone size={17} />}
                    label="Phone"
                    value={person.phone || "Not provided"}
                  />
                  <Detail
                    icon={<UserCheck size={17} />}
                    label="Role"
                    value={roleLabels[person.role] ?? person.role}
                  />
                </div>
              </section>
              <section className="border-t border-border pt-6">
                <h3 className="font-display text-lg font-bold text-navy">
                  Programme context
                </h3>
                <div className="mt-5 space-y-5">
                  <Detail
                    icon={<ShieldCheck size={17} />}
                    label="Scope"
                    value={person.scope ?? scopeBasis(person.role)}
                  />
                  <Detail
                    icon={<BriefcaseBusiness size={17} />}
                    label="Access basis"
                    value={`${scopeBasis(person.role)} (${roleLabels[person.role] ?? person.role} role)`}
                  />
                  <Detail
                    icon={<Users size={17} />}
                    label="Status"
                    value={statusLabels[person.status] ?? person.status}
                  />
                </div>
              </section>
            </div>
          )}
          {tab === "Access" && (
            <section className="space-y-5">
              <h3 className="font-display text-lg font-bold text-navy">
                Access controls
              </h3>
              <p className="font-body text-sm leading-6 text-navy-muted">
                Access is governed by the assigned role and programme scope.
              </p>
              <Detail
                icon={<ShieldCheck size={17} />}
                label="Current role"
                value={roleLabels[person.role] ?? person.role}
              />
              <Detail
                icon={<BriefcaseBusiness size={17} />}
                label="Scope"
                value={person.scope ?? scopeBasis(person.role)}
              />
              {person.status !== "invited" &&
                !person.can_reissue_invitation && (
                  <Button onClick={onEditAccess} className="mt-2 w-full">
                    Edit access
                  </Button>
                )}
              {(person.status === "invited" ||
                person.can_reissue_invitation) && (
                <p className="rounded-xl bg-mist/50 p-3 text-sm text-navy-muted">
                  To change a pending invitation, reissue it with the correct
                  role and scope. The recipient will get a fresh link.
                </p>
              )}
              {person.status === "active" && (
                <section className="mt-6 border-t border-border pt-5">
                  <h4 className="font-semibold text-navy">Signed-in devices</h4>
                  <p className="mt-1 text-sm text-navy-muted">
                    Sign this person out on all devices. They’ll need to sign in
                    again.
                  </p>
                  <label className="mt-3 block text-sm font-semibold">
                    Reason
                    <textarea
                      value={sessionReason}
                      onChange={(event) => setSessionReason(event.target.value)}
                      minLength={5}
                      rows={2}
                      className="mt-1 w-full rounded border border-border p-2 font-normal"
                      placeholder="Why are you signing them out?"
                    />
                  </label>
                  <Button
                    className="mt-2"
                    variant="tertiary"
                    disabled={
                      sessionBusy ||
                      sessionReason.trim().length < 5 ||
                      person.id === ""
                    }
                    onClick={() => {
                      setSessionBusy(true);
                      void onRevokeSessions(sessionReason.trim())
                        .then(() =>
                          setSessionMessage(
                            "Their signed-in devices have been signed out.",
                          ),
                        )
                        .catch((cause) =>
                          setSessionMessage(
                            cause instanceof Error
                              ? cause.message
                              : "Could not sign out their devices.",
                          ),
                        )
                        .finally(() => setSessionBusy(false));
                    }}
                  >
                    {sessionBusy ? "Signing out…" : "Sign out all devices"}
                  </Button>
                  {sessionMessage && (
                    <p role="status" className="mt-2 text-sm text-navy-muted">
                      {sessionMessage}
                    </p>
                  )}
                </section>
              )}
            </section>
          )}
          {tab === "Activity" && (
            <section>
              <h3 className="font-display text-lg font-bold text-navy">
                Recent account activity
              </h3>
              {activity.isPending ? (
                <p className="mt-4 text-sm text-navy-muted">
                  Loading activity…
                </p>
              ) : activity.isError ? (
                <div className="mt-4">
                  <p role="alert" className="text-sm text-error">
                    Activity could not be loaded.
                  </p>
                  <Button
                    className="mt-2"
                    variant="tertiary"
                    size="sm"
                    onClick={() => void activity.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              ) : activity.data.length === 0 ? (
                <p className="mt-4 rounded-xl bg-mist/40 p-4 text-sm text-navy-muted">
                  No account activity has been recorded yet.
                </p>
              ) : (
                <ol className="mt-4 divide-y divide-border">
                  {activity.data.map((entry) => (
                    <li key={entry.id} className="py-3">
                      <p className="font-semibold text-navy">
                        {entry.action.replaceAll(".", " ").replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-sm text-navy-muted">
                        By {entry.actor_name} ·{" "}
                        {new Date(entry.occurred_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
        <footer className="border-t border-border px-6 py-5 sm:px-8">
          <div className="flex flex-wrap gap-2">
            {canResend && (
              <ActionButton
                disabled={busy}
                onClick={onResend}
                label={
                  person.status === "deactivated"
                    ? "Reissue invitation"
                    : "Resend invitation"
                }
                icon={<RefreshCw size={14} />}
              />
            )}
            {canSuspend && (
              <ActionButton
                disabled={busy}
                onClick={() => onStatus("suspended")}
                label="Suspend access"
                icon={<UserX size={14} />}
              />
            )}
            {canActivate && (
              <ActionButton
                disabled={busy}
                onClick={() => onStatus("active")}
                label="Activate access"
                icon={<UserCheck size={14} />}
              />
            )}
            {person.status !== "deactivated" && (
              <ActionButton
                disabled={busy}
                onClick={() => onStatus("deactivated")}
                label="Remove from programme"
                icon={<UserX size={14} />}
              />
            )}
          </div>
        </footer>
      </aside>
    </div>
  );
}

function EditAccessModal({
  person,
  reason,
  onReasonChange,
  onClose,
  onSave,
}: {
  person: Person;
  reason: string;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onSave: (input: {
    role: string;
    institution_id?: string | null;
    facility_id?: string | null;
    scope?: string;
  }) => Promise<void>;
}) {
  const [role, setRole] = useState(person.role);
  const [institutionId, setInstitutionId] = useState(
    person.institution_id ?? "",
  );
  const [facilityId, setFacilityId] = useState(person.facility_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const institutions = useQuery({
    queryKey: ["access-institutions"],
    queryFn: getInstitutions,
  });
  const facilities = useQuery({
    queryKey: ["access-facilities"],
    queryFn: getFacilities,
  });
  const usesInstitution = role === "student" || role === "coordinator";
  const usesFacility = role === "mentor" || role === "nurse_manager";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((usesInstitution && !institutionId) || (usesFacility && !facilityId)) {
      setError("Select the scope that governs this role before saving.");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Add a reason so this access change is recorded clearly.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const selectedScope = usesInstitution
        ? (institutions.data ?? []).find((item) => item.id === institutionId)
            ?.name
        : usesFacility
          ? (facilities.data ?? []).find((item) => item.id === facilityId)?.name
          : "Programme-wide";
      await onSave({
        role,
        institution_id: usesInstitution ? institutionId : null,
        facility_id: usesFacility ? facilityId : null,
        scope: selectedScope,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "We could not update access.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-access-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Access management
            </p>
            <h2
              id="edit-access-title"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Edit access
            </h2>
            <p className="mt-2 font-body text-sm text-navy-muted">
              Update {person.name}&apos;s role and programme scope. Their
              account and email stay unchanged.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-2 text-navy-muted hover:bg-mist"
            aria-label="Close edit access"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="mt-7 space-y-5">
          <label className="block">
            <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
              Role
            </span>
            <select
              value={role}
              onChange={(event) => {
                const next = event.target.value;
                setRole(next);
                if (next !== "student" && next !== "coordinator")
                  setInstitutionId("");
                if (next !== "mentor" && next !== "nurse_manager")
                  setFacilityId("");
              }}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 font-body text-sm text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            >
              <option value="student">Student</option>
              <option value="mentor">Clinical Mentor</option>
              <option value="nurse_manager">Nurse Manager</option>
              <option value="coordinator">University Coordinator</option>
              <option value="program_admin">Programme Administrator</option>
            </select>
          </label>
          {usesInstitution && (
            <label className="block">
              <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
                Institution
              </span>
              <select
                value={institutionId}
                onChange={(event) => setInstitutionId(event.target.value)}
                disabled={institutions.isPending}
                className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 font-body text-sm text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              >
                <option value="">Select institution</option>
                {(institutions.data ?? []).map((institution: Institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {usesFacility && (
            <label className="block">
              <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
                Facility
              </span>
              <select
                value={facilityId}
                onChange={(event) => setFacilityId(event.target.value)}
                disabled={facilities.isPending}
                className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 font-body text-sm text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              >
                <option value="">Select facility</option>
                {(facilities.data ?? []).map((facility: Facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {role === "student" && !person.registration_number && (
            <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 font-body text-sm leading-6 text-warning">
              This account has no registration number, so it cannot be changed
              to Student until that identifier is added.
            </p>
          )}
          <label className="block">
            <span className="font-body text-sm font-semibold text-navy">
              Reason for this change
            </span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              minLength={5}
              maxLength={500}
              rows={3}
              className="mt-2 w-full rounded-xl border border-border p-3 font-body text-sm"
              placeholder="Explain why this person’s access is changing"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 font-body text-sm leading-6 text-error"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="tertiary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                reason.trim().length < 5 ||
                (role === "student" && !person.registration_number)
              }
            >
              {saving ? "Saving…" : "Save access"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-teal">{icon}</span>
      <div>
        <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
          {label}
        </p>
        <p className="mt-2 font-body text-sm text-navy">{value}</p>
      </div>
    </div>
  );
}
function EmptyPeople({ onInvite }: Pick<Props, "onInvite">) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-light text-teal">
        <Users size={25} />
      </div>
      <h3 className="mt-5 font-display text-2xl font-bold text-navy">
        No team members yet
      </h3>
      <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-navy-muted">
        Invite your first programme team member to get started.
      </p>
      <Button className="mt-6" onClick={onInvite}>
        Invite a team member
      </Button>
    </div>
  );
}
