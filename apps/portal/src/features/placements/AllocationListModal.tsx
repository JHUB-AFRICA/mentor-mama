import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Mail, Table2 } from "lucide-react";
import { Modal } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { downloadAllocationList, shareAllocationWithStudents } from "../../services/api";
import { datedFilename, saveBlob } from "../../lib/download";
import { AdminButton, SelectField } from "../programme-admin/ui/AdminKit";

const FORMATS = [
  { file: "pdf" as const, label: "PDF (branded report)", hint: "Branded, print-ready", icon: <FileText /> },
  { file: "xlsx" as const, label: "Excel (XLSX)", hint: "Edit and share", icon: <FileSpreadsheet /> },
  { file: "csv" as const, label: "CSV (for systems)", hint: "Import elsewhere", icon: <Table2 /> },
];

/** Download where each student is placed, so facilities and students can prepare early. */
export function AllocationListModal({ open, onClose, cohorts, canShare = false }: { open: boolean; onClose: () => void; cohorts: Array<{ id: string; name: string }>; canShare?: boolean }) {
  const { pushToast } = useToast();
  const [cohort, setCohort] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const controller = useRef<AbortController | null>(null);

  function close() {
    controller.current?.abort();
    onClose();
  }

  async function download(file: "csv" | "xlsx" | "pdf") {
    setBusy(file);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const blob = await downloadAllocationList(file, cohort || undefined, abort.signal);
      if (abort.signal.aborted) return;
      const cohortName = cohorts.find((item) => item.id === cohort)?.name;
      saveBlob(blob, datedFilename("allocation-list", file, cohortName ? [cohortName] : []));
      pushToast({ kind: "success", title: "Allocation list downloaded", message: "It lists where each student is placed right now." });
    } catch (cause) {
      if (abort.signal.aborted) return;
      pushToast({ kind: "error", title: "Could not download", message: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      if (controller.current === abort) controller.current = null;
      setBusy(null);
    }
  }

  async function share() {
    setBusy("share");
    try {
      const result = await shareAllocationWithStudents(cohort || undefined);
      pushToast({
        kind: "success",
        title: "Students informed",
        message: result.sent + result.updated === 0
          ? `Nothing new to send${result.not_arranged ? `; ${result.not_arranged} not arranged yet` : ""}.`
          : `${result.sent} told, ${result.updated} updated${result.not_arranged ? `; ${result.not_arranged} not arranged yet` : ""}.`,
      });
    } catch (cause) {
      pushToast({ kind: "error", title: "Could not send", message: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible
      size="sm"
      icon={<Download />}
      title="Allocation list"
      description="Where each student is placed: facility, ward and mentor. Students not yet arranged are included."
      footer={<AdminButton variant="secondary" size="sm" onClick={close}>Close</AdminButton>}
    >
      <SelectField label="Cohort" value={cohort} onChange={setCohort} options={[{ value: "", label: "All cohorts" }, ...cohorts.map((item) => ({ value: item.id, label: item.name }))]} />
      <div className="pa-row-actions" style={{ marginTop: 12 }}>
        {FORMATS.map((format) => (
          <div key={format.file} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <AdminButton variant="secondary" size="sm" icon={format.icon} disabled={Boolean(busy)} aria-busy={busy === format.file} onClick={() => void download(format.file)}>
              {busy === format.file ? "Preparing…" : format.label}
            </AdminButton>
            <small className="pa-sub">{format.hint}</small>
          </div>
        ))}
      </div>
      {canShare && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #eef2f6" }}>
          <strong>Tell students early</strong>
          <p className="pa-sub">Emails each arranged student where they are placed so they can prepare. Placements are still released separately. If you share again, only changed details are re-sent.</p>
          <AdminButton variant="secondary" size="sm" icon={<Mail />} disabled={Boolean(busy)} aria-busy={busy === "share"} onClick={() => void share()}>
            {busy === "share" ? "Sending…" : "Email students their placement"}
          </AdminButton>
        </div>
      )}
    </Modal>
  );
}
