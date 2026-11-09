import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import {
  getDashboardIndicators,
  downloadExport,
  getExports,
  getInterruptionReport,
  getPlacementOptions,
  requestExport,
  type CurrentUser,
} from "../../services/api";
import { ApprovedFeedbackPanel } from "../assessments/ApprovedFeedbackPanel";
import { AnonymousFeedbackReport } from "../assessments/AnonymousFeedbackReport";

export function CoordinatorReports({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const indicators = useQuery({
    queryKey: ["coordinator-report-indicators"],
    queryFn: getDashboardIndicators,
  });
  const interruptions = useQuery({
    queryKey: ["coordinator-report-interruptions"],
    queryFn: getInterruptionReport,
  });
  const options = useQuery({
    queryKey: ["coordinator-report-options"],
    queryFn: getPlacementOptions,
  });
  const exportsQuery = useQuery({
    queryKey: ["coordinator-exports"],
    queryFn: getExports,
    refetchInterval: 5000,
  });
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [exportType, setExportType] = useState<"placements" | "cohort">(
    "placements",
  );
  const [cohortId, setCohortId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const refreshing =
    indicators.isFetching ||
    interruptions.isFetching ||
    options.isFetching ||
    exportsQuery.isFetching;
  const values = indicators.data?.indicators ?? {};
  const total = values.placements_total ?? 0;
  const draft = values.placements_draft ?? 0;
  const scheduled = values.placements_scheduled ?? 0;
  const awaiting = values.placements_awaiting_student ?? 0;
  const orientation = values.placements_orientation ?? 0;
  const induction = values.placements_induction ?? 0;
  const active = values.placements_active ?? 0;
  const paused = values.placements_paused ?? 0;
  const completed = values.placements_completed ?? 0;
  const preparing = draft + scheduled;
  const stages = [
    ["Draft", draft, "Placement setup"],
    ["Scheduled", scheduled, "Ready for release"],
    ["Awaiting student", awaiting, "Ready for confirmation"],
    ["Orientation", orientation, "Student preparation"],
    ["Induction", induction, "Handoff in progress"],
    ["Active", active, "Currently in placement"],
    ["Paused", paused, "Needs coordination"],
    ["Completed", completed, "Finished placement journeys"],
  ] as const;
  const facilities = options.data
    ? Array.from(
        new Map(
          options.data.wards.map((ward) => [
            ward.facility_id,
            ward.facility_name,
          ]),
        ),
      )
    : [];

  async function refreshReport() {
    try {
      await Promise.all([
        indicators.refetch(),
        interruptions.refetch(),
        options.refetch(),
        exportsQuery.refetch(),
      ]);
      pushToast({
        kind: "success",
        title: "Report refreshed",
        message: "The institution report is up to date.",
      });
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not refresh this institution report.",
      );
    }
  }

  async function createExport() {
    setBusy(true);
    pushToast({
      kind: "info",
      title: "Export started",
      message: "Preparing your institution snapshot…",
    });
    try {
      await requestExport(exportType, {
        ...(exportType === "cohort" && cohortId ? { cohort_id: cohortId } : {}),
        ...(facilityId ? { facility_id: facilityId } : {}),
      });
      await queryClient.invalidateQueries({
        queryKey: ["coordinator-exports"],
      });
      pushToast({
        kind: "success",
        title: "Export request accepted",
        message:
          "Your snapshot will appear in Export history when it is ready.",
      });
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not request that institution export.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(
    record: NonNullable<typeof exportsQuery.data>[number],
  ) {
    setDownloadingId(record.id);
    pushToast({
      kind: "info",
      title: "Download started",
      message: "Fetching the requested institution snapshot…",
    });
    try {
      const blob = await downloadExport(record);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mentormama-${record.export_type}-${record.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast({
        kind: "success",
        title: "Download ready",
        message: "The snapshot has been saved to your downloads.",
      });
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not download this export.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-10">
      <header className="relative overflow-hidden rounded-2xl bg-navy px-6 py-7 text-white sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full border-[3rem] border-teal/15" />
        <div className="relative max-w-3xl">
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Institution report ·{" "}
            {user.scope?.institution_name ?? "Your institution"}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            Your students’ placement progress
          </h2>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-slate-300">
            A live operating view of handoffs from cohort preparation through
            completed placement. Use it to decide where your team should follow
            up.
          </p>
        </div>
      </header>

      <section aria-labelledby="coordinator-report-signals">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Operating picture
            </p>
            <h3
              id="coordinator-report-signals"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              At a glance
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void refreshReport()}
            disabled={refreshing}
            className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-semibold text-teal disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin" : undefined}
              aria-hidden="true"
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {indicators.isPending ? (
          <div className="grid gap-px border-y border-border sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : indicators.isError ? (
          <ReportError onRetry={() => void indicators.refetch()} />
        ) : (
          <div className="grid overflow-hidden rounded-2xl border border-border bg-white sm:grid-cols-2 xl:grid-cols-4">
            <Signal
              label="Placements"
              value={total}
              detail={`${values.placements_active ?? 0} active`}
            />
            <Signal
              label="In preparation"
              value={preparing}
              detail="Being readied for handoff"
            />
            <Signal
              label="Completed"
              value={values.placements_completed ?? 0}
              detail="Finished placement journeys"
            />
            <Signal
              label="Needs follow-up"
              value={
                (values.placements_awaiting_student ?? 0) +
                (values.open_concerns ?? 0)
              }
              detail={`${values.open_concerns ?? 0} safeguarding concern${values.open_concerns === 1 ? "" : "s"}`}
            />
          </div>
        )}
      </section>

      <section
        aria-labelledby="coordinator-progress-heading"
        className="rounded-2xl border border-border bg-white p-5 sm:p-7"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Placement journey
            </p>
            <h3
              id="coordinator-progress-heading"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Where your students are now
            </h3>
          </div>
          <p className="font-body text-xs text-navy-muted">
            {total} total placement{total === 1 ? "" : "s"}
          </p>
        </div>
        {indicators.isPending ? (
          <Skeleton className="mt-6 h-40" />
        ) : indicators.isError ? (
          <ReportError onRetry={() => void indicators.refetch()} />
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {stages.map(([label, value, detail]) => (
              <StageBar
                key={label}
                label={label}
                value={value}
                total={total}
                detail={detail}
              />
            ))}
          </div>
        )}
      </section>

      <section
        aria-labelledby="coordinator-interruptions"
        className="rounded-2xl border border-border bg-white p-5 sm:p-7"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Follow-up signals
            </p>
            <h3
              id="coordinator-interruptions"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Interruptions affecting continuity
            </h3>
          </div>
          <p className="font-body text-xs text-navy-muted">
            Pause patterns reported in your institution
          </p>
        </div>
        {interruptions.isPending ? (
          <Skeleton className="h-32" />
        ) : interruptions.isError ? (
          <ReportError onRetry={() => void interruptions.refetch()} />
        ) : interruptions.data?.length ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[42rem] text-left">
              <thead className="bg-mist/45">
                <tr>
                  <Th>Facility</Th>
                  <Th>Cohort</Th>
                  <Th>Reason</Th>
                  <Th>Count</Th>
                  <Th>Days</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {interruptions.data.slice(0, 12).map((row) => (
                  <tr key={`${row.facility_id}-${row.cohort_id}-${row.reason}`}>
                    <Td>{row.facility_name}</Td>
                    <Td>{row.cohort_name}</Td>
                    <Td>{row.reason.replaceAll("_", " ")}</Td>
                    <Td>{row.interruptions}</Td>
                    <Td>{row.days_interrupted}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ClearSignal />
        )}
      </section>

      <ApprovedFeedbackPanel user={user} />
      <AnonymousFeedbackReport />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section
          aria-labelledby="coordinator-export-heading"
          className="rounded-2xl border border-teal/20 bg-teal-light/25 p-5 sm:p-7"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal">
              <Download size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Institution export
              </p>
              <h3
                id="coordinator-export-heading"
                className="mt-1 font-display text-2xl font-bold text-navy"
              >
                Create a safe operational snapshot
              </h3>
              <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-navy-muted">
                Exports contain placement progress metadata only. They are
                scoped to your institution and expire after a short period.
              </p>
            </div>
          </div>
          {user.capabilities.export_reports && (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Select
                label="Snapshot"
                value={exportType}
                onChange={(value) => {
                  setExportType(value as "placements" | "cohort");
                  if (value === "placements") setCohortId("");
                }}
              >
                <option value="placements">All placements</option>
                <option value="cohort">One cohort</option>
              </Select>
              <Select
                label="Cohort"
                value={cohortId}
                onChange={setCohortId}
                disabled={exportType !== "cohort" || options.isPending}
              >
                <option value="">Choose a cohort</option>
                {options.data?.cohorts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Facility"
                value={facilityId}
                onChange={setFacilityId}
                disabled={options.isPending}
              >
                <option value="">All facilities</option>
                {facilities.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {user.capabilities.export_reports && (
            <Button
              className="mt-5"
              size="sm"
              disabled={busy || (exportType === "cohort" && !cohortId)}
              onClick={() => void createExport()}
            >
              <Download size={16} className="mr-2" aria-hidden="true" />
              {busy ? "Requesting…" : "Request export"}
            </Button>
          )}
        </section>

        <section
          aria-labelledby="coordinator-export-queue"
          className="rounded-2xl border border-border bg-white p-5 sm:p-7"
        >
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Export history
            </p>
            <h3
              id="coordinator-export-queue"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Recent institution snapshots
            </h3>
          </div>
          {exportsQuery.isPending ? (
            <Skeleton className="h-24" />
          ) : exportsQuery.isError ? (
            <ReportError onRetry={() => void exportsQuery.refetch()} />
          ) : exportsQuery.data?.length ? (
            <div
              className="mt-5 max-h-[26rem] divide-y divide-border overflow-y-auto overscroll-contain rounded-xl border border-border"
              tabIndex={0}
              aria-label="Recent institution snapshots"
            >
              {exportsQuery.data.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <FileText
                      size={18}
                      className="mt-0.5 text-teal"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-body text-sm font-semibold capitalize text-navy">
                        {item.export_type} snapshot · {item.status}
                      </p>
                      <p className="mt-1 font-body text-xs text-navy-muted">
                        {item.row_count} rows ·{" "}
                        {new Date(item.created_at).toLocaleString("en-GB")}
                      </p>
                    </div>
                  </div>
                  {item.download_url && (
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-semibold text-teal disabled:opacity-50"
                      disabled={downloadingId === item.id}
                      onClick={() => void download(item)}
                    >
                      <Download size={15} aria-hidden="true" />
                      {downloadingId === item.id ? "Downloading…" : "Download"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyReport
              title="No exports yet"
              detail="Requested institution snapshots will appear here."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block font-body text-sm font-semibold text-navy">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="auth-control mt-2 disabled:opacity-60"
      >
        {children}
      </select>
    </label>
  );
}
function Signal({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="border-b border-border px-4 py-5 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold text-navy">{value}</p>
      <p className="mt-1 font-body text-xs text-navy-muted">{detail}</p>
    </div>
  );
}
function StageBar({
  label,
  value,
  total,
  detail,
}: {
  label: string;
  value: number;
  total: number;
  detail: string;
}) {
  const percentage = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-body text-sm font-semibold text-navy">{label}</p>
          <p className="mt-1 font-body text-xs text-navy-muted">{detail}</p>
        </div>
        <p className="font-body text-sm font-bold tabular-nums text-navy">
          {value}{" "}
          <span className="font-normal text-navy-muted">({percentage}%)</span>
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-mist"
        role="progressbar"
        aria-label={`${label}: ${value} placements`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-teal transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border-l-2 border-error bg-error/5 px-4 py-4">
      <p className="font-body text-sm text-error">
        This institution report could not be loaded.
      </p>
      <Button size="sm" variant="tertiary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
function EmptyReport({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
      <TriangleAlert
        size={20}
        className="mx-auto text-navy-muted"
        aria-hidden="true"
      />
      <p className="mt-3 font-body text-sm font-semibold text-navy">{title}</p>
      <p className="mt-1 font-body text-sm text-navy-muted">{detail}</p>
    </div>
  );
}
function ClearSignal() {
  return (
    <div className="mt-6 flex items-center gap-4 rounded-xl border border-teal/20 bg-teal-light/35 px-4 py-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal">
        <RefreshCw size={18} aria-hidden="true" />
      </span>
      <div>
        <p className="font-body text-sm font-semibold text-navy">
          Continuity is clear
        </p>
        <p className="mt-1 font-body text-sm text-navy-muted">
          No recorded interruption is currently affecting your institution’s
          placement flow.
        </p>
      </div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3 font-body text-sm capitalize text-navy">
      {children}
    </td>
  );
}
