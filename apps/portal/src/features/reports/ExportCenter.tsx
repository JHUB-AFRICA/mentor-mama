import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { AdminButton, AdminCard, EmptyState, SelectField, StatusPill, type PillTone } from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";
import { useToast } from "../../components/ToastProvider";
import { datedFilename, saveBlob } from "../../lib/download";
import {
  ApiError,
  downloadExport,
  getExports,
  requestExport,
  type CurrentUser,
  type ExportFormat,
  type ExportRecord,
} from "../../services/api";

const EXTENSION: Record<string, string> = { csv: "csv", xlsx: "xlsx", json: "json", pdf: "pdf" };
/** Option labels in the request form. */
const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV (for systems)" },
  { value: "xlsx", label: "Excel (XLSX)" },
  { value: "pdf", label: "PDF (branded report)" },
];
/** Short labels in the history table. */
const FORMAT_LABEL: Record<string, string> = { csv: "CSV", xlsx: "Excel", pdf: "PDF", json: "JSON" };
const STALLED_MS = 5 * 60_000;
const POLL_LIMIT_MS = 10 * 60_000;
const POLL_MS = 4000;

/** Plain reasons for a failed export, keyed by the API error_code. */
const EXPORT_ERRORS: Record<string, string> = {
  pdf_too_large: "Too many rows for a readable PDF. Use Excel or narrow the filters.",
  export_timed_out: "This took too long. Narrow the filters or use Excel.",
  actor_access_changed: "Your access changed before the export finished.",
  export_generation_failed: "Something went wrong. Try again.",
};

type DisplayState = "queued" | "preparing" | "ready" | "expired" | "failed";

function displayState(record: ExportRecord, now: number): DisplayState {
  if (record.status === "queued") return "queued";
  if (record.status === "running") return "preparing";
  if (record.status === "failed") return "failed";
  const expired = !record.download_url || (record.expires_at !== null && Date.parse(record.expires_at) <= now);
  return expired ? "expired" : "ready";
}

