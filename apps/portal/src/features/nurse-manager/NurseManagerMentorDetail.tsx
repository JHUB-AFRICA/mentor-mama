import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Clock3, Gauge, Mail, Save, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Field, FieldRow, TextArea, TextInput } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  getFacilityMentors,
  getMentorAvailabilityHistory,
  getPlacements,
  resendInvitation,
  updateFacilityMentor,
  type CurrentUser,
  type FacilityMentor,
  type MentorAvailabilityEvent,
  type Placement,
} from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, ListRow, Notice, StatCard, StatGrid, StatusPill } from "../programme-admin/ui/AdminKit";
import { isPlacementClosed, placementStateLabel, placementStateTone } from "../placements/placementJourney";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";

type Filter = "all" | "attention" | "active";

function describeChange(entry: MentorAvailabilityEvent): string {
  const parts: string[] = [];
  const accepting = entry.changes.accepting_students as { from: boolean; to: boolean } | undefined;
  const limit = entry.changes.max_active_placements as { from: number; to: number } | undefined;
  if (accepting) parts.push(accepting.to ? "Started accepting students" : "Stopped accepting students");
  if (limit) parts.push(`Student limit changed from ${limit.from} to ${limit.to}`);
  return parts.join(" · ") || "Availability updated";
}

/** One mentor: workload, availability controls and the history of changes. */
export function NurseManagerMentorDetail({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const mentorId = location.pathname.replace(/\/+$/, "").match(/^\/facility\/mentors\/([^/]+)$/)?.[1] ?? "";
  const [filter, setFilter] = useState<Filter>("all");
  const [accepting, setAccepting] = useState(true);
  const [limit, setLimit] = useState("5");
  const [reason, setReason] = useState("");
  const [inviting, setInviting] = useState(false);

  const query = useQuery<{ mentor: FacilityMentor; placements: Placement[] }>({
    queryKey: ["facility-mentor-detail", mentorId],
    enabled: Boolean(mentorId),
    queryFn: async () => {
      const [mentorPage, placementPage] = await Promise.all([getFacilityMentors({ page_size: 50 }), getPlacements({ mentor: mentorId, pageSize: 50 })]);
      const mentor = mentorPage.results.find((item) => item.id === mentorId);
      if (!mentor) throw new Error("This mentor is not available in your facility scope.");
      return { mentor, placements: placementPage.results };
    },
  });
  const history = useQuery({ queryKey: ["mentor-availability-history", mentorId], queryFn: () => getMentorAvailabilityHistory(mentorId), enabled: Boolean(mentorId) });
  const mentor = query.data?.mentor;
  const placements = query.data?.placements ?? [];

  useEffect(() => {
    if (!mentor) return;
    setAccepting(mentor.accepting_students);
    setLimit(String(mentor.max_active_placements));
  }, [mentor]);

  const save = useMutation({
    mutationFn: () => updateFacilityMentor(mentorId, { accepting_students: accepting, max_active_placements: Number(limit), reason }),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Mentor updated", message: "Availability and capacity were saved." });
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["facility-mentor-detail", mentorId] });
      void queryClient.invalidateQueries({ queryKey: ["mentor-availability-history", mentorId] });
      void queryClient.invalidateQueries({ queryKey: ["facility-mentors"] });
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not save mentor settings."),
  });

  async function resend(target: FacilityMentor) {
    setInviting(true);
    try {
      await resendInvitation(target.id);
      pushToast({ kind: "success", title: "Invitation resent", message: `${target.name} will get a fresh link by email.` });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not resend that invitation.");
    } finally {
      setInviting(false);
    }
  }

  const open = placements.filter((p) => !isPlacementClosed(p.state));
  const attention = open.filter((p) => ["awaiting_student", "orientation", "induction", "paused"].includes(p.state));
  const activePlacements = open.filter((p) => p.state === "active");
  const visible = filter === "attention" ? attention : filter === "active" ? activePlacements : placements;
  const atCapacity = Boolean(mentor && open.length >= mentor.max_active_placements);
  const dirty = Boolean(mentor && (accepting !== mentor.accepting_students || Number(limit) !== mentor.max_active_placements));
  const nav = (destination: string) => navigate(destination === "overview" ? "/facility" : destination === "placements" ? "/placements" : `/facility/${destination}`);

  const body = (() => {
    if (query.isPending) return <AdminPage><Skeleton className="h-8 w-40" /><Skeleton className="h-28" /><Skeleton className="h-64" /></AdminPage>;
    if (query.isError || !mentor) return <PortalErrorState onRetry={() => void query.refetch()} />;
    return (
      <AdminPage>
        <div>
          <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={() => navigate("/facility/mentors")}>
            All mentors
          </AdminButton>
        </div>
        <AdminPageHeader
          eyebrow="Facility mentor"
          title={mentor.name}
          meta={
            <>
              <StatusPill tone={mentor.status === "active" ? "success" : mentor.status === "invited" ? "warning" : "neutral"}>
                {mentor.status.charAt(0).toUpperCase() + mentor.status.slice(1)}
              </StatusPill>
              <span><Mail size={14} aria-hidden="true" /> {mentor.email}</span>
              {mentor.phone && <span>{mentor.phone}</span>}
            </>
          }
          actions={
            mentor.status === "invited" ? (
              <AdminButton variant="secondary" size="sm" icon={<Mail />} disabled={inviting} onClick={() => void resend(mentor)}>
                {inviting ? "Sending…" : "Resend invitation"}
              </AdminButton>
            ) : undefined
          }
        />

        <StatGrid columns={3}>
          <StatCard icon={<Users />} tone="teal" value={`${open.length} / ${mentor.max_active_placements}`} label="Students" hint="Open placements against limit" />
          <StatCard icon={<Gauge />} tone={attention.length ? "amber" : "green"} value={attention.length} label="Need attention" hint="Waiting, in induction or paused" />
          <StatCard icon={<Clock3 />} tone="blue" value={activePlacements.length} label="Active now" hint="In placement" />
        </StatGrid>

        {(!mentor.accepting_students || atCapacity) && (
          <Notice icon={<AlertTriangle />}>
            <strong>{atCapacity ? "Workload limit reached." : "New allocations are paused."}</strong>{" "}
            {atCapacity
              ? `This mentor has ${open.length} open placements, matching their limit of ${mentor.max_active_placements}. Review the workload before assigning another student.`
              : "New assignments to this mentor are blocked until availability is restored."}
          </Notice>
        )}

        <div className="rp-grid-2">
          <AdminCard
            title="Current workload"
            description="Students assigned to this mentor."
            action={
              <div className="pa-row-actions">
                {([["all", "All"], ["attention", "Attention"], ["active", "Active"]] as const).map(([value, label]) => (
                  <AdminButton key={value} size="sm" variant={filter === value ? "primary" : "ghost"} onClick={() => setFilter(value)}>
                    {label}
                  </AdminButton>
                ))}
              </div>
            }
            flush
          >
            {visible.length === 0 ? (
              <EmptyState icon={<Users />} title="No students here" text="Students assigned to this mentor appear in this list." />
            ) : (
              <div className="pa-list">
                {visible.map((placement) => (
                  <ListRow
                    key={placement.id}
                    icon={<Users />}
                    tone="teal"
                    title={placement.student?.name ?? "Student"}
                    meta={`${placement.ward?.name ?? "No ward"} · ${placement.cohort_name ?? ""}`}
                    trailing={<StatusPill tone={placementStateTone(placement.state)}>{placementStateLabel(placement.state, "staff")}</StatusPill>}
                    onClick={() => navigate(`/placements/${placement.id}`)}
                  />
                ))}
              </div>
            )}
          </AdminCard>

          <AdminCard title="Availability and capacity" description="Pause new allocations or change how many students this mentor supports.">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (dirty && limit && !save.isPending) save.mutate();
              }}
            >
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
                <input type="checkbox" checked={accepting} onChange={(event) => setAccepting(event.target.checked)} style={{ marginTop: 4 }} />
                <span>
                  <strong>Accepting new students</strong>
                  <small className="pa-sub">Turn this off when the mentor is temporarily unavailable.</small>
                </span>
              </label>
              <FieldRow>
                <Field label="Student limit" hint="1 to 50">
                  <TextInput type="number" min="1" max="50" value={limit} onChange={(event) => setLimit(event.target.value)} />
                </Field>
              </FieldRow>
              <Field label="Reason" optional hint="Recorded in the history below.">
                <TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this changing?" />
              </Field>
              <AdminButton type="submit" size="sm" icon={<Save />} disabled={!dirty || !limit || save.isPending}>
                {save.isPending ? "Saving…" : "Save changes"}
              </AdminButton>
            </form>
          </AdminCard>
        </div>

        <AdminCard title="Availability history" description="Who changed this mentor's availability or capacity, and when." flush>
          {history.isPending ? (
            <div className="p-4"><Skeleton className="h-24" /></div>
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState icon={<Clock3 />} title="No changes yet" text="Availability changes will be listed here." />
          ) : (
            <div className="pa-list">
              {(history.data ?? []).map((entry) => (
                <ListRow
                  key={entry.id}
                  icon={<Clock3 />}
                  tone="slate"
                  title={describeChange(entry)}
                  meta={`${entry.actor} · ${new Date(entry.occurred_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}${entry.reason ? ` · “${entry.reason}”` : ""}`}
                />
              ))}
            </div>
          )}
        </AdminCard>
      </AdminPage>
    );
  })();

  return (
    <FacilityWorkspaceFrame user={user} active="mentors" title="Mentor" onNavigate={nav} onAccount={() => navigate("/facility/account")} onError={onError}>
      {body}
    </FacilityWorkspaceFrame>
  );
}
