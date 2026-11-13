import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ClipboardList, Download, RotateCcw, Undo2, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Modal } from "../../../components/kit";
import { PortalErrorState } from "../../../components/PortalErrorState";
import { useToast } from "../../../components/ToastProvider";
import { datedFilename, saveBlob } from "../../../lib/download";
import { getPlacementOptions, retryAllocationRun, undoAllocationRun, withdrawFacilityRequests, type CurrentUser } from "../../../services/api";
import {
  downloadAllocation,
  getAllocationRunDetail,
  messageOf,
  type AllocationRunDetail,
  type PipelineStatus,
} from "../../../services/placement-planning";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, Notice, SearchField, StatGrid, StatCard, StatusPill } from "../../programme-admin/ui/AdminKit";
import { ServerPager } from "../../programme-admin/ui/DataTable";
import { MODE_LABEL, Meter, PLANNING_PATH, RUNS_PATH, RUN_STATUS, STRATEGY_LABEL, StatusChip, fmtDate, fmtDateTime } from "./planningUi";
import { RequestSplitDialog } from "./RequestSplitDialog";

type Tab = "" | "placed" | "unplaced";

/** The result of one allocation run: summary, capacity before and after, mentor spread, who was placed and who was not. */
export function AllocationResult({ runId, user }: { runId: string; user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<Tab>("");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<"undo" | "withdraw" | null>(null);
  const [asking, setAsking] = useState(false);
  const [file, setFile] = useState<"csv" | "xlsx" | "pdf">("xlsx");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(text.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [text]);
  useEffect(() => { setTab(""); setText(""); setPage(1); }, [runId]);

  const [knownMode, setKnownMode] = useState<string | undefined>();
  const outcome = tab === "placed" ? (knownMode === "facility_split" ? "requested" : "placed") : tab === "unplaced" ? "unplaced" : undefined;
  const detail = useQuery({
    queryKey: ["allocation-run", runId, outcome ?? "all", search, page],
    queryFn: () => getAllocationRunDetail(runId, { outcome, search: search || undefined, page, page_size: 25 }),
    placeholderData: (previous) => previous,
  });
  const data = detail.data;
  const view: AllocationRunDetail | undefined = data;
  const fetching = detail.isFetching;
  useEffect(() => setKnownMode(data?.run.mode), [data?.run.mode]);
  const isSplit = data?.run.mode === "facility_split";
  const options = useQuery({ queryKey: ["placement-options"], queryFn: getPlacementOptions, staleTime: 5 * 60_000, enabled: asking });
  const askFacilities = [...new Map((options.data?.wards ?? []).map((item) => [item.facility_id, item.facility_name])).entries()].map(([id, name]) => ({ id, name }));

  const unplacedForAction = useQuery({
    queryKey: ["allocation-run", runId, "unplaced-ids"],
    enabled: asking,
    queryFn: () => getAllocationRunDetail(runId, { outcome: "unplaced", page_size: 200 }),
    staleTime: 0,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["allocation-run"] });
    void queryClient.invalidateQueries({ queryKey: ["allocation-runs-list"] });
    void queryClient.invalidateQueries({ queryKey: ["planning-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["planning-cohort"] });
    void queryClient.invalidateQueries({ queryKey: ["planning-students"] });
  }
  const undo = useMutation({
    mutationFn: () => undoAllocationRun(runId),
    onSuccess: (result) => {
      setConfirm(null);
      refresh();
      pushToast({ kind: "success", title: "Arrangement undone", message: `${result.reverted} ${result.reverted === 1 ? "student" : "students"} back in the incoming queue${result.kept.length ? `; ${result.kept.length} had already moved on and were left as they are` : ""}.` });
    },
    onError: (cause) => { setConfirm(null); pushToast({ kind: "error", title: "Could not undo", message: messageOf(cause, "Try again.") }); },
  });
  const retry = useMutation({
    mutationFn: () => retryAllocationRun(runId),
    onSuccess: (result) => {
      refresh();
      pushToast({ kind: "success", title: "Tried again", message: `${result.summary.arranged} more placed, ${result.summary.unplaced} still waiting.` });
      if (result.run_id) navigate(`${RUNS_PATH}/${result.run_id}`);
    },
    onError: (cause) => pushToast({ kind: "error", title: "Could not retry", message: messageOf(cause, "Try again.") }),
  });
  const withdraw = useMutation({
    mutationFn: async () => {
      const waiting = await getAllocationRunDetail(runId, { outcome: "requested", page_size: 200 });
      const ids = waiting.placements.filter((row) => row.status === "requested").map((row) => row.placement_id);
      if (ids.length === 0) return { withdrawn: 0 };
      return withdrawFacilityRequests(ids);
    },
    onSuccess: (result) => {
      setConfirm(null);
      refresh();
      pushToast({ kind: "success", title: "Requests withdrawn", message: result.withdrawn ? `${result.withdrawn} ${result.withdrawn === 1 ? "student" : "students"} no longer requested.` : "No requests were still waiting." });
    },
    onError: (cause) => { setConfirm(null); pushToast({ kind: "error", title: "Could not withdraw", message: messageOf(cause, "Try again.") }); },
  });

  async function download() {
    setDownloading(true);
    try {
      saveBlob(await downloadAllocation({ file, runId }), datedFilename("allocation-result", file));
    } catch (cause) {
      pushToast({ kind: "error", title: "Could not download the list", message: messageOf(cause, "Try again.") });
    } finally {
      setDownloading(false);
    }
  }

  if (detail.isPending) {
    return (
      <AdminPage>
        <Skeleton className="h-24" />
        <Skeleton className="mt-4 h-28" />
        <Skeleton className="mt-4 h-64" />
      </AdminPage>
    );
  }
  if (detail.isError || !data || !view) {
    return (
      <AdminPage>
        <PortalErrorState
          title="We couldn’t open this result"
          message={messageOf(detail.error, "It may have been removed, or it belongs to another institution.")}
          onRetry={() => void detail.refetch()}
        />
        <p style={{ marginTop: 12 }}><Link to={RUNS_PATH}>Back to allocation runs</Link></p>
      </AdminPage>
    );
  }

  const { run, summary } = data;
  const state = RUN_STATUS[run.status] ?? { label: run.status, tone: "neutral" as const };
  const canWithdraw = isSplit && run.status !== "undone" && Boolean(user.capabilities.request_facility);
  const rows = view.placements;
  const maxRequested = Math.max(1, ...data.facilities.map((item) => item.requested ?? 0));
  const askIds = (unplacedForAction.data?.placements ?? []).map((row) => row.placement_id);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={`${MODE_LABEL[run.mode] ?? "Allocation"} · ${fmtDateTime(run.created_at)}`}
        title="Allocation result"
        description={`Run by ${run.by}. ${STRATEGY_LABEL[run.strategy] ?? run.strategy}${run.facility ? ` at ${run.facility.name}` : ""}. Shuffle code ${run.seed || "none"}: running the same plan again gives the same result.`}
        meta={<StatusPill tone={state.tone}>{state.label}</StatusPill>}
        actions={
          <>
            <Link className="pa-btn pa-btn--secondary pa-btn--sm" to={PLANNING_PATH}>Back to planning</Link>
            <Link className="pa-btn pa-btn--secondary pa-btn--sm" to={RUNS_PATH}>All runs</Link>
            <label className="pa-select" style={{ minWidth: 0 }}>
              <span className="sr-only">File type for the list</span>
              <select value={file} onChange={(event) => setFile(event.target.value as typeof file)} aria-label="File type for the list">
                <option value="xlsx">Excel</option>
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            <AdminButton variant="secondary" size="sm" icon={<Download />} onClick={() => void download()} disabled={downloading}>{downloading ? "Preparing…" : "Download list"}</AdminButton>
            {run.can_retry && <AdminButton variant="secondary" size="sm" icon={<RotateCcw />} onClick={() => retry.mutate()} disabled={retry.isPending}>{retry.isPending ? "Trying…" : "Retry unplaced"}</AdminButton>}
            {run.can_undo && <AdminButton variant="secondary" size="sm" icon={<Undo2 />} onClick={() => setConfirm("undo")}>Undo this arrangement</AdminButton>}
            {canWithdraw && <AdminButton variant="secondary" size="sm" icon={<Undo2 />} onClick={() => setConfirm("withdraw")}>Withdraw waiting requests</AdminButton>}
          </>
        }
      />

      {!data.detail_available && <Notice icon={<ClipboardList />}>The student-by-student detail of this run is no longer available. The totals below are still correct.</Notice>}
      {run.status === "undone" && <Notice icon={<Undo2 />}>This arrangement was undone. The students are back in the facility’s incoming queue.</Notice>}
      {run.retried_by && (
        <Notice icon={<RotateCcw />}>
          The unplaced students were tried again. <Link to={`${RUNS_PATH}/${run.retried_by}`}>Open the retry result</Link>.
        </Notice>
      )}

      <StatGrid columns={3}>
        <StatCard icon={<Users />} tone="blue" value={summary.requested} label={isSplit ? "Students in this run" : "Students to arrange"} />
        <StatCard icon={<Building2 />} tone="green" value={summary.placed} label={isSplit ? "Requested of a facility" : "Placed"} hint={!isSplit ? `${summary.with_mentor} with a mentor` : undefined} />
        <StatCard icon={<ClipboardList />} tone={summary.unplaced ? "amber" : "green"} value={summary.unplaced} label="Unplaced" hint={summary.unplaced ? "See the reasons below" : "Everyone has a place"} />
      </StatGrid>

      {summary.unplaced > 0 && (
        <AdminCard
          title="Why some students were not placed"
          titleId="run-unplaced-title"
          description="These students were left as they were. Nothing was lost."
          action={
            run.can_retry ? (
              <AdminButton size="sm" icon={<RotateCcw />} onClick={() => retry.mutate()} disabled={retry.isPending}>Retry unplaced</AdminButton>
            ) : isSplit && user.capabilities.request_facility ? (
              <AdminButton size="sm" icon={<Building2 />} onClick={() => setAsking(true)}>Choose other facilities</AdminButton>
            ) : undefined
          }
        >
          <ul className="pp-result-list" aria-label="Reasons students were not placed">
            {summary.unplaced_reasons.map((item) => (
              <li key={item.reason}><strong>{item.count}</strong> {item.count === 1 ? "student" : "students"}: {item.reason}</li>
            ))}
          </ul>
          <p style={{ margin: "10px 0 0" }}>
            <button type="button" className="pp-linkbtn" onClick={() => { setTab("unplaced"); setPage(1); }}>Show the unplaced students</button>
          </p>
        </AdminCard>
      )}

      <div className="pp-two">
        <AdminCard titleId="run-capacity-title" title={isSplit ? "Requests per facility" : "Places before and after"} description={isSplit ? "How many students were asked of each facility." : "Ward places taken before this run and added by it."}>
          {data.facilities.length === 0 && data.wards.length === 0 ? (
            <p className="pa-muted">No capacity details were kept for this run.</p>
          ) : isSplit ? (
            <div className="pp-meters">
              {data.facilities.map((item) => (
                <Meter key={item.facility_id} label={item.name} detail={`${item.requested ?? 0} requested`} total={maxRequested} before={0} added={item.requested ?? 0} summary={`${item.name}: ${item.requested ?? 0} students requested`} />
              ))}
            </div>
          ) : (
            <>
              <div className="pp-legend" aria-hidden="true">
                <span><i style={{ background: "#7aa7b5" }} />Taken before</span>
                <span><i style={{ background: "var(--pa-teal)" }} />Added by this run</span>
              </div>
              <div className="pp-meters">
                {data.facilities.map((item) => (
                  <Meter
                    key={item.facility_id}
                    label={<strong>{item.name}</strong>}
                    detail={item.capacity != null ? `${item.after ?? "—"} of ${item.capacity} taken after · ${item.free_after ?? "—"} free` : `${item.added ?? 0} added`}
                    total={item.capacity}
                    before={item.before}
                    added={item.added ?? 0}
                    summary={`${item.name}: ${item.before ?? "unknown"} places taken before, ${item.added ?? 0} added, capacity ${item.capacity ?? "unknown"}`}
                  />
                ))}
                {data.wards.map((ward) => (
                  <Meter
                    key={ward.id}
                    label={ward.name}
                    detail={ward.capacity != null ? `${ward.after ?? "—"} of ${ward.capacity} · ${ward.free_after ?? "—"} free` : `${ward.added} added`}
                    total={ward.capacity}
                    before={ward.before}
                    added={ward.added}
                    summary={`${ward.name}: ${ward.before ?? "unknown"} taken before, ${ward.added} added, capacity ${ward.capacity ?? "unknown"}`}
                  />
                ))}
              </div>
            </>
          )}
        </AdminCard>

        {!isSplit && (
          <AdminCard titleId="run-mentors-title" title="Mentor spread" description={`${summary.with_mentor} placed with a mentor, ${summary.without_mentor} still need one.`}>
            {data.mentors.length === 0 ? (
              <p className="pa-muted">No mentors were assigned in this run.</p>
            ) : (
              <div className="pp-meters">
                {data.mentors.map((mentor) => (
                  <Meter
                    key={mentor.id}
                    label={mentor.name}
                    detail={`${mentor.assigned_in_run} in this run${mentor.remaining_now != null ? ` · ${mentor.remaining_now} places left` : ""}`}
                    total={mentor.limit}
                    before={mentor.open_placements_now != null ? Math.max(0, mentor.open_placements_now - mentor.assigned_in_run) : null}
                    added={mentor.assigned_in_run}
                    summary={`${mentor.name}: ${mentor.assigned_in_run} students in this run, limit ${mentor.limit ?? "not set"}`}
                  />
                ))}
              </div>
            )}
          </AdminCard>
        )}
      </div>

      <div role="group" aria-label="Show students" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        {([["", "All"], ["placed", isSplit ? "Requested" : "Placed"], ["unplaced", "Unplaced"]] as Array<[Tab, string]>).map(([value, label]) => (
          <AdminButton key={value || "all"} variant={tab === value ? "primary" : "secondary"} size="sm" aria-pressed={tab === value} onClick={() => { setTab(value); setPage(1); }}>
            {label}{value === "" ? ` (${summary.requested})` : value === "placed" ? ` (${summary.placed})` : ` (${summary.unplaced})`}
          </AdminButton>
        ))}
        <div style={{ flex: "1 1 14rem", minWidth: 0 }}>
          <SearchField label="Search the students in this run" placeholder="Search name or reg. number" value={text} onChange={setText} />
        </div>
      </div>

      {detail.isFetching && rows.length === 0 ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users />} title={search || tab ? "No students match" : "No student details to show"} text={search || tab ? "Try another tab or search." : "This run has no student-level detail."} />
      ) : (
        <div className="pa-table-wrap" aria-busy={fetching}>
          <div className="pa-table-scroll">
            <table className="pa-table pp-table">
              <caption className="sr-only">Students in this allocation run</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Facility</th>
                  <th scope="col">Ward</th>
                  <th scope="col">Mentor</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.placement_id}>
                    <td>
                      <div className="pa-cell-title">
                        <span>
                          <Link to={`/coordinator/placements/${row.placement_id}`}><strong>{row.student}</strong></Link>
                          <small>{row.registration_number || row.cohort}</small>
                        </span>
                      </div>
                    </td>
                    <td data-label="Outcome">
                      {row.outcome === "unplaced" ? <StatusPill tone="warning">Unplaced</StatusPill> : <StatusChip status={row.status as PipelineStatus} label={row.status_label} />}
                      {row.outcome === "unplaced" && row.reason && <span className="pp-reason" style={{ display: "block" }}>{row.reason}</span>}
                      {row.moved_since && <small className="pa-sub">Changed since this run</small>}
                    </td>
                    <td data-label="Facility">{row.facility ? `${row.facility.requested ? "Requested: " : ""}${row.facility.name}` : <span className="pa-muted">—</span>}</td>
                    <td data-label="Ward">{row.ward?.name ?? <span className="pa-muted">—</span>}</td>
                    <td data-label="Mentor">{row.mentor?.name ?? <span className="pa-muted">—</span>}</td>
                    <td data-label="Start" className="pa-nowrap">{fmtDate(row.planned_start)}</td>
                    <td data-label="End" className="pa-nowrap">{fmtDate(row.planned_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServerPager pagination={view.pagination} onPage={setPage} noun="students" />
        </div>
      )}

      <Modal
        open={confirm === "undo"}
        onClose={() => setConfirm(null)}
        dismissible={!undo.isPending}
        icon={<Undo2 />}
        title="Undo this arrangement?"
        description="This takes the students placed by this run out of their wards and back to the facility’s incoming queue."
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setConfirm(null)} disabled={undo.isPending}>Keep the arrangement</AdminButton>
            <AdminButton size="sm" icon={<Undo2 />} onClick={() => undo.mutate()} disabled={undo.isPending}>{undo.isPending ? "Undoing…" : `Undo for ${summary.placed} students`}</AdminButton>
          </>
        }
      >
        <ul className="pp-result-list">
          <li>Each student’s ward and mentor from this run are removed and the placement goes back to draft.</li>
          <li>Anyone who has already moved on (released, confirmed or changed by hand) is left exactly as they are, and you are told who.</li>
          <li>Arrangements can only be undone within 24 hours of the run.</li>
        </ul>
      </Modal>
      <Modal
        open={confirm === "withdraw"}
        onClose={() => setConfirm(null)}
        dismissible={!withdraw.isPending}
        icon={<Undo2 />}
        title="Withdraw the waiting requests?"
        description="Students whose facility has not placed them yet go back to “not yet requested”."
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setConfirm(null)} disabled={withdraw.isPending}>Keep the requests</AdminButton>
            <AdminButton size="sm" icon={<Undo2 />} onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>{withdraw.isPending ? "Withdrawing…" : "Withdraw requests"}</AdminButton>
          </>
        }
      >
        <ul className="pp-result-list">
          <li>Only requests the facility has not yet answered are withdrawn. Students already given a ward stay as they are.</li>
          <li>You can request facilities again afterwards from the planning page.</li>
        </ul>
      </Modal>
      <RequestSplitDialog
        open={asking && askIds.length > 0}
        onClose={() => setAsking(false)}
        placementIds={askIds}
        facilities={askFacilities}
        onApplied={(id) => { setAsking(false); refresh(); navigate(`${RUNS_PATH}/${id}`); }}
      />
      {asking && unplacedForAction.isPending && <p className="pa-muted" role="status">Loading the unplaced students…</p>}
    </AdminPage>
  );
}
