import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, CalendarDays, ClipboardList, GraduationCap, Pencil, UserMinus, UserPlus, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { BarList } from "../../components/charts";
import { Field, FieldRow, Modal, TextArea, TextInput } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { ApiError, archiveCohort, getCohortProgress, getCohortStudents, getCohorts, removeCohortMembership, updateCohort, type Cohort } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, StatCard, StatGrid, StatusPill } from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";
import { placementStateLabel } from "../placements/placementJourney";
import { cohortPhase } from "./CoordinatorCohorts";

type Member = { id: string; name: string; email: string };

export function CoordinatorCohortDetail({
  id,
  onBack,
  onManageStudents,
  onInviteStudents,
  onError,
}: {
  id: string;
  onBack: () => void;
  onManageStudents: () => void;
  onInviteStudents: () => void;
  onError: (message: string) => void;
}) {
  const client = useQueryClient();
  const { pushToast } = useToast();
  const cohortQuery = useQuery({ queryKey: ["institution-cohorts"], queryFn: getCohorts, select: (items) => items.find((item) => item.id === id) });
  const students = useQuery({ queryKey: ["cohort-students", id], queryFn: () => getCohortStudents(id) });
  const progress = useQuery({ queryKey: ["cohort-progress", id], queryFn: () => getCohortProgress(id) });
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", planned_capacity: "" });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["institution-cohorts"] });
    void client.invalidateQueries({ queryKey: ["cohort-students", id] });
    void client.invalidateQueries({ queryKey: ["cohort-progress", id] });
  };
  const save = useMutation({
    mutationFn: () => updateCohort(id, { name: form.name.trim(), start_date: form.start_date, end_date: form.end_date, planned_capacity: form.planned_capacity ? Number(form.planned_capacity) : null }),
    onSuccess: () => { setEditing(false); refresh(); pushToast({ kind: "success", title: "Cohort updated", message: "Your changes have been saved." }); },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "Check for overlapping cohort dates and try again."),
  });
  const archive = useMutation({
    mutationFn: () => archiveCohort(id),
    onSuccess: () => { refresh(); onBack(); },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not archive this cohort."),
  });
  const remove = useMutation({
    mutationFn: ({ studentId, why }: { studentId: string; why: string }) => removeCohortMembership(id, studentId, why),
    onSuccess: () => { setRemoving(null); setReason(""); refresh(); pushToast({ kind: "success", title: "Removed from cohort", message: "The change is in the audit record." }); },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "The membership was not changed. Refresh and try again."),
  });

  if (cohortQuery.isPending) return <AdminPage><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></AdminPage>;
  if (cohortQuery.isError || !cohortQuery.data) return <PortalErrorState onRetry={() => void cohortQuery.refetch()} />;
  const cohort: Cohort = cohortQuery.data;
  const phase = cohortPhase(cohort);

  const columns: ColumnDef<Member>[] = [
    { accessorKey: "name", header: "Student", cell: ({ row }) => <div className="pa-cell-title"><span><strong>{row.original.name}</strong><small>{row.original.email}</small></span></div> },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => (
        <AdminButton variant="ghost" size="sm" icon={<UserMinus />} onClick={() => setRemoving(row.original)}>
          Remove
        </AdminButton>
      ),
    },
  ];

  return (
    <AdminPage>
      <div>
        <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={onBack}>
          All cohorts
        </AdminButton>
      </div>
      <AdminPageHeader
        eyebrow="Cohort"
        title={cohort.name}
        meta={
          <>
            <StatusPill tone={phase.tone}>{phase.label}</StatusPill>
            <span><CalendarDays size={14} aria-hidden="true" /> {cohort.start_date} → {cohort.end_date}</span>
            {cohort.planned_capacity && <span><Users size={14} aria-hidden="true" /> Capacity {cohort.planned_capacity}</span>}
          </>
        }
        actions={
          <>
            <AdminButton variant="secondary" size="sm" icon={<Pencil />} onClick={() => { setForm({ name: cohort.name, start_date: cohort.start_date, end_date: cohort.end_date, planned_capacity: cohort.planned_capacity ? String(cohort.planned_capacity) : "" }); setEditing(true); }}>
              Edit
            </AdminButton>
            <AdminButton variant="secondary" size="sm" icon={<UserPlus />} onClick={onInviteStudents}>
              Invite students
            </AdminButton>
            <AdminButton size="sm" icon={<Users />} onClick={onManageStudents}>
              Add students
            </AdminButton>
          </>
        }
      />
      <StatGrid columns={3}>
        <StatCard icon={<Users />} tone="teal" value={cohort.member_count} label="Enrolled students" />
        <StatCard icon={<ClipboardList />} tone="violet" value={progress.data?.placement_count ?? "—"} label="Placements" loading={progress.isPending} />
        <StatCard icon={<GraduationCap />} tone="amber" value={progress.data?.students_without_placement ?? "—"} label="Without a placement" hint="Ready to be placed" loading={progress.isPending} />
      </StatGrid>
      <div className="rp-grid-2">
        <AdminCard title="Enrolled students" description="Students currently in this cohort." flush>
          {students.isPending ? (
            <div className="p-4"><Skeleton className="h-32" /></div>
          ) : students.isError ? (
            <PortalErrorState onRetry={() => void students.refetch()} />
          ) : (
            <DataTable
              data={students.data ?? []}
              columns={columns}
              caption="Enrolled students"
              pageSize={8}
              empty={<EmptyState icon={<Users />} title="No students enrolled" text="Add students from the student register." action={<AdminButton size="sm" onClick={onManageStudents}>Add students</AdminButton>} />}
            />
          )}
        </AdminCard>
        <AdminCard title="Placement progress" description="Where this cohort’s placements are now.">
          <BarList
            items={Object.entries(progress.data?.by_state ?? {}).map(([state, count]) => ({ label: placementStateLabel(state, "staff"), value: count }))}
            empty="No placements have been created for this cohort yet."
          />
        </AdminCard>
      </div>
      <div>
        <AdminButton variant="ghost" size="sm" className="po-danger" icon={<Archive />} onClick={() => setArchiving(true)}>
          Archive cohort
        </AdminButton>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        dismissible={!save.isPending}
        icon={<Pencil />}
        title="Edit cohort"
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}>Cancel</AdminButton>
            <AdminButton size="sm" disabled={save.isPending || !form.name.trim() || form.end_date <= form.start_date} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save changes"}
            </AdminButton>
          </>
        }
      >
        <Field label="Name" required>
          <TextInput maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <FieldRow>
          <Field label="Starts" required><TextInput type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></Field>
          <Field label="Ends" required><TextInput type="date" min={form.start_date} value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></Field>
        </FieldRow>
        <Field label="Planned capacity" optional>
          <TextInput type="number" min="1" value={form.planned_capacity} onChange={(event) => setForm({ ...form, planned_capacity: event.target.value })} />
        </Field>
      </Modal>

      <Modal
        open={archiving}
        onClose={() => setArchiving(false)}
        dismissible={!archive.isPending}
        size="sm"
        icon={<Archive />}
        title="Archive this cohort?"
        description="Its history and placements stay available. It will no longer appear in your active cohorts."
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setArchiving(false)} disabled={archive.isPending}>Cancel</AdminButton>
            <AdminButton variant="secondary" size="sm" className="po-danger" disabled={archive.isPending} onClick={() => archive.mutate()}>{archive.isPending ? "Archiving…" : "Archive"}</AdminButton>
          </>
        }
      >
        <></>
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        dismissible={!remove.isPending}
        size="sm"
        icon={<UserMinus />}
        title={`Remove ${removing?.name ?? "student"}?`}
        description="They leave this cohort. A reason is kept in the audit record."
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setRemoving(null)} disabled={remove.isPending}>Cancel</AdminButton>
            <AdminButton variant="secondary" size="sm" className="po-danger" disabled={remove.isPending || reason.trim().length < 5} onClick={() => removing && remove.mutate({ studentId: removing.id, why: reason.trim() })}>
              {remove.isPending ? "Removing…" : "Remove"}
            </AdminButton>
          </>
        }
      >
        <Field label="Reason" required hint="At least 5 characters.">
          <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </Modal>
    </AdminPage>
  );
}
