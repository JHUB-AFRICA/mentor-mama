import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { Modal } from "../../../components/kit";
import { useToast } from "../../../components/ToastProvider";
import { messageOf, releasePlacements, type ReleaseResult } from "../../../services/placement-planning";
import { AdminButton, Notice, StatusPill } from "../../programme-admin/ui/AdminKit";

/**
 * Release arranged placements to their students. Confirms what will happen first, then reports the outcome for every
 * student: released, already released, not arranged yet, or blocked (with the reason).
 */
export function ReleaseDialog({
  open,
  onClose,
  cohort,
  selectedIds,
  readyInCohort,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  cohort: { id: string; name: string };
  selectedIds: string[];
  readyInCohort: number;
  onDone: () => void;
}) {
  const { pushToast } = useToast();
  const [scope, setScope] = useState<"selected" | "cohort">("selected");
  const [result, setResult] = useState<ReleaseResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setScope(selectedIds.length > 0 ? "selected" : "cohort");
    // Reset only when the dialog opens.
  }, [open]);

  const release = useMutation({
    mutationFn: () => releasePlacements(scope === "selected" ? { placement_ids: selectedIds } : { cohort_id: cohort.id }),
    onSuccess: (data) => {
      setResult(data);
      onDone();
      pushToast({ kind: "success", title: "Release finished", message: `${data.released} released to students${data.blocked.length ? `, ${data.blocked.length} blocked` : ""}.` });
    },
    onError: (cause) => pushToast({ kind: "error", title: "Could not release", message: messageOf(cause, "Try again.") }),
  });
  const count = scope === "selected" ? selectedIds.length : readyInCohort;

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!release.isPending}
      icon={<Send />}
      title={result ? "Release result" : "Release to students"}
      description={result ? `${cohort.name}` : "Students are told where they are placed and asked to confirm. This sends an email to each student."}
      footer={
        result ? (
          <AdminButton size="sm" onClick={onClose}>Done</AdminButton>
        ) : (
          <>
            <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={release.isPending}>Cancel</AdminButton>
            <AdminButton size="sm" icon={<Send />} onClick={() => release.mutate()} disabled={release.isPending || (scope === "cohort" && readyInCohort === 0)}>
              {release.isPending ? "Releasing…" : `Release ${count} ${count === 1 ? "student" : "students"}`}
            </AdminButton>
          </>
        )
      }
    >
      {result ? (
        <div aria-live="polite">
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusPill tone="success">{result.released} released</StatusPill>
            {result.already_released > 0 && <StatusPill tone="neutral">{result.already_released} already released</StatusPill>}
            {result.not_arranged > 0 && <StatusPill tone="warning">{result.not_arranged} not arranged yet</StatusPill>}
            {result.blocked.length > 0 && <StatusPill tone="danger">{result.blocked.length} blocked</StatusPill>}
          </p>
          {result.not_arranged > 0 && <p className="pa-muted">Students still waiting for a facility to give them a ward and mentor were left as they are.</p>}
          {result.blocked.length > 0 && (
            <>
              <p><strong>Blocked</strong></p>
              <ul className="pp-result-list">
                {result.blocked.map((item) => <li key={item.placement_id}><strong>{item.student}</strong>: {item.reason}</li>)}
              </ul>
            </>
          )}
          {result.released > 0 && result.blocked.length === 0 && (
            <Notice icon={<CheckCircle2 />}>Every arranged student in this release is now with the student to confirm.</Notice>
          )}
        </div>
      ) : (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 10 }}>
          <legend className="pa-muted" style={{ marginBottom: 6 }}>Who to release</legend>
          <label className="pp-facility-opt">
            <input type="radio" name="release-scope" checked={scope === "selected"} disabled={selectedIds.length === 0} onChange={() => setScope("selected")} />
            <span>
              <strong>{selectedIds.length} selected</strong>
              <small>Only arranged students are released. Others are left as they are and listed afterwards.</small>
            </span>
          </label>
          <label className="pp-facility-opt">
            <input type="radio" name="release-scope" checked={scope === "cohort"} onChange={() => setScope("cohort")} />
            <span>
              <strong>Everyone ready in {cohort.name} ({readyInCohort})</strong>
              <small>Arranged with a ward and a trained mentor.</small>
            </span>
          </label>
          <p className="pa-muted" style={{ margin: 0 }}>Releasing again is safe: students already released are counted, not emailed twice.</p>
        </fieldset>
      )}
    </Modal>
  );
}
