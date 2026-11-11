import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, ClipboardList, Download, Layers, Plus } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { getPlacementOptions, getPlacements, withdrawFacilityRequests, type CurrentUser, type Placement } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { PortalErrorState } from "../../components/PortalErrorState";
import { AdminButton, AdminPage, AdminPageHeader, AdminTabs, EmptyState, SearchField, SelectField, StatusPill, Toolbar } from "../programme-admin/ui/AdminKit";
import { AllocationListModal } from "../placements/AllocationListModal";
import { RequestFacilitiesModal } from "./RequestFacilitiesModal";
import { ServerPager } from "../programme-admin/ui/DataTable";
import { placementStateLabel, placementStateTone } from "../placements/placementJourney";

const STAGES = [
  { value: "", label: "All stages" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "awaiting_student", label: "Awaiting student" },
  { value: "orientation", label: "Orientation" },
  { value: "induction", label: "Induction" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];
const QUICK = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "awaiting_student", label: "Awaiting student" },
  { value: "scheduled", label: "Upcoming" },
  { value: "completed", label: "Completed" },
];

const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Every placement in the institution, filterable by stage, cohort and facility. */
export function CoordinatorPlacementRegister({
  user,
  onError,
  onOpen,
  onCreate,
  onOpenBatches,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onOpenBatches?: () => void;
}) {
  const { pushToast } = useToast();
  const [params, setParams] = useSearchParams();
  const state = params.get("state") ?? "";
  const cohort = params.get("cohort") ?? "";
  const facility = params.get("facility") ?? "";
  const page = Number(params.get("page") ?? "1") || 1;
  const [text, setText] = useState(params.get("q") ?? "");
  const search = params.get("q") ?? "";

  function patch(next: Record<string, string>) {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    if (!("page" in next)) copy.delete("page");
    setParams(copy, { replace: true });
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (text !== search) patch({ q: text });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const options = useQuery({ queryKey: ["placement-options"], queryFn: getPlacementOptions, staleTime: 5 * 60_000 });
  const list = useQuery({
    queryKey: ["coordinator-placements", page, search, state, cohort, facility],
    queryFn: () => getPlacements({ page, pageSize: 15, search, state, cohort, facility }),
    placeholderData: (previous) => previous,
  });
  const facilities = [...new Map((options.data?.wards ?? []).map((item) => [item.facility_id, item.facility_name])).entries()];
  const hasFilters = Boolean(search || state || cohort || facility);
  const rows: Placement[] = list.data?.results ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [listing, setListing] = useState(false);
  const canRequest = Boolean(user.capabilities.request_facility);
  const requestable = (row: Placement) => row.state === "draft" && !row.facility_id && !row.requested_facility_id;
  const withdrawable = (row: Placement) => row.state === "draft" && !row.facility_id && Boolean(row.requested_facility_id);
  const pickable = (row: Placement) => requestable(row) || withdrawable(row);
  const requestableRows = rows.filter(pickable);
  async function withdrawPicked() {
    const ids = rows.filter((row) => picked.includes(row.id) && withdrawable(row)).map((row) => row.id);
    try {
      const result = await withdrawFacilityRequests(ids);
      pushToast({ kind: "success", title: "Request withdrawn", message: `${result.withdrawn} student${result.withdrawn === 1 ? "" : "s"} no longer requested.` });
      setPicked([]);
      void list.refetch();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not withdraw that request.");
    }
  }
  const allPicked = requestableRows.length > 0 && requestableRows.every((row) => picked.includes(row.id));

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Institution register"
        title="Placements"
        description="Follow each student from cohort preparation to active placement. Open a row for its full record."
        actions={
          <>
            <AdminButton variant="secondary" size="sm" icon={<Download />} onClick={() => setListing(true)}>
              Allocation list
            </AdminButton>
            {onOpenBatches && (
              <AdminButton variant="secondary" size="sm" icon={<Layers />} onClick={onOpenBatches}>
                Batch activity
              </AdminButton>
            )}
            {user.capabilities.create_placement && (
              <AdminButton size="sm" icon={<Plus />} onClick={onCreate}>
                New placement
              </AdminButton>
            )}
          </>
        }
      />
      <AdminTabs label="Quick stage filter" tabs={QUICK} value={QUICK.some((q) => q.value === state) ? state : "__other"} onChange={(value) => patch({ state: value })} />
      <Toolbar filters={3}>
        <SearchField label="Search placements" placeholder="Search student, cohort or facility" value={text} onChange={setText} />
        <SelectField label="Stage" value={state} onChange={(value) => patch({ state: value })} options={STAGES} />
        <SelectField label="Cohort" value={cohort} onChange={(value) => patch({ cohort: value })} options={[{ value: "", label: "All cohorts" }, ...(options.data?.cohorts ?? []).map((item) => ({ value: item.id, label: item.name }))]} />
        {facilities.length > 1 && (
          <SelectField label="Facility" value={facility} onChange={(value) => patch({ facility: value })} options={[{ value: "", label: "All facilities" }, ...facilities.map(([id, name]) => ({ value: id, label: name }))]} />
        )}
      </Toolbar>

      {canRequest && picked.length > 0 && (
        <div className="pa-bulkbar" role="status" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <strong>{picked.length} selected</strong>
          {rows.some((row) => picked.includes(row.id) && requestable(row)) && (
            <AdminButton size="sm" icon={<Building2 />} onClick={() => setRequesting(true)}>Send to partner facilities</AdminButton>
          )}
          {rows.some((row) => picked.includes(row.id) && withdrawable(row)) && (
            <AdminButton variant="secondary" size="sm" onClick={() => void withdrawPicked()}>Withdraw request</AdminButton>
          )}
          <AdminButton variant="ghost" size="sm" onClick={() => setPicked([])}>Clear</AdminButton>
        </div>
      )}
      {list.isPending ? (
        <Skeleton className="h-72" />
      ) : list.isError ? (
        <PortalErrorState onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={hasFilters ? "No placements match" : "No placements yet"}
          text={hasFilters ? "Try another stage, cohort or search term." : "Create a placement from an enrolled student when your cohort is ready."}
          action={
            hasFilters ? (
              <AdminButton variant="secondary" size="sm" onClick={() => { setText(""); setParams({}, { replace: true }); }}>
                Clear filters
              </AdminButton>
            ) : user.capabilities.create_placement ? (
              <AdminButton size="sm" icon={<Plus />} onClick={onCreate}>
                New placement
              </AdminButton>
            ) : undefined
          }
        />
      ) : (
        <div className="pa-table-wrap" aria-busy={list.isFetching}>
          <div className="pa-table-scroll">
            <table className="pa-table">
              <caption className="sr-only">Institution placements</caption>
              <thead>
                <tr>
                  {canRequest && (
                    <th scope="col" style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="Select all draft placements on this page"
                        disabled={requestableRows.length === 0}
                        checked={allPicked}
                        onChange={() => setPicked(allPicked ? picked.filter((id) => !requestableRows.some((r) => r.id === id)) : [...new Set([...picked, ...requestableRows.map((r) => r.id)])])}
                      />
                    </th>
                  )}
                  <th scope="col">Student</th>
                  <th scope="col">Cohort</th>
                  <th scope="col">Facility · ward</th>
                  <th scope="col">Mentor</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Dates</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((placement) => (
                  <tr
                    key={placement.id}
                    className="is-clickable"
                    tabIndex={0}
                    onClick={() => onOpen(placement.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(placement.id);
                      }
                    }}
                  >
                    {canRequest && (
                      <td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        {pickable(placement) && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${placement.student?.name ?? "student"}`}
                            checked={picked.includes(placement.id)}
                            onChange={() => setPicked((cur) => (cur.includes(placement.id) ? cur.filter((id) => id !== placement.id) : [...cur, placement.id]))}
                          />
                        )}
                      </td>
                    )}
                    <td>
                      <div className="pa-cell-title">
                        <span>
                          <strong>{placement.student?.name ?? "Student pending"}</strong>
                          <small>{placement.student?.registration_number ?? placement.student?.email ?? ""}</small>
                        </span>
                      </div>
                    </td>
                    <td>{placement.cohort_name ?? "—"}</td>
                    <td>
                      {placement.facility_name ?? (placement.requested_facility_name ? `Requested: ${placement.requested_facility_name}` : "Not allocated")}
                      {!placement.facility_name && !placement.requested_facility_name && placement.declined_facility_name && (
                        <small className="pa-sub" style={{ color: "#a4572a" }}>Declined by {placement.declined_facility_name}: {placement.decline_reason}</small>
                      )}
                      {placement.ward?.name && <small className="pa-sub">{placement.ward.name}</small>}
                    </td>
                    <td>{placement.mentor?.name ?? <span className="pa-muted">Not assigned</span>}</td>
                    <td>
                      <StatusPill tone={placementStateTone(placement.state)}>{placementStateLabel(placement.state, "staff")}</StatusPill>
                    </td>
                    <td className="pa-nowrap">
                      {fmt(placement.planned_start)} – {fmt(placement.planned_end)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data && <ServerPager pagination={list.data.pagination} onPage={(next) => patch({ page: String(next) })} noun="placements" />}
        </div>
      )}
      <AllocationListModal canShare={Boolean(user.capabilities.share_allocation)} open={listing} onClose={() => setListing(false)} cohorts={(options.data?.cohorts ?? []).map((item) => ({ id: item.id, name: item.name }))} />
      <RequestFacilitiesModal
        open={requesting}
        onClose={() => { setRequesting(false); setPicked([]); }}
        placementIds={picked}
        facilities={facilities.map(([id, name]) => ({ id, name }))}
      />
    </AdminPage>
  );
}
