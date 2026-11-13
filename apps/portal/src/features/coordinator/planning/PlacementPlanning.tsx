import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Building2, CheckCircle2, Download, GraduationCap, History, Send, TriangleAlert, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../../components/PortalErrorState";
import { useToast } from "../../../components/ToastProvider";
import { datedFilename, saveBlob } from "../../../lib/download";
import type { CurrentUser } from "../../../services/api";
import {
  downloadAllocation,
  getPlanningCohort,
  getPlanningOverview,
  getPlanningStudentIds,
  getPlanningStudents,
  messageOf,
  type PipelineStatus,
  type PlanningCohortSummary,
  type PlanningSort,
  type PlanningStudentRow,
} from "../../../services/placement-planning";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, Notice, SearchField, SelectField, StatusPill, Toolbar } from "../../programme-admin/ui/AdminKit";
import { ServerPager } from "../../programme-admin/ui/DataTable";
import { PIPELINE_STEPS, RUNS_PATH, StatusChip, Meter, dateRange, fmtDate, sumStatuses } from "./planningUi";
import { ReleaseDialog } from "./ReleaseDialog";
import { RequestSplitDialog } from "./RequestSplitDialog";

const PAGE_SIZE = 25;

const SORTABLE: Array<{ key: PlanningSort; label: string }> = [
  { key: "name", label: "Student" },
  { key: "registration_number", label: "Reg. no." },
  { key: "status", label: "Status" },
  { key: "facility", label: "Facility" },
  { key: "ward", label: "Ward" },
  { key: "mentor", label: "Mentor" },
  { key: "start", label: "Start" },
];

function facilityText(row: PlanningStudentRow) {
  if (row.facility) return row.facility.name;
  if (row.requested_facility) return `Requested: ${row.requested_facility.name}`;
  return null;
}

function reasonText(row: PlanningStudentRow): string | null {
  if (row.declined) return `Declined by ${row.declined.facility}: ${row.declined.reason}`;
  if (row.blockers.length > 0) return row.blockers.join(" ");
  return null;
}

