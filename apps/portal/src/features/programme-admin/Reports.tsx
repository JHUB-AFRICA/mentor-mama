import {
  Activity,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileText,
  HeartPulse,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  downloadExport,
  getDashboardIndicators,
  getDashboardSummary,
  getExports,
  getInterruptionReport,
  getPeople,
  getReportOverview,
  requestExport,
  type CurrentUser,
  type ExportFormat,
  type ExportRecord,
  type InterruptionReportRow,
  type ReportOverview,
} from "../../services/api";
import "./reports.css";

const chartColors = ["#9aa8b8", "#7190b5", "#e6aa38", "#b48a36", "#8b79d9", "#0b9696", "#d96a5f", "#42a77b", "#506176", "#945d5d"];
const reportTabs = [
  "Overview",
  "Placements",
  "Mentorship",
  "People",
  "Engagement",
  "Safeguarding",
  "Custom reports",
];
const reportTabSet = new Set(reportTabs);
function availableReportPeriods() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function Reports({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedPeriod = searchParams.get("period");
  const periods = availableReportPeriods();
  const tab =
    requestedTab && reportTabSet.has(requestedTab) ? requestedTab : "Overview";
  const period =
      requestedPeriod && periods.includes(requestedPeriod)
      ? requestedPeriod
      : periods[0];
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const range = periodRange(period);
  const indicators = useQuery({
    queryKey: ["dashboard-indicators"],
    queryFn: getDashboardIndicators,
  });
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  });
  const activeStudents = useQuery({
    queryKey: ["report-people", "student", "active"],
    queryFn: () =>
      getPeople({ page: 1, pageSize: 1, role: "student", status: "active" }),
  });
  const activeMentors = useQuery({
    queryKey: ["report-people", "mentor", "active"],
    queryFn: () =>
      getPeople({ page: 1, pageSize: 1, role: "mentor", status: "active" }),
  });
  const report = useQuery({
    enabled: tab === "Overview",
    queryKey: ["report-overview", period],
    queryFn: () => getReportOverview(range.from, range.to),
  });
  const interruptions = useQuery({
    queryKey: ["interruption-report"],
    queryFn: getInterruptionReport,
  });
  const exportsQuery = useQuery({ queryKey: ["exports"], queryFn: getExports });
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const periodSelectionPending = useRef(false);
  const values = indicators.data?.indicators ?? {};
  const reportError =
    indicators.error ||
    summary.error ||
    activeStudents.error ||
    activeMentors.error ||
    (tab === "Overview" ? report.error : null) ||
    interruptions.error ||
    exportsQuery.error;
  const statusData = [
    { name: "Draft", value: values.placements_draft ?? 0 },
    { name: "Scheduled", value: values.placements_scheduled ?? 0 },
    {
      name: "Awaiting student",
      value: values.placements_awaiting_student ?? 0,
    },
    { name: "Orientation", value: values.placements_orientation ?? 0 },
    { name: "Induction", value: values.placements_induction ?? 0 },
    { name: "Active", value: values.placements_active ?? 0 },
    { name: "Paused", value: values.placements_paused ?? 0 },
    { name: "Completed", value: values.placements_completed ?? 0 },
    { name: "Archived", value: values.placements_archived ?? 0 },
    { name: "Withdrawn", value: values.placements_withdrawn ?? 0 },
  ].filter((item) => item.value > 0);
  const totalPlacements =
    values.placements_total ??
    statusData.reduce((sum, item) => sum + item.value, 0);
  useEffect(() => {
    if (!periodSelectionPending.current || tab !== "Overview") return;
    if (report.isFetching) return;
    if (report.isError) {
      periodSelectionPending.current = false;
      pushToast({ kind: "error", title: "Could not load this period", message: "Try selecting the period again." });
    } else if (report.data) {
      periodSelectionPending.current = false;
      pushToast({ kind: "success", title: "Report updated", message: `Showing recorded activity for ${range.label}.` });
    }
  }, [period, range.label, report.data, report.isError, report.isFetching, tab, pushToast]);
  function selectTab(nextTab: string) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set("tab", nextTab);
        return params;
      },
      { replace: true },
    );
  }
  async function refreshReport() {
    try {
      const results = await Promise.all([
        indicators.refetch(),
        summary.refetch(),
        activeStudents.refetch(),
        activeMentors.refetch(),
        report.refetch(),
        interruptions.refetch(),
        exportsQuery.refetch(),
      ]);
      const failed = results.find((result) => result.isError);
      if (failed?.error) throw failed.error;
      pushToast({
        kind: "success",
        title: "Report refreshed",
        message: "The programme report is up to date.",
      });
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not refresh this report.",
      );
    }
  }
  async function createExport(format = exportFormat) {
    setBusy(true);
    try {
      await requestExport(
        "placements",
        { from: range.from, to: range.to },
        format,
      );
      setShowExportDialog(false);
      await queryClient.invalidateQueries({ queryKey: ["exports"] });
      pushToast({
        kind: "success",
        title: "Export requested",
        message: `Your ${format.toUpperCase()} placement report will appear in Recent reports.`,
      });
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not request the placement export.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(record: ExportRecord) {
    setDownloadingId(record.id);
    try {
      const blob = await downloadExport(record);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mentormama-${record.export_type}-${record.id}.${record.format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pushToast({
        kind: "success",
        title: "Download ready",
        message: "The report has been saved to your downloads.",
      });
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not download this report.",
      );
    } finally {
      setDownloadingId(null);
    }
  }
  return (
    <div className="programme-reports-page">
      <section className="programme-reports-header">
        <div>
          <p className="programme-reports-eyebrow">Programme intelligence</p>
          <h1>Reports</h1>
          <p>
            Track progress, understand continuity, and make decisions from the
            programme record.
          </p>
        </div>
        <div className="programme-reports-header-actions">
          <label className="programme-reports-period">
            <span className="sr-only">Reporting period</span>
            <select
              value={period}
              onChange={(event) => {
                const nextPeriod = event.target.value;
                setSearchParams(
                  (current) => {
                    const params = new URLSearchParams(current);
                    params.set("period", nextPeriod);
                    return params;
                  },
                  { replace: true },
                );
                periodSelectionPending.current = true;
              }}
            >
              {periods.map((value) => (
                <option key={value} value={value}>{periodLabel(value)}</option>
              ))}
            </select>
          </label>
          {user.capabilities.export_reports && (
            <Button onClick={() => setShowExportDialog(true)} disabled={busy}>
              <Download size={16} />
              {busy ? "Preparing…" : "Export report"}
            </Button>
          )}
        </div>
      </section>
      <nav
        className="programme-reports-tabs"
        role="tablist"
        aria-label="Report sections"
      >
        {reportTabs.map((item) => (
          <button
            key={item}
            id={`report-tab-${item.toLowerCase().replaceAll(" ", "-")}`}
            role="tab"
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            type="button"
            className={tab === item ? "active" : ""}
            onClick={() => selectTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {reportError ? (
        <ReportError onRetry={() => void refreshReport()} />
      ) : tab !== "Overview" ? (
        <ReportSection
          tab={tab}
          values={values}
          summary={summary.data}
          interruptions={interruptions.data ?? []}
          exports={exportsQuery.data ?? []}
          loading={
            interruptions.isPending || indicators.isPending || summary.isPending
          }
          onExport={() => void createExport()}
        />
      ) : (
        <>
          <section className="programme-report-kpis">
            <ReportKpi
              icon={<Users />}
              label="Active students"
              value={activeStudents.isPending ? "—" : activeStudents.data?.pagination.total_count ?? 0}
              detail="In the programme workspace"
              tone="teal"
            />
            <ReportKpi
              icon={<BriefcaseBusiness />}
              label="Active placements"
              value={indicators.isPending ? "—" : values.placements_active ?? 0}
              detail={`${values.placements_total ?? 0} total placements`}
              tone="amber"
            />
            <ReportKpi
              icon={<Users />}
              label="Active mentors"
              value={activeMentors.isPending ? "—" : activeMentors.data?.pagination.total_count ?? 0}
              detail="Active mentor accounts"
              tone="blue"
            />
            <ReportKpi
              icon={<CheckCircle2 />}
              label="Placements completed"
              value={indicators.isPending ? "—" : values.placements_completed ?? 0}
              detail={indicators.isPending ? "Loading placement totals…" : `${values.placements_completed ?? 0} of ${values.placements_total ?? 0} placements across all lifecycle states`}
              tone="violet"
            />
          </section>
          <section className="programme-report-period-card programme-report-card">
            <ReportCardHeading
              title="Period activity"
              detail={`${range.label} compared with the previous period`}
            />
            {report.isPending ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="programme-report-period-grid">
                <PeriodMetric
                  label="New placements"
                  value={report.data?.summary.placements_created ?? 0}
                  change={report.data?.comparisons.placements_created ?? null}
                />
                <PeriodMetric
                  label="Completed"
                  value={report.data?.summary.placements_completed ?? 0}
                  change={report.data?.comparisons.placements_completed ?? null}
                />
                <PeriodMetric
                  label="Sessions logged"
                  value={report.data?.summary.sessions_logged ?? 0}
                  change={report.data?.comparisons.sessions_logged ?? null}
                />
                <PeriodMetric
                  label="Activity events"
                  value={report.data?.summary.activity_events ?? 0}
                  change={report.data?.comparisons.activity_events ?? null}
                />
              </div>
            )}
          </section>
          <section className="programme-report-chart-grid">
            <article className="programme-report-card programme-report-status-card">
              <ReportCardHeading
                title="Placements by status"
                detail="Current lifecycle distribution"
              />
              <div className="programme-report-donut-layout">
                {statusData.length ? (
                  <div className="programme-report-donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="64%"
                          outerRadius="88%"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {statusData.map((item, index) => (
                            <Cell
                              key={item.name}
                              fill={chartColors[index % chartColors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${value}`, "placements"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <strong>
                      {totalPlacements}
                      <span>placements</span>
                    </strong>
                  </div>
                ) : (
                  <EmptyReport
                    title="No placement data yet"
                    detail="Lifecycle distribution will appear after placements are recorded."
                  />
                )}
                {statusData.length > 0 && (
                  <div className="programme-report-legend">
                    {statusData.map((item, index) => (
                      <div key={item.name}>
                        <span
                          style={{
                            background: chartColors[index % chartColors.length],
                          }}
                        />
                        {item.name}
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
            <article className="programme-report-card">
              <ReportCardHeading
                title="Daily programme activity"
                detail={`Recorded activity during ${range.label}`}
              />
              {report.isPending ? (
                <Skeleton className="h-52" />
              ) : report.data?.trend.some((point) => point.placements_created || point.sessions_logged || point.placements_completed) ? (
                <ReportTrend data={report.data} />
              ) : (
                <div className="programme-report-chart-empty">
                  <span className="programme-report-empty-line" />
                  <strong>No activity recorded for this period</strong>
                  <p>
                    Daily placement and mentorship activity will appear here when recorded.
                  </p>
                </div>
              )}
            </article>
          </section>
          <section className="programme-report-lower-grid">
            <article className="programme-report-card">
              <ReportCardHeading
                title="Recent reports"
                action="Refresh"
                onAction={() =>
                  void queryClient.invalidateQueries({ queryKey: ["exports"] })
                }
              />
              {exportsQuery.isPending ? (
                <Skeleton className="h-24" />
              ) : exportsQuery.data?.length ? (
                <div className="programme-report-list">
                  {exportsQuery.data.slice(0, 4).map((item) => (
                    <div key={item.id}>
                      <FileText size={16} />
                      <span>
                        <strong>{item.export_type} report</strong>
                        <small>
                          {item.status} ·{" "}
                          {new Date(item.created_at).toLocaleDateString(
                            "en-GB",
                          )}
                        </small>
                      </span>
                      {item.download_url && (
                        <button
                          type="button"
                          disabled={downloadingId === item.id}
                          onClick={() => void download(item)}
                        >
                          {downloadingId === item.id ? "…" : "Download"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyReport
                  title="No reports generated"
                  detail="Request an export when you need a safe programme snapshot."
                />
              )}
            </article>
            <article className="programme-report-card">
              <ReportCardHeading
                title="Programme signals"
                action="Refresh"
                onAction={() => void refreshReport()}
              />
              {indicators.isPending || summary.isPending ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="programme-report-signal-list">
                  <Signal
                    label="Facilities"
                    value={summary.data?.readiness.facilities ?? 0}
                  />
                  <Signal
                    label="Wards"
                    value={summary.data?.readiness.wards ?? 0}
                  />
                  <Signal
                    label="Pending setup"
                    value={
                      summary.data?.readiness.placements_missing_setup ?? 0
                    }
                  />
                  <Signal
                    label="Unassigned placements"
                    value={summary.data?.readiness.unassigned_placements ?? 0}
                  />
                </div>
              )}
            </article>
          </section>
          <section className="programme-report-card programme-report-interruptions">
            <ReportCardHeading
              title="Continuity needs attention"
              detail="Pause patterns in your programme scope"
              action="View safeguarding"
              onAction={() => selectTab("Safeguarding")}
            />
            {interruptions.isPending ? (
              <Skeleton className="h-24" />
            ) : interruptions.data?.length ? (
              <ReportTable rows={interruptions.data} />
            ) : (
              <EmptyReport
                title="No interruptions recorded"
                detail="The programme has no continuity interruptions to review."
              />
            )}
          </section>
        </>
      )}
      {showExportDialog && (
        <ExportDialog
          format={exportFormat}
          busy={busy}
          onFormatChange={setExportFormat}
          onClose={() => setShowExportDialog(false)}
          onExport={() => void createExport()}
        />
      )}
    </div>
  );
}

function ExportDialog({
  format,
  busy,
  onFormatChange,
  onClose,
  onExport,
}: {
  format: ExportFormat;
  busy: boolean;
  onFormatChange: (format: ExportFormat) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);
  return (
    <div
      className="programme-report-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="programme-report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
      >
        <div className="programme-report-modal-header">
          <div>
            <p className="programme-reports-eyebrow">Export report</p>
            <h2 id="export-dialog-title">Create a placement report</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close export dialog"
          >
            ×
          </button>
        </div>
        <p className="programme-report-section-intro">
          Choose the format that fits your next step. The export remains scoped
          to your programme permissions.
        </p>
        <label className="programme-report-format-label">
          File format
          <select
            value={format}
            onChange={(event) =>
              onFormatChange(event.target.value as ExportFormat)
            }
          >
            <option value="xlsx">Excel workbook (.xlsx)</option>
            <option value="pdf">Printable PDF (.pdf)</option>
            <option value="csv">Spreadsheet data (.csv)</option>
            <option value="json">Structured data (.json)</option>
          </select>
        </label>
        <div className="programme-report-format-help">
          <strong>
            {format === "pdf"
              ? "Best for sharing and printing"
              : format === "xlsx"
                ? "Best for analysis in Excel"
                : format === "json"
                  ? "Best for system-to-system use"
                  : "Best for lightweight spreadsheet imports"}
          </strong>
          <p>
            Generation runs in the background and the completed file will be
            available in Recent reports.
          </p>
        </div>
        <div className="programme-report-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <Button onClick={onExport} disabled={busy}>
            {busy ? "Preparing…" : "Create export"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function ReportSection({
  tab,
  values,
  summary,
  interruptions,
  exports,
  loading,
  onExport,
}: {
  tab: string;
  values: Record<string, number>;
  summary?: {
    people_total: number;
    active_people: number;
    invited_people: number;
    suspended_people: number;
    activity_events: number;
    readiness: {
      active_coordinators: number;
      active_nurse_managers: number;
      facilities: number;
      wards: number;
      unassigned_placements: number;
      placements_missing_setup: number;
    };
  };
  interruptions: InterruptionReportRow[];
  exports: ExportRecord[];
  loading: boolean;
  onExport: () => void;
}) {
  if (loading)
    return (
      <section className="programme-report-card programme-report-section">
        <Skeleton className="h-28" />
      </section>
    );
  if (tab === "Placements")
    return (
      <ReportSectionShell
        eyebrow={tab}
        title="Placements reporting"
        intro="Lifecycle distribution and continuity signals for placements in your programme scope."
      >
        <ReportMetricGrid
          items={[
            {
              icon: <BriefcaseBusiness />,
              label: "Total placements",
              value: values.placements_total ?? 0,
              tone: "teal",
            },
            {
              icon: <Activity />,
              label: "Active",
              value: values.placements_active ?? 0,
              tone: "blue",
            },
            {
              icon: <Users />,
              label: "Awaiting student",
              value: values.placements_awaiting_student ?? 0,
              tone: "amber",
            },
            {
              icon: <CheckCircle2 />,
              label: "Completed",
              value: values.placements_completed ?? 0,
              tone: "violet",
            },
          ]}
        />
        <ReportStageList values={values} />
        {interruptions.length ? (
          <ReportTable rows={interruptions} showCohort />
        ) : (
          <EmptyReport
            title="No continuity interruptions"
            detail="There are no placement interruption records in this reporting scope."
          />
        )}
      </ReportSectionShell>
    );
  if (tab === "People")
    return (
      <ReportSectionShell
        eyebrow={tab}
        title="People reporting"
        intro="Current participation and operational staffing across the programme workspace."
      >
        <ReportMetricGrid
          items={[
            {
              icon: <Users />,
              label: "People in programme",
              value: summary?.people_total ?? values.people_total ?? 0,
              tone: "teal",
            },
            {
              icon: <CheckCircle2 />,
              label: "Active people",
              value: summary?.active_people ?? 0,
              tone: "blue",
            },
            {
              icon: <Activity />,
              label: "Invitations pending",
              value: summary?.invited_people ?? 0,
              tone: "amber",
            },
            {
              icon: <ShieldCheck />,
              label: "Suspended",
              value: summary?.suspended_people ?? 0,
              tone: "violet",
            },
          ]}
        />
        <div className="programme-report-detail-grid">
          <Signal
            label="Active coordinators"
            value={summary?.readiness.active_coordinators ?? 0}
          />
          <Signal
            label="Active nurse managers"
            value={summary?.readiness.active_nurse_managers ?? 0}
          />
          <Signal
            label="Activity events"
            value={summary?.activity_events ?? 0}
          />
        </div>
      </ReportSectionShell>
    );
  if (tab === "Mentorship")
    return (
      <ReportSectionShell
        eyebrow={tab}
        title="Mentorship reporting"
        intro="Mentorship activity recorded against placements in your programme scope."
      >
        <ReportMetricGrid
          items={[
            {
              icon: <HeartPulse />,
              label: "Sessions logged",
              value: values.sessions_total ?? 0,
              tone: "teal",
            },
            {
              icon: <Activity />,
              label: "Sessions this week",
              value: values.sessions_this_week ?? 0,
              tone: "blue",
            },
            {
              icon: <BriefcaseBusiness />,
              label: "Active placements",
              value: values.placements_active ?? 0,
              tone: "violet",
            },
          ]}
        />
        <EmptyReport
          title={
            values.sessions_total
              ? "Session activity is available"
              : "No mentorship sessions yet"
          }
          detail={
            values.sessions_total
              ? "Session totals are sourced from the mentorship activity record."
              : "Mentorship insights will appear after mentors log sessions."
          }
        />
      </ReportSectionShell>
    );
  if (tab === "Safeguarding")
    return (
      <ReportSectionShell
        eyebrow={tab}
        title="Safeguarding reporting"
        intro="Operational safeguarding counts are shown without exposing restricted concern narratives."
      >
        <ReportMetricGrid
          items={[
            {
              icon: <ShieldCheck />,
              label: "Open concerns",
              value: values.open_concerns ?? 0,
              tone: "teal",
            },
            {
              icon: <TriangleAlert />,
              label: "High priority",
              value: values.high_concerns ?? 0,
              tone: "amber",
            },
            {
              icon: <Activity />,
              label: "Medium priority",
              value: values.medium_concerns ?? 0,
              tone: "blue",
            },
            {
              icon: <CheckCircle2 />,
              label: "Low priority",
              value: values.low_concerns ?? 0,
              tone: "violet",
            },
          ]}
        />
        <EmptyReport
          title="Safeguarding case details stay protected"
          detail="This report shows aggregate counts only. Use the safeguarding workspace for authorised case follow-up. Placement interruption records are listed under Placements."
        />
      </ReportSectionShell>
    );
  if (tab === "Engagement")
    return (
      <ReportSectionShell
        eyebrow={tab}
        title="Engagement reporting"
        intro="Operational engagement signals from recorded programme activity and mentorship sessions."
      >
        <ReportMetricGrid
          items={[
            {
              icon: <Activity />,
              label: "Activity events",
              value: summary?.activity_events ?? 0,
              tone: "teal",
            },
            {
              icon: <HeartPulse />,
              label: "Sessions logged",
              value: values.sessions_total ?? 0,
              tone: "blue",
            },
            {
              icon: <Users />,
              label: "Active people",
              value: summary?.active_people ?? 0,
              tone: "violet",
            },
          ]}
        />
        <EmptyReport
          title="Operational engagement is available"
          detail="These counters are live programme signals. Historical engagement trends require a time-series analytics projection."
        />
      </ReportSectionShell>
    );
  if (tab === "Custom reports")
    return (
      <ReportSectionShell
        eyebrow={tab}
        title="Custom reports"
        intro="Generate a scoped placement snapshot or review exports already requested for this programme."
      >
        <div className="programme-report-custom-action">
          <div>
            <strong>Placement snapshot</strong>
            <p>Export the programme-scoped placement record as CSV, XLSX, JSON, or PDF.</p>
          </div>
          <Button onClick={onExport}>
            <Download size={16} />
            Create export
          </Button>
        </div>
        {exports.length ? (
          <div className="programme-report-list">
            {exports.slice(0, 5).map((item) => (
              <div key={item.id}>
                <FileText size={16} />
                <span>
                  <strong>{item.export_type} report</strong>
                  <small>
                    {item.status} ·{" "}
                    {new Date(item.created_at).toLocaleDateString("en-GB")}
                  </small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyReport
            title="No custom exports yet"
            detail="Create a placement snapshot when you need a portable programme report."
          />
        )}
      </ReportSectionShell>
    );
  return (
    <ReportSectionShell
      eyebrow={tab}
      title={`${tab} reporting`}
      intro="This view is scoped to the programme data currently available to your role."
    >
      <EmptyReport
        title={`${tab} reporting is ready for expansion`}
        detail="The current programme read model does not expose this report yet. No placeholder metrics are shown."
      />
    </ReportSectionShell>
  );
}
function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <PortalErrorState
      title="We couldn’t load the programme reports"
      message="The latest programme reporting data is temporarily unavailable. This might be due to a connection issue or scheduled maintenance."
      onRetry={onRetry}
    />
  );
}
function periodRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${period}-01`,
    to: `${period}-${String(lastDay).padStart(2, "0")}`,
    label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    }),
  };
}
function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function PeriodMetric({
  label,
  value,
  change,
}: {
  label: string;
  value: number | string;
  change: number | null;
}) {
  return (
    <div className="programme-report-period-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {change === null ? (
        <small>{value === 0 ? "No activity in the previous period" : "No previous activity to compare"}</small>
      ) : (
        <small className={change >= 0 ? "positive" : "negative"}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change)}% vs previous
        </small>
      )}
    </div>
  );
}
function ReportTrend({ data }: { data: ReportOverview }) {
  return (
    <div
      className="programme-report-trend"
      role="img"
      aria-label="Daily report trend for new placements, mentorship sessions, and completed placements"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.trend}>
          <CartesianGrid stroke="#e5ebf1" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => date.slice(8)}
            tick={{ fontSize: 10, fill: "#607392" }}
          />
          <YAxis
            allowDecimals={false}
            width={24}
            tick={{ fontSize: 10, fill: "#607392" }}
          />
          <Tooltip labelFormatter={(date) => String(date)} />
          <Line
            type="monotone"
            dataKey="placements_created"
            name="New placements"
            stroke="#0b9696"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="sessions_logged"
            name="Sessions"
            stroke="#3479ca"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="placements_completed"
            name="Completed"
            stroke="#7958c9"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function ReportSectionShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section className="programme-report-card programme-report-section">
      <p className="programme-reports-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="programme-report-section-intro">{intro}</p>
      {children}
    </section>
  );
}
function ReportMetricGrid({
  items,
}: {
  items: { icon: ReactNode; label: string; value: number; tone: string }[];
}) {
  return (
    <div className="programme-report-section-metrics">
      {items.map((item) => (
        <ReportKpi key={item.label} {...item} detail="Programme scope" />
      ))}
    </div>
  );
}
function ReportStageList({ values }: { values: Record<string, number> }) {
  const stages = [
    { label: "Scheduled", value: values.placements_scheduled ?? 0 },
    { label: "Orientation", value: values.placements_induction ?? 0 },
    {
      label: "Awaiting student",
      value: values.placements_awaiting_student ?? 0,
    },
    { label: "Active", value: values.placements_active ?? 0 },
    { label: "Completed", value: values.placements_completed ?? 0 },
  ];
  return (
    <div className="programme-report-stage-list">
      {stages.map((stage) => (
        <div key={stage.label}>
          <span>{stage.label}</span>
          <strong>{stage.value}</strong>
          <div>
            <i
              style={{
                width: `${Math.min(100, stage.value ? Math.max(8, (stage.value / Math.max(values.placements_total ?? 1, 1)) * 100) : 0)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function ReportTable({
  rows,
  showCohort = false,
}: {
  rows: InterruptionReportRow[];
  showCohort?: boolean;
}) {
  return (
    <div className="programme-report-table-wrap">
      <table>
        <caption className="sr-only">Programme interruption report</caption>
        <thead>
          <tr>
            <Th>Facility</Th>
            {showCohort && <Th>Cohort</Th>}
            <Th>Reason</Th>
            <Th>Interruptions</Th>
            <Th>Days</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={`${row.facility_id}-${row.cohort_id}-${row.reason}`}>
              <Td>{row.facility_name}</Td>
              {showCohort && <Td>{row.cohort_name}</Td>}
              <Td>{row.reason.replaceAll("_", " ")}</Td>
              <Td>{row.interruptions}</Td>
              <Td>{row.days_interrupted}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ReportKpi({
  icon,
  label,
  value,
  suffix,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  suffix?: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={`programme-report-kpi programme-report-kpi--${tone}`}>
      <span className="programme-report-kpi-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>
          {value}
          {suffix}
        </strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
function ReportCardHeading({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="programme-report-card-heading">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action && (
        <button type="button" onClick={onAction}>
          {action} <span>→</span>
        </button>
      )}
    </div>
  );
}
function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function EmptyReport({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="programme-report-empty">
      <TriangleAlert size={18} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Th({ children }: { children: ReactNode }) {
  return <th>{children}</th>;
}
function Td({ children }: { children: ReactNode }) {
  return <td>{children}</td>;
}
