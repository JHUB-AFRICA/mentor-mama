import {
  Activity,
  BedDouble,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  CheckCircle2,
  Download,
  FileText,
  HeartPulse,
  Info,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid,
  Cell,
  Legend,
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
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  ListRow,
  Notice,
  SelectField,
  StatCard,
  StatGrid,
  StatusPill,
  type PillTone,
  type Tone,
} from "./ui/AdminKit";
import "./reports.css";
import "./programme-overlays.css";
import { Field, Modal, SelectInput } from "../../components/kit";

const chartColors = ["#1d8c8c", "#7653d4", "#236bd4", "#b26b00", "#4b5f7c", "#5fb3b3", "#a58de3", "#6b9be3", "#e0a64a", "#94a3b8"];
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

  const periodOptions = periods.map((value) => ({ value, label: periodLabel(value) }));
  const loadingOverview = report.isPending;

  return (
    <AdminPage className="programme-reports-page">
      <AdminPageHeader
        eyebrow="Programme intelligence"
        title="Reports"
        description="Track progress, understand continuity, and make decisions from the programme record."
        actions={
          <>
            <SelectField
              label="Reporting period"
              value={period}
              options={periodOptions}
              onChange={(nextPeriod) => {
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
            />
            {user.capabilities.export_reports && (
              <AdminButton
                onClick={() => setShowExportDialog(true)}
                disabled={busy}
                icon={<Download aria-hidden="true" />}
              >
                {busy ? "Preparing…" : "Export report"}
              </AdminButton>
            )}
          </>
        }
      />
      <AdminTabs
        label="Report sections"
        tabs={reportTabs.map((item) => ({ value: item, label: item }))}
        value={tab}
        onChange={selectTab}
      />
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
          <StatGrid>
            <StatCard
              tone="teal"
              icon={<Users />}
              value={activeStudents.data?.pagination.total_count ?? 0}
              loading={activeStudents.isPending}
              label="Active students"
              hint="In the programme workspace"
            />
            <StatCard
              tone="amber"
              icon={<BriefcaseBusiness />}
              value={values.placements_active ?? 0}
              loading={indicators.isPending}
              label="Active placements"
              hint={`${values.placements_total ?? 0} total placements`}
            />
            <StatCard
              tone="blue"
              icon={<Users />}
              value={activeMentors.data?.pagination.total_count ?? 0}
              loading={activeMentors.isPending}
              label="Active mentors"
              hint="Active mentor accounts"
            />
            <StatCard
              tone="violet"
              icon={<CheckCircle2 />}
              value={values.placements_completed ?? 0}
              loading={indicators.isPending}
              label="Placements completed"
              hint={`Of ${values.placements_total ?? 0} placements in all states`}
            />
          </StatGrid>
          <AdminCard
            title="Period activity"
            description={`${range.label} compared with the previous period`}
          >
            {loadingOverview ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="rp-metrics">
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
          </AdminCard>
          <div className="pa-grid-2 rp-grid">
            <AdminCard
              className="rp-chart-card"
              title="Placements by status"
              description="Current lifecycle distribution"
            >
              {statusData.length ? (
                <div className="rp-donut-layout">
                  <div className="rp-donut">
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
                  <ul className="rp-legend" aria-label="Placement status legend">
                    {statusData.map((item, index) => (
                      <li key={item.name}>
                        <i
                          aria-hidden="true"
                          style={{
                            background: chartColors[index % chartColors.length],
                          }}
                        />
                        <span>{item.name}</span>
                        <strong>{item.value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <EmptyReport
                  title="No placement data yet"
                  detail="Lifecycle distribution will appear after placements are recorded."
                />
              )}
            </AdminCard>
            <AdminCard
              className="rp-chart-card"
              title="Daily programme activity"
              description={`Recorded activity during ${range.label}`}
            >
              {loadingOverview ? (
                <Skeleton className="h-52" />
              ) : report.data?.trend.some((point) => point.placements_created || point.sessions_logged || point.placements_completed) ? (
                <ReportTrend data={report.data} />
              ) : (
                <EmptyReport
                  title="No activity recorded for this period"
                  detail="Daily placement and mentorship activity will appear here when recorded."
                />
              )}
            </AdminCard>
          </div>
          <div className="pa-grid-2 rp-grid">
            <AdminCard
              title="Recent reports"
              description="Latest exports requested for this programme"
              flush
              action={
                <AdminButton
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void queryClient.invalidateQueries({ queryKey: ["exports"] })
                  }
                >
                  Refresh
                </AdminButton>
              }
            >
              {exportsQuery.isPending ? (
                <div className="p-4"><Skeleton className="h-24" /></div>
              ) : exportsQuery.data?.length ? (
                <div className="pa-list">
                  {exportsQuery.data.slice(0, 4).map((item) => (
                    <ExportRow
                      key={item.id}
                      item={item}
                      downloading={downloadingId === item.id}
                      onDownload={() => void download(item)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyReport
                  title="No reports generated"
                  detail="Request an export when you need a safe programme snapshot."
                />
              )}
            </AdminCard>
            <AdminCard
              title="Programme signals"
              description="Setup and readiness across the programme"
              flush
              action={
                <AdminButton
                  variant="ghost"
                  size="sm"
                  onClick={() => void refreshReport()}
                >
                  Refresh
                </AdminButton>
              }
            >
              {indicators.isPending || summary.isPending ? (
                <div className="p-4"><Skeleton className="h-24" /></div>
              ) : (
                <div className="pa-list">
                  <Signal
                    icon={<Building2 />}
                    tone="teal"
                    label="Facilities"
                    value={summary.data?.readiness.facilities ?? 0}
                  />
                  <Signal
                    icon={<BedDouble />}
                    tone="blue"
                    label="Wards"
                    value={summary.data?.readiness.wards ?? 0}
                  />
                  <Signal
                    icon={<ClipboardList />}
                    tone="amber"
                    label="Pending setup"
                    value={summary.data?.readiness.placements_missing_setup ?? 0}
                  />
                  <Signal
                    icon={<Users />}
                    tone="violet"
                    label="Unassigned placements"
                    value={summary.data?.readiness.unassigned_placements ?? 0}
                  />
                </div>
              )}
            </AdminCard>
          </div>
          <AdminCard
            title="Continuity needs attention"
            description="Pause patterns in your programme scope"
            flush
            action={
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => selectTab("Safeguarding")}
              >
                View safeguarding
              </AdminButton>
            }
          >
            {interruptions.isPending ? (
              <div className="p-4"><Skeleton className="h-24" /></div>
            ) : interruptions.data?.length ? (
              <ReportTable rows={interruptions.data} />
            ) : (
              <EmptyReport
                title="No interruptions recorded"
                detail="The programme has no continuity interruptions to review."
              />
            )}
          </AdminCard>
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
    </AdminPage>
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
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      closeLabel="Close export dialog"
      icon={<Download />}
      title="Create a placement report"
      description="Choose the format that fits your next step. The export remains scoped to your programme permissions."
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton size="sm" onClick={onExport} disabled={busy}>
            {busy ? "Preparing…" : "Create export"}
          </AdminButton>
        </>
      }
    >
      <Field label="File format">
        <SelectInput value={format} onChange={(event) => onFormatChange(event.target.value as ExportFormat)} disabled={busy}>
          <option value="xlsx">Excel workbook (.xlsx)</option>
          <option value="pdf">Printable PDF (.pdf)</option>
          <option value="csv">Spreadsheet data (.csv)</option>
          <option value="json">Structured data (.json)</option>
        </SelectInput>
      </Field>
      <div className="po-note">
        <strong style={{ display: "block", color: "#10223b" }}>
          {format === "pdf"
            ? "Best for sharing and printing"
            : format === "xlsx"
              ? "Best for analysis in Excel"
              : format === "json"
                ? "Best for system-to-system use"
                : "Best for lightweight spreadsheet imports"}
        </strong>
        Generation runs in the background and the completed file will be available in Recent reports.
      </div>
    </Modal>
  );
}

type SectionSummary = {
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
  summary?: SectionSummary;
  interruptions: InterruptionReportRow[];
  exports: ExportRecord[];
  loading: boolean;
  onExport: () => void;
}) {
  if (loading)
    return (
      <AdminCard>
        <Skeleton className="h-28" />
      </AdminCard>
    );
  if (tab === "Placements")
    return (
      <ReportSectionShell
        title="Placements reporting"
        intro="Lifecycle distribution and continuity signals for placements in your programme scope."
        metrics={[
          { icon: <BriefcaseBusiness />, label: "Total placements", value: values.placements_total ?? 0, tone: "teal" },
          { icon: <Activity />, label: "Active", value: values.placements_active ?? 0, tone: "blue" },
          { icon: <Users />, label: "Awaiting student", value: values.placements_awaiting_student ?? 0, tone: "amber" },
          { icon: <CheckCircle2 />, label: "Completed", value: values.placements_completed ?? 0, tone: "violet" },
        ]}
        after={
          <>
            <AdminCard title="Lifecycle stages" description="Share of all placements in each stage">
              <ReportStageList values={values} />
            </AdminCard>
            <AdminCard
              title="Continuity interruptions"
              description="Pause patterns by facility and cohort"
              flush
            >
              {interruptions.length ? (
                <ReportTable rows={interruptions} showCohort />
              ) : (
                <EmptyReport
                  title="No continuity interruptions"
                  detail="There are no placement interruption records in this reporting scope."
                />
              )}
            </AdminCard>
          </>
        }
      />
    );
  if (tab === "People")
    return (
      <ReportSectionShell
        title="People reporting"
        intro="Current participation and operational staffing across the programme workspace."
        metrics={[
          { icon: <Users />, label: "People in programme", value: summary?.people_total ?? values.people_total ?? 0, tone: "teal" },
          { icon: <CheckCircle2 />, label: "Active people", value: summary?.active_people ?? 0, tone: "blue" },
          { icon: <Activity />, label: "Invitations pending", value: summary?.invited_people ?? 0, tone: "amber" },
          { icon: <ShieldCheck />, label: "Suspended", value: summary?.suspended_people ?? 0, tone: "violet" },
        ]}
        after={
          <AdminCard title="Operational staffing" description="Roles supporting the programme" flush>
            <div className="pa-list">
              <Signal icon={<Users />} tone="teal" label="Active coordinators" value={summary?.readiness.active_coordinators ?? 0} />
              <Signal icon={<Users />} tone="blue" label="Active nurse managers" value={summary?.readiness.active_nurse_managers ?? 0} />
              <Signal icon={<Activity />} tone="violet" label="Activity events" value={summary?.activity_events ?? 0} />
            </div>
          </AdminCard>
        }
      />
    );
  if (tab === "Mentorship")
    return (
      <ReportSectionShell
        title="Mentorship reporting"
        intro="Mentorship activity recorded against placements in your programme scope."
        metrics={[
          { icon: <HeartPulse />, label: "Sessions logged", value: values.sessions_total ?? 0, tone: "teal" },
          { icon: <Activity />, label: "Sessions this week", value: values.sessions_this_week ?? 0, tone: "blue" },
          { icon: <BriefcaseBusiness />, label: "Active placements", value: values.placements_active ?? 0, tone: "violet" },
        ]}
        after={
          <AdminCard>
            <EmptyReport
              title={values.sessions_total ? "Session activity is available" : "No mentorship sessions yet"}
              detail={
                values.sessions_total
                  ? "Session totals are sourced from the mentorship activity record."
                  : "Mentorship insights will appear after mentors log sessions."
              }
            />
          </AdminCard>
        }
      />
    );
  if (tab === "Safeguarding")
    return (
      <ReportSectionShell
        title="Safeguarding reporting"
        intro="Operational safeguarding counts are shown without exposing restricted concern narratives."
        metrics={[
          { icon: <ShieldCheck />, label: "Open concerns", value: values.open_concerns ?? 0, tone: "teal" },
          { icon: <TriangleAlert />, label: "High priority", value: values.high_concerns ?? 0, tone: "amber" },
          { icon: <Activity />, label: "Medium priority", value: values.medium_concerns ?? 0, tone: "blue" },
          { icon: <CheckCircle2 />, label: "Low priority", value: values.low_concerns ?? 0, tone: "violet" },
        ]}
        after={
          <AdminCard>
            <EmptyReport
              title="Safeguarding case details stay protected"
              detail="This report shows aggregate counts only. Use the safeguarding workspace for authorised case follow-up. Placement interruption records are listed under Placements."
            />
          </AdminCard>
        }
      />
    );
  if (tab === "Engagement")
    return (
      <ReportSectionShell
        title="Engagement reporting"
        intro="Operational engagement signals from recorded programme activity and mentorship sessions."
        metrics={[
          { icon: <Activity />, label: "Activity events", value: summary?.activity_events ?? 0, tone: "teal" },
          { icon: <HeartPulse />, label: "Sessions logged", value: values.sessions_total ?? 0, tone: "blue" },
          { icon: <Users />, label: "Active people", value: summary?.active_people ?? 0, tone: "violet" },
        ]}
        after={
          <AdminCard>
            <EmptyReport
              title="Operational engagement is available"
              detail="These counters are live programme signals. Historical engagement trends require a time-series analytics projection."
            />
          </AdminCard>
        }
      />
    );
  if (tab === "Custom reports")
    return (
      <>
        <AdminCard
          title="Custom reports"
          description="Generate a scoped placement snapshot or review exports already requested for this programme."
        >
          <div className="rp-custom-action">
            <div>
              <strong>Placement snapshot</strong>
              <p>Export the programme-scoped placement record as CSV, XLSX, JSON, or PDF.</p>
            </div>
            <AdminButton onClick={onExport} icon={<Download aria-hidden="true" />}>
              Create export
            </AdminButton>
          </div>
        </AdminCard>
        <AdminCard title="Requested exports" description="Most recent exports for this programme" flush>
          {exports.length ? (
            <div className="pa-list">
              {exports.slice(0, 5).map((item) => (
                <ExportRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyReport
              title="No custom exports yet"
              detail="Create a placement snapshot when you need a portable programme report."
            />
          )}
        </AdminCard>
      </>
    );
  return (
    <AdminCard title={`${tab} reporting`} description="This view is scoped to the programme data currently available to your role.">
      <EmptyReport
        title={`${tab} reporting is ready for expansion`}
        detail="The current programme read model does not expose this report yet. No placeholder metrics are shown."
      />
    </AdminCard>
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
function exportLabel(type: string) {
  const text = type.replaceAll("_", " ").trim();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} report`;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const exportStatus: Record<ExportRecord["status"], { tone: PillTone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "info", label: "In progress" },
  completed: { tone: "success", label: "Completed" },
  failed: { tone: "danger", label: "Failed" },
};
function ExportRow({
  item,
  downloading,
  onDownload,
}: {
  item: ExportRecord;
  downloading?: boolean;
  onDownload?: () => void;
}) {
  const status = exportStatus[item.status] ?? { tone: "neutral" as PillTone, label: item.status };
  return (
    <ListRow
      icon={<FileText />}
      tone="teal"
      title={exportLabel(item.export_type)}
      meta={`${item.format.toUpperCase()} · ${formatDate(item.created_at)}`}
      trailing={
        <>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          {onDownload && item.download_url && (
            <AdminButton
              variant="ghost"
              size="sm"
              disabled={downloading}
              onClick={onDownload}
              aria-label={`Download ${exportLabel(item.export_type)}`}
            >
              {downloading ? "…" : "Download"}
            </AdminButton>
          )}
        </>
      }
    />
  );
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
    <div className="rp-metric">
      <span className="rp-metric__label">{label}</span>
      <strong className="rp-metric__value">{value}</strong>
      {change === null ? (
        <small className="rp-metric__hint">{value === 0 ? "No activity in the previous period" : "No previous activity to compare"}</small>
      ) : (
        <small className={`rp-metric__hint ${change >= 0 ? "positive" : "negative"}`}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change)}% vs previous
        </small>
      )}
    </div>
  );
}
function ReportTrend({ data }: { data: ReportOverview }) {
  return (
    <div
      className="rp-trend"
      role="img"
      aria-label="Daily report trend for new placements, mentorship sessions, and completed placements"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e6edf2" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => date.slice(8)}
            tick={{ fontSize: 12, fill: "#607392" }}
            tickLine={false}
            axisLine={{ stroke: "#dbe4ed" }}
          />
          <YAxis
            allowDecimals={false}
            width={28}
            tick={{ fontSize: 12, fill: "#607392" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip labelFormatter={(date) => String(date)} />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "#607392" }}
          />
          <Line type="monotone" dataKey="placements_created" name="New placements" stroke="#1d8c8c" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="sessions_logged" name="Sessions" stroke="#236bd4" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="placements_completed" name="Completed" stroke="#7653d4" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
function ReportSectionShell({
  title,
  intro,
  metrics,
  after,
}: {
  title: string;
  intro: string;
  metrics: { icon: ReactNode; label: string; value: number; tone: Tone }[];
  after: ReactNode;
}) {
  const columns = metrics.length === 3 ? 3 : 4;
  return (
    <>
      <Notice icon={<Info aria-hidden="true" />}>
        <strong>{title}.</strong> {intro}
      </Notice>
      <StatGrid columns={columns}>
        {metrics.map((item) => (
          <StatCard
            key={item.label}
            icon={item.icon}
            tone={item.tone}
            value={item.value}
            label={item.label}
            hint="Programme scope"
          />
        ))}
      </StatGrid>
      {after}
    </>
  );
}
function ReportStageList({ values }: { values: Record<string, number> }) {
  const stages = [
    { label: "Scheduled", value: values.placements_scheduled ?? 0 },
    { label: "Orientation", value: values.placements_induction ?? 0 },
    { label: "Awaiting student", value: values.placements_awaiting_student ?? 0 },
    { label: "Active", value: values.placements_active ?? 0 },
    { label: "Completed", value: values.placements_completed ?? 0 },
  ];
  return (
    <ul className="rp-stages">
      {stages.map((stage) => (
        <li key={stage.label}>
          <span>{stage.label}</span>
          <strong>{stage.value}</strong>
          <div className="rp-stages__bar">
            <i
              style={{
                width: `${Math.min(100, stage.value ? Math.max(8, (stage.value / Math.max(values.placements_total ?? 1, 1)) * 100) : 0)}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
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
    <div className="pa-table-scroll">
      <table className="pa-table">
        <caption className="sr-only">Programme interruption report</caption>
        <thead>
          <tr>
            <th scope="col">Facility</th>
            {showCohort && <th scope="col">Cohort</th>}
            <th scope="col">Reason</th>
            <th scope="col">Interruptions</th>
            <th scope="col">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={`${row.facility_id}-${row.cohort_id}-${row.reason}`}>
              <td><strong className="rp-cell-strong">{row.facility_name}</strong></td>
              {showCohort && <td>{row.cohort_name}</td>}
              <td className="rp-capitalize">{row.reason.replaceAll("_", " ")}</td>
              <td>{row.interruptions}</td>
              <td>{row.days_interrupted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Signal({
  icon,
  tone,
  label,
  value,
}: {
  icon: ReactNode;
  tone: Tone;
  label: string;
  value: number;
}) {
  return <ListRow icon={icon} tone={tone} title={label} value={value} />;
}
function EmptyReport({ title, detail }: { title: string; detail: string }) {
  return <EmptyState icon={<FileText size={22} />} title={title} text={detail} />;
}
