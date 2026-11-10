import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { AdminButton, AdminCard, EmptyState, SelectField, StatusPill } from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";
import { useToast } from "../../components/ToastProvider";
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

/** Request governed exports and download the finished files. */
export function ExportCenter({
  user,
  cohorts,
  facilities,
  onError,
}: {
  user: CurrentUser;
  cohorts: Array<{ id: string; name: string }>;
  facilities: Array<{ id: string; name: string }>;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const canExport = Boolean(user.capabilities.export_reports);
  const [type, setType] = useState<"placements" | "cohort">("placements");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [cohortId, setCohortId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const history = useQuery({ queryKey: ["exports"], queryFn: getExports, refetchInterval: (query) => (query.state.data?.some((row) => row.status === "queued" || row.status === "running") ? 4000 : false) });

  const request = useMutation({
    mutationFn: () =>
      requestExport(type, { ...(type === "cohort" && cohortId ? { cohort_id: cohortId } : {}), ...(facilityId ? { facility_id: facilityId } : {}) }, format),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Export requested", message: "It will appear in the history below when it is ready." });
      void queryClient.invalidateQueries({ queryKey: ["exports"] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not request that export."),
  });

  async function download(record: ExportRecord) {
    setDownloading(record.id);
    try {
      const blob = await downloadExport(record);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mentormama-${record.export_type}-${record.id.slice(0, 8)}.${EXTENSION[record.format] ?? "csv"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not download this export.");
    } finally {
      setDownloading(null);
    }
  }

  const columns: ColumnDef<ExportRecord>[] = [
    { accessorKey: "export_type", header: "Export", cell: ({ row }) => <strong style={{ textTransform: "capitalize" }}>{row.original.export_type}</strong> },
    { accessorKey: "format", header: "Format", cell: ({ row }) => row.original.format.toUpperCase() },
    { accessorKey: "row_count", header: "Rows", meta: { align: "right" } },
    {
      accessorKey: "created_at",
      header: "Requested",
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusPill tone={row.original.status === "completed" ? "success" : row.original.status === "failed" ? "danger" : "warning"}>
          {row.original.status[0].toUpperCase() + row.original.status.slice(1)}
        </StatusPill>
      ),
    },
    {
      id: "action",
      header: () => <span className="sr-only">Download</span>,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.status === "completed" && row.original.download_url ? (
          <AdminButton variant="secondary" size="sm" icon={<Download />} disabled={downloading === row.original.id} onClick={() => void download(row.original)}>
            {downloading === row.original.id ? "Preparing…" : "Download"}
          </AdminButton>
        ) : null,
      meta: { align: "right" },
    },
  ];

  return (
    <div className="rp-stack">
      {canExport && (
        <AdminCard title="Request an export" description="Exports contain placement progress metadata only: no narratives, no patient information.">
          <div className="rp-export-form">
            <SelectField label="Export type" value={type} onChange={(value) => setType(value as "placements" | "cohort")} options={[{ value: "placements", label: "All placements" }, { value: "cohort", label: "One cohort" }]} />
            {type === "cohort" && (
              <SelectField label="Cohort" value={cohortId} onChange={setCohortId} options={[{ value: "", label: "Choose a cohort" }, ...cohorts.map((c) => ({ value: c.id, label: c.name }))]} />
            )}
            {facilities.length > 1 && (
              <SelectField label="Facility" value={facilityId} onChange={setFacilityId} options={[{ value: "", label: "All facilities" }, ...facilities.map((f) => ({ value: f.id, label: f.name }))]} />
            )}
            <SelectField label="Format" value={format} onChange={(value) => setFormat(value as ExportFormat)} options={[{ value: "csv", label: "CSV" }, { value: "xlsx", label: "Excel (XLSX)" }]} />
            <AdminButton icon={<FileSpreadsheet />} disabled={request.isPending || (type === "cohort" && !cohortId)} onClick={() => request.mutate()}>
              {request.isPending ? "Requesting…" : "Request export"}
            </AdminButton>
          </div>
        </AdminCard>
      )}
      <AdminCard
        title="Export history"
        action={
          <AdminButton variant="ghost" size="sm" icon={<RefreshCw />} onClick={() => void history.refetch()} disabled={history.isFetching}>
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
