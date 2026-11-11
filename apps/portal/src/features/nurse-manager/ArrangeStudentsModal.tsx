import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Shuffle, Wand2 } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Modal } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { applyAutoArrange, previewAutoArrange, type ArrangeInput, type ArrangeResult } from "../../services/api";
import { AdminButton, Notice, StatusPill } from "../programme-admin/ui/AdminKit";

const newSeed = () => Math.random().toString(36).slice(2, 10);

/**
 * One-tap arrangement: the manager previews a random, capacity-aware spread of incoming
 * students across wards and mentors, can shuffle it, then confirms. Nothing is saved until confirm.
 */
export function ArrangeStudentsModal({ open, onClose, incomingCount }: { open: boolean; onClose: () => void; incomingCount: number }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [strategy, setStrategy] = useState<ArrangeInput["strategy"]>("balanced");
  const [assignMentors, setAssignMentors] = useState(true);
  const [seed, setSeed] = useState(newSeed);
  const [result, setResult] = useState<ArrangeResult | null>(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      setSeed(newSeed());
    }
  }, [open]);

  const input: ArrangeInput = { strategy, assign_mentors: assignMentors, seed };
  const preview = useQuery({
    queryKey: ["arrange-preview", strategy, assignMentors, seed],
    queryFn: () => previewAutoArrange(input),
    enabled: open && !result && incomingCount > 0,
    staleTime: 0,
    gcTime: 0,
  });
  const apply = useMutation({
    mutationFn: () => applyAutoArrange({ ...input, expected_plan_hash: plan?.plan_hash }),
    onSuccess: (data) => {
      setResult(data);
      pushToast({ kind: "success", title: "Students arranged", message: `${data.summary.arranged} placed. Mentors and the coordinator have been notified.` });
      void queryClient.invalidateQueries();
    },
    onError: (error) => pushToast({ kind: "error", title: "Could not arrange students", message: error instanceof Error ? error.message : "Try again." }),
  });

  const plan = preview.data;
  const rows = result ? result.arranged : plan?.assignments ?? [];
  const unplaced = result ? result.unplaced : plan?.unplaced ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!apply.isPending}
      icon={<Wand2 />}
      title={result ? "Arrangement complete" : "Arrange incoming students"}
      description={
        result
          ? "Wards and mentors are set. The coordinator can now release these placements."
          : `${incomingCount} ${incomingCount === 1 ? "student is" : "students are"} waiting. Preview a random spread across your wards, then confirm.`
      }
      footer={
        result ? (
          <AdminButton size="sm" onClick={onClose}>Done</AdminButton>
        ) : (
          <>
            <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={apply.isPending}>Cancel</AdminButton>
            <AdminButton variant="secondary" size="sm" icon={<Shuffle />} onClick={() => setSeed(newSeed())} disabled={apply.isPending || preview.isFetching}>
              Shuffle again
            </AdminButton>
            <AdminButton size="sm" onClick={() => apply.mutate()} disabled={!plan || plan.assignments.length === 0 || apply.isPending}>
              {apply.isPending ? "Arranging…" : `Confirm ${plan?.assignments.length ?? ""} placements`.trim()}
            </AdminButton>
          </>
        )
      }
    >
      {!result && (
        <div className="pa-form-row" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <label>
            <span className="pa-muted">Spread </span>
            <select value={strategy} onChange={(event) => setStrategy(event.target.value as ArrangeInput["strategy"])}>
              <option value="balanced">Balanced — keep wards evenly loaded</option>
              <option value="fill">Fill — fill one ward before the next</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={assignMentors} onChange={(event) => setAssignMentors(event.target.checked)} />
            Also assign mentors
          </label>
        </div>
      )}

      {preview.isPending && !result ? (
        <Skeleton className="h-40" />
      ) : preview.isError && !result ? (
        <Notice icon={<Wand2 />}>{preview.error instanceof Error ? preview.error.message : "Could not build a preview."}</Notice>
      ) : (
        <>
          {result && (
            <Notice icon={<CheckCircle2 />}>
              {result.summary.arranged} arranged · {result.summary.unplaced} not placed · {result.summary.mentors_notified} mentors emailed.
            </Notice>
          )}
          <div className="pa-table-scroll" style={{ maxHeight: 320, overflow: "auto" }}>
            <table className="pa-table">
              <caption className="sr-only">Proposed arrangement</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Ward</th>
                  <th scope="col">Mentor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.placement_id}>
                    <td><strong>{row.student}</strong></td>
                    <td>{row.ward?.name ?? "—"}</td>
                    <td>
                      {row.mentor?.name ?? <span className="pa-muted">Assign manually</span>}
                      {row.issues.map((issue) => <small key={issue} className="pa-sub">{issue}</small>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unplaced.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <StatusPill tone="warning">{unplaced.length} not placed</StatusPill>
              <ul className="pa-muted" style={{ marginTop: 6 }}>
                {unplaced.map((row) => <li key={row.placement_id}>{row.student}: {row.reason}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
