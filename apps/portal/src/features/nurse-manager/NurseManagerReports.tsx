import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Download,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  downloadExport,
  getDashboardIndicators,
  getExports,
  getInterruptionReport,
  requestExport,
  type CurrentUser,
  type ExportRecord,
} from "../../services/api";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { ApprovedFeedbackPanel } from "../assessments/ApprovedFeedbackPanel";
import { AnonymousFeedbackReport } from "../assessments/AnonymousFeedbackReport";
import { TablePagination } from "../../components/TablePagination";

export function NurseManagerReports({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const indicators = useQuery({
    queryKey: ["manager-report-indicators"],
    queryFn: getDashboardIndicators,
    staleTime: 60_000,
  });
  const interruptions = useQuery({
    queryKey: ["manager-report-interruptions"],
    queryFn: getInterruptionReport,
    staleTime: 60_000,
  });
  const exportsQuery = useQuery({
    queryKey: ["manager-report-exports"],
    queryFn: getExports,
    refetchInterval: 5000,
  });
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [exportPage, setExportPage] = useState(1);
  const exportPageSize = 5;
  const values = indicators.data?.indicators ?? {};
  const total = values.placements_total ?? 0;
  const preparing = Math.max(
    total -
      (values.placements_awaiting_student ?? 0) -
      (values.placements_induction ?? 0) -
      (values.placements_active ?? 0) -
      (values.placements_completed ?? 0),
    0,
  );
  const refresh = () =>
    void Promise.all([
      indicators.refetch(),
      interruptions.refetch(),
      exportsQuery.refetch(),
    ]);
  const nav = (destination: string) =>
    navigate(
      destination === "overview"
        ? "/facility"
        : destination === "placements"
          ? "/placements"
          : `/facility/${destination}`,
    );

  async function createExport() {
    setExporting(true);
    try {
      await requestExport("placements");
      setExportPage(1);
      await exportsQuery.refetch();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not prepare the facility export.",
      );
    } finally {
      setExporting(false);
    }
  }
  async function download(record: ExportRecord) {
    setDownloading(record.id);
    try {
      const blob = await downloadExport(record);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mentormama-facility-placements-${record.id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not download this report.",
      );
    } finally {
      setDownloading(null);
    }
  }
  return (
    <FacilityWorkspaceFrame
      user={user}
      active="reports"
      title="Reports"
      onNavigate={nav}
      onAccount={() => navigate("/facility/account")}
      onError={onError}
    >
      <main className="mx-auto w-full min-w-0 max-w-6xl space-y-7 pb-10">
        <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
              Facility intelligence · your scope
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">
              Operational reports
            </h1>
            <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">
              Understand placement flow, interruptions, and workload so your
              next facility decision is grounded in what is happening now.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 font-body text-sm font-bold text-teal hover:bg-teal-light sm:self-auto"
          >
            <RefreshCw size={16} aria-hidden="true" /> Refresh report
          </button>
        </header>
        <section className="rounded-3xl bg-navy p-6 text-white shadow-[0_16px_36px_rgba(8,25,53,0.12)] sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal-bright">
                Manager view
              </p>
              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
                Is the facility moving students forward?
              </h2>
              <p className="mt-3 max-w-xl font-body text-sm leading-6 text-slate-300">
                Use this snapshot to spot stalled handoffs, monitor completion,
                and decide where operational attention is needed.
              </p>
            </div>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-teal-bright">
              <BarChart3 size={27} aria-hidden="true" />
            </span>
          </div>
        </section>
        {indicators.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : indicators.isError ? (
          <ReportError onRetry={() => void indicators.refetch()} />
        ) : (
          <section
            aria-label="Facility report summary"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Metric
              label="Placement handoffs"
              value={total}
              detail="In your facility scope"
              icon={<Users size={18} />}
            />
            <Metric
              label="Preparing"
              value={preparing}
              detail="Needs setup or release"
              icon={<BarChart3 size={18} />}
            />
            <Metric
              label="Active"
              value={values.placements_active ?? 0}
              detail="Currently on the ward"
              icon={<CheckCircle2 size={18} />}
              tone="teal"
            />
            <Metric
              label="Completed"
              value={values.placements_completed ?? 0}
              detail="Finished journeys"
              icon={<CheckCircle2 size={18} />}
            />
          </section>
        )}
        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
          <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                  Placement pipeline
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-navy">
                  Where work is sitting
                </h2>
                <p className="mt-1 font-body text-sm text-navy-muted">
                  A simple view of the facility handoff journey.
                </p>
              </div>
              <button
                type="button"
                onClick={() => nav("placements")}
                className="font-body text-sm font-bold text-teal hover:underline"
              >
                Open register
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <Pipeline
                label="Preparing"
                value={preparing}
                total={total}
                tone="bg-navy"
              />
              <Pipeline
                label="Awaiting student"
                value={values.placements_awaiting_student ?? 0}
                total={total}
                tone="bg-warning"
              />
              <Pipeline
                label="Induction"
                value={values.placements_induction ?? 0}
                total={total}
                tone="bg-teal"
              />
              <Pipeline
                label="Active"
                value={values.placements_active ?? 0}
                total={total}
                tone="bg-teal-dark"
              />
              <Pipeline
                label="Completed"
                value={values.placements_completed ?? 0}
                total={total}
                tone="bg-[#7c8da8]"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-teal/20 bg-[#edf8f7] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white text-teal">
                <CalendarClock size={19} />
              </span>
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                  Operational signal
                </p>
                <h2 className="mt-2 font-display text-xl font-bold text-navy">
                  Interruptions
                </h2>
              </div>
            </div>
            <p className="mt-4 font-body text-sm leading-6 text-navy-muted">
              Understand pause reasons and elapsed days before a stalled
              placement becomes a safeguarding or completion concern.
            </p>
            {interruptions.isPending ? (
              <Skeleton className="mt-5 h-16 rounded-xl" />
            ) : interruptions.isError ? (
              <p className="mt-5 rounded-xl bg-error/5 px-4 py-3 font-body text-sm text-error">
                Interruption data is unavailable.
              </p>
            ) : interruptions.data?.length ? (
              <div className="mt-5 space-y-2">
                {interruptions.data.slice(0, 4).map((row) => (
                  <div
                    key={`${row.facility_id}-${row.cohort_id}-${row.reason}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-body text-sm font-bold text-navy">
                        {row.reason.replaceAll("_", " ")}
                      </span>
                      <span className="block truncate font-body text-xs text-navy-muted">
                        {row.cohort_name}
                      </span>
                    </span>
                    <span className="shrink-0 font-body text-xs font-bold text-teal">
                      {row.days_interrupted} days
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-white px-4 py-3 font-body text-sm text-navy-muted">
                No recorded interruptions in this facility.
              </p>
            )}
          </div>
        </section>
        <ApprovedFeedbackPanel user={user} />
        <AnonymousFeedbackReport />
        {user.capabilities.export_reports && (
          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                  Take the report with you
                </p>
                <h2 className="mt-2 font-display text-xl font-bold text-navy">
                  Facility placement export
                </h2>
                <p className="mt-1 font-body text-sm text-navy-muted">
                  Generate a CSV containing only records in your facility scope.
                </p>
              </div>
              <Button
                size="sm"
                disabled={exporting}
                onClick={() => void createExport()}
              >
                <Download size={15} className="mr-2" aria-hidden="true" />
                {exporting ? "Preparing…" : "Prepare CSV"}
              </Button>
            </div>
            {exportsQuery.data?.length ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left">
                  <caption className="sr-only">Recent facility exports</caption>
                  <thead className="border-b border-border">
                    <tr className="font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
                      <th className="px-3 py-3">Created</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Rows</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {exportsQuery.data.slice((exportPage - 1) * exportPageSize, exportPage * exportPageSize).map((record) => (
                      <tr key={record.id}>
                        <td className="px-3 py-3 font-body text-sm text-navy">
                          {new Date(record.created_at).toLocaleString("en-GB")}
                        </td>
                        <td className="px-3 py-3 font-body text-sm capitalize text-navy-muted">
                          {record.status}
                        </td>
                        <td className="px-3 py-3 text-right font-body text-sm text-navy">
                          {record.row_count}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {record.download_url && (
                            <button
                              type="button"
                              onClick={() => void download(record)}
                              disabled={downloading === record.id}
                              className="font-body text-sm font-bold text-teal hover:underline"
                            >
                              {downloading === record.id
                                ? "Downloading…"
                                : "Download"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TablePagination page={exportPage} totalPages={Math.ceil(exportsQuery.data.length / exportPageSize)} totalCount={exportsQuery.data.length} pageSize={exportPageSize} onPage={setExportPage} />
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">
                No exports created yet.
              </p>
            )}
          </section>
        )}
      </main>
    </FacilityWorkspaceFrame>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone?: "default" | "teal";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${tone === "teal" ? "border-teal/20 bg-[#edf8f7]" : "border-border bg-white"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-teal-light text-teal">
          {icon}
        </span>
        <span className="font-display text-3xl font-bold tabular-nums text-navy">
          {value}
        </span>
      </div>
      <p className="mt-4 font-body text-sm font-bold text-navy">{label}</p>
      <p className="mt-1 font-body text-xs text-navy-muted">{detail}</p>
    </div>
  );
}
function Pipeline({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  return (
    <div>
      <div className="flex justify-between gap-3 font-body text-sm">
        <span className="font-semibold text-navy">{label}</span>
        <span className="font-bold text-navy">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{
            width: `${total ? Math.min((value / total) * 100, 100) : 0}%`,
          }}
        />
      </div>
    </div>
  );
}
function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error"
    >
      We could not load the facility report.
      <button
        type="button"
        onClick={onRetry}
        className="ml-2 font-bold underline"
      >
        Try again
      </button>
    </div>
  );
}
