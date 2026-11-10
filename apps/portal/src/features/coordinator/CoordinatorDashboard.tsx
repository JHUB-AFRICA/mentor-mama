import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ClipboardList, GraduationCap, Plus, ShieldAlert, UserPlus, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { BarList } from "../../components/charts";
import { greetingFor } from "../../lib/greeting";
import { getCohorts, getDashboardIndicators, getInstitutionStudents, type CurrentUser } from "../../services/api";
import { PortalErrorState } from "../../components/PortalErrorState";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  ListRow,
  StatCard,
  StatGrid,
} from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";

export type CoordinatorDestination = "students" | "cohorts" | "placements" | "safeguarding" | "reports";

/** The coordinator's morning view: what changed, what needs a decision, where students are. */
export function CoordinatorDashboard({
  user,
  onNavigate,
  onCreatePlacement,
  onInvite,
  onOpenCohort,
  onOpenPlacements,
}: {
  user: CurrentUser;
  onNavigate: (destination: CoordinatorDestination) => void;
  onCreatePlacement: () => void;
  onInvite: () => void;
  onOpenCohort: (id: string) => void;
  /** Open the placement register, optionally pre-filtered to a lifecycle stage. */
  onOpenPlacements: (state?: string) => void;
}) {
  const indicators = useQuery({ queryKey: ["coordinator-dashboard"], queryFn: getDashboardIndicators, staleTime: 15_000 });
  const cohorts = useQuery({ queryKey: ["institution-cohorts"], queryFn: getCohorts, staleTime: 30_000 });
  const students = useQuery({ queryKey: ["institution-students"], queryFn: () => getInstitutionStudents(), staleTime: 30_000 });

  const values = indicators.data?.indicators ?? {};
  const n = (key: string) => values[key] ?? 0;
  const setup = n("placements_draft") + n("placements_scheduled");
  const awaiting = n("placements_awaiting_student");
  const paused = n("placements_paused");
  const concerns = n("open_concerns");
  const needsAttention = setup + awaiting + paused + concerns;
  const canCreate = Boolean(user.capabilities.create_placement);
  const institution = user.scope?.institution_name ?? "Your institution";

  const pipeline = [
    ["Draft", "draft"],
    ["Scheduled", "scheduled"],
    ["Awaiting student", "awaiting_student"],
    ["Orientation", "orientation"],
    ["Induction", "induction"],
    ["Active", "active"],
    ["Paused", "paused"],
    ["Completed", "completed"],
  ].map(([label, key]) => ({ label, value: n(`placements_${key}`) }));
  const pipelineTotal = pipeline.reduce((sum, item) => sum + item.value, 0);

  type CohortRow = NonNullable<typeof cohorts.data>[number];
  const cohortColumns: ColumnDef<CohortRow>[] = [
    { accessorKey: "name", header: "Cohort", cell: ({ row }) => <strong>{row.original.name}</strong> },
    {
      id: "dates",
      header: "Dates",
      accessorFn: (row) => row.start_date,
      cell: ({ row }) => `${row.original.start_date} → ${row.original.end_date}`,
    },
    { accessorKey: "member_count", header: "Students", meta: { align: "right" } },
  ];

  if (indicators.isError) return <PortalErrorState onRetry={() => void indicators.refetch()} />;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={institution}
        title={`${greetingFor(user.name)}.`}
        description={
          needsAttention
            ? `${needsAttention} ${needsAttention === 1 ? "item needs" : "items need"} your attention today.`
            : "Everything is moving. Nothing is waiting for your decision."
        }
        actions={
          <>
            <AdminButton variant="secondary" size="sm" icon={<UserPlus />} onClick={onInvite}>
              Invite students
            </AdminButton>
            {canCreate && (
              <AdminButton size="sm" icon={<Plus />} onClick={onCreatePlacement}>
                New placement
              </AdminButton>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard icon={<Users />} tone="teal" value={students.data?.pagination.total_count ?? 0} label="Students" hint="In your institution" loading={students.isPending} onClick={() => onNavigate("students")} />
        <StatCard icon={<GraduationCap />} tone="violet" value={cohorts.data?.length ?? 0} label="Cohorts" hint="Planning groups" loading={cohorts.isPending} onClick={() => onNavigate("cohorts")} />
        <StatCard icon={<ClipboardList />} tone="blue" value={n("placements_active")} label="Active placements" hint={`${n("placements_completed")} completed`} loading={indicators.isPending} onClick={() => onOpenPlacements("active")} />
        <StatCard icon={<ShieldAlert />} tone={concerns ? "rose" : "green"} value={concerns} label="Open concerns" hint={concerns ? "Needs a reviewer" : "All clear"} loading={indicators.isPending} onClick={() => onNavigate("safeguarding")} />
      </StatGrid>

      <div className="rp-grid-2">
        <AdminCard title="Needs your attention" description="Start here. Each item opens the filtered list." flush>
          {indicators.isPending ? (
            <Skeleton className="h-32" />
          ) : needsAttention === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title="All clear" text="No placements are waiting on you and no concerns are open." />
          ) : (
            <div className="pa-list">
              {concerns > 0 && (
                <ListRow icon={<ShieldAlert />} tone="rose" title={`${concerns} safeguarding ${concerns === 1 ? "concern" : "concerns"}`} meta="Assign a reviewer or record the next action" onClick={() => onNavigate("safeguarding")} />
              )}
              {setup > 0 && (
                <ListRow icon={<ClipboardList />} tone="amber" title={`${setup} ${setup === 1 ? "placement needs" : "placements need"} setup or release`} meta="Allocate and release to the student" onClick={() => onOpenPlacements(n("placements_scheduled") ? "scheduled" : "draft")} />
              )}
              {awaiting > 0 && (
                <ListRow icon={<UserPlus />} tone="blue" title={`${awaiting} awaiting student confirmation`} meta="Follow up on the student handoff" onClick={() => onOpenPlacements("awaiting_student")} />
              )}
              {paused > 0 && (
                <ListRow icon={<BookOpen />} tone="amber" title={`${paused} paused ${paused === 1 ? "placement" : "placements"}`} meta="Coordinate the next permitted action" onClick={() => onOpenPlacements("paused")} />
              )}
            </div>
          )}
        </AdminCard>

        <AdminCard
          title="Placement pipeline"
          description={`${pipelineTotal} ${pipelineTotal === 1 ? "placement" : "placements"} across all stages.`}
          action={
            <AdminButton variant="ghost" size="sm" onClick={() => onNavigate("reports")}>
              Full report
            </AdminButton>
          }
        >
          {indicators.isPending ? <Skeleton className="h-40" /> : <BarList items={pipeline.filter((item) => item.value > 0)} empty="No placements yet." />}
        </AdminCard>
      </div>

      <AdminCard
        title="Cohorts"
        description="Your planning groups and how many students are enrolled."
        action={
          <AdminButton variant="ghost" size="sm" onClick={() => onNavigate("cohorts")}>
            View all
          </AdminButton>
        }
        flush
      >
        {cohorts.isPending ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : (
          <DataTable
            data={cohorts.data ?? []}
            columns={cohortColumns}
            caption="Cohorts"
            pageSize={5}
            onRowClick={(row) => onOpenCohort(row.id)}
            empty={<EmptyState icon={<GraduationCap />} title="No cohorts yet" text="Create a cohort to start enrolling students." action={<AdminButton size="sm" onClick={() => onNavigate("cohorts")}>Create a cohort</AdminButton>} />}
          />
        )}
      </AdminCard>
    </AdminPage>
  );
}
