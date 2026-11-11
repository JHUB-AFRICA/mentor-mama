import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Building2, Gauge, Lock, LockOpen, Pencil, Plus, RefreshCw, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Field, FieldRow, Modal, TextInput } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { ApiError, createWard, getFacilities, getWards, updateWard, type CurrentUser, type Ward } from "../../services/api";
import { AdminButton, AdminPage, AdminPageHeader, EmptyState, StatCard, StatGrid, StatusPill } from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";

type Draft = { id: string | null; name: string; shift_pattern: string; max_students: string };
const EMPTY: Draft = { id: null, name: "", shift_pattern: "", max_students: "" };

/** Ward capacity for this facility. Declared capacity is what automatic arrangement and coordinators plan against. */
export function NurseManagerWardOperations({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const wards = useQuery({ queryKey: ["facility-ward-operations"], queryFn: getWards, staleTime: 15_000 });
  const facilities = useQuery({ queryKey: ["facility-dashboard-facilities"], queryFn: getFacilities, staleTime: 60_000 });
  const rows = wards.data ?? [];
  const open = rows.filter((ward) => !ward.archived_at);
  const capacity = open.reduce((sum, ward) => sum + ward.max_students, 0);
  const allocated = open.reduce((sum, ward) => sum + ward.allocated_students, 0);
  const free = open.reduce((sum, ward) => sum + ward.available_slots, 0);

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const input = { name: value.name.trim(), shift_pattern: value.shift_pattern.trim(), max_students: Number(value.max_students) };
      if (value.id) return updateWard(value.id, input);
      const facilityId = facilities.data?.[0]?.id ?? rows[0]?.facility_id;
      if (!facilityId) throw new Error("Your facility could not be found.");
      return createWard({ facility_id: facilityId, ...input });
    },
    onSuccess: (_ward, value) => {
      pushToast({ kind: "success", title: value.id ? "Ward updated" : "Ward added", message: "Capacity changes apply to new arrangements straight away." });
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["facility-ward-operations"] });
      void queryClient.invalidateQueries({ queryKey: ["facility-dashboard-wards"] });
    },
    onError: (cause) => onError(cause instanceof ApiError || cause instanceof Error ? cause.message : "We could not save that ward."),
  });
  const toggle = useMutation({
    mutationFn: (ward: Ward) => updateWard(ward.id, { archived: !ward.archived_at }),
    onSuccess: (_result, ward) => {
      pushToast({ kind: "success", title: ward.archived_at ? "Ward reopened" : "Ward closed", message: ward.archived_at ? "It can receive students again." : "No new students will be placed there." });
      void queryClient.invalidateQueries({ queryKey: ["facility-ward-operations"] });
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not change that ward."),
  });

  const columns: ColumnDef<Ward>[] = [
    { accessorKey: "name", header: "Ward", cell: ({ row }) => <strong>{row.original.name}</strong> },
    { accessorKey: "shift_pattern", header: "Shifts", cell: ({ row }) => row.original.shift_pattern || <span className="pa-muted">Not recorded</span> },
    {
      id: "occupancy",
      header: "Occupancy",
      accessorFn: (ward) => (ward.max_students ? ward.allocated_students / ward.max_students : 0),
      cell: ({ row }) => (
        <span className="pa-cell-fill">
          <span>{row.original.allocated_students} / {row.original.max_students}</span>
          <span className="pa-meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, row.original.max_students ? (row.original.allocated_students / row.original.max_students) * 100 : 0)}%` }} />
          </span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (ward) => (ward.archived_at ? "closed" : ward.available_slots > 0 ? "open" : "full"),
      cell: ({ row }) =>
        row.original.archived_at ? (
          <StatusPill tone="neutral">Closed</StatusPill>
        ) : row.original.available_slots > 0 ? (
          <StatusPill tone="success">{row.original.available_slots} open</StatusPill>
        ) : (
          <StatusPill tone="warning">Full</StatusPill>
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="pa-row-actions" onClick={(event) => event.stopPropagation()}>
          <AdminButton variant="ghost" size="sm" icon={<Pencil />} onClick={() => setDraft({ id: row.original.id, name: row.original.name, shift_pattern: row.original.shift_pattern, max_students: String(row.original.max_students) })}>
            Edit
          </AdminButton>
          <AdminButton variant="ghost" size="sm" icon={row.original.archived_at ? <LockOpen /> : <Lock />} disabled={toggle.isPending} onClick={() => toggle.mutate(row.original)}>
            {row.original.archived_at ? "Reopen" : "Close"}
          </AdminButton>
          <AdminButton variant="ghost" size="sm" onClick={() => navigate(`/placements?ward=${encodeURIComponent(row.original.id)}`)}>
            Students
          </AdminButton>
        </span>
      ),
    },
  ];

  const valid = draft ? draft.name.trim().length > 0 && Number(draft.max_students) >= 1 && Number(draft.max_students) <= 500 : false;
  const nav = (destination: string) => navigate(destination === "overview" ? "/facility" : destination === "placements" ? "/placements" : `/facility/${destination}`);

  return (
    <FacilityWorkspaceFrame user={user} active="wards" title="Ward operations" onNavigate={nav} onAccount={() => navigate("/facility/account")} onError={onError}>
      <AdminPage>
        <AdminPageHeader
          eyebrow="Facility operations"
          title="Wards and capacity"
          description="Declare how many students each ward can take. Coordinators plan requests against this, and automatic arrangement never goes over it."
          actions={
            <>
              <AdminButton variant="ghost" size="sm" icon={<RefreshCw />} disabled={wards.isFetching} onClick={() => void wards.refetch()}>
                Refresh
              </AdminButton>
              <AdminButton size="sm" icon={<Plus />} onClick={() => setDraft(EMPTY)}>
                Add ward
              </AdminButton>
            </>
          }
        />
        <StatGrid columns={3}>
          <StatCard icon={<Building2 />} tone="teal" value={open.length} label="Open wards" hint={`${rows.length - open.length} closed`} loading={wards.isPending} />
          <StatCard icon={<Gauge />} tone={free ? "green" : "amber"} value={free} label="Spaces available" hint={`${capacity} declared capacity`} loading={wards.isPending} />
          <StatCard icon={<Users />} tone="blue" value={allocated} label="Students placed" hint="Across open wards" loading={wards.isPending} />
        </StatGrid>

        {wards.isPending ? (
          <Skeleton className="h-64" />
        ) : wards.isError ? (
          <PortalErrorState onRetry={() => void wards.refetch()} />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            caption="Facility wards"
            pageSize={10}
            csvName="mentormama-wards"
            empty={
              <EmptyState
                icon={<Building2 />}
                title="Add your first ward"
                text="Wards and their capacity let coordinators send students your way and let the system place them for you."
                action={<AdminButton size="sm" icon={<Plus />} onClick={() => setDraft(EMPTY)}>Add ward</AdminButton>}
              />
            }
          />
        )}

        <Modal
          open={Boolean(draft)}
          onClose={() => !save.isPending && setDraft(null)}
          dismissible={!save.isPending}
          icon={<Building2 />}
          title={draft?.id ? "Edit ward" : "Add a ward"}
          description="Capacity cannot be set lower than the students already placed there."
          footer={
            <>
              <AdminButton variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={save.isPending}>Cancel</AdminButton>
              <AdminButton size="sm" disabled={!valid || save.isPending} onClick={() => draft && save.mutate(draft)}>
                {save.isPending ? "Saving…" : draft?.id ? "Save ward" : "Add ward"}
              </AdminButton>
            </>
          }
        >
          {draft && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (valid && !save.isPending) save.mutate(draft);
              }}
            >
              <Field label="Ward name" required>
                <TextInput autoFocus maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Medical Ward 3" />
              </Field>
              <FieldRow>
                <Field label="Student capacity" required hint="Most students at one time">
                  <TextInput type="number" min="1" max="500" value={draft.max_students} onChange={(event) => setDraft({ ...draft, max_students: event.target.value })} />
                </Field>
                <Field label="Shift pattern" optional>
                  <TextInput maxLength={120} value={draft.shift_pattern} onChange={(event) => setDraft({ ...draft, shift_pattern: event.target.value })} placeholder="e.g. Day, Night" />
                </Field>
              </FieldRow>
            </form>
          )}
        </Modal>
      </AdminPage>
    </FacilityWorkspaceFrame>
  );
}
