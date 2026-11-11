/**
 * The safeguarding review queue for authorised reviewers (coordinator, nurse
 * manager, programme admin). The list never shows narrative; opening a concern
 * shows the detail and the next permitted action in a side panel.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Drawer, Field, SelectInput, TextArea } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  ApiError,
  assignEscalationReviewer,
  closeEscalation,
  getEscalation,
  getEscalations,
  recordEscalationAction,
  recordEscalationFinding,
  type CurrentUser,
  type EscalationSummary,
} from "../../services/api";
import {
  AdminButton,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  Notice,
  StatCard,
  StatGrid,
  StatusPill,
  type PillTone,
} from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";

type View = "action" | "resolved" | "all";
const OVERDUE_DAYS = 7;
const OPEN = new Set(["open", "under_review", "action_required"]);
const label = (value: string) => value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
const severityTone = (value: string): PillTone => (value === "high" ? "danger" : value === "medium" ? "warning" : "success");
const stateTone = (value: string): PillTone => (value === "open" ? "danger" : value === "under_review" || value === "action_required" ? "warning" : value === "resolved" ? "teal" : "neutral");
const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export function ConcernQueue({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [view, setView] = useState<View>("action");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["escalations"], queryFn: getEscalations, refetchInterval: 60_000 });
  const rows = list.data ?? [];
  const openRows = rows.filter((row) => OPEN.has(row.state));
  const overdue = openRows.filter((row) => ageDays(row.submitted_at) >= OVERDUE_DAYS).length;
  const unassigned = rows.filter((row) => row.state === "open").length;
  const visible = view === "action" ? openRows : view === "resolved" ? rows.filter((row) => !OPEN.has(row.state)) : rows;

  const assign = useMutation({
    mutationFn: (id: string) => assignEscalationReviewer(id, user.id),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Assigned to you", message: "Open the concern to record your finding." });
      void queryClient.invalidateQueries({ queryKey: ["escalations"] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not assign that concern."),
  });

  const columns: ColumnDef<EscalationSummary>[] = [
    { accessorKey: "category", header: "Concern", cell: ({ row }) => <strong>{row.original.category}</strong> },
    { accessorKey: "severity", header: "Severity", cell: ({ row }) => <StatusPill tone={severityTone(row.original.severity)}>{label(row.original.severity)}</StatusPill> },
    { accessorKey: "state", header: "Status", cell: ({ row }) => <StatusPill tone={stateTone(row.original.state)}>{label(row.original.state)}</StatusPill> },
    {
      accessorKey: "submitted_at",
      header: "Raised",
      cell: ({ row }) => {
        const days = ageDays(row.original.submitted_at);
        return (
          <>
            {new Date(row.original.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            {OPEN.has(row.original.state) && days >= OVERDUE_DAYS && <small className="pa-sub" style={{ color: "#b83e3e" }}>{days} days old</small>}
          </>
        );
      },
    },
    {
      accessorKey: "routed_to",
      header: "Sent to",
      cell: ({ row }) => (row.original.routed_to === "both" ? "Nurse manager & coordinator" : row.original.routed_to === "coordinator" ? "Coordinator" : "Nurse manager"),
    },
    { accessorKey: "reviewer", header: "Reviewer", cell: ({ row }) => row.original.reviewer ?? <span className="pa-muted">Unassigned</span> },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="pa-actions" onClick={(event) => event.stopPropagation()}>
          {row.original.state === "open" && (
            <AdminButton size="sm" variant="secondary" icon={<UserCheck />} disabled={assign.isPending} onClick={() => assign.mutate(row.original.id)}>
              Assign to me
            </AdminButton>
          )}
          <AdminButton size="sm" variant="ghost" onClick={() => setOpenId(row.original.id)}>
            Review
          </AdminButton>
        </span>
      ),
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Safeguarding"
        title="Concerns queue"
        description="Concerns raised by students and mentors in your scope. The list shows only the category and status; narratives open for an authorised reviewer."
      />
      <StatGrid>
        <StatCard icon={<ShieldAlert />} tone="rose" value={openRows.length} label="Open concerns" loading={list.isPending} />
        <StatCard icon={<Clock />} tone={overdue ? "amber" : "green"} value={overdue} label="Overdue" hint={`Older than ${OVERDUE_DAYS} days`} loading={list.isPending} />
        <StatCard icon={<UserCheck />} tone="blue" value={unassigned} label="Waiting for a reviewer" loading={list.isPending} />
        <StatCard icon={<CheckCircle2 />} tone="green" value={rows.length - openRows.length} label="Resolved or closed" loading={list.isPending} />
      </StatGrid>
      <AdminTabs
        label="Concern views"
        value={view}
        onChange={setView}
        tabs={[
          { value: "action", label: "Needs action", count: openRows.length },
          { value: "resolved", label: "Resolved", count: rows.length - openRows.length },
          { value: "all", label: "All", count: rows.length },
        ]}
      />
      {list.isPending ? (
        <Skeleton className="h-64" />
      ) : list.isError ? (
        <PortalErrorState onRetry={() => void list.refetch()} />
      ) : (
        <DataTable
          data={visible}
          columns={columns}
          caption="Safeguarding concerns"
          initialSort={[{ id: "submitted_at", desc: false }]}
          onRowClick={(row) => setOpenId(row.id)}
          empty={
            <EmptyState
              icon={<ShieldCheck />}
              title={view === "action" ? "No concerns need action" : "Nothing to show"}
              text="Concerns raised in your scope will appear here."
            />
          }
        />
      )}
      <Notice icon={<ShieldCheck />}>Concern narratives are confidential. Opening one is recorded in the audit trail.</Notice>
      <ConcernDrawer id={openId} user={user} onClose={() => setOpenId(null)} onError={onError} />
    </AdminPage>
  );
}

function ConcernDrawer({ id, user, onClose, onError }: { id: string | null; user: CurrentUser; onClose: () => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [finding, setFinding] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("internal_action");
  const detail = useQuery({ queryKey: ["escalation", id], queryFn: () => getEscalation(id as string), enabled: Boolean(id) });
  const item = detail.data;
  const mine = item?.reviewer_id === user.id;

  const run = useMutation({
    mutationFn: (command: () => Promise<void>) => command(),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Concern updated", message: "Your action was recorded." });
      setFinding("");
      setAction("");
      void queryClient.invalidateQueries({ queryKey: ["escalations"] });
      void queryClient.invalidateQueries({ queryKey: ["escalation", id] });
      void queryClient.invalidateQueries({ queryKey: ["coordinator-dashboard"] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not update that concern."),
  });

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      icon={<ShieldAlert />}
      title={item?.category ?? "Concern"}
      description={item ? `${label(item.severity)} severity · ${label(item.state)}${item.routed_to === "both" ? " · Sent to both reviewers" : " · Sent to you only"}${item.rereview_count ? ` · Reviewed again ×${item.rereview_count}` : ""}` : undefined}
    >
      {detail.isPending ? (
        <Skeleton className="h-40" />
      ) : detail.isError || !item ? (
        <PortalErrorState onRetry={() => void detail.refetch()} />
      ) : (
        <div className="cq-detail">
          {item.access === "summary" ? (
            <>
              <Notice icon={<ShieldCheck />}>
                {item.can_claim
                  ? "This concern is waiting for a reviewer. Take it to read the report and record your next step. Opening the report is recorded in the audit trail."
                  : item.reviewer
                    ? `${item.reviewer} is reviewing this concern. Only the assigned reviewer can read the report.`
                    : "Only the assigned reviewer can read the report."}
              </Notice>
              {item.can_claim && (
                <AdminButton icon={<UserCheck />} disabled={run.isPending} onClick={() => run.mutate(() => assignEscalationReviewer(item.id, user.id))}>
                  Take this concern
                </AdminButton>
              )}
            </>
          ) : (
            <section>
              <h3>What was reported</h3>
              <p>{item.description}</p>
            </section>
          )}
          {item.rereview_count > 0 && (
            <Notice icon={<ShieldAlert />}>
              The student asked for another review{item.rereview_requested_at ? ` on ${new Date(item.rereview_requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.
              {item.access === "full" && item.rereview_reason ? ` Their reason: ${item.rereview_reason}` : " Take the concern to read their reason."}
            </Notice>
          )}
          {item.finding && (
            <section>
              <h3>Finding</h3>
              <p>{item.finding}</p>
            </section>
          )}
          {item.action_taken && (
            <section>
              <h3>Action taken</h3>
              <p>
                {item.action_taken}
                {item.resolution_outcome && <small className="pa-sub">Outcome: {label(item.resolution_outcome)}</small>}
              </p>
            </section>
          )}

          {item.access === "full" && item.state === "open" && (
            <AdminButton icon={<UserCheck />} disabled={run.isPending} onClick={() => run.mutate(() => assignEscalationReviewer(item.id, user.id))}>
              Assign to me
            </AdminButton>
          )}
          {item.state === "under_review" && mine && (
            <>
              <Field label="Finding" required hint="What did you establish? Do not include patient identifiers.">
                <TextArea value={finding} onChange={(event) => setFinding(event.target.value)} rows={4} />
              </Field>
              <AdminButton variant="secondary" disabled={run.isPending || !finding.trim()} onClick={() => run.mutate(() => recordEscalationFinding(item.id, finding))}>
                Record finding
              </AdminButton>
            </>
          )}
          {(item.state === "under_review" || item.state === "action_required") && mine && (
            <>
              <Field label="Action taken" required>
                <TextArea value={action} onChange={(event) => setAction(event.target.value)} rows={4} />
              </Field>
              <Field label="Outcome">
                <SelectInput value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                  <option value="internal_action">Internal action</option>
                  <option value="referred_externally">Referred externally</option>
                  <option value="no_action_required">No action required</option>
                </SelectInput>
              </Field>
              <AdminButton disabled={run.isPending || !action.trim()} onClick={() => run.mutate(() => recordEscalationAction(item.id, action, outcome))}>
                Mark resolved
              </AdminButton>
            </>
          )}
          {item.access === "full" && item.state === "resolved" && (
            <AdminButton disabled={run.isPending} onClick={() => run.mutate(() => closeEscalation(item.id))}>
              Close concern
            </AdminButton>
          )}
          {item.access === "full" && (item.state === "under_review" || item.state === "action_required") && !mine && (
            <Notice icon={<ShieldCheck />}>This concern is assigned to another reviewer. Only they can record the next step.</Notice>
          )}
        </div>
      )}
    </Drawer>
  );
}
