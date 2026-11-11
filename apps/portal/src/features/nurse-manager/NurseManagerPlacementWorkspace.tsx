import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ClipboardList, Download, Inbox, RefreshCw, UserCog, Wand2 } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Field, Modal, SelectInput, TextArea } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  getIncomingPlacements,
  getPlacementOptions,
  getPlacements,
  reassignMentor,
  type CurrentUser,
  type Placement,
  type PlacementOptions,
} from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, AdminTabs, EmptyState, ListRow, Notice, SearchField, SelectField, StatCard, StatGrid, StatusPill, Toolbar } from "../programme-admin/ui/AdminKit";
import { ServerPager } from "../programme-admin/ui/DataTable";
import { isPlacementClosed, placementStateLabel, placementStateTone } from "../placements/placementJourney";
import { AllocationListModal } from "../placements/AllocationListModal";
import { ArrangeStudentsModal } from "./ArrangeStudentsModal";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { isManagerActionablePlacement, managerPlacementAction } from "./managerPlacementLogic";

const QUICK = [
  { value: "", label: "All" },
  { value: "scheduled", label: "Ready to release" },
  { value: "awaiting_student", label: "Awaiting student" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];
const STAGES = [
  { value: "", label: "All stages" },
  { value: "draft", label: "Needs setup" },
  { value: "scheduled", label: "Ready to release" },
  { value: "awaiting_student", label: "Awaiting student" },
  { value: "orientation", label: "Orientation" },
  { value: "induction", label: "Induction" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

type Result = { id: string; student: string; ok: boolean; message?: string };
const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Every placement in this facility: who needs a ward or mentor, and who is progressing. */
export function NurseManagerPlacementWorkspace({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [params, setParams] = useSearchParams();
  const state = params.get("state") ?? "";
  const ward = params.get("ward") ?? "";
  const mentor = params.get("mentor") ?? "";
  const search = params.get("search") ?? "";
  const page = Number(params.get("page") ?? "1") || 1;
  const [text, setText] = useState(search);

  const patch = (next: Record<string, string>) => {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    if (!("page" in next)) copy.delete("page");
    setParams(copy, { replace: true });
  };
  useEffect(() => {
    const timer = window.setTimeout(() => text !== search && patch({ search: text }), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const list = useQuery({
    queryKey: ["manager-placement-workspace", state, ward, mentor, search, page],
    queryFn: () => getPlacements({ page, pageSize: 15, state, ward, mentor, search }),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
  const options = useQuery<PlacementOptions>({ queryKey: ["manager-placement-options"], queryFn: getPlacementOptions, staleTime: 60_000 });
  const incoming = useQuery({ queryKey: ["facility-incoming"], queryFn: getIncomingPlacements, staleTime: 15_000 });
  const rows = list.data?.results ?? [];
  const incomingCount = incoming.data?.length ?? 0;
  const needDecision = rows.filter(isManagerActionablePlacement).length;

  const [arranging, setArranging] = useState(false);
  const [listing, setListing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const selectable = rows.filter((item) => item.mentor && !isPlacementClosed(item.state));
  const allPicked = selectable.length > 0 && selectable.every((item) => picked.includes(item.id));
  const selected = rows.filter((item) => picked.includes(item.id));
  const eligible = (options.data?.mentors ?? []).filter(
    (item) => item.accepting_students && item.active_placements < item.max_active_placements && !selected.some((p) => p.mentor?.id === item.id),
  );
  const hasFilters = Boolean(state || ward || mentor || search);

  function closeReassign() {
    if (busy) return;
    setReassignOpen(false);
    setReplacement("");
    setReason("");
    setResults([]);
  }
  async function applyReassignment() {
    if (!replacement || !reason.trim() || selected.length === 0) return;
    setBusy(true);
    const done: Result[] = [];
    for (const placement of selected) {
      const student = placement.student?.name ?? "Student";
      try {
        await reassignMentor(placement.id, replacement, reason.trim());
        done.push({ id: placement.id, student, ok: true });
      } catch (cause) {
        done.push({ id: placement.id, student, ok: false, message: cause instanceof Error ? cause.message : "Reassignment failed." });
      }
    }
    setResults(done);
    setPicked(done.filter((item) => !item.ok).map((item) => item.id));
    setBusy(false);
    if (done.some((item) => item.ok)) {
      pushToast({ kind: "success", title: "Mentors reassigned", message: `${done.filter((item) => item.ok).length} of ${done.length} updated.` });
      void queryClient.invalidateQueries();
    }
  }
  const navigateTo = (destination: string) => navigate(destination === "overview" ? "/facility" : destination === "placements" ? "/placements" : `/facility/${destination}`);

  return (
    <FacilityWorkspaceFrame user={user} active="placements" title="Placements" onNavigate={navigateTo} onAccount={() => navigate("/facility/account")} onError={onError}>
      <AdminPage>
        <AdminPageHeader
          eyebrow="Facility operations"
          title="Placements"
          description="Place incoming students in wards, assign mentors, and follow each placement through to completion."
          actions={
            <>
              <AdminButton variant="ghost" size="sm" icon={<RefreshCw />} disabled={list.isFetching} onClick={() => void list.refetch()}>
                Refresh
              </AdminButton>
              <AdminButton variant="secondary" size="sm" icon={<Download />} onClick={() => setListing(true)}>
                Allocation list
              </AdminButton>
              {selected.length > 0 && user.capabilities.reassign_mentor !== false && (
                <AdminButton variant="secondary" size="sm" icon={<UserCog />} onClick={() => setReassignOpen(true)}>
                  Reassign {selected.length} {selected.length === 1 ? "student" : "students"}
                </AdminButton>
              )}
              {incomingCount > 0 && (
                <AdminButton size="sm" icon={<Wand2 />} onClick={() => setArranging(true)}>
                  Arrange {incomingCount} incoming
                </AdminButton>
              )}
            </>
          }
        />

        <StatGrid columns={3}>
          <StatCard icon={<Inbox />} tone={incomingCount ? "amber" : "green"} value={incomingCount} label="Incoming students" hint={incomingCount ? "Requested by coordinators" : "No pending requests"} loading={incoming.isPending} />
          <StatCard icon={<ClipboardList />} tone="teal" value={list.data?.pagination.total_count ?? 0} label="Placements" hint="In your facility" loading={list.isPending} />
          <StatCard icon={<UserCog />} tone={needDecision ? "rose" : "green"} value={needDecision} label="Need a decision" hint="On this page: ward or mentor missing" loading={list.isPending} />
        </StatGrid>

        {incomingCount > 0 && (
          <AdminCard
            title="Incoming students"
            description="Coordinators have asked your facility to host these students. Arrange them in one step, or open each placement."
            action={<AdminButton size="sm" icon={<Wand2 />} onClick={() => setArranging(true)}>Arrange all</AdminButton>}
            flush
          >
            <div className="pa-list">
              {(incoming.data ?? []).slice(0, 5).map((placement) => (
                <ListRow
                  key={placement.id}
                  icon={<Inbox />}
                  tone="amber"
                  title={placement.student?.name ?? "Student"}
                  meta={`${placement.cohort_name ?? ""} · ${fmt(placement.planned_start)} – ${fmt(placement.planned_end)}`}
                  trailing={<StatusPill tone="warning">Needs ward</StatusPill>}
                  onClick={() => navigate(`/placements/${placement.id}`)}
                />
              ))}
              {incomingCount > 5 && <p className="pa-muted" style={{ padding: "8px 16px" }}>and {incomingCount - 5} more</p>}
            </div>
          </AdminCard>
        )}

        <AdminTabs label="Quick stage filter" tabs={QUICK} value={QUICK.some((q) => q.value === state) ? state : "__other"} onChange={(value) => patch({ state: value })} />
        <Toolbar filters={3}>
          <SearchField label="Search placements" placeholder="Search student or mentor" value={text} onChange={setText} />
          <SelectField label="Stage" value={state} onChange={(value) => patch({ state: value })} options={STAGES} />
          <SelectField
            label="Ward"
            value={ward}
            onChange={(value) => patch({ ward: value })}
            options={[{ value: "", label: "All wards" }, ...(options.data?.wards ?? []).map((item) => ({ value: item.id, label: item.name }))]}
          />
          <SelectField
            label="Mentor"
            value={mentor}
            onChange={(value) => patch({ mentor: value })}
            options={[{ value: "", label: "All mentors" }, ...(options.data?.mentors ?? []).map((item) => ({ value: item.id, label: item.name }))]}
          />
        </Toolbar>

        {list.isPending ? (
          <Skeleton className="h-72" />
        ) : list.isError ? (
          <PortalErrorState onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title={hasFilters ? "No placements match" : "No placements yet"}
            text={hasFilters ? "Try another stage, ward or search term." : "Placements appear here once a coordinator requests your facility."}
            action={hasFilters ? <AdminButton variant="secondary" size="sm" onClick={() => { setText(""); setParams({}, { replace: true }); }}>Clear filters</AdminButton> : undefined}
          />
        ) : (
          <div className="pa-table-wrap" aria-busy={list.isFetching}>
            <div className="pa-table-scroll">
              <table className="pa-table">
                <caption className="sr-only">Facility placements</caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="Select all placements with a mentor on this page"
                        disabled={selectable.length === 0}
                        checked={allPicked}
                        onChange={() => setPicked(allPicked ? picked.filter((id) => !selectable.some((r) => r.id === id)) : [...new Set([...picked, ...selectable.map((r) => r.id)])])}
                      />
                    </th>
                    <th scope="col">Student</th>
                    <th scope="col">Ward</th>
                    <th scope="col">Mentor</th>
                    <th scope="col">Next step</th>
                    <th scope="col">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((placement) => (
                    <PlacementRow
                      key={placement.id}
                      placement={placement}
                      checked={picked.includes(placement.id)}
                      selectable={selectable.some((item) => item.id === placement.id)}
                      onToggle={() => setPicked((cur) => (cur.includes(placement.id) ? cur.filter((id) => id !== placement.id) : [...cur, placement.id]))}
                      onOpen={() => navigate(`/placements/${placement.id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {list.data && <ServerPager pagination={list.data.pagination} onPage={(next) => patch({ page: String(next) })} noun="placements" />}
          </div>
        )}

        <AllocationListModal open={listing} onClose={() => setListing(false)} cohorts={(options.data?.cohorts ?? []).map((item) => ({ id: item.id, name: item.name }))} />
        <ArrangeStudentsModal open={arranging} onClose={() => setArranging(false)} incomingCount={incomingCount} />

        <Modal
          open={reassignOpen}
          onClose={closeReassign}
          dismissible={!busy}
          icon={<UserCog />}
          title="Reassign mentor"
          description="Each current assignment is closed and a new audited assignment is created."
          footer={
            <>
              <AdminButton variant="secondary" size="sm" onClick={closeReassign} disabled={busy}>
                {results.some((item) => item.ok) ? "Done" : "Cancel"}
              </AdminButton>
              <AdminButton size="sm" icon={<Check />} onClick={() => void applyReassignment()} disabled={!replacement || !reason.trim() || selected.length === 0 || busy}>
                {busy ? "Applying…" : "Confirm reassignment"}
              </AdminButton>
            </>
          }
        >
          <Notice icon={<UserCog />}>
            {selected.length} {selected.length === 1 ? "student" : "students"}: {selected.map((item) => item.student?.name ?? "Student").join(", ")}
          </Notice>
          <Field label="Replacement mentor" required>
            <SelectInput value={replacement} onChange={(event) => setReplacement(event.target.value)}>
              <option value="">Choose an available mentor</option>
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.active_placements}/{item.max_active_placements} students
                </option>
              ))}
            </SelectInput>
          </Field>
          {eligible.length === 0 && <Notice icon={<UserCog />}>No other mentor currently has capacity and availability for these students.</Notice>}
          <Field label="Reason" required hint="Recorded in the audit trail.">
            <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this workload is moving" />
          </Field>
          {results.length > 0 && (
            <div role="status">
              <strong>{results.filter((item) => item.ok).length}/{results.length} applied</strong>
              {results.filter((item) => !item.ok).map((item) => (
                <p key={item.id} className="pa-muted">{item.student}: {item.message}</p>
              ))}
            </div>
          )}
        </Modal>
      </AdminPage>
    </FacilityWorkspaceFrame>
  );
}

function PlacementRow({ placement, checked, selectable, onToggle, onOpen }: { placement: Placement; checked: boolean; selectable: boolean; onToggle: () => void; onOpen: () => void }) {
  const action = managerPlacementAction(placement);
  return (
    <tr
      className="is-clickable"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <td onClick={(event) => event.stopPropagation()}>
        {selectable && <input type="checkbox" aria-label={`Select ${placement.student?.name ?? "student"}`} checked={checked} onChange={onToggle} />}
      </td>
      <td>
        <div className="pa-cell-title">
          <span>
            <strong>{placement.student?.name ?? "Student pending"}</strong>
            <small>{placement.cohort_name ?? ""}</small>
          </span>
        </div>
      </td>
      <td>{placement.ward?.name ?? <span className="pa-muted">Not allocated</span>}</td>
      <td>{placement.mentor?.name ?? <span className="pa-muted">Not assigned</span>}</td>
      <td>
        {action.actionable ? <StatusPill tone="warning">{action.label}</StatusPill> : <span className="pa-muted">{action.label}</span>}
      </td>
      <td>
        <StatusPill tone={placementStateTone(placement.state)}>{placementStateLabel(placement.state, "staff")}</StatusPill>
      </td>
    </tr>
  );
}
