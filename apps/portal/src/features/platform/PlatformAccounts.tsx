import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, LogOut, MailPlus, PlayCircle, ShieldPlus, UserX, Users } from "lucide-react";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { Modal } from "../../components/kit";
import {
  ApiError,
  getPlatformAccounts,
  getPlatformProgrammes,
  invitePlatformAdmin,
  resendPlatformInvitation,
  revokePlatformAccountSessions,
  setPlatformAccountStatus,
  type PersonInput,
  type PlatformAccount,
} from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, AdminTabs, EmptyState, SearchField, SelectField, StatusPill, Toolbar } from "../programme-admin/ui/AdminKit";
import { TableRowsSkeleton } from "./PlatformSkeletons";
import { EMPTY_PERSON, PersonFields, ReasonDialog, STATUS_LABEL, formatDate, invitationLabel, personProblem, statusTone } from "./platformUi";

type Tab = "all" | "invitations" | "expired" | "suspended";
type Pending = { kind: "suspend" | "reactivate" | "deactivate" | "signout"; account: PlatformAccount } | null;

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "platform_admin", label: "Platform Administrator" },
  { value: "program_admin", label: "Programme Administrator" },
  { value: "coordinator", label: "University Coordinator" },
  { value: "nurse_manager", label: "Nurse Manager" },
  { value: "mentor", label: "Clinical Mentor" },
  { value: "student", label: "Student" },
];

