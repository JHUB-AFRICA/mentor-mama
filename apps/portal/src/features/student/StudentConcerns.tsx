/** Student "Concerns" page: every private concern they raised, in the portal table. Opening a row shows its detail screen. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@mentormama/ui";
import { CheckCircle2, ChevronRight, Clock, Lock, Plus, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Modal } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { getEscalations, type EscalationSummary, type Placement } from "../../services/api";
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
} from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";
import { AUDIENCE_LABEL, ConcernSteps, CONCERN_STEPS, OPEN_STATES, concernDay, concernLabel, concernStep, severityTone, stateLabel } from "../safeguarding/MyConcerns";
import { RaiseConcernForm } from "../safeguarding/RaiseConcernForm";

type View = "active" | "resolved" | "all";
// A concern can be raised on any placement the student still has a relationship with.
export const RAISABLE_STATES = new Set(["awaiting_student", "orientation", "induction", "active", "paused", "completed"]);

export function raisablePlacements(placements: Placement[]) {
  return placements
    .filter((item) => RAISABLE_STATES.has(item.state))
    .map((item) => ({ id: item.id, label: `${item.facility_name ?? "Placement"}${item.cohort_name ? ` · ${item.cohort_name}` : ""}` }));
}

export function StudentConcerns({ placements, onError, initialPlacementId }: { placements: Placement[]; onError: (message: string) => void; initialPlacementId?: string | null }) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [raising, setRaising] = useState(Boolean(initialPlacementId));
  const list = useQuery({ queryKey: ["escalations"], queryFn: getEscalations, refetchInterval: 60_000 });
  const rows = list.data ?? [];
  const active = rows.filter((row) => OPEN_STATES.has(row.state));
  const done = rows.filter((row) => !OPEN_STATES.has(row.state));
  const raisable = useMemo(() => raisablePlacements(placements), [placements]);
  const names = useMemo(() => new Map(placements.map((item) => [item.id, item.facility_name ?? "Placement"])), [placements]);
  const preset = initialPlacementId && raisable.some((item) => item.id === initialPlacementId) ? initialPlacementId : undefined;

  const visible = useMemo(() => {
    const scoped = view === "active" ? active : view === "resolved" ? done : rows;
    const needle = search.trim().toLowerCase();
    return scoped.filter(
      (row) =>
        (severity === "all" || row.severity === severity) &&
        (!needle || `${row.category} ${names.get(row.placement_id ?? "") ?? ""} ${row.reviewer ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [view, active, done, rows, search, severity, names]);

  const columns: ColumnDef<EscalationSummary>[] = [
    {
      accessorKey: "category",
      header: "Concern",
      cell: ({ row }) => (
        <span className="sc-cell">
          <strong>{row.original.category}</strong>
          <small>{names.get(row.original.placement_id ?? "") ?? "No placement"}</small>
        </span>
      ),
    },
    {
      accessorKey: "submitted_at",
      header: "Raised",
      cell: ({ row }) => concernDay(row.original.submitted_at),
    },
    {
      accessorKey: "routed_to",
      header: "Visible to",
      cell: ({ row }) => (
        <span className="sc-visible">
          <Lock aria-hidden="true" /> {AUDIENCE_LABEL[row.original.routed_to] ?? "Chosen reviewers"}
        </span>
      ),
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => <StatusPill tone={severityTone(row.original.severity)} dot={false}>{concernLabel(row.original.severity)}</StatusPill>,
    },
    {
      id: "progress",
      header: "Progress",
      accessorFn: (row) => concernStep(row.state),
      cell: ({ row }) => (
        <span className="sc-progress">
          <ConcernSteps state={row.original.state} compact />
          <small>{CONCERN_STEPS[concernStep(row.original.state)]}</small>
        </span>
      ),
    },
    {
      accessorKey: "state",
      header: "Status",
      cell: ({ row }) => {
        const state = stateLabel(row.original);
        return <StatusPill tone={state.tone}>{state.text}</StatusPill>;
      },
    },
    {
      id: "open",
      header: () => <span className="sr-only">Open</span>,
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => (
        <AdminButton size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); navigate(`/student/concerns/${row.original.id}`); }} aria-label={`View ${row.original.category} concern`}>
          View <ChevronRight aria-hidden="true" />
        </AdminButton>
      ),
    },
  ];

  return (
    <AdminPage className="sc">
      <AdminPageHeader
        eyebrow="Safeguarding"
        title="My concerns"
        description="Raise a private concern, choose who may look into it, and follow it until it is resolved."
        actions={
          <AdminButton icon={<Plus />} onClick={() => setRaising(true)} disabled={!raisable.length} title={raisable.length ? undefined : "You need a placement to raise a concern"}>
            Raise a concern
          </AdminButton>
        }
      />
      <StatGrid>
        <StatCard icon={<ShieldAlert />} tone="amber" value={active.length} label="In progress" hint="Waiting or being reviewed" loading={list.isPending} onClick={() => setView("active")} />
        <StatCard icon={<Clock />} tone="blue" value={rows.filter((row) => row.state === "under_review" || row.state === "action_required").length} label="With a reviewer" loading={list.isPending} />
        <StatCard icon={<CheckCircle2 />} tone="green" value={done.length} label="Resolved or closed" loading={list.isPending} onClick={() => setView("resolved")} />
        <StatCard icon={<RefreshCw />} tone="violet" value={rows.filter((row) => row.rereview_count > 0).length} label="Reviewed again" loading={list.isPending} />
      </StatGrid>
      <AdminTabs
        label="Concern views"
        value={view}
        onChange={setView}
        tabs={[
          { value: "active", label: "In progress", count: active.length },
          { value: "resolved", label: "Resolved", count: done.length },
          { value: "all", label: "All", count: rows.length },
        ]}
      />
      {list.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : list.isError ? (
        <PortalErrorState onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="You have not raised any concerns"
          text="If something about your placement worries you, raise it here. You decide who can read it."
          action={raisable.length ? <AdminButton size="sm" icon={<Plus />} onClick={() => setRaising(true)}>Raise a concern</AdminButton> : undefined}
        />
      ) : (
        <DataTable
          data={visible}
          columns={columns}
          caption="Your concerns"
          initialSort={[{ id: "submitted_at", desc: true }]}
          onRowClick={(row) => navigate(`/student/concerns/${row.id}`)}
          toolbar={
            <Toolbar compact filters={1}>
              <SearchField value={search} onChange={setSearch} placeholder="Search concerns" label="Search concerns" />
              <SelectField
                value={severity}
                onChange={setSeverity}
                label="Severity"
                options={[
                  { value: "all", label: "All severities" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
              />
            </Toolbar>
          }
          empty={<EmptyState icon={<ShieldCheck />} title={view === "active" ? "Nothing in progress" : view === "resolved" ? "Nothing resolved yet" : "No matching concerns"} text="Try another view or clear the search." />}
        />
      )}
      <Notice icon={<ShieldCheck />}>
        Concerns are confidential, not anonymous, so they can be investigated. For a risk to someone&rsquo;s safety right now, tell a senior person at the facility straight away.
      </Notice>
      <Modal open={raising} onClose={() => setRaising(false)} icon={<ShieldAlert />} title="Raise a private concern" description="Choose who may look into it. Nobody else will see it." size="lg">
        <RaiseConcernForm placementId={preset} placements={raisable} onError={onError} onCancel={() => setRaising(false)} onSubmitted={() => { setRaising(false); setView("active"); }} />
      </Modal>
    </AdminPage>
  );
}