const STATE_META: Record<DisplayState, { label: string; tone: PillTone }> = {
  queued: { label: "Queued", tone: "warning" },
  preparing: { label: "Preparing", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  expired: { label: "Expired", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

const shortDay = (value: string) => new Date(value.length <= 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type ExportFilters = ExportRecord["filters"];

/** Request governed exports and download the finished files. */
export function ExportCenter({
  user,
  cohorts,
  facilities,
  onError,
  period,
  cohortId: cohortIdProp,
  facilityId: facilityIdProp,
}: {
  user: CurrentUser;
  cohorts: Array<{ id: string; name: string }>;
  facilities: Array<{ id: string; name: string }>;
  onError: (message: string) => void;
  period?: { from: string; to: string };
  cohortId?: string;
  facilityId?: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const canExport = Boolean(user.capabilities.export_reports);
  const [type, setType] = useState<"placements" | "cohort" | "training">("placements");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [cohortChoice, setCohortChoice] = useState<string | null>(null);
  const [facilityChoice, setFacilityChoice] = useState<string | null>(null);
  const [limitToPeriod, setLimitToPeriod] = useState(Boolean(period));
  const [downloading, setDownloading] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const pollStart = useRef<number | null>(null);
  const previous = useRef<Map<string, string>>(new Map());
  const cohortId = cohortChoice ?? cohortIdProp ?? "";
  const facilityId = facilityChoice ?? facilityIdProp ?? "";
  const cohortName = (id?: string) => cohorts.find((item) => item.id === id)?.name;
  const facilityName = (id?: string) => facilities.find((item) => item.id === id)?.name;

  const history = useQuery({
    queryKey: ["exports"],
    queryFn: getExports,
    refetchInterval: (query) => {
      const active = query.state.data?.some((row) => row.status === "queued" || row.status === "running");
      if (!active) {
        pollStart.current = null;
        return false;
      }
      pollStart.current ??= Date.now();
      return Date.now() - pollStart.current < POLL_LIMIT_MS ? POLL_MS : false;
    },
  });

  // Recompute "Expires in N min" and stalled flags.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Announce exports that finish while the page is open.
  useEffect(() => {
    if (!history.data) return;
    const seen = previous.current;
    for (const row of history.data) {
      const before = seen.get(row.id);
      if ((before === "queued" || before === "running") && row.status === "completed") setAnnouncement(`Your ${row.export_type} export is ready to download.`);
      if ((before === "queued" || before === "running") && row.status === "failed") setAnnouncement(`Your ${row.export_type} export failed.`);
      seen.set(row.id, row.status);
    }
  }, [history.data]);

  const request = useMutation({
    mutationFn: (input: { type: string; format: string; filters: Record<string, string> }) =>
      requestExport(input.type as "placements" | "cohort" | "training", input.filters, input.format as ExportFormat),
    onSuccess: () => {
      pollStart.current = null;
      pushToast({ kind: "success", title: "Export requested", message: "It will appear in the history below when it is ready." });
      void queryClient.invalidateQueries({ queryKey: ["exports"] });
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.code === "too_many_exports") {
        onError("You already have 3 exports in progress. Wait for one to finish, then try again.");
      } else {
        onError(cause instanceof ApiError ? cause.message : "We could not request that export.");
      }
    },
  });

  function submitForm() {
    const filters: Record<string, string> = {};
    // The training report covers everyone in your scope; placement filters do not apply to it.
    if (type !== "training" && cohortId) filters.cohort_id = cohortId;
    if (type !== "training" && facilityId) filters.facility_id = facilityId;
    if (type !== "training" && period && limitToPeriod) {
      filters.from = period.from;
      filters.to = period.to;
    }
    request.mutate({ type, format, filters });
  }

  function requestAgain(record: ExportRecord) {
    const filters: Record<string, string> = {};
    for (const [key, value] of Object.entries(record.filters ?? {})) if (typeof value === "string" && value) filters[key] = value;
    request.mutate({ type: record.export_type, format: record.format, filters });
  }

  async function download(record: ExportRecord) {
    setDownloading(record.id);
    try {
      const blob = await downloadExport(record);
      const cohort = cohortName(record.filters?.cohort_id);
      saveBlob(blob, datedFilename(record.export_type, EXTENSION[record.format] ?? "csv", cohort ? [cohort] : []));
      pushToast({ kind: "success", title: "Downloaded", message: "Your export has been saved." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We could not download this export.";
      if (cause instanceof ApiError && (cause.status === 410 || cause.status === 404)) {
        pushToast({ kind: "error", title: "Export expired", message });
        void history.refetch();
      } else {
        onError(message);
      }
    } finally {
      setDownloading(null);
    }
  }

  function filterSummary(record: ExportRecord) {
    const f: ExportFilters = record.filters ?? {};
    const parts: string[] = [];
    if (f.cohort_id) parts.push(cohortName(f.cohort_id) ?? "Cohort");
    if (f.facility_id) parts.push(facilityName(f.facility_id) ?? "Facility");
    if (f.from && f.to) parts.push(`${shortDay(f.from)} – ${shortDay(f.to)}`);
    else if (f.from) parts.push(`From ${shortDay(f.from)}`);
    else if (f.to) parts.push(`Until ${shortDay(f.to)}`);
    return parts;
  }

  const columns: ColumnDef<ExportRecord>[] = [
    { accessorKey: "export_type", header: "Export", cell: ({ row }) => <strong style={{ textTransform: "capitalize" }}>{row.original.export_type}</strong> },
    { id: "format", accessorFn: (row) => FORMAT_LABEL[row.format] ?? row.format.toUpperCase(), header: "Format" },
    {
      id: "filters",
      header: "Filters",
      enableSorting: false,
      cell: ({ row }) => {
        const parts = filterSummary(row.original);
        return parts.length ? <span className="pa-sub">{parts.join(" · ")}</span> : <span className="pa-sub">All data</span>;
      },
    },
    {
      accessorKey: "row_count",
      header: "Rows",
      meta: { align: "right" },
      cell: ({ row }) => (row.original.status === "completed" && row.original.row_count ? row.original.row_count.toLocaleString("en-GB") : "—"),
    },
    {
      accessorKey: "created_at",
      header: "Requested",
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const record = row.original;
        const state = displayState(record, now);
        const meta = STATE_META[state];
        const stalled = (state === "queued" || state === "preparing") && now - Date.parse(record.created_at) > STALLED_MS;
        const minutes = record.expires_at ? Math.max(1, Math.ceil((Date.parse(record.expires_at) - now) / 60_000)) : null;
        return (
          <span className="inline-flex flex-col items-start gap-1">
            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
            {state === "ready" && minutes !== null && <small className="pa-sub">Expires in {minutes} min</small>}
            {stalled && <small className="pa-sub">Taking longer than usual</small>}
            {state === "failed" && (
              <small className="pa-sub">{(record.error_code && EXPORT_ERRORS[record.error_code]) || "Something went wrong. Try again."}</small>
            )}
          </span>
        );
      },
    },
    {
      id: "action",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const record = row.original;
        const state = displayState(record, now);
        if (state === "ready") {
          const busy = downloading === record.id;
          return (
            <AdminButton variant="secondary" size="sm" icon={<Download />} disabled={busy} aria-busy={busy} onClick={() => void download(record)}>
              {busy ? "Preparing…" : "Download"}
            </AdminButton>
          );
        }
        if ((state === "expired" || state === "failed") && canExport) {
          return (
            <AdminButton variant="secondary" size="sm" icon={<RefreshCw />} disabled={request.isPending} aria-busy={request.isPending} onClick={() => requestAgain(record)}>
              Request again
            </AdminButton>
          );
        }
        return null;
      },
      meta: { align: "right" },
    },
  ];

  const needsCohort = type === "cohort" && !cohortId;

  return (
    <div className="rp-stack">
      <div aria-live="polite" role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
        {announcement}
      </div>
      {canExport && (
        <AdminCard
          title="Request an export"
          description="Placement exports include student names, registration numbers and emails, with placement progress. The mentor training export lists mentor names and emails with required-module status. Exports never include session notes, feedback text, concern content or clinical details. Links last 15 minutes."
        >
          <div className="rp-export-form">
            <SelectField label="Export type" value={type} onChange={(value) => setType(value as "placements" | "cohort" | "training")} options={[{ value: "placements", label: "All placements" }, { value: "cohort", label: "One cohort" }, { value: "training", label: "Mentor training" }]} />
            {type !== "training" && (
            <SelectField
              label="Cohort"
              value={cohortId}
              onChange={setCohortChoice}
              options={[{ value: "", label: type === "cohort" ? "Choose a cohort" : "All cohorts" }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]}
            />
            )}
            {type !== "training" && facilities.length > 1 && (
              <SelectField label="Facility" value={facilityId} onChange={setFacilityChoice} options={[{ value: "", label: "All facilities" }, ...facilities.map((f) => ({ value: f.id, label: f.name }))]} />
            )}
            <SelectField label="Format" value={format} onChange={(value) => setFormat(value as ExportFormat)} options={FORMAT_OPTIONS} />
            {type !== "training" && period && (
              <label className="pa-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={limitToPeriod} onChange={(event) => setLimitToPeriod(event.target.checked)} />
                Limit to the reporting period ({shortDay(period.from)} – {shortDay(period.to)})
              </label>
            )}
            <AdminButton icon={<FileSpreadsheet />} disabled={request.isPending || needsCohort} aria-busy={request.isPending} onClick={submitForm}>
              {request.isPending ? "Requesting…" : "Request export"}
            </AdminButton>
            {needsCohort && <small className="pa-sub">Choose a cohort first</small>}
          </div>
        </AdminCard>
      )}
      <AdminCard
        title="Export history"
        action={
          <AdminButton
            variant="ghost"
            size="sm"
            icon={<RefreshCw />}
            aria-busy={history.isFetching}
            onClick={() => {
              pollStart.current = null;
              void history.refetch();
            }}
            disabled={history.isFetching}
          >
            Refresh
          </AdminButton>
        }
        flush
      >
        {history.isPending ? (
          <p className="rp-note">Loading exports…</p>
        ) : history.isError ? (
          <p className="rp-note" role="alert">We couldn’t load your exports. Use Refresh to try again.</p>
        ) : (
          <DataTable
            data={history.data}
            columns={columns}
            caption="Export history"
            pageSize={6}
            empty={<EmptyState icon={<FileSpreadsheet />} title="No exports yet" text="Requested exports will be listed here with a download button." />}
          />
        )}
      </AdminCard>
    </div>
  );
}
