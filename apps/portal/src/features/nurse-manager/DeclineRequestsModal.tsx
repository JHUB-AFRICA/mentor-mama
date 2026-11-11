import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { Field, Modal, TextArea } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { declineFacilityRequests, type Placement } from "../../services/api";
import { AdminButton } from "../programme-admin/ui/AdminKit";

/** The facility cannot host some of the requested students. They go back to the coordinator with a reason. */
export function DeclineRequestsModal({ open, onClose, incoming, onError }: { open: boolean; onClose: () => void; incoming: Placement[]; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setPicked([]);
      setReason("");
    }
  }, [open]);
  const decline = useMutation({
    mutationFn: () => declineFacilityRequests(picked, reason.trim()),
    onSuccess: (result) => {
      pushToast({ kind: "success", title: "Sent back to the coordinator", message: `${result.declined} student${result.declined === 1 ? "" : "s"} declined. The coordinator can ask another facility.` });
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not decline those students."),
  });
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!decline.isPending}
      icon={<Ban />}
      title="Decline students"
      description="Choose the students your facility cannot host. Arrange the rest in one tap afterwards."
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={decline.isPending}>Cancel</AdminButton>
          <AdminButton size="sm" disabled={picked.length === 0 || reason.trim().length < 5 || decline.isPending} onClick={() => decline.mutate()}>
            {decline.isPending ? "Sending…" : `Decline ${picked.length || ""} student${picked.length === 1 ? "" : "s"}`.replace("  ", " ")}
          </AdminButton>
        </>
      }
    >
      <div className="pa-table-scroll" style={{ maxHeight: 260, overflow: "auto" }}>
        <table className="pa-table">
          <caption className="sr-only">Incoming students</caption>
          <thead><tr><th scope="col" style={{ width: 36 }}><span className="sr-only">Select</span></th><th scope="col">Student</th><th scope="col">Cohort</th></tr></thead>
          <tbody>
            {incoming.map((placement) => (
              <tr key={placement.id} className="is-clickable" onClick={() => toggle(placement.id)}>
                <td><input type="checkbox" aria-label={`Select ${placement.student?.name ?? "student"}`} checked={picked.includes(placement.id)} onChange={() => toggle(placement.id)} onClick={(event) => event.stopPropagation()} /></td>
                <td><strong>{placement.student?.name ?? "Student"}</strong></td>
                <td>{placement.cohort_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label="Reason" required hint="The coordinator sees this, so they can choose another facility.">
        <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. No ward capacity for these dates" />
      </Field>
    </Modal>
  );
}
