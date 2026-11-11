import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, MapPin, Pause, Play, Save, UserRound, XCircle } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { DetailList, Field, Modal, SelectInput, TextArea } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  allocateWard,
  assignMentor,
  getPlacement,
  getPlacementActivity,
  getPlacementOptions,
  getTransitions,
  updatePlacementLifecycle,
  type CurrentUser,
  type Placement,
} from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, ListRow, Notice, StatusPill } from "../programme-admin/ui/AdminKit";
import { JourneyStepper } from "../placements/JourneyStepper";
import { PlacementProgressSummary } from "../placements/PlacementProgressSummary";
import { isPlacementClosed, placementJourney, placementStateLabel, placementStateTone } from "../placements/placementJourney";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { managerPlacementAction } from "./managerPlacementLogic";

const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One placement from the nurse manager's side: where it stands, what it needs from the facility, what is permitted next. */
export function NurseManagerPlacementDetail({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Role workspaces dispatch on pathname, so read the id from the URL.
  const id = location.pathname.match(/^\/placements\/([^/]+)$/)?.[1] ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const placement = useQuery({ queryKey: ["manager-placement", id], queryFn: () => getPlacement(id), enabled: Boolean(id) });
  const options = useQuery({ queryKey: ["manager-placement-options"], queryFn: getPlacementOptions, staleTime: 60_000 });
  const transitions = useQuery({ queryKey: ["manager-placement-transitions", id, placement.data?.state], queryFn: () => getTransitions(id), enabled: Boolean(placement.data) });
  const activity = useQuery({ queryKey: ["manager-placement-activity", id], queryFn: () => getPlacementActivity(id), enabled: Boolean(id) });

  const [ward, setWard] = useState<string | null>(null);
  const [mentor, setMentor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"pause" | "withdraw" | null>(null);
  const [reason, setReason] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["manager-placement", id] });
    void queryClient.invalidateQueries({ queryKey: ["manager-placement-transitions", id] });
    void queryClient.invalidateQueries({ queryKey: ["manager-placement-activity", id] });
    void queryClient.invalidateQueries({ queryKey: ["manager-placement-workspace"] });
    void queryClient.invalidateQueries({ queryKey: ["facility-incoming"] });
  };
  const run = useMutation({
    mutationFn: (command: () => Promise<Placement>) => command(),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Placement updated", message: "Your change was saved and the people involved are notified." });
      setWard(null);
      setMentor(null);
      setConfirming(null);
      setReason("");
      refresh();
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not complete that placement action."),
  });

  const body = (() => {
    if (placement.isPending) return <AdminPage><Skeleton className="h-8 w-40" /><Skeleton className="h-28" /><Skeleton className="h-64" /></AdminPage>;
    if (placement.isError || !placement.data) return <PortalErrorState onRetry={() => void placement.refetch()} />;
    const item = placement.data;
    const available = (transitions.data?.available ?? []) as string[];
    const can = (state: string, capability: string) => available.includes(state) && Boolean(user.capabilities[capability]);
    const closed = isPlacementClosed(item.state);
    const action = managerPlacementAction(item);
    const journey = placementJourney(item.state, "staff");
    const blocked = (transitions.data?.blocked ?? []).flatMap((entry) => entry.reasons).map((r) => r.message).filter(Boolean).slice(0, 3);
    const wardValue = ward ?? item.ward?.id ?? "";
    const mentorValue = mentor ?? item.mentor?.id ?? "";
    const wardChanged = wardValue !== (item.ward?.id ?? "") && wardValue !== "";
    const mentorChanged = mentorValue !== (item.mentor?.id ?? "") && mentorValue !== "";
    const canWard = Boolean(user.capabilities.allocate_ward) && !closed;
    const canMentor = Boolean(user.capabilities.assign_mentor) && !closed;

    return (
      <AdminPage>
        <div>
          <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={() => navigate("/placements")}>
            All placements
          </AdminButton>
        </div>
        <AdminPageHeader
          eyebrow="Facility placement"
          title={item.student?.name ?? "Student placement"}
          meta={
            <>
              <StatusPill tone={placementStateTone(item.state)}>{placementStateLabel(item.state, "staff")}</StatusPill>
              <span><CalendarDays size={14} aria-hidden="true" /> {fmt(item.planned_start)} – {fmt(item.planned_end)}</span>
              <span><MapPin size={14} aria-hidden="true" /> {item.ward?.name ?? "Ward not allocated"}</span>
            </>
          }
          actions={
            <>
              {can("resume", "resume_placement") && (
                <AdminButton size="sm" icon={<Play />} disabled={run.isPending} onClick={() => run.mutate(() => updatePlacementLifecycle(item.id, "resume", ""))}>
                  Resume
                </AdminButton>
              )}
              {can("complete", "complete_placement") && (
                <AdminButton size="sm" icon={<CheckCircle2 />} disabled={run.isPending} onClick={() => run.mutate(() => updatePlacementLifecycle(item.id, "complete", ""))}>
                  Complete
                </AdminButton>
              )}
              {can("pause", "pause_placement") && (
                <AdminButton variant="secondary" size="sm" icon={<Pause />} disabled={run.isPending} onClick={() => setConfirming("pause")}>
                  Pause
                </AdminButton>
              )}
              {can("withdraw", "withdraw_placement") && (
                <AdminButton variant="secondary" size="sm" className="po-danger" icon={<XCircle />} disabled={run.isPending} onClick={() => setConfirming("withdraw")}>
                  Withdraw
                </AdminButton>
              )}
            </>
          }
        />

        <JourneyStepper state={item.state} audience="staff" />
        <p className="rp-note">{journey.summary}</p>

        {action.actionable ? (
          <Notice icon={<CheckCircle2 />}>
            <strong>Next for you: {action.label}.</strong> This is a facility decision.
          </Notice>
        ) : closed ? (
          <Notice icon={<CheckCircle2 />}>This placement is {placementStateLabel(item.state, "staff").toLowerCase()}, so no further changes are available.</Notice>
        ) : (
          <Notice icon={<Clock3 />}>{action.label}. The next step belongs to the student, mentor or programme team.</Notice>
        )}

        <div className="rp-grid-2">
          <AdminCard title="Ward and mentor" description="Choose where the student works and who supports them. Changes notify the people involved.">
            <Field label="Ward">
              <SelectInput value={wardValue} disabled={!canWard || run.isPending} onChange={(event) => setWard(event.target.value)}>
                <option value="">No ward allocated</option>
                {(options.data?.wards ?? []).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Mentor">
              <SelectInput value={mentorValue} disabled={!canMentor || run.isPending} onChange={(event) => setMentor(event.target.value)}>
                <option value="">No mentor assigned</option>
                {(options.data?.mentors ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.active_placements}/{m.max_active_placements} students{m.accepting_students ? "" : " · not accepting"}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {(wardChanged || mentorChanged) && (
              <div className="pa-row-actions">
                {wardChanged && (
                  <AdminButton size="sm" icon={<Save />} disabled={run.isPending} onClick={() => run.mutate(() => allocateWard(item.id, wardValue))}>
                    Save ward
                  </AdminButton>
                )}
                {mentorChanged && (
                  <AdminButton size="sm" icon={<Save />} disabled={run.isPending} onClick={() => run.mutate(() => assignMentor(item.id, mentorValue))}>
                    Save mentor
                  </AdminButton>
                )}
              </div>
            )}
          </AdminCard>

          <AdminCard title="Placement details">
            <DetailList
              items={[
                { label: "Student", value: item.student?.email ?? "Not available", icon: <UserRound /> },
                { label: "Cohort", value: item.cohort_name ?? "Pending" },
                { label: "Ward", value: item.ward?.name ?? "Not allocated", icon: <MapPin /> },
                { label: "Mentor", value: item.mentor?.name ?? "Awaiting assignment" },
              ]}
            />
          </AdminCard>
        </div>

        <div className="rp-grid-2">
          <AdminCard title="Readiness" description="Safe progress signals. Restricted narratives stay with authorised roles.">
            <PlacementProgressSummary placementId={item.id} audience="admin" />
            {blocked.length > 0 && <p className="pa-sub" style={{ marginTop: "0.8rem" }}>Waiting on: {blocked.join(" · ")}</p>}
          </AdminCard>
          <AdminCard title="Recent changes" description="What changed on this placement, and who changed it." flush>
            {activity.isPending ? (
              <div className="p-4"><Skeleton className="h-28" /></div>
            ) : (activity.data ?? []).length === 0 ? (
              <EmptyState icon={<Clock3 />} title="Nothing yet" text="Changes to this placement will appear here." />
            ) : (
              <div className="pa-list">
                {(activity.data ?? []).slice(0, 6).map((entry) => (
                  <ListRow
                    key={entry.id}
                    icon={<Clock3 />}
                    tone="slate"
                    title={entry.action}
                    meta={`${entry.actor} · ${new Date(entry.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                  />
                ))}
              </div>
            )}
          </AdminCard>
        </div>

        <Modal
          open={Boolean(confirming)}
          onClose={() => setConfirming(null)}
          dismissible={!run.isPending}
          size="sm"
          icon={confirming === "pause" ? <Pause /> : <XCircle />}
          title={confirming === "pause" ? "Pause this placement?" : "Withdraw this placement?"}
          description={confirming === "pause" ? "The interruption is recorded for continuity reporting." : "The student and coordinator are told. This ends the placement."}
          footer={
            <>
              <AdminButton variant="secondary" size="sm" onClick={() => setConfirming(null)} disabled={run.isPending}>Cancel</AdminButton>
              <AdminButton
                size="sm"
                className={confirming === "withdraw" ? "po-danger" : undefined}
                variant={confirming === "withdraw" ? "secondary" : "primary"}
                disabled={run.isPending || !reason.trim()}
                onClick={() => confirming && run.mutate(() => updatePlacementLifecycle(item.id, confirming, reason.trim()))}
              >
                {run.isPending ? "Saving…" : confirming === "pause" ? "Pause placement" : "Withdraw placement"}
              </AdminButton>
            </>
          }
        >
          <Field label="Reason" required hint="Recorded with the change.">
            <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </Modal>
      </AdminPage>
    );
  })();

  return (
    <FacilityWorkspaceFrame user={user} active="placements" title="Placement" onAccount={() => navigate("/facility/account")} onError={onError}>
      {body}
    </FacilityWorkspaceFrame>
  );
}
