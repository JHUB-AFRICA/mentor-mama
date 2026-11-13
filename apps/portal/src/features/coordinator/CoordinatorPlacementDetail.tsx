import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, MapPin, Pause, Play, Send, UserRound, XCircle } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { DetailList, Field, Modal, SelectInput, TextArea } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { ApiError, getPlacement, getPlacementOptions, getTransitions, overrideArrangement, releasePlacement, updatePlacementLifecycle, withdrawFacilityRequests } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, Notice, StatusPill } from "../programme-admin/ui/AdminKit";
import { JourneyStepper } from "../placements/JourneyStepper";
import { PlacementProgressSummary } from "../placements/PlacementProgressSummary";
import { RequestFacilitiesModal } from "./RequestFacilitiesModal";
import { isPlacementClosed, placementJourney, placementStateLabel, placementStateTone } from "../placements/placementJourney";

const PAUSE_REASONS: Array<[string, string]> = [["student_illness", "Student illness"], ["personal_family", "Personal or family"], ["industrial_action", "Industrial action"], ["facility_closure", "Facility closure"], ["ward_capacity", "Ward capacity"], ["academic_examinations", "Academic or examinations"], ["mentor_unavailability", "Mentor unavailability"], ["safeguarding_investigation", "Safeguarding investigation"], ["public_health_emergency", "Public health emergency"], ["other", "Other"]];
const WITHDRAW_REASONS: Array<[string, string]> = [["student_withdrew", "Student withdrew"], ["academic_decision", "Academic decision"], ["facility_capacity", "Facility capacity"], ["safeguarding", "Safeguarding"], ["administrative_error", "Administrative error"], ["other", "Other"]];
const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One placement from the coordinator's side: where it is, what it needs, what is permitted next. */
export function CoordinatorPlacementDetail({ id, onBack, onError, canOverride = false }: { id: string; onBack: () => void; onError: (message: string) => void; canOverride?: boolean }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [confirming, setConfirming] = useState<"pause" | "withdraw" | null>(null);
  const [reason, setReason] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [ovWard, setOvWard] = useState("");
  const [ovMentor, setOvMentor] = useState("");
  const [ovReason, setOvReason] = useState("");
  const options = useQuery({ queryKey: ["placement-options"], queryFn: getPlacementOptions, staleTime: 5 * 60_000 });
  const override = useMutation({
    mutationFn: () => overrideArrangement(id, { ...(ovWard ? { ward_id: ovWard } : {}), ...(ovMentor ? { mentor_id: ovMentor } : {}), reason: ovReason.trim() }),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Arrangement changed", message: "The facility's nurse manager has been told and can see your reason." });
      setOverriding(false);
      setOvWard("");
      setOvMentor("");
      setOvReason("");
      void queryClient.invalidateQueries({ queryKey: ["coordinator-placement", id] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not change the arrangement."),
  });
  const withdrawRequest = useMutation({
    mutationFn: () => withdrawFacilityRequests([id]),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Request withdrawn", message: "The facility no longer sees this student. You can send them somewhere else." });
      void queryClient.invalidateQueries({ queryKey: ["coordinator-placement", id] });
      void queryClient.invalidateQueries({ queryKey: ["coordinator-placements"] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not withdraw that request."),
  });
  const placement = useQuery({ queryKey: ["coordinator-placement", id], queryFn: () => getPlacement(id) });
  const transitions = useQuery({ queryKey: ["coordinator-placement-transitions", id, placement.data?.state], queryFn: () => getTransitions(id), enabled: Boolean(placement.data) });

  const act = useMutation({
    mutationFn: ({ action, why }: { action: "release" | "pause" | "resume" | "withdraw"; why?: string }) =>
      action === "release" ? releasePlacement(id) : updatePlacementLifecycle(id, action, why ?? ""),
    onSuccess: (_result, { action }) => {
      pushToast({
        kind: "success",
        title: action === "release" ? "Placement released" : action === "pause" ? "Placement paused" : action === "resume" ? "Placement resumed" : "Placement withdrawn",
        message: action === "release" ? "The student can now review and confirm this placement." : "The record and affected people have been updated.",
      });
      setConfirming(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["coordinator-placement", id] });
      void queryClient.invalidateQueries({ queryKey: ["coordinator-placements"] });
      void queryClient.invalidateQueries({ queryKey: ["coordinator-dashboard"] });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not update this placement."),
  });

  if (placement.isPending) return <AdminPage><Skeleton className="h-8 w-40" /><Skeleton className="h-28" /><Skeleton className="h-64" /></AdminPage>;
  if (placement.isError) return <PortalErrorState onRetry={() => void placement.refetch()} />;
  const item = placement.data;
  const available = transitions.data?.available ?? [];
  const can = (action: string) => available.includes(action as never);
  const completionStage = item.state === "active" || item.state === "paused";
  const blocked = !completionStage ? [] : (transitions.data?.blocked ?? []).flatMap((entry) => entry.reasons).map((r) => r.message).filter(Boolean).slice(0, 3);
  const journey = placementJourney(item.state, "staff");
  const closed = isPlacementClosed(item.state);
  const unrequested = item.state === "draft" && !item.facility_id && !item.requested_facility_id;
  const requested = item.state === "draft" && !item.facility_id && Boolean(item.requested_facility_id);
  const facilityChoices = [...new Map((options.data?.wards ?? []).map((w) => [w.facility_id, w.facility_name])).entries()].map(([fid, name]) => ({ id: fid, name }));
  const reasons = confirming === "pause" ? PAUSE_REASONS : WITHDRAW_REASONS;

  return (
    <AdminPage>
      <div>
        <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={onBack}>
          All placements
        </AdminButton>
      </div>
      <AdminPageHeader
        eyebrow="Placement handoff"
        title={item.student?.name ?? "Student placement"}
        meta={
          <>
            <StatusPill tone={placementStateTone(item.state)}>{placementStateLabel(item.state, "staff")}</StatusPill>
            <span><CalendarDays size={14} aria-hidden="true" /> {fmt(item.planned_start)} – {fmt(item.planned_end)}</span>
            <span><MapPin size={14} aria-hidden="true" /> {item.facility_name ?? "Facility pending"}</span>
          </>
        }
        actions={
          <>
            {can("awaiting_student") && (
              <AdminButton size="sm" icon={<Send />} disabled={act.isPending} onClick={() => act.mutate({ action: "release" })}>
                Release to student
              </AdminButton>
            )}
            {can("resume") && (
              <AdminButton size="sm" icon={<Play />} disabled={act.isPending} onClick={() => act.mutate({ action: "resume" })}>
                Resume
              </AdminButton>
            )}
            {can("pause") && (
              <AdminButton variant="secondary" size="sm" icon={<Pause />} disabled={act.isPending} onClick={() => setConfirming("pause")}>
                Pause
              </AdminButton>
            )}
            {can("withdraw") && (
              <AdminButton variant="secondary" size="sm" className="po-danger" icon={<XCircle />} disabled={act.isPending} onClick={() => setConfirming("withdraw")}>
                Withdraw
              </AdminButton>
            )}
          </>
        }
      />

      <JourneyStepper state={item.state} audience="staff" />
      <p className="rp-note">{journey.summary}</p>

      <div className="rp-grid-2">
        <AdminCard title="Placement details">
          <DetailList
            items={[
              { label: "Student", value: item.student?.email ?? "Not available", icon: <UserRound /> },
              { label: "Cohort", value: item.cohort_name ?? "Pending" },
              { label: "Facility · ward", value: `${item.facility_name ?? "Not allocated"}${item.ward?.name ? ` · ${item.ward.name}` : ""}`, icon: <MapPin /> },
              { label: "Mentor", value: item.mentor?.name ?? "Awaiting assignment" },
            ]}
          />
          <p className="pa-sub" style={{ marginTop: "0.8rem" }}>Ward allocation and mentor assignment belong to the facility team.</p>
        </AdminCard>
        <AdminCard title="Readiness" description="Safe progress signals. Restricted narratives stay with authorised roles.">
          <PlacementProgressSummary placementId={item.id} audience="admin" />
        </AdminCard>
      </div>

      {unrequested ? (
        <Notice icon={<Building2 />}>
          <strong>Waiting on you:</strong> this student has not been sent to a facility yet, so no nurse manager can see them.
          {item.declined_facility_name ? ` ${item.declined_facility_name} declined${item.decline_reason ? `: ${item.decline_reason}` : ""}.` : ""}{" "}
          <AdminButton size="sm" icon={<Building2 />} onClick={() => setRequesting(true)} disabled={facilityChoices.length === 0}>Send to a partner facility</AdminButton>
        </Notice>
      ) : requested ? (
        <Notice icon={<Building2 />}>
          <strong>Waiting on {item.requested_facility_name ?? "the facility"}:</strong> the nurse manager will place this student in a ward with a mentor from their Incoming requests.{" "}
          <AdminButton variant="secondary" size="sm" disabled={withdrawRequest.isPending} onClick={() => withdrawRequest.mutate()}>Withdraw request</AdminButton>
        </Notice>
      ) : closed ? (
        <Notice icon={<CheckCircle2 />}>This placement is {placementStateLabel(item.state, "staff").toLowerCase()}, so no further actions are available.</Notice>
      ) : blocked.length ? (
        <Notice icon={<CheckCircle2 />}>
          <strong>Waiting on:</strong> {blocked.join(" · ")}
        </Notice>
      ) : (
        <Notice icon={<CheckCircle2 />}>No coordinator blockers are recorded for this placement.</Notice>
      )}

      {canOverride && !closed && (
        <AdminCard
          title="Change the arrangement"
          description="Normally the facility's nurse manager places students. Override only when the programme needs a different ward or mentor. They are told, with your reason."
          action={<AdminButton variant="secondary" size="sm" onClick={() => setOverriding(true)}>Override</AdminButton>}
        >
          <p className="pa-sub">Current: {item.ward?.name ?? "no ward"} · {item.mentor?.name ?? "no mentor"}</p>
        </AdminCard>
      )}

      <RequestFacilitiesModal open={requesting} onClose={() => setRequesting(false)} placementIds={[id]} facilities={facilityChoices} />

      <Modal
        open={overriding}
        onClose={() => setOverriding(false)}
        dismissible={!override.isPending}
        size="sm"
        icon={<UserRound />}
        title="Override the facility's arrangement"
        description="Choose a new ward, a new mentor, or both. A reason is required."
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setOverriding(false)} disabled={override.isPending}>Cancel</AdminButton>
            <AdminButton size="sm" disabled={override.isPending || ovReason.trim().length < 5 || (!ovWard && !ovMentor)} onClick={() => override.mutate()}>
              {override.isPending ? "Saving…" : "Apply override"}
            </AdminButton>
          </>
        }
      >
        <Field label="Ward">
          <SelectInput value={ovWard} onChange={(event) => setOvWard(event.target.value)}>
            <option value="">Keep current ward</option>
            {(options.data?.wards ?? []).filter((w) => !item.facility_id || w.facility_id === item.facility_id).map((w) => (
              <option key={w.id} value={w.id}>{w.name} · {w.facility_name}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Mentor">
          <SelectInput value={ovMentor} onChange={(event) => setOvMentor(event.target.value)}>
            <option value="">Keep current mentor</option>
            {(options.data?.mentors ?? []).filter((m) => (!item.facility_id || m.facility_id === item.facility_id) && m.accepting_students && m.active_placements < m.max_active_placements).map((m) => (
              <option key={m.id} value={m.id}>{m.name} · {m.active_placements}/{m.max_active_placements}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Reason" required hint="Visible to the facility and recorded in the audit trail.">
          <TextArea rows={3} value={ovReason} onChange={(event) => setOvReason(event.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        dismissible={!act.isPending}
        size="sm"
        icon={confirming === "pause" ? <Pause /> : <XCircle />}
        title={confirming === "pause" ? "Pause this placement?" : "Withdraw this placement?"}
        description={confirming === "pause" ? "The interruption is recorded for continuity reporting." : "The student and facility are told. This ends the placement."}
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setConfirming(null)} disabled={act.isPending}>Cancel</AdminButton>
            <AdminButton size="sm" className={confirming === "withdraw" ? "po-danger" : undefined} variant={confirming === "withdraw" ? "secondary" : "primary"} disabled={act.isPending || !reason} onClick={() => confirming && act.mutate({ action: confirming, why: reason })}>
              {act.isPending ? "Saving…" : confirming === "pause" ? "Pause placement" : "Withdraw placement"}
            </AdminButton>
          </>
        }
      >
        <Field label="Reason" required>
          <SelectInput value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">Choose a reason</option>
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectInput>
        </Field>
      </Modal>
    </AdminPage>
  );
}
