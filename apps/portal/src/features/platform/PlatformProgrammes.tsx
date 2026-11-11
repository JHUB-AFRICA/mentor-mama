import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, UserPlus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { Field, Modal, TextArea, TextInput } from "../../components/kit";
import { ApiError, createPlatformProgramme, getPlatformProgrammes, inviteProgrammeAdmin, type PersonInput, type PlatformProgramme } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, StatusPill } from "../programme-admin/ui/AdminKit";
import { DataTable } from "../programme-admin/ui/DataTable";
import { EMPTY_PERSON, PersonFields, formatDate, personProblem } from "./platformUi";

export function PlatformProgrammes({ onError }: { onError: (message: string) => void }) {
  const query = useQuery({ queryKey: ["platform-programmes"], queryFn: getPlatformProgrammes });
  const [creating, setCreating] = useState(false);
  const [inviteFor, setInviteFor] = useState<PlatformProgramme | null>(null);

  const columns: ColumnDef<PlatformProgramme>[] = [
    {
      accessorKey: "name",
      header: "Programme",
      cell: ({ row }) => (
        <span className="pf-cell-stack">
          <strong>{row.original.name}</strong>
          <small>{[row.original.short_name, row.original.academic_year].filter(Boolean).join(" · ") || "—"}</small>
        </span>
      ),
    },
    {
      id: "admins",
      header: "Administrators",
      accessorFn: (row) => row.active_admins,
      cell: ({ row }) =>
        row.original.active_admins ? (
          <StatusPill tone="success">{row.original.active_admins} active</StatusPill>
        ) : row.original.invited_admins ? (
          <StatusPill tone="info">{row.original.invited_admins} invited</StatusPill>
        ) : (
          <StatusPill tone="warning">None</StatusPill>
        ),
    },
    { accessorKey: "active_people", header: "Active people", meta: { align: "right" } },
    { accessorKey: "invited_people", header: "Open invitations", meta: { align: "right" } },
    { id: "created", header: "Created", accessorFn: (row) => row.created_at, cell: ({ row }) => formatDate(row.original.created_at) },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <AdminButton variant="secondary" size="sm" icon={<UserPlus />} onClick={() => setInviteFor(row.original)}>
          Invite admin
        </AdminButton>
      ),
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Programmes"
        description="Each programme is run by its own administrators, who then invite coordinators, nurse managers, mentors and students."
        actions={
          <AdminButton icon={<Plus />} onClick={() => setCreating(true)}>
            New programme
          </AdminButton>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <PortalErrorState onRetry={() => void query.refetch()} />
      ) : (
        <AdminCard flush>
          <DataTable
            data={query.data}
            columns={columns}
            caption="Programmes"
            csvName="mentormama-programmes"
            empty={
              <EmptyState
                icon={<Building2 />}
                title="No programmes yet"
                text="Create the first programme and invite its administrator."
                action={<AdminButton icon={<Plus />} onClick={() => setCreating(true)}>New programme</AdminButton>}
              />
            }
          />
        </AdminCard>
      )}
      <CreateProgrammeDialog open={creating} onClose={() => setCreating(false)} onError={onError} />
      <InviteAdminDialog programme={inviteFor} onClose={() => setInviteFor(null)} onError={onError} />
    </AdminPage>
  );
}

function CreateProgrammeDialog({ open, onClose, onError }: { open: boolean; onClose: () => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [year, setYear] = useState("");
  const [description, setDescription] = useState("");
  const [withAdmin, setWithAdmin] = useState(true);
  const [admin, setAdmin] = useState<PersonInput>(EMPTY_PERSON);
  const problem = !name.trim() ? "Give the programme a name." : withAdmin ? personProblem(admin) : null;

  const reset = () => {
    setName("");
    setShortName("");
    setYear("");
    setDescription("");
    setAdmin(EMPTY_PERSON);
    setWithAdmin(true);
  };
  const create = useMutation({
    mutationFn: () =>
      createPlatformProgramme({
        name: name.trim(),
        short_name: shortName.trim(),
        academic_year: year.trim(),
        description: description.trim(),
        admin: withAdmin ? { ...admin, email: admin.email.trim() } : null,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["platform-programmes"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
      pushToast({
        kind: "success",
        title: "Programme created",
        message: result.admin_invited ? `An invitation was emailed to ${result.admin_invited}.` : `${result.name} is ready. Invite its administrator when you are ready.`,
      });
      reset();
      onClose();
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not create the programme."),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!create.isPending}
      size="md"
      icon={<Building2 />}
      title="New programme"
      description="The programme starts with the standard induction checklist. Its administrator receives an email to set up their account."
      footer={
        <>
          <AdminButton variant="secondary" size="sm" disabled={create.isPending} onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton size="sm" disabled={create.isPending || Boolean(problem)} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : withAdmin ? "Create and send invitation" : "Create programme"}
          </AdminButton>
        </>
      }
    >
      <div className="pf-form">
        <Field label="Programme name" required>
          <TextInput value={name} maxLength={120} placeholder="e.g. JKUAT Midwifery Pilot" onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="pf-grid">
          <Field label="Short name" optional>
            <TextInput value={shortName} maxLength={40} placeholder="e.g. JKUAT" onChange={(event) => setShortName(event.target.value)} />
          </Field>
          <Field label="Academic year" optional>
            <TextInput value={year} maxLength={20} placeholder="e.g. 2026/27" onChange={(event) => setYear(event.target.value)} />
          </Field>
        </div>
        <Field label="Description" optional>
          <TextArea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <label className="pf-check-row">
          <input type="checkbox" checked={withAdmin} onChange={(event) => setWithAdmin(event.target.checked)} />
          <span>Invite the programme administrator now</span>
        </label>
        {withAdmin && <PersonFields value={admin} onChange={setAdmin} />}
        {problem && name.trim() && <p className="pf-problem" role="status">{problem}</p>}
      </div>
    </Modal>
  );
}

function InviteAdminDialog({ programme, onClose, onError }: { programme: PlatformProgramme | null; onClose: () => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [person, setPerson] = useState<PersonInput>(EMPTY_PERSON);
  const problem = personProblem(person);
  const invite = useMutation({
    mutationFn: () => inviteProgrammeAdmin(programme!.id, { ...person, email: person.email.trim() }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["platform-programmes"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-accounts"] });
      pushToast({ kind: "success", title: "Invitation sent", message: `${result.email} will receive an email to set up their account.` });
      setPerson(EMPTY_PERSON);
      onClose();
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not send the invitation."),
  });
  return (
    <Modal
      open={Boolean(programme)}
      onClose={onClose}
      dismissible={!invite.isPending}
      size="md"
      icon={<UserPlus />}
      title={`Invite an administrator${programme ? ` · ${programme.name}` : ""}`}
      description="They receive an email link valid for 48 hours, then set a password and an authenticator app."
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
