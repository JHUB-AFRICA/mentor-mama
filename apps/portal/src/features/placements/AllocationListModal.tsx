import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { Modal } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { downloadAllocationList } from "../../services/api";
import { AdminButton, SelectField } from "../programme-admin/ui/AdminKit";

const FORMATS = [
  { file: "pdf" as const, label: "PDF", hint: "Branded, print-ready", icon: <FileText /> },
  { file: "xlsx" as const, label: "Excel", hint: "Edit and share", icon: <FileSpreadsheet /> },
  { file: "csv" as const, label: "CSV", hint: "Import elsewhere", icon: <Table2 /> },
];

/** Download where each student is placed, so facilities and students can prepare early. */
export function AllocationListModal({ open, onClose, cohorts }: { open: boolean; onClose: () => void; cohorts: Array<{ id: string; name: string }> }) {
  const { pushToast } = useToast();
  const [cohort, setCohort] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function download(file: "csv" | "xlsx" | "pdf") {
    setBusy(file);
    try {
      const blob = await downloadAllocationList(file, cohort || undefined);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `mentormama-allocation-list.${file}`;
      link.click();
      URL.revokeObjectURL(link.href);
      pushToast({ kind: "success", title: "Allocation list downloaded", message: "It lists where each student is placed right now." });
    } catch (cause) {
      pushToast({ kind: "error", title: "Could not download", message: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      icon={<Download />}
      title="Allocation list"
      description="Where each student is placed: facility, ward and mentor. Students not yet arranged are included."
      footer={<AdminButton variant="secondary" size="sm" onClick={onClose} disabled={Boolean(busy)}>Close</AdminButton>}
    >
      <SelectField label="Cohort" value={cohort} onChange={setCohort} options={[{ value: "", label: "All cohorts" }, ...cohorts.map((item) => ({ value: item.id, label: item.name }))]} />
      <div className="pa-row-actions" style={{ marginTop: 12 }}>
        {FORMATS.map((format) => (
          <AdminButton key={format.file} variant="secondary" size="sm" icon={format.icon} disabled={Boolean(busy)} onClick={() => void download(format.file)} title={format.hint}>
            {busy === format.file ? "Preparing…" : format.label}
          </AdminButton>
        ))}
      </div>
    </Modal>
  );
}
