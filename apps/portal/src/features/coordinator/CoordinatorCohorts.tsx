import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Field, FieldRow, Modal, TextInput } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { ApiError, createCohort, getCohorts, type Cohort } from "../../services/api";
import { AdminButton, AdminPage, AdminPageHeader, EmptyState, StatusPill, type PillTone } from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";

const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function cohortPhase(cohort: Pick<Cohort, "start_date" | "end_date">): { label: string; tone: PillTone } {
  const today = new Date().toISOString().slice(0, 10);
  if (today < cohort.start_date) return { label: "Upcoming", tone: "info" };
  if (today > cohort.end_date) return { label: "Ended", tone: "neutral" };
  return { label: "In progress", tone: "success" };
}

/** Planning groups for the institution. Creation happens in a dialog, not a page. */
export function CoordinatorCohorts({ onOpenCohort, onError }: { onOpenCohort: (id: string) => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", planned_capacity: "" });
  const cohorts = useQuery({ queryKey: ["institution-cohorts"], queryFn: getCohorts, staleTime: 30_000 });
  const create = useMutation({
    mutationFn: () => createCohort({ name: form.name.trim(), start_date: form.start_date, end_date: form.end_date, planned_capacity: form.planned_capacity ? Number(form.planned_capacity) : null }),
    onSuccess: (cohort) => {
      pushToast({ kind: "success", title: "Cohort created", message: `${cohort.name} is ready for students.` });
      setCreating(false);
      setForm({ name: "", start_date: "", end_date: "", planned_capacity: "" });
      void queryClient.invalidateQueries({ queryKey: ["institution-cohorts"] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not create that cohort. Check that its dates do not overlap."),
  });
  const datesValid = form.start_date && form.end_date && form.end_date > form.start_date;

  const columns: ColumnDef<Cohort>[] = [
    { accessorKey: "name", header: "Cohort", cell: ({ row }) => <strong>{row.original.name}</strong> },
    { id: "dates", header: "Dates", accessorFn: (row) => row.start_date, cell: ({ row }) => `${fmt(row.original.start_date)} – ${fmt(row.original.end_date)}` },
    { id: "phase", header: "Phase", accessorFn: (row) => cohortPhase(row).label, cell: ({ row }) => { const p = cohortPhase(row.original); return <StatusPill tone={p.tone}>{p.label}</StatusPill>; } },
    {
      accessorKey: "member_count",
      header: "Students",
      cell: ({ row }) => {
        const { member_count: count, planned_capacity: capacity } = row.original;
        return capacity ? (
          <span className="pa-cell-fill">
            <span>{count} / {capacity}</span>
            <span className="pa-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (count / capacity) * 100)}%` }} /></span>
          </span>
        ) : (
          count
        );
      },
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Planning groups"
        title="Cohorts"
        description="Group students by intake so they can be placed together. A student can only be in one cohort at a time."
        actions={
          <AdminButton size="sm" icon={<Plus />} onClick={() => setCreating(true)}>
            New cohort
          </AdminButton>
        }
      />
      {cohorts.isPending ? (
        <Skeleton className="h-56" />
      ) : cohorts.isError ? (
        <PortalErrorState onRetry={() => void cohorts.refetch()} />
      ) : (
        <DataTable
          data={(cohorts.data ?? []).filter((cohort) => !cohort.archived_at)}
          columns={columns}
          caption="Cohorts"
          initialSort={[{ id: "dates", desc: true }]}
          onRowClick={(row) => onOpenCohort(row.id)}
          csvName="mentormama-cohorts"
          empty={<EmptyState icon={<GraduationCap />} title="Create your first cohort" text="Cohorts organise student enrolment before placements are created." action={<AdminButton size="sm" icon={<Plus />} onClick={() => setCreating(true)}>New cohort</AdminButton>} />}
        />
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        dismissible={!create.isPending}
        icon={<GraduationCap />}
        title="New cohort"
        description="Name the intake and set the period its students will be on placement."
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setCreating(false)} disabled={create.isPending}>Cancel</AdminButton>
            <AdminButton size="sm" disabled={!form.name.trim() || !datesValid || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Create cohort"}
            </AdminButton>
          </>
        }
      >
        <form onSubmit={(event) => { event.preventDefault(); if (form.name.trim() && datesValid && !create.isPending) create.mutate(); }}>
          <Field label="Name" required>
            <TextInput autoFocus maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. 2027 Term 1 intake" />
          </Field>
          <FieldRow>
            <Field label="Starts" required>
              <TextInput type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
            </Field>
            <Field label="Ends" required error={form.end_date && form.start_date && form.end_date <= form.start_date ? "The end date must be after the start date." : undefined}>
              <TextInput type="date" min={form.start_date} value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
            </Field>
          </FieldRow>
          <Field label="Planned capacity" optional hint="How many students you expect to enrol.">
            <TextInput type="number" min="1" value={form.planned_capacity} onChange={(event) => setForm({ ...form, planned_capacity: event.target.value })} />
          </Field>
        </form>
      </Modal>
    </AdminPage>
  );
}