/** The next cohort(s), where every student is in the placement pipeline, and the actions to move them on. */
export function PlacementPlanning({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [params, setParams] = useSearchParams();
  const overview = useQuery({ queryKey: ["planning-overview"], queryFn: getPlanningOverview, staleTime: 15_000 });

  const cohortId = params.get("cohort") || overview.data?.next_cohort_id || "";
  const status = params.get("status") ?? "";
  const facility = params.get("facility") ?? "";
  const ward = params.get("ward") ?? "";
  const ready = params.get("ready") === "1";
  const search = params.get("q") ?? "";
  const sort = (params.get("sort") as PlanningSort | null) ?? "status";
  const order = params.get("order") === "desc" ? "desc" : "asc";
  const page = Number(params.get("page") ?? "1") || 1;
  const [text, setText] = useState(search);

  function patch(next: Record<string, string>, keepPage = false) {
    // Start from the address bar, not the last render, so quick successive changes never overwrite each other.
    const copy = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    if (!keepPage && !("page" in next)) copy.delete("page");
    setParams(copy, { replace: true });
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (text !== search) patch({ q: text });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const summary = useQuery({
    queryKey: ["planning-cohort", cohortId],
    queryFn: () => getPlanningCohort(cohortId),
    enabled: Boolean(cohortId),
    staleTime: 15_000,
  });

  const serverQuery = useMemo(
    () => ({ status: status || undefined, search: search || undefined, facility_id: facility || undefined, ward_id: ward || undefined, ready: ready || undefined, sort, order } as const),
    [status, search, facility, ward, ready, sort, order],
  );
  const students = useQuery({
    queryKey: ["planning-students", cohortId, serverQuery, page],
    enabled: Boolean(cohortId),
    placeholderData: (previous) => previous,
    queryFn: () => getPlanningStudents(cohortId, { ...serverQuery, page, page_size: PAGE_SIZE }),
  });

  // Choosing a different cohort, filter or page keeps the selection only while the cohort is the same.
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected([]), [cohortId]);
  const [requesting, setRequesting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [file, setFile] = useState<"csv" | "xlsx" | "pdf">("xlsx");
  const [downloading, setDownloading] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  const canRequest = Boolean(user.capabilities.request_facility);
  const canRelease = Boolean(user.capabilities.release_placement);
  const rows = students.data?.results ?? [];
  const selectable = rows.filter((row) => row.placement_id);
  const pageIds = selectable.map((row) => row.placement_id as string);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const total = students.data?.pagination.total_count ?? 0;
  const hasFilters = Boolean(status || facility || ward || ready || search);
  const cohort = overview.data?.cohorts.find((item) => item.id === cohortId);
  const counts = summary.data?.cohort.counts ?? cohort?.counts;

  const facilities = summary.data?.capacity.facilities ?? [];
  const wardOptions = facilities
    .filter((item) => !facility || item.facility_id === facility)
    .flatMap((item) => item.wards.map((w) => ({ value: w.ward_id, label: facility ? w.name : `${item.name} · ${w.name}` })));
  const statusOptions = [
    { value: "", label: "All statuses" },
    ...PIPELINE_STEPS.filter((step) => step.statuses.length > 1).map((step) => ({ value: step.statuses.join(","), label: `${step.label} (group)` })),
    ...(overview.data?.statuses ?? []).map((item) => ({ value: item.code, label: item.label })),
  ];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["planning-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["planning-cohort"] });
    void queryClient.invalidateQueries({ queryKey: ["planning-students"] });
    void queryClient.invalidateQueries({ queryKey: ["coordinator-placements"] });
  }
  function toggleRow(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }
  function togglePage() {
    setSelected((current) => (allOnPage ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]));
  }
  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const ids = (await getPlanningStudentIds(cohortId, serverQuery)).placement_ids;
      setSelected(ids);
    } catch (cause) {
      pushToast({ kind: "error", title: "Could not select everyone", message: messageOf(cause, "Try again.") });
    } finally {
      setSelectingAll(false);
    }
  }
  async function download() {
    setDownloading(true);
    try {
      const blob = await downloadAllocation({ file, cohortId });
      saveBlob(blob, datedFilename("allocation-list", file, [cohort?.name ?? ""]));
    } catch (cause) {
      pushToast({ kind: "error", title: "Could not download the list", message: messageOf(cause, "Try again.") });
    } finally {
      setDownloading(false);
    }
  }
  function sortBy(key: PlanningSort) {
    patch({ sort: key, order: sort === key && order === "asc" ? "desc" : "asc" });
  }

  if (overview.isError) return <PlanningShell><PortalErrorState onRetry={() => void overview.refetch()} /></PlanningShell>;
  if (overview.isPending) {
    return (
      <PlanningShell>
        <Skeleton className="h-28" />
        <Skeleton className="mt-4 h-24" />
        <Skeleton className="mt-4 h-72" />
      </PlanningShell>
    );
  }
  if (overview.data.cohorts.length === 0) {
    return (
      <PlanningShell>
        <EmptyState
          icon={<GraduationCap />}
          title="No upcoming cohorts to plan"
          text="Create a cohort with its dates and enrol students, then come back here to place them."
          action={<Link className="pa-btn pa-btn--primary pa-btn--sm" to="/coordinator/cohorts">Go to cohorts</Link>}
        />
      </PlanningShell>
    );
  }

  const bulkVisible = selected.length > 0;
  return (
    <PlanningShell
      actions={
        <>
          <Link className="pa-btn pa-btn--secondary pa-btn--sm" to={RUNS_PATH}><History aria-hidden="true" /> Allocation runs</Link>
          <label className="pa-select" style={{ minWidth: 0 }}>
            <span className="sr-only">File type for the allocation list</span>
            <select value={file} onChange={(event) => setFile(event.target.value as typeof file)} aria-label="File type for the allocation list">
              <option value="xlsx">Excel</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <AdminButton variant="secondary" size="sm" icon={<Download />} onClick={() => void download()} disabled={downloading || !cohortId}>
            {downloading ? "Preparing…" : "Download allocation list"}
          </AdminButton>
        </>
      }
    >
      <div className="pp-cohorts" role="group" aria-label="Choose a cohort">
        {overview.data.cohorts.map((item) => (
          <button
            key={item.id}
            type="button"
            className="pp-cohort"
            aria-pressed={item.id === cohortId}
            onClick={() => patch({ cohort: item.id, status: "", facility: "", ward: "", q: "", ready: "", sort: "", order: "" })}
          >
            <strong>{item.name}</strong>
            <small>{item.institution_name} · {dateRange(item.start_date, item.end_date)}</small>
            <small>
              {item.phase === "upcoming" ? `Starts in ${item.days_until_start} ${item.days_until_start === 1 ? "day" : "days"}` : "Under way"} · {item.counts.total} {item.counts.total === 1 ? "student" : "students"}
            </small>
            <span className="pp-cohort__counts">
              {item.counts.needs_attention > 0 && <StatusPill tone="warning">{item.counts.needs_attention} need action</StatusPill>}
              {item.counts.ready_to_release > 0 && <StatusPill tone="success">{item.counts.ready_to_release} ready</StatusPill>}
            </span>
          </button>
        ))}
      </div>

      {counts && (
        <AdminCard titleId="planning-steps-title" title="Where the cohort is" description="Select a step to show only those students." className="pp-step-card">
          <ol className="pp-strip" aria-label="Placement progress">
            {PIPELINE_STEPS.map((step) => {
              const value = sumStatuses(counts, step.statuses);
              const key = step.statuses.join(",");
              return (
                <li key={step.id}>
                  <button type="button" className="pp-strip__step" aria-pressed={status === key} onClick={() => patch({ status: status === key ? "" : key })}>
                    <span className="pp-strip__value">{value}</span>
                    <span className="pp-strip__label">{step.label}</span>
                    <span className="pp-strip__bar" aria-hidden="true"><span style={{ width: `${counts.total ? (value / counts.total) * 100 : 0}%` }} /></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </AdminCard>
      )}

      <CapacityCard summary={summary} onRetry={() => void summary.refetch()} />

      <Toolbar filters={4}>
        <SearchField label="Search students" placeholder="Search name, email or reg. number" value={text} onChange={setText} />
        <SelectField label="Status" value={status} onChange={(value) => patch({ status: value })} options={statusOptions.some((o) => o.value === status) ? statusOptions : [...statusOptions, { value: status, label: "Selected statuses" }]} />
        <SelectField label="Facility" value={facility} onChange={(value) => patch({ facility: value, ward: "" })} options={[{ value: "", label: "All facilities" }, ...facilities.map((item) => ({ value: item.facility_id, label: item.name }))]} />
        <SelectField label="Ward" value={ward} onChange={(value) => patch({ ward: value })} options={[{ value: "", label: "All wards" }, ...wardOptions]} />
      </Toolbar>
      <label style={{ display: "inline-flex", gap: 8, alignItems: "center", margin: "0 0 12px", font: "600 0.82rem/1.3 Inter, sans-serif" }}>
        <input type="checkbox" checked={ready} onChange={(event) => patch({ ready: event.target.checked ? "1" : "" })} />
        Only students ready to release
      </label>

      {bulkVisible && (
        <div className="pp-bulkbar" role="status">
          <strong>{selected.length} selected</strong>
          {allOnPage && total > pageIds.length && selected.length < total && (
            <button type="button" className="pp-linkbtn" onClick={() => void selectAllMatching()} disabled={selectingAll}>
              {selectingAll ? "Selecting…" : `Select all ${total} matching`}
            </button>
          )}
          <span className="pp-bulkbar__spacer" />
          {canRequest && <AdminButton size="sm" icon={<Building2 />} onClick={() => setRequesting(true)}>Request facilities</AdminButton>}
          {canRelease && <AdminButton size="sm" icon={<Send />} onClick={() => setReleasing(true)}>Release to students</AdminButton>}
          <AdminButton variant="ghost" size="sm" onClick={() => setSelected([])}>Clear selection</AdminButton>
        </div>
      )}
      {!bulkVisible && canRelease && (counts?.ready_to_release ?? 0) > 0 && (
        <div className="pp-bulkbar" role="note">
          <CheckCircle2 aria-hidden="true" size={16} />
          <span>{counts?.ready_to_release} {counts?.ready_to_release === 1 ? "student is" : "students are"} arranged and ready to release.</span>
          <span className="pp-bulkbar__spacer" />
          <AdminButton size="sm" icon={<Send />} onClick={() => setReleasing(true)}>Release ready students</AdminButton>
        </div>
      )}

      {students.isPending ? (
        <Skeleton className="h-72" />
      ) : students.isError ? (
        <PortalErrorState title="We couldn’t load the students" message={messageOf(students.error, "Please try again.")} onRetry={() => void students.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={hasFilters ? "No students match" : "No students in this cohort yet"}
          text={hasFilters ? "Try another status, facility or search term." : "Enrol students in the cohort, then create their placements."}
          action={
            hasFilters ? (
              <AdminButton variant="secondary" size="sm" onClick={() => { setText(""); patch({ status: "", facility: "", ward: "", q: "", ready: "" }); }}>Clear filters</AdminButton>
            ) : (
              <Link className="pa-btn pa-btn--primary pa-btn--sm" to="/coordinator/placements/new">New placement</Link>
            )
          }
        />
      ) : (
        <div className="pa-table-wrap" aria-busy={students.isFetching}>
          <div className="pa-table-scroll">
            <table className="pa-table pp-table">
              <caption className="sr-only">Students in {cohort?.name ?? "the cohort"} and where each is placed</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 36 }}>
                    <input type="checkbox" aria-label="Select all students on this page" checked={allOnPage} disabled={pageIds.length === 0} onChange={togglePage} />
                  </th>
                  {SORTABLE.map((column) => (
                    <th key={column.key} scope="col" aria-sort={sort === column.key ? (order === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" className="pp-th-btn" onClick={() => sortBy(column.key)}>
                        {column.label}
                        {sort === column.key && (order === "asc" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                      </button>
                    </th>
                  ))}
                  <th scope="col">End</th>
                  <th scope="col">Reason / next step</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PlanningRow key={row.student.id} row={row} checked={Boolean(row.placement_id && selected.includes(row.placement_id))} onToggle={toggleRow} />
                ))}
              </tbody>
            </table>
          </div>
          {students.data && <ServerPager pagination={students.data.pagination} onPage={(next) => patch({ page: String(next) }, true)} noun="students" />}
        </div>
      )}
      {students.data && students.data.pagination.total_pages <= 1 && <p className="pa-muted" style={{ marginTop: 8 }}>{total} {total === 1 ? "student" : "students"}</p>}

      <RequestSplitDialog
        open={requesting}
        onClose={() => setRequesting(false)}
        placementIds={selected}
        facilities={facilities.map((item) => ({ id: item.facility_id, name: item.name, free: item.free }))}
        onApplied={(runId) => {
          setRequesting(false);
          setSelected([]);
          refresh();
          navigate(`${RUNS_PATH}/${runId}`);
        }}
      />
      {cohort && (
        <ReleaseDialog
          open={releasing}
          onClose={() => setReleasing(false)}
          cohort={{ id: cohort.id, name: cohort.name }}
          selectedIds={selected}
          readyInCohort={counts?.ready_to_release ?? 0}
          onDone={() => {
            setSelected([]);
            refresh();
          }}
        />
      )}
    </PlanningShell>
  );
}

function PlanningShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Placements"
        title="Placement planning"
        description="See the next cohort, where each student is placed and what step they are at. Request facilities, release arranged placements and open the allocation result."
        actions={actions}
      />
      {children}
    </AdminPage>
  );
}

function PlanningRow({ row, checked, onToggle }: { row: PlanningStudentRow; checked: boolean; onToggle: (id: string) => void }) {
  const reason = reasonText(row);
  const place = facilityText(row);
  return (
    <tr>
      <td className="pp-td-select">
        {row.placement_id ? (
          <input type="checkbox" aria-label={`Select ${row.student.name}`} checked={checked} onChange={() => onToggle(row.placement_id as string)} />
        ) : null}
      </td>
      <td>
        <div className="pa-cell-title">
          <span>
            {row.placement_id ? <Link to={`/coordinator/placements/${row.placement_id}`}><strong>{row.student.name}</strong></Link> : <strong>{row.student.name}</strong>}
          </span>
        </div>
      </td>
      <td data-label="Reg. no.">{row.student.registration_number || "—"}</td>
      <td data-label="Status">
        <StatusChip status={row.status as PipelineStatus} label={row.status_label} />
        {row.ready_to_release && <span className="pp-ready"><CheckCircle2 aria-hidden="true" /> Ready to release</span>}
        {!row.placement_id && <small className="pa-sub">No placement yet</small>}
      </td>
      <td data-label="Facility">{place ?? <span className="pa-muted">—</span>}</td>
      <td data-label="Ward">{row.ward?.name ?? <span className="pa-muted">—</span>}</td>
      <td data-label="Mentor">{row.mentor?.name ?? <span className="pa-muted">—</span>}</td>
      <td data-label="Start" className="pa-nowrap">{fmtDate(row.planned_start)}</td>
      <td data-label="End" className="pa-nowrap">{fmtDate(row.planned_end)}</td>
      <td data-label="Next step">
        {reason ? <span className={row.declined ? "pp-reason" : "pp-blocked"}>{reason}</span> : <span className="pa-muted">{row.next_action || "—"}</span>}
      </td>
    </tr>
  );
}

function CapacityCard({ summary, onRetry }: { summary: UseQueryResult<PlanningCohortSummary>; onRetry: () => void }) {
  if (summary.isPending) return <Skeleton className="mb-4 h-28" />;
  if (summary.isError) {
    return (
      <Notice icon={<TriangleAlert />}>
        {messageOf(summary.error, "We could not load facility capacity.")}{" "}
        <button type="button" className="pp-linkbtn" onClick={onRetry}>Try again</button>
      </Notice>
    );
  }
  const data = summary.data;
  const { capacity, window } = data;
  return (
    <AdminCard
      titleId="planning-capacity-title"
      title="Room at partner facilities"
      description={`Free ward places for ${fmtDate(window.start)} to ${fmtDate(window.end)}${window.basis === "cohort" ? " (the cohort’s dates)" : ""}. ${capacity.total_free} free of ${capacity.total_capacity}; ${capacity.students_to_place} students still need a place.`}
    >
      {data.warnings.map((text) => <Notice key={text} icon={<TriangleAlert />}>{text}</Notice>)}
      {capacity.facilities.length === 0 ? (
        <p className="pa-muted">No partner facilities with wards are set up yet.</p>
      ) : (
        <>
          <div className="pp-legend" aria-hidden="true">
            <span><i style={{ background: "#7aa7b5" }} />Places taken</span>
            <span><i style={{ background: "var(--pa-teal)" }} />Requested, waiting</span>
          </div>
          <div className="pp-meters pp-meters--cols">
            {capacity.facilities.map((item) => (
              <div key={item.facility_id}>
                <Meter
                  label={item.name}
                  detail={`${item.free} free${item.pending_requests ? ` · ${item.pending_requests} waiting` : ""}`}
                  total={item.capacity}
                  before={item.occupied}
                  added={item.pending_requests}
                  summary={`${item.name}: ${item.occupied} of ${item.capacity} places taken, ${item.pending_requests} requested and waiting, ${item.free} free`}
                />
                {item.no_wards && <small className="pa-sub">No active wards yet.</small>}
              </div>
            ))}
          </div>
        </>
      )}
    </AdminCard>
  );
}
