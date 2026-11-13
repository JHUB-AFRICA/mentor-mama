import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Shuffle, TriangleAlert } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Modal } from "../../../components/kit";
import { useToast } from "../../../components/ToastProvider";
import {
  applyCohortAutoRequest,
  applyFacilitySplit,
  messageOf,
  previewCohortAutoRequest,
  previewFacilitySplit,
  type SplitBasis,
  type SplitInput,
  type SplitMode,
} from "../../../services/placement-planning";
import { AdminButton, Notice, StatusPill } from "../../programme-admin/ui/AdminKit";
import { Meter } from "./planningUi";

const newSeed = () => Math.random().toString(36).slice(2, 10);

export interface SplitFacility {
  id: string;
  name: string;
  /** Free ward places for the cohort's dates, when known. */
  free?: number;
}

/**
 * Ask partner facilities to host the chosen students. Shows how the students would be spread across the facilities
 * (by free ward places, optionally limited by mentor places) before anything is sent. The reviewed split is the one
 * applied: the server refuses if capacity changed in between.
 */
export function RequestSplitDialog({
  open,
  onClose,
  placementIds,
  cohort,
  facilities,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  placementIds: string[];
  /** Whole-cohort mode: every student who still needs a facility, including those with no placement yet. */
  cohort?: { id: string; name: string; students: number };
  facilities: SplitFacility[];
  /** Called with the new run's id once the requests are recorded, to open the result page. */
  onApplied: (runId: string) => void;
}) {
  const { pushToast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<SplitMode>("capacity");
  const [basis, setBasis] = useState<SplitBasis>("wards");
  const [seed, setSeed] = useState(newSeed);

  useEffect(() => {
    if (!open) return;
    const withRoom = facilities.filter((item) => (item.free ?? 1) > 0).map((item) => item.id);
    setSelected(facilities.length === 1 ? [facilities[0].id] : withRoom);
    setMode("capacity");
    setBasis("wards");
    setSeed(newSeed());
    // Reset only when the dialog opens, not when the facility list refetches.
  }, [open]);

  const input: SplitInput = useMemo(
    () => ({ placement_ids: placementIds, facility_ids: selected, mode, basis, seed }),
    [placementIds, selected, mode, basis, seed],
  );
  const cohortId = cohort?.id;
  const studentCount = cohort ? cohort.students : placementIds.length;
  const preview = useQuery({
    queryKey: ["planning-split-preview", cohortId ?? "selection", input],
    queryFn: () => {
      if (!cohortId) return previewFacilitySplit(input);
      const { placement_ids: _ids, ...rest } = input;
      void _ids;
      return previewCohortAutoRequest(cohortId, rest);
    },
    enabled: open && selected.length > 0 && studentCount > 0,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const apply = useMutation({
    mutationFn: (hash: string) => {
      if (!cohortId) return applyFacilitySplit(input, hash);
      const { placement_ids: _ids, ...rest } = input;
      void _ids;
      return applyCohortAutoRequest(cohortId, rest, hash);
    },
    onSuccess: (data) => {
      pushToast({ kind: "success", title: "Facilities notified", message: `${data.requested} students requested. Nurse managers have been emailed.` });
      onApplied(data.run_id);
    },
    onError: (cause) => pushToast({ kind: "error", title: "Could not send the requests", message: messageOf(cause, "Try again.") }),
  });
  const plan = preview.data;
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const maxRequested = Math.max(1, ...(plan?.facilities.map((row) => row.requested) ?? [1]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!apply.isPending}
      size="lg"
      icon={<Building2 />}
      title={cohort ? "Share the cohort across partner facilities" : "Request facilities"}
      description={
        cohort
          ? `${cohort.students} ${cohort.students === 1 ? "student" : "students"} in ${cohort.name} still need a facility. The system creates any missing placements and shares everyone at random across the facilities you choose. Review the split before anything is sent.`
          : `${placementIds.length} ${placementIds.length === 1 ? "student" : "students"} selected. Choose the facilities and review how the students are shared before anything is sent.`
      }
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={apply.isPending}>Cancel</AdminButton>
          <AdminButton variant="secondary" size="sm" icon={<Shuffle />} onClick={() => setSeed(newSeed())} disabled={apply.isPending || selected.length === 0}>
            Shuffle again
          </AdminButton>
          <AdminButton size="sm" onClick={() => plan && apply.mutate(plan.plan_hash)} disabled={!plan || plan.assignments.length === 0 || apply.isPending}>
            {apply.isPending ? "Sending…" : plan ? `Send ${plan.assignments.length} ${plan.assignments.length === 1 ? "request" : "requests"}` : "Send requests"}
          </AdminButton>
        </>
      }
    >
      <fieldset className="pp-split-grid" style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
        <legend className="pa-muted" style={{ marginBottom: 6 }}>Partner facilities</legend>
        {facilities.length === 0 && <p className="pa-muted">No partner facilities are available in this programme yet.</p>}
        {facilities.map((item) => (
          <label key={item.id} className="pp-facility-opt">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
            <span>
              <strong>{item.name}</strong>
              {typeof item.free === "number" && <small>{item.free} free ward {item.free === 1 ? "place" : "places"} for these dates</small>}
            </span>
          </label>
        ))}
      </fieldset>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="pa-muted">Share the students</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as SplitMode)}>
            <option value="capacity">In proportion to free places</option>
            <option value="even">Evenly</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="pa-muted">Count room as</span>
          <select value={basis} onChange={(event) => setBasis(event.target.value as SplitBasis)}>
            <option value="wards">Free ward places</option>
            <option value="wards_and_mentors">Ward places limited by mentor places</option>
          </select>
        </label>
      </div>

      {selected.length === 0 ? (
        <Notice icon={<Building2 />}>Choose at least one facility to preview how the students would be shared.</Notice>
      ) : preview.isPending ? (
        <Skeleton className="h-28" />
      ) : preview.isError ? (
        <Notice icon={<TriangleAlert />}>{messageOf(preview.error, "We could not build a preview.")}</Notice>
      ) : plan ? (
        <div aria-live="polite">
          <div className="pa-table-scroll">
            <table className="pa-table">
              <caption className="sr-only">How the students would be shared across facilities</caption>
              <thead>
                <tr>
                  <th scope="col">Facility</th>
                  <th scope="col">Free places</th>
                  <th scope="col">Mentor places</th>
                  <th scope="col">Already waiting</th>
                  <th scope="col">Students</th>
                </tr>
              </thead>
              <tbody>
                {plan.facilities.map((row) => (
                  <tr key={row.facility_id}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.free_capacity}</td>
                    <td>{row.mentor_places_left}</td>
                    <td>{row.pending_requests}</td>
                    <td style={{ minWidth: 140 }}>
                      <Meter label={<strong>{row.requested}</strong>} total={maxRequested} before={0} added={row.requested} summary={`${row.requested} students to ${row.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pa-muted" style={{ margin: "8px 0" }}>
            Window {plan.window.start} to {plan.window.end}. Reproducible: the same shuffle code ({plan.seed}) always gives the same split.
          </p>
          {cohort && (plan.to_create ?? 0) > 0 && (
            <p className="pa-muted">{plan.to_create} {plan.to_create === 1 ? "student has" : "students have"} no placement yet; one is created for them when you send.</p>
          )}
          {plan.unplaced.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <StatusPill tone="warning">{plan.unplaced.length} would be left without a request</StatusPill>
              <p className="pa-muted">{plan.unplaced[0].reason} Choose more facilities, or share evenly and let each facility decide.</p>
            </div>
          )}
          {plan.skipped.length > 0 && (
            <p className="pa-muted">{plan.skipped.length} selected {plan.skipped.length === 1 ? "student was" : "students were"} left out because they are already requested or placed.</p>
          )}
          {plan.warnings.length > 0 && (
            <ul className="pp-result-list" aria-label="Capacity warnings">
              {plan.warnings.map((text) => <li key={text}>{text}</li>)}
            </ul>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
