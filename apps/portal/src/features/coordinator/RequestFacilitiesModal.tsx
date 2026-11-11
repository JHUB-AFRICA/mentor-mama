import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Shuffle } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Modal } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { applyFacilityRequest, previewFacilityRequest, type FacilityRequestInput } from "../../services/api";
import { AdminButton, Notice, StatusPill } from "../programme-admin/ui/AdminKit";

const newSeed = () => Math.random().toString(36).slice(2, 10);

/** Coordinator asks one or more partner facilities to host the selected draft placements. */
export function RequestFacilitiesModal({
  open,
  onClose,
  placementIds,
  facilities,
}: {
  open: boolean;
  onClose: () => void;
  placementIds: string[];
  facilities: Array<{ id: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<FacilityRequestInput["mode"]>("capacity");
  const [seed, setSeed] = useState(newSeed);

  useEffect(() => {
    if (open) {
      setSelected(facilities.length === 1 ? [facilities[0].id] : []);
      setSeed(newSeed());
    }
  }, [open]);

  const input: FacilityRequestInput = { placement_ids: placementIds, facility_ids: selected, mode, seed };
  const preview = useQuery({
    queryKey: ["facility-request-preview", placementIds, selected, mode, seed],
    queryFn: () => previewFacilityRequest(input),
    enabled: open && selected.length > 0 && placementIds.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
  const apply = useMutation({
    mutationFn: () => applyFacilityRequest(input),
    onSuccess: (data) => {
      pushToast({ kind: "success", title: "Facilities notified", message: `${data.requested} students requested. Nurse managers have been emailed.` });
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (error) => pushToast({ kind: "error", title: "Could not send requests", message: error instanceof Error ? error.message : "Try again." }),
  });
  const nameOf = (id: string) => facilities.find((item) => item.id === id)?.name ?? "Facility";
  const plan = preview.data;
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!apply.isPending}
      icon={<Building2 />}
      title="Send to partner facilities"
      description={`${placementIds.length} draft ${placementIds.length === 1 ? "placement" : "placements"} selected. Each facility's nurse manager then places students in wards.`}
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={apply.isPending}>Cancel</AdminButton>
          {selected.length > 1 && (
            <AdminButton variant="secondary" size="sm" icon={<Shuffle />} onClick={() => setSeed(newSeed())} disabled={apply.isPending}>Shuffle again</AdminButton>
          )}
          <AdminButton size="sm" onClick={() => apply.mutate()} disabled={!plan || plan.assignments.length === 0 || apply.isPending}>
            {apply.isPending ? "Sending…" : "Send requests"}
          </AdminButton>
        </>
      }
    >
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend className="pa-muted">Partner facilities</legend>
        {facilities.map((item) => (
          <label key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
            {item.name}
          </label>
        ))}
      </fieldset>
      {selected.length > 1 && (
        <label style={{ display: "block", marginBottom: 12 }}>
          <span className="pa-muted">Split </span>
          <select value={mode} onChange={(event) => setMode(event.target.value as FacilityRequestInput["mode"])}>
            <option value="capacity">By declared free capacity</option>
            <option value="even">Evenly</option>
          </select>
        </label>
      )}
      {selected.length === 0 ? (
        <Notice icon={<Building2 />}>Choose at least one facility to preview the split.</Notice>
      ) : preview.isPending ? (
        <Skeleton className="h-24" />
      ) : preview.isError ? (
        <Notice icon={<Building2 />}>{preview.error instanceof Error ? preview.error.message : "Could not build a preview."}</Notice>
      ) : plan ? (
        <>
          <table className="pa-table">
            <caption className="sr-only">Requests per facility</caption>
            <thead>
              <tr><th scope="col">Facility</th><th scope="col">Free capacity</th><th scope="col">Students requested</th></tr>
            </thead>
            <tbody>
              {plan.facilities.map((row) => (
                <tr key={row.facility_id}>
                  <td><strong>{nameOf(row.facility_id)}</strong></td>
                  <td>{row.free_capacity}</td>
                  <td>{row.requested}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.unplaced.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <StatusPill tone="warning">{plan.unplaced.length} left unrequested</StatusPill>
              <p className="pa-muted">No declared capacity remains for them. Choose more facilities or use an even split.</p>
            </div>
          )}
        </>
      ) : null}
    </Modal>
  );
}
