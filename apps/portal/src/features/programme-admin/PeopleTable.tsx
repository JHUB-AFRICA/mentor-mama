import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { TableSkeleton } from "@mentormama/ui";
import {
  AdminButton,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  Notice,
  SearchField,
  SelectField,
  StatCard,
  StatGrid,
  StatusPill,
  Toolbar,
  type PillTone,
} from "./ui/AdminKit";
import "./people-pages.css";
import "./programme-overlays.css";
import { DetailList, DetailSection, Drawer, Field, Modal, SelectInput, TextArea } from "../../components/kit";
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

const statusTones: Record<string, PillTone> = {
  active: "success",
  invited: "warning",
  suspended: "danger",
  deactivated: "neutral",
};
function PersonStatus({ status }: { status: string }) {
  return (
    <StatusPill tone={statusTones[status] ?? "neutral"}>
      {statusLabels[status] ?? status}
    </StatusPill>
  );
}
function Initials({ name }: { name: string }) {
  return (
    <span className="pa-tile pa-tile--sm pa-tile--teal" aria-hidden="true">
      <span className="text-[0.7rem] font-bold">
        {name
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </span>
    </span>
  );
}

export function PeopleTable({ onInvite, onOpenRecovery }: Props) {
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });
  return (
    <AdminPage className="people-access-shell">
      <AdminPageHeader
        eyebrow="Access management"
        title="People & access"
        description="Review programme roles, account access, and invitations in one place."
        actions={
          <>
            <AdminButton variant="secondary" icon={<KeyRound />} onClick={onOpenRecovery}>
              Authenticator recovery
            </AdminButton>
            <AdminButton icon={<Users />} onClick={onInvite}>
              Invite person
            </AdminButton>
          </>
        }
      />
      <PeopleKpis summary={summary.data} loading={summary.isPending} error={summary.isError} />
      <PeopleTableContent onInvite={onInvite} />
    </AdminPage>
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
  const hint = (text: string) => (error ? "Counts could not be loaded" : text);
  return (
    <StatGrid>
      <StatCard
        icon={<Users />}
        tone="teal"
        value={summary?.people_total ?? 0}
        label="Other programme accounts"
        hint={hint("All roles and statuses; excludes you")}
        loading={loading || error}
      />
      <StatCard
        icon={<UserCheck />}
        tone="blue"
        value={summary?.students ?? 0}
        label="Students"
        hint={hint("Active in programme")}
        loading={loading || error}
      />
      <StatCard
        icon={<BriefcaseBusiness />}
        tone="violet"
        value={summary?.mentors ?? 0}
        label="Mentors"
        hint={hint("Active in programme")}
        loading={loading || error}
      />
      <StatCard
        icon={<ShieldCheck />}
        tone="green"
        value={summary?.programme_staff ?? 0}
        label="Other programme staff"
        hint={hint("Admins, Coordinators, Nurse Managers")}
        loading={loading || error}
      />
    </StatGrid>
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

  const filtered = Boolean(search || role || status);
  return (
    <>
      <form onSubmit={applySearch} aria-label="Search and filter people">
        <Toolbar compact filters={filtered ? 3 : 2}>
          <SearchField
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search by name or email"
            label="Search people"
          />
          <SelectField
            label="Filter by role"
            value={role}
            onChange={(value) => {
              setRole(value);
              setPage(1);
            }}
            options={[
                { value: "", label: "All roles" },
                { value: "coordinator", label: "University Coordinator" },
                { value: "nurse_manager", label: "Nurse Manager" },
                { value: "mentor", label: "Clinical Mentor" },
                { value: "student", label: "Student" },
              ]}
          />
          <SelectField
            label="Filter by status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
                { value: "", label: "All statuses" },
                { value: "invited", label: "Invitation pending" },
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "deactivated", label: "Deactivated" },
              ]}
          />
          {filtered && (
            <AdminButton variant="ghost" onClick={clearFilters}>
              Clear
            </AdminButton>
          )}
        </Toolbar>
      </form>
      {feedback && (
        <div role={feedback.kind === "error" ? "alert" : "status"}>
          <Notice icon={feedback.kind === "error" ? <X /> : <ShieldCheck />}>
            {feedback.message}
          </Notice>
        </div>
      )}
      <section aria-label="Programme people" className="pa-table-wrap">
        {people.isError ? (
          <EmptyState
            icon={<UserX size={24} />}
            title="We could not load programme people."
            text="Please try again."
            action={
              <AdminButton variant="secondary" onClick={() => void people.refetch()}>
                Try again
              </AdminButton>
            }
          />
        ) : people.isPending ? (
          <TableSkeleton rows={6} />
        ) : people.data.results.length === 0 ? (
          <EmptyPeople onInvite={onInvite} filtered={filtered} />
        ) : (
          <>
            <div className="pa-table-scroll hidden md:block">
              <table className="pa-table min-w-[56rem]">
                <thead>
                  <tr>
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
            <div className="md:hidden">
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
            <div className="pa-table-footer">
              <p>
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
                <AdminButton
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft />}
                  disabled={
                    !people.data.pagination.has_previous || people.isFetching
                  }
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </AdminButton>
                <span className="font-semibold text-[var(--pa-ink)]">
                  Page {people.data.pagination.page} of{" "}
                  {people.data.pagination.total_pages}
                </span>
                <AdminButton
                  variant="secondary"
                  size="sm"
                  disabled={
                    !people.data.pagination.has_next || people.isFetching
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                  <ChevronRight />
                </AdminButton>
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
          hidden={Boolean(pendingAction)}
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
    </>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col">
      {children === "Added"
        ? "Last active"
        : children === "Scope basis"
          ? "Scope / ward"
          : children}
    </th>
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
    <tr>
      <td>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open details for ${person.name}`}
          className="pa-cell-title rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-teal)]"
        >
          <Initials name={person.name} />
          <span className="min-w-0">
            <strong className="truncate">{person.name}</strong>
            <small className="truncate">{person.email}</small>
          </span>
        </button>
      </td>
      <td>{roleLabels[person.role] ?? person.role}</td>
      <td>{person.scope ?? scopeBasis(person.role)}</td>
      <td>
        <PersonStatus status={person.status} />
      </td>
      <td>
        {person.last_active
          ? new Date(person.last_active).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </td>
      <td className="text-right">
        <details className="relative inline-block">
          <summary
            className="pa-btn pa-btn--secondary pa-btn--sm cursor-pointer list-none"
            aria-label={`Actions for ${person.name}`}
          >
            •••
          </summary>
          <div className="absolute right-0 z-10 mt-2 grid min-w-44 gap-1 rounded-[0.75rem] border border-[var(--pa-line)] bg-white p-1 text-left shadow-xl">
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
    <article className="pa-row !flex-col !items-stretch gap-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open details for ${person.name}`}
          className="pa-cell-title rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-teal)]"
        >
          <Initials name={person.name} />
          <span className="min-w-0">
            <strong className="truncate">{person.name}</strong>
            <small className="truncate">{person.email}</small>
          </span>
        </button>
        <PersonStatus status={person.status} />
      </div>
      <p className="pa-row__meta !whitespace-normal">
        {roleLabels[person.role] ?? person.role} · {scopeBasis(person.role)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
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
        <AdminButton variant="ghost" size="sm" className="ml-auto" onClick={onOpen}>
          View details <span aria-hidden="true">→</span>
        </AdminButton>
      </div>
    </article>
  );
}
function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <AdminButton
      variant="secondary"
      size="sm"
      icon={icon}
      disabled={disabled}
      onClick={onClick}
      className={danger ? "po-danger" : undefined}
    >
      {label}
    </AdminButton>
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
  const verb = isRemoval ? "Remove" : action.status === "suspended" ? "Suspend" : "Activate";
  return (
    <Modal
      open
      onClose={onCancel}
      dismissible={!busy}
      size="sm"
      closeLabel="Close"
      icon={action.status === "active" ? <UserCheck /> : <UserX />}
      title={`${verb} ${action.person.name}?`}
      description={
        isRemoval
          ? "This will revoke this person’s programme access and sign out their active sessions. You can restore access later from the account actions."
          : action.status === "active"
            ? "This will restore their access to the programme portal."
            : "Their active sessions will be signed out and access will be restricted."
      }
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton
            variant={isRemoval ? "secondary" : "primary"}
            size="sm"
            className={isRemoval ? "po-danger" : undefined}
            onClick={onConfirm}
            disabled={busy || action.reason.trim().length < 5}
          >
            {busy ? "Updating…" : isRemoval ? "Remove access" : label[0].toUpperCase() + label.slice(1)}
          </AdminButton>
        </>
      }
    >
      <Field
        label="Why are you changing access?"
        required
        hint="Saved to the audit record. At least 5 characters."
      >
        <TextArea
          value={action.reason}
          onChange={(event) => onReasonChange(event.target.value)}
          required
          minLength={5}
          maxLength={500}
          rows={3}
          placeholder="Add a short reason for the audit record"
        />
      </Field>
    </Modal>
  );
}
function PersonDrawer(props: {
  person: Person;
  busy: boolean;
  hidden: boolean;
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
  return (
    <>
      {/* Only one dialog traps focus at a time, so the drawer steps aside while a modal is open. */}
      <InlinePersonDrawer
        {...props}
        open={!props.hidden && !editing}
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
    </>
  );
}

type DrawerTab = "Overview" | "Access" | "Activity";
const drawerTabs: Array<{ value: DrawerTab; label: string }> = [
  { value: "Overview", label: "Overview" },
  { value: "Access", label: "Access" },
  { value: "Activity", label: "Activity" },
];

function InlinePersonDrawer({
  person,
  busy,
  open,
  onClose,
  onResend,
  onStatus,
  onEditAccess,
  onRevokeSessions,
}: {
  person: Person;
  busy: boolean;
  open: boolean;
  onClose: () => void;
  onResend: () => void;
  onStatus: (status: "active" | "suspended" | "deactivated") => void;
  onEditAccess: () => void;
  onRevokeSessions: (reason: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<DrawerTab>("Overview");
  const [sessionReason, setSessionReason] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const activity = useQuery({
    queryKey: ["person-activity", person.id],
    queryFn: () => getPersonActivity(person.id),
    enabled: tab === "Activity",
  });
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
  const roleLabel = roleLabels[person.role] ?? person.role;
  const scope = person.scope ?? scopeBasis(person.role);
  const addedOn = new Date(person.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const pendingInvitation = person.status === "invited" || person.can_reissue_invitation;
  const hasActions = canResend || canSuspend || canActivate || person.status !== "deactivated";
  return (
    <Drawer
      open={open}
      onClose={onClose}
      closeLabel="Close person details"
      title={person.name}
      header={
        <div className="po-person">
          <span className="po-avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="po-person__text">
            <p className="po-person__name">{person.name}</p>
            <p className="po-person__email">{person.email}</p>
            <div className="po-person__meta">
              <PersonStatus status={person.status} />
              <span>Added {addedOn}</span>
            </div>
          </div>
        </div>
      }
      tabs={<AdminTabs tabs={drawerTabs} value={tab} onChange={setTab} label="Person details sections" />}
      footer={
        hasActions ? (
          <>
            {canResend && (
              <ActionButton
                disabled={busy}
                onClick={onResend}
                label={person.status === "deactivated" ? "Reissue invitation" : "Resend invitation"}
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
                danger
                disabled={busy}
                onClick={() => onStatus("deactivated")}
                label="Remove from programme"
                icon={<UserX size={14} />}
              />
            )}
          </>
        ) : undefined
      }
    >
      {tab === "Overview" && (
        <>
          <DetailSection title="Basic information">
            <DetailList
              items={[
                { label: "Full name", value: person.name, icon: <Users /> },
                { label: "Email", value: person.email, icon: <Mail /> },
                { label: "Phone", value: person.phone || "Not provided", icon: <Phone /> },
                { label: "Role", value: roleLabel, icon: <UserCheck /> },
              ]}
            />
          </DetailSection>
          <DetailSection title="Programme context">
            <DetailList
              items={[
                { label: "Scope", value: scope, icon: <ShieldCheck /> },
                {
                  label: "Access basis",
                  value: `${scopeBasis(person.role)} (${roleLabel} role)`,
                  icon: <BriefcaseBusiness />,
                },
                { label: "Status", value: statusLabels[person.status] ?? person.status, icon: <Users /> },
              ]}
            />
          </DetailSection>
        </>
      )}
      {tab === "Access" && (
        <>
          <DetailSection title="Access controls">
            <p className="po-lead" style={{ marginBottom: "0.85rem" }}>
              Access is governed by the assigned role and programme scope.
            </p>
            <DetailList
              items={[
                { label: "Current role", value: roleLabel, icon: <ShieldCheck /> },
                { label: "Scope", value: scope, icon: <BriefcaseBusiness /> },
              ]}
            />
            {!pendingInvitation && (
              <div style={{ marginTop: "0.85rem" }}>
                <AdminButton variant="secondary" size="sm" icon={<KeyRound />} onClick={onEditAccess}>
                  Edit access
                </AdminButton>
              </div>
            )}
            {pendingInvitation && (
              <p className="po-note" style={{ marginTop: "0.85rem" }}>
                To change a pending invitation, reissue it with the correct role and scope. The recipient will get a
                fresh link.
              </p>
            )}
          </DetailSection>
          {person.status === "active" && (
            <DetailSection title="Signed-in devices">
              <p className="po-lead" style={{ marginBottom: "0.85rem" }}>
                Sign this person out on all devices. They’ll need to sign in again.
              </p>
              <Field label="Reason" required hint="Saved to the audit record. At least 5 characters.">
                <TextArea
                  value={sessionReason}
                  onChange={(event) => setSessionReason(event.target.value)}
                  minLength={5}
                  rows={2}
                  className="po-textarea-sm"
                  placeholder="Why are you signing them out?"
                />
              </Field>
              <div style={{ marginTop: "0.75rem" }}>
                <AdminButton
                  variant="secondary"
                  size="sm"
                  className="po-danger"
                  disabled={sessionBusy || sessionReason.trim().length < 5 || person.id === ""}
                  onClick={() => {
                    setSessionBusy(true);
                    void onRevokeSessions(sessionReason.trim())
                      .then(() => setSessionMessage("Their signed-in devices have been signed out."))
                      .catch((cause) =>
                        setSessionMessage(
                          cause instanceof Error ? cause.message : "Could not sign out their devices.",
                        ),
                      )
                      .finally(() => setSessionBusy(false));
                  }}
                >
                  {sessionBusy ? "Signing out…" : "Sign out all devices"}
                </AdminButton>
              </div>
              {sessionMessage && (
                <p role="status" className="po-note" style={{ marginTop: "0.75rem" }}>
                  {sessionMessage}
                </p>
              )}
            </DetailSection>
          )}
        </>
      )}
      {tab === "Activity" && (
        <DetailSection title="Recent account activity">
          {activity.isPending ? (
            <p className="po-lead">Loading activity…</p>
          ) : activity.isError ? (
            <div>
              <p role="alert" className="po-note po-note--error">
                Activity could not be loaded.
              </p>
              <div style={{ marginTop: "0.65rem" }}>
                <AdminButton variant="secondary" size="sm" onClick={() => void activity.refetch()}>
                  Try again
                </AdminButton>
              </div>
            </div>
          ) : activity.data.length === 0 ? (
            <p className="po-note">No account activity has been recorded yet.</p>
          ) : (
            <ol className="po-timeline">
              {activity.data.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action.replaceAll(".", " ").replaceAll("_", " ")}</strong>
                  <span>
                    By {entry.actor_name} · {new Date(entry.occurred_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </DetailSection>
      )}
    </Drawer>
  );
}

const accessRoleHints: Record<string, string> = {
  student: "Completes the programme; needs an institution and a registration number.",
  mentor: "Supervises students on the ward; tied to one facility.",
  nurse_manager: "Oversees mentors and placements at one facility.",
  coordinator: "Manages students and placements for one institution.",
  program_admin: "Programme-wide access to every institution and facility.",
};

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
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="md"
      closeLabel="Close edit access"
      icon={<ShieldCheck />}
      title="Edit access"
      description={`Update ${person.name}’s role and programme scope. Their account and email stay unchanged.`}
      footer={
        <>
          <AdminButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            form="edit-access-form"
            size="sm"
            disabled={saving || reason.trim().length < 5 || (role === "student" && !person.registration_number)}
          >
            {saving ? "Saving…" : "Save access"}
          </AdminButton>
        </>
      }
    >
      <form id="edit-access-form" onSubmit={submit} className="space-y-4">
        <Field label="Role" hint={accessRoleHints[role]}>
          <SelectInput
            value={role}
            onChange={(event) => {
              const next = event.target.value;
              setRole(next);
              if (next !== "student" && next !== "coordinator") setInstitutionId("");
              if (next !== "mentor" && next !== "nurse_manager") setFacilityId("");
            }}
          >
            <option value="student">Student</option>
            <option value="mentor">Clinical Mentor</option>
            <option value="nurse_manager">Nurse Manager</option>
            <option value="coordinator">University Coordinator</option>
            <option value="program_admin">Programme Administrator</option>
          </SelectInput>
        </Field>
        {usesInstitution && (
          <Field label="Institution" required>
            <SelectInput
              value={institutionId}
              onChange={(event) => setInstitutionId(event.target.value)}
              disabled={institutions.isPending}
            >
              <option value="">Select institution</option>
              {(institutions.data ?? []).map((institution: Institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}
        {usesFacility && (
          <Field label="Facility" required>
            <SelectInput
              value={facilityId}
              onChange={(event) => setFacilityId(event.target.value)}
              disabled={facilities.isPending}
            >
              <option value="">Select facility</option>
              {(facilities.data ?? []).map((facility: Facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}
        {role === "student" && !person.registration_number && (
          <p className="po-note po-note--warning">
            This account has no registration number, so it cannot be changed to Student until that identifier is
            added.
          </p>
        )}
        <Field label="Reason for this change" required hint="Saved to the audit record. At least 5 characters.">
          <TextArea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            minLength={5}
            maxLength={500}
            rows={3}
            placeholder="Explain why this person’s access is changing"
          />
        </Field>
        {error && (
          <p role="alert" className="po-note po-note--error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
function EmptyPeople({
  onInvite,
  filtered,
}: Pick<Props, "onInvite"> & { filtered: boolean }) {
  return (
    <EmptyState
      icon={<Users size={24} />}
      title={filtered ? "No people match these filters" : "No team members yet"}
      text={
        filtered
          ? "Try a different search or clear the filters."
          : "Invite your first programme team member to get started."
      }
      action={
        filtered ? undefined : (
          <AdminButton onClick={onInvite}>Invite a team member</AdminButton>
        )
      }
    />
  );
}