export function PlatformAccounts({ currentUserId, onError }: { currentUserId: string; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("");
  const [programme, setProgramme] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending>(null);
  const [invitingPlatform, setInvitingPlatform] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [tab, debounced, role, programme]);

  const filters = {
    page,
    page_size: 25,
    search: debounced,
    role,
    programme_id: programme,
    status: tab === "suspended" ? "suspended" : "",
    invitation: tab === "invitations" ? "pending" : tab === "expired" ? "expired" : "",
  };
  const query = useQuery({ queryKey: ["platform-accounts", filters], queryFn: () => getPlatformAccounts(filters), placeholderData: keepPreviousData });
  const programmes = useQuery({ queryKey: ["platform-programmes"], queryFn: getPlatformProgrammes, staleTime: 60_000 });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["platform-accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
  };
  const fail = (fallback: string) => (cause: unknown) => onError(cause instanceof ApiError ? cause.message : fallback);

  const resend = useMutation({
    mutationFn: (account: PlatformAccount) => resendPlatformInvitation(account.id),
    onSuccess: (_, account) => {
      refresh();
      pushToast({ kind: "success", title: "Invitation resent", message: `A new link was emailed to ${account.email}. It is valid for 48 hours.` });
    },
    onError: fail("We could not resend the invitation."),
  });
  const act = useMutation({
    mutationFn: async ({ kind, account, reason }: { kind: NonNullable<Pending>["kind"]; account: PlatformAccount; reason: string }) => {
      if (kind === "signout") return revokePlatformAccountSessions(account.id, reason);
      return setPlatformAccountStatus(account.id, kind === "suspend" ? "suspended" : kind === "deactivate" ? "deactivated" : "active", reason);
    },
    onSuccess: (_, { kind, account }) => {
      refresh();
      setPending(null);
      const titles = { suspend: "Account suspended", reactivate: "Account reactivated", deactivate: "Account deactivated", signout: "Signed out everywhere" };
      pushToast({ kind: "success", title: titles[kind], message: `${account.name || account.email} was updated and notified by email.` });
    },
    onError: fail("We could not update this account."),
  });

  const programmeOptions = [
    { value: "", label: "All programmes" },
    { value: "platform", label: "Platform team" },
    ...(programmes.data ?? []).map((item) => ({ value: item.id, label: item.name })),
  ];
  const results = query.data?.results ?? [];
  const pagination = query.data?.pagination;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Accounts & invitations"
        description="Every account across all programmes. Programme administrators manage the people inside their own programme; use this page when they cannot."
        actions={
          <AdminButton variant="secondary" icon={<ShieldPlus />} onClick={() => setInvitingPlatform(true)}>
            Invite platform admin
          </AdminButton>
        }
      />
      <AdminTabs
        label="Account views"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: "All accounts" },
          { value: "invitations", label: "Open invitations" },
          { value: "expired", label: "Expired invitations" },
          { value: "suspended", label: "Suspended" },
        ]}
      />
      <Toolbar filters={3}>
        <SearchField label="Search accounts" placeholder="Search by name or email" value={search} onChange={setSearch} />
        <SelectField label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        <SelectField label="Programme" value={programme} onChange={setProgramme} options={programmeOptions} />
      </Toolbar>

      {query.isPending ? (
        <TableRowsSkeleton rows={8} columns={6} label="accounts" />
      ) : query.isError ? (
        <PortalErrorState onRetry={() => void query.refetch()} />
      ) : results.length === 0 ? (
        <EmptyState icon={<Users />} title="No accounts match" text="Try a different search or filter." />
      ) : (
        <AdminCard flush>
          <div className="pf-table-wrap">
            <table className="pf-table" aria-label="Accounts">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Programme</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody aria-busy={query.isFetching}>
                {results.map((account) => {
                  const self = account.id === currentUserId;
                  return (
                    <tr key={account.id}>
                      <td>
                        <span className="pf-cell-stack">
                          <strong>{account.name || "—"}{self ? " (you)" : ""}</strong>
                          <small>{account.email}</small>
                        </span>
                      </td>
                      <td>{account.role_label}</td>
                      <td>{account.programme}</td>
                      <td>
                        <span className="pf-cell-stack">
                          <StatusPill tone={statusTone(account.status)}>{STATUS_LABEL[account.status]}</StatusPill>
                          {invitationLabel(account) && <small>{invitationLabel(account)}</small>}
                        </span>
                      </td>
                      <td>{formatDate(account.last_login, true)}</td>
                      <td>
                        {!self && (
                          <div className="pf-actions">
                            {account.status === "invited" && (
                              <AdminButton variant="secondary" size="sm" icon={<MailPlus />} disabled={resend.isPending} onClick={() => resend.mutate(account)}>
                                Resend
                              </AdminButton>
                            )}
                            {account.status === "active" && (
                              <>
                                <AdminButton variant="ghost" size="sm" icon={<LogOut />} onClick={() => setPending({ kind: "signout", account })}>
                                  Sign out
                                </AdminButton>
                                <AdminButton variant="ghost" size="sm" icon={<Ban />} onClick={() => setPending({ kind: "suspend", account })}>
                                  Suspend
                                </AdminButton>
                              </>
                            )}
                            {account.status === "suspended" && (
                              <>
                                <AdminButton variant="secondary" size="sm" icon={<PlayCircle />} onClick={() => setPending({ kind: "reactivate", account })}>
                                  Reactivate
                                </AdminButton>
                                <AdminButton variant="ghost" size="sm" icon={<UserX />} onClick={() => setPending({ kind: "deactivate", account })}>
                                  Deactivate
                                </AdminButton>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pagination && pagination.pages > 1 && (
            <div className="pf-pager">
              <span>
                Page {pagination.page} of {pagination.pages} · {pagination.total} accounts
              </span>
              <AdminButton variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </AdminButton>
              <AdminButton variant="secondary" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>
                Next
              </AdminButton>
            </div>
          )}
        </AdminCard>
      )}

      {pending && (
        <ReasonDialog
          open
          busy={act.isPending}
          danger={pending.kind !== "reactivate"}
          title={
            { suspend: "Suspend this account?", reactivate: "Reactivate this account?", deactivate: "Deactivate this account?", signout: "Sign this account out everywhere?" }[pending.kind]
          }
          description={
            {
              suspend: `${pending.account.email} will be signed out and cannot sign in until reactivated.`,
              reactivate: `${pending.account.email} will be able to sign in again.`,
              deactivate: `${pending.account.email} will lose access permanently. Their records are kept.`,
              signout: `Every device signed in as ${pending.account.email} is signed out. They can sign in again.`,
            }[pending.kind]
          }
          confirmLabel={{ suspend: "Suspend", reactivate: "Reactivate", deactivate: "Deactivate", signout: "Sign out everywhere" }[pending.kind]}
          onClose={() => setPending(null)}
          onConfirm={(reason) => act.mutate({ kind: pending.kind, account: pending.account, reason })}
        />
      )}
      <InvitePlatformAdminDialog open={invitingPlatform} onClose={() => setInvitingPlatform(false)} onDone={refresh} onError={onError} />
    </AdminPage>
  );
}

function InvitePlatformAdminDialog({ open, onClose, onDone, onError }: { open: boolean; onClose: () => void; onDone: () => void; onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [person, setPerson] = useState<PersonInput>(EMPTY_PERSON);
  const problem = personProblem(person);
  const invite = useMutation({
    mutationFn: () => invitePlatformAdmin({ ...person, email: person.email.trim() }),
    onSuccess: (result) => {
      onDone();
      pushToast({ kind: "success", title: "Invitation sent", message: `${result.email} will receive an email to set up their platform account.` });
      setPerson(EMPTY_PERSON);
      onClose();
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not send the invitation."),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!invite.isPending}
      icon={<ShieldPlus />}
      title="Invite a platform administrator"
      description="Platform administrators can manage every programme and account. Invite only people who operate MentorMAMA."
      footer={
        <>
          <AdminButton variant="secondary" size="sm" disabled={invite.isPending} onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton size="sm" disabled={invite.isPending || Boolean(problem)} onClick={() => invite.mutate()}>
            {invite.isPending ? "Sending…" : "Send invitation"}
          </AdminButton>
        </>
      }
    >
      <PersonFields value={person} onChange={setPerson} />
    </Modal>
  );
}
