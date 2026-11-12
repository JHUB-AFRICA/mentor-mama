import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity, Building2, HeartHandshake, Wand2, CheckCircle2, ClipboardList, ShieldAlert, UserPlus, UserX, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { BarList } from "../../components/charts";
import { greetingFor } from "../../lib/greeting";
import { getMentorActivity } from "../../services/mentor-activity";
import { getDashboardIndicators, getFacilities, getFacilityMentors, getIncomingPlacements, getOrphanedPlacements, getPlacements, getWards, type CurrentUser } from "../../services/api";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  ListRow,
  StatCard,
  StatGrid,
  StatusPill,
} from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";
import { placementStateLabel, placementStateTone } from "../placements/placementJourney";
import { ArrangeStudentsModal } from "./ArrangeStudentsModal";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { isManagerActionablePlacement, managerPlacementAction } from "./managerPlacementLogic";

type Ward = Awaited<ReturnType<typeof getWards>>[number];

/** The nurse manager's facility overview: what needs a decision, how full the wards are, mentor capacity. */
export function NurseManagerDashboard({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const indicators = useQuery({ queryKey: ["facility-dashboard-indicators"], queryFn: getDashboardIndicators, staleTime: 15_000 });
  const facilities = useQuery({ queryKey: ["facility-dashboard-facilities"], queryFn: getFacilities, staleTime: 60_000 });
  const wards = useQuery({ queryKey: ["facility-dashboard-wards"], queryFn: getWards, staleTime: 15_000 });
  const placements = useQuery({ queryKey: ["facility-dashboard-placements"], queryFn: () => getPlacements({ pageSize: 50 }), staleTime: 15_000 });
  const mentors = useQuery({ queryKey: ["facility-dashboard-mentors"], queryFn: () => getFacilityMentors({ page_size: 50 }), staleTime: 15_000 });

  const incoming = useQuery({ queryKey: ["facility-incoming"], queryFn: getIncomingPlacements, staleTime: 15_000 });
  const orphaned = useQuery({ queryKey: ["facility-orphaned"], queryFn: getOrphanedPlacements, staleTime: 15_000 });
  const orphans = orphaned.data ?? [];
  const quiet = useQuery({ queryKey: ["facility-inactive-mentors", 14], queryFn: () => getMentorActivity(14), staleTime: 15_000 });
  const quietMentors = (quiet.data?.results ?? []).filter((row) => row.inactive);
  const [arranging, setArranging] = useState(false);
  const incomingCount = incoming.data?.length ?? 0;
  const n = (key: string) => indicators.data?.indicators[key] ?? 0;
  const facilityName = facilities.data?.[0]?.name ?? "Your facility";
  const actionable = (placements.data?.results ?? []).filter(isManagerActionablePlacement);
  const mentorAlerts = (mentors.data?.results ?? []).filter((m) => !m.accepting_students || m.active_placements >= m.max_active_placements);
  const concerns = n("open_concerns");
  const total = n("placements_total");
  const go = (path: string) => navigate(path);

  const wardColumns: ColumnDef<Ward>[] = [
    { accessorKey: "name", header: "Ward", cell: ({ row }) => <strong>{row.original.name}</strong> },
    { accessorKey: "shift_pattern", header: "Shifts", cell: ({ row }) => row.original.shift_pattern || <span className="pa-muted">—</span> },
    {
      id: "occupancy",
      header: "Occupancy",
      accessorFn: (row) => (row.max_students ? row.allocated_students / row.max_students : 0),
      cell: ({ row }) => (
        <span className="pa-cell-fill">
          <span>{row.original.allocated_students} / {row.original.max_students}</span>
          <span className="pa-meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, row.original.max_students ? (row.original.allocated_students / row.original.max_students) * 100 : 0)}%` }} />
          </span>
        </span>
      ),
    },
    {
      accessorKey: "available_slots",
      header: "Open slots",
      meta: { align: "right" },
      cell: ({ row }) => (row.original.available_slots > 0 ? row.original.available_slots : <StatusPill tone="warning">Full</StatusPill>),
    },
  ];

  return (
    <FacilityWorkspaceFrame user={user} active="overview" title="Facility overview" onError={onError}>
      <AdminPage>
        <AdminPageHeader
          eyebrow={facilityName}
          title={`${greetingFor(user.name)}.`}
          description={
            incomingCount > 0
              ? `${incomingCount} ${incomingCount === 1 ? "student is" : "students are"} waiting to be placed in your wards.`
              : actionable.length || concerns || orphans.length
              ? `${actionable.length + concerns + orphans.length} ${actionable.length + concerns + orphans.length === 1 ? "item needs" : "items need"} a decision from you.`
              : "Your facility is running smoothly. Nothing needs a decision right now."
          }
          actions={
            <>
              {incomingCount > 0 && (
                <AdminButton size="sm" icon={<Wand2 />} onClick={() => setArranging(true)}>
                  Arrange {incomingCount} {incomingCount === 1 ? "student" : "students"}
                </AdminButton>
              )}
              <AdminButton variant="secondary" size="sm" icon={<UserPlus />} onClick={() => go("/facility/mentors/invite")}>
                Invite mentors
              </AdminButton>
              <AdminButton size="sm" icon={<ClipboardList />} onClick={() => go("/placements")}>
                Placements
              </AdminButton>
            </>
          }
        />

        <StatGrid>
          <StatCard icon={<ClipboardList />} tone="teal" value={total} label="Placements" hint="All in your facility" loading={indicators.isPending} onClick={() => go("/placements")} />
          <StatCard icon={<Users />} tone="blue" value={n("placements_awaiting_student")} label="Awaiting student" hint="Ready for confirmation" loading={indicators.isPending} />
          <StatCard icon={<Activity />} tone="violet" value={n("placements_induction")} label="In induction" hint="Mentor sign-off pending" loading={indicators.isPending} />
          <StatCard icon={<ShieldAlert />} tone={concerns ? "rose" : "green"} value={concerns} label="Open concerns" hint={concerns ? "Needs a reviewer" : "All clear"} loading={indicators.isPending} onClick={() => go("/facility/safeguarding")} />
        </StatGrid>

        {orphans.length > 0 && (
          <AdminCard
            className="nm-orphans"
            title={`${orphans.length} ${orphans.length === 1 ? "placement needs" : "placements need"} a new mentor`}
            description={
              orphans.some((row) => row.urgent)
                ? "Their mentor was suspended or deactivated. Active placements cannot log sessions until you assign a new mentor."
                : "Their mentor was suspended or deactivated. Assign a new mentor before these placements start."
            }
            flush
          >
            {orphans.map((row) => (
              <ListRow
                key={row.placement_id}
                icon={<UserX />}
                tone={row.urgent ? "rose" : "amber"}
                title={`${row.student_first_name || "Student"} · ${placementStateLabel(row.state)}`}
                meta={`Was with ${row.mentor_name} (${row.mentor_status})`}
                trailing={row.urgent ? <StatusPill tone="danger">Sessions blocked</StatusPill> : <StatusPill tone="warning">Before start</StatusPill>}
                onClick={() => go(`/placements/${row.placement_id}`)}
              />
            ))}
          </AdminCard>
        )}

        {quiet.isPending ? (
          <Skeleton className="h-24" />
        ) : quiet.isError ? null : (
          <AdminCard
            className="nm-inactive"
            titleId="inactive-mentors-card"
            title={quietMentors.length ? `${quietMentors.length} ${quietMentors.length === 1 ? "mentor may" : "mentors may"} welcome a check-in` : "Mentors are logging sessions"}
            description={quietMentors.length ? "No recent session, or not signed in yet. A short conversation can help them get going." : "Every mentor with students has logged a session recently."}
            action={<AdminButton variant="ghost" size="sm" onClick={() => go("/facility/mentors?view=inactive")}>{quietMentors.length ? "View inactive mentors" : "View list"}</AdminButton>}
            flush
          >
            {quietMentors.length === 0 ? (
              <EmptyState icon={<HeartHandshake />} title="All clear" text="Nobody has been quiet for two weeks or more." />
            ) : (
              <div className="pa-list">
                {quietMentors.slice(0, 3).map((mentor) => (
                  <ListRow
                    key={mentor.id}
                    icon={<HeartHandshake />}
                    tone="amber"
                    title={mentor.name}
                    meta={mentor.reasons.join(" · ")}
                    onClick={() => go(`/facility/mentors/${mentor.id}`)}
                  />
                ))}
              </div>
            )}
          </AdminCard>
        )}

        <div className="rp-grid-2">
          <AdminCard
            title="Needs your decision"
            description="Placements waiting for a ward or a mentor."
            action={<AdminButton variant="ghost" size="sm" onClick={() => go("/placements")}>View all</AdminButton>}
            flush
          >
            {placements.isPending ? (
              <div className="p-4"><Skeleton className="h-28" /></div>
            ) : actionable.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="All clear" text="Every placement has what it needs from you." />
            ) : (
              <div className="pa-list">
                {actionable.slice(0, 5).map((placement) => (
                  <ListRow
                    key={placement.id}
                    icon={<ClipboardList />}
                    tone="amber"
                    title={placement.student?.name ?? "Student"}
                    meta={`${managerPlacementAction(placement).label} · ${placement.cohort_name ?? ""}`}
                    trailing={<StatusPill tone={placementStateTone(placement.state)}>{placementStateLabel(placement.state, "staff")}</StatusPill>}
                    onClick={() => go(`/placements/${placement.id}`)}
                  />
                ))}
              </div>
            )}
          </AdminCard>

          <AdminCard
            title="Mentor capacity"
            description="Mentors who are full or not accepting students."
            action={<AdminButton variant="ghost" size="sm" onClick={() => go("/facility/mentors")}>All mentors</AdminButton>}
            flush
          >
            {mentors.isPending ? (
              <div className="p-4"><Skeleton className="h-28" /></div>
            ) : mentorAlerts.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="Capacity is healthy" text={`${mentors.data?.results.length ?? 0} ${(mentors.data?.results.length ?? 0) === 1 ? "mentor can" : "mentors can"} take more students.`} />
            ) : (
              <div className="pa-list">
                {mentorAlerts.slice(0, 5).map((mentor) => (
                  <ListRow
                    key={mentor.id}
                    icon={<Users />}
                    tone="amber"
                    title={mentor.name}
                    meta={mentor.accepting_students ? `${mentor.active_placements} of ${mentor.max_active_placements} placements` : "Not accepting students"}
                    onClick={() => go(`/facility/mentors/${mentor.id}`)}
                  />
                ))}
              </div>
            )}
          </AdminCard>
        </div>

        <div className="rp-grid-2">
          <AdminCard title="Ward occupancy" description="How full each ward is." flush action={<AdminButton variant="ghost" size="sm" onClick={() => go("/facility/wards")}>Manage wards</AdminButton>}>
            {wards.isPending ? (
              <div className="p-4"><Skeleton className="h-28" /></div>
            ) : (
              <DataTable
                data={wards.data ?? []}
                columns={wardColumns}
                caption="Ward occupancy"
                pageSize={5}
                empty={<EmptyState icon={<Building2 />} title="No wards yet" text="Wards are set up by the programme team." />}
              />
            )}
          </AdminCard>
          <AdminCard title="Placement pipeline" description={`${total} ${total === 1 ? "placement" : "placements"} by stage.`}>
            {indicators.isPending ? (
              <Skeleton className="h-40" />
            ) : (
              <BarList
                items={[
                  ["Draft", "draft"], ["Scheduled", "scheduled"], ["Awaiting student", "awaiting_student"], ["Orientation", "orientation"],
                  ["Induction", "induction"], ["Active", "active"], ["Paused", "paused"], ["Completed", "completed"],
                ].map(([label, key]) => ({ label, value: n(`placements_${key}`) })).filter((item) => item.value > 0)}
                empty="No placements yet."
              />
            )}
          </AdminCard>
        </div>
        <ArrangeStudentsModal open={arranging} onClose={() => setArranging(false)} incomingCount={incomingCount} />
      </AdminPage>
    </FacilityWorkspaceFrame>
  );
}
