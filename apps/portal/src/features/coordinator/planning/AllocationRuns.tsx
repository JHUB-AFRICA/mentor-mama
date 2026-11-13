import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../../components/PortalErrorState";
import { listAllocationRuns, messageOf, type RunMode } from "../../../services/placement-planning";
import { AdminPage, AdminPageHeader, EmptyState, SelectField, StatusPill, Toolbar } from "../../programme-admin/ui/AdminKit";
import { MODE_LABEL, PLANNING_PATH, RUNS_PATH, RUN_STATUS, STRATEGY_LABEL, fmtDateTime } from "./planningUi";

/** Recent allocation runs (facility requests and ward/mentor arrangements) the person may read; each opens its result. */
export function AllocationRuns() {
  const [params, setParams] = useSearchParams();
  const mode = (params.get("mode") as RunMode | null) ?? "";
  const runs = useQuery({ queryKey: ["allocation-runs-list", mode], queryFn: () => listAllocationRuns(50, mode || undefined), staleTime: 15_000 });
  const rows = runs.data ?? [];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Placements"
        title="Allocation runs"
        description="Every time students were shared across facilities or arranged into wards and mentors, the result is kept here. Open one to see who was placed, who was not and why."
        actions={<Link className="pa-btn pa-btn--secondary pa-btn--sm" to={PLANNING_PATH}>Back to planning</Link>}
      />
      <Toolbar filters={1}>
        <SelectField
          label="Type of run"
          value={mode}
          onChange={(value) => setParams(value ? { mode: value } : {}, { replace: true })}
          options={[{ value: "", label: "All runs" }, { value: "facility_split", label: MODE_LABEL.facility_split }, { value: "auto_arrange", label: MODE_LABEL.auto_arrange }]}
        />
      </Toolbar>
      {runs.isPending ? (
        <Skeleton className="h-64" />
      ) : runs.isError ? (
        <PortalErrorState title="We couldn’t load the allocation runs" message={messageOf(runs.error, "Please try again.")} onRetry={() => void runs.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No allocation runs yet"
          text="When you request facilities for a cohort, the result is saved here."
          action={<Link className="pa-btn pa-btn--primary pa-btn--sm" to={PLANNING_PATH}>Plan the next cohort</Link>}
        />
      ) : (
        <div className="pa-table-wrap" aria-busy={runs.isFetching}>
          <div className="pa-table-scroll">
            <table className="pa-table pp-table">
              <caption className="sr-only">Recent allocation runs</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Run by</th>
                  <th scope="col">Type</th>
                  <th scope="col">Strategy</th>
                  <th scope="col">Placed or requested</th>
                  <th scope="col">Unplaced</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((run) => {
                  const state = RUN_STATUS[run.status] ?? { label: run.status, tone: "neutral" as const };
                  const placed = run.mode === "facility_split" ? (run.requested ?? 0) : run.arranged;
                  return (
                    <tr key={run.id}>
                      <td>
                        <Link to={`${RUNS_PATH}/${run.id}`}>
                          <strong>{fmtDateTime(run.created_at)}</strong>
                        </Link>
                      </td>
                      <td data-label="Run by">{run.by}</td>
                      <td data-label="Type">{MODE_LABEL[run.mode] ?? run.mode}{run.facility_name && <small className="pa-sub">{run.facility_name}</small>}</td>
                      <td data-label="Strategy">{STRATEGY_LABEL[run.strategy] ?? run.strategy}</td>
                      <td data-label={run.mode === "facility_split" ? "Requested" : "Placed"}>{placed}</td>
                      <td data-label="Unplaced">{run.unplaced}</td>
                      <td data-label="Status"><StatusPill tone={state.tone}>{state.label}</StatusPill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
