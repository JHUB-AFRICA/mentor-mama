/**
 * Reports for the Programme Admin, University Coordinator and Nurse Manager.
 * One layout, scoped by the server to the viewer's institution, facility or
 * programme. Everything is aggregate; small groups are suppressed server-side.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  GraduationCap,
  Heart,
  Printer,
  ShieldAlert,
  Users,
  FileSpreadsheet,
  LineChart,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { BarList, CHART_COLORS, ColumnChart, DonutChart, RateRing, TrendChart } from "../../components/charts";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  Notice,
  SearchField,
  SelectField,
  StatCard,
  StatGrid,
  Toolbar,
} from "../programme-admin/ui/AdminKit";
import { DataTable, type ColumnDef } from "../programme-admin/ui/DataTable";
import { getReportInsights, type CurrentUser, type ReportInsights } from "../../services/api";
import { ExportCenter } from "./ExportCenter";
import "./reports.css";

type Tab = "overview" | "placements" | "mentorship" | "training" | "feedback" | "safeguarding" | "exports";
type Breakdown = ReportInsights["breakdown"][number];

const PRESETS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

const iso = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return iso(date);
};
const human = (value: string) => value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

const COPY: Record<string, { eyebrow: string; title: string; description: string; scope: string }> = {
  program_admin: { eyebrow: "Programme reports", title: "Reports & analytics", description: "How mentorship is running across every facility and institution in the programme.", scope: "Whole programme" },
  coordinator: { eyebrow: "Institution reports", title: "Reports & analytics", description: "Placement quality and student progress across your cohorts and partner facilities.", scope: "Your institution" },
  nurse_manager: { eyebrow: "Facility reports", title: "Reports & analytics", description: "Induction, mentor activity and student experience in your facility.", scope: "Your facility" },
};

export function ReportsDashboard({
  user,
  onError,
  onOpenSafeguarding,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
  onOpenSafeguarding?: () => void;
}) {
  const copy = COPY[user.role] ?? COPY.coordinator;
  const [tab, setTab] = useState<Tab>("overview");
  const [preset, setPreset] = useState("90");
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(iso(new Date()));
  const [cohortId, setCohortId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [search, setSearch] = useState("");

  const range = preset === "custom" ? { from, to } : { from: daysAgo(Number(preset)), to: iso(new Date()) };
  const validRange = range.from <= range.to;
  const query = useQuery({
    queryKey: ["report-insights", user.role, range.from, range.to, cohortId, facilityId],
    queryFn: () => getReportInsights({ ...range, cohort_id: cohortId || undefined, facility_id: facilityId || undefined }),
    enabled: validRange,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
  const data = query.data;
  const isManager = user.role === "nurse_manager";

  const tabs = useMemo(
    () => [
      { value: "overview" as Tab, label: "Overview", icon: <BarChart3 /> },
      { value: "placements" as Tab, label: "Placements & induction", icon: <ClipboardCheck /> },
      { value: "mentorship" as Tab, label: "Mentorship", icon: <Activity /> },
      { value: "training" as Tab, label: "Mentor training", icon: <GraduationCap /> },
      { value: "feedback" as Tab, label: "Feedback & confidence", icon: <Heart /> },
      { value: "safeguarding" as Tab, label: "Safeguarding", icon: <ShieldAlert />, count: data?.kpis.open_concerns || undefined },
      { value: "exports" as Tab, label: "Exports", icon: <FileSpreadsheet /> },
    ],
    [data?.kpis.open_concerns],
  );

  return (
    <AdminPage className="rp">
      <AdminPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <AdminButton variant="secondary" size="sm" icon={<Printer />} onClick={() => window.print()}>
            Print or save as PDF
          </AdminButton>
        }
      />

      <Toolbar filters={isManager ? 3 : 4}>
        <SelectField label="Reporting period" value={preset} onChange={setPreset} options={PRESETS} />
        {preset === "custom" && (
          <div className="rp-dates">
            <label>
              <span className="sr-only">From</span>
              <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
            </label>
            <span aria-hidden="true">→</span>
            <label>
              <span className="sr-only">To</span>
              <input type="date" value={to} min={from} max={iso(new Date())} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
            </label>
          </div>
        )}
        <SelectField
          label="Cohort"
          value={cohortId}
          onChange={setCohortId}
          options={[{ value: "", label: "All cohorts" }, ...(data?.options.cohorts ?? []).map((item) => ({ value: item.id, label: item.name }))]}
        />
        {!isManager && (
          <SelectField
            label="Facility"
            value={facilityId}
            onChange={setFacilityId}
            options={[{ value: "", label: "All facilities" }, ...(data?.options.facilities ?? []).map((item) => ({ value: item.id, label: item.name }))]}
          />
        )}
      </Toolbar>
      {!validRange && <Notice icon={<Activity />}>The start date must be on or before the end date.</Notice>}

      <AdminTabs label="Report sections" tabs={tabs} value={tab} onChange={setTab} />

      {query.isPending && validRange ? (
        <ReportSkeleton />
      ) : query.isError ? (
        <PortalErrorState onRetry={() => void query.refetch()} />
      ) : data ? (
        <div className={`rp-body${query.isFetching ? " is-refreshing" : ""}`} aria-busy={query.isFetching}>
          <p className="rp-scope">
            {copy.scope} · {shortDate(data.filters.from)} – {shortDate(data.filters.to)}
            {query.isFetching && " · updating…"}
          </p>
          {tab === "overview" && <Overview data={data} onGo={setTab} />}
          {tab === "placements" && <Placements data={data} search={search} onSearch={setSearch} />}
          {tab === "mentorship" && <Mentorship data={data} />}
          {tab === "training" && <Training data={data} />}
          {tab === "feedback" && <Feedback data={data} />}
          {tab === "safeguarding" && <Safeguarding data={data} onOpen={onOpenSafeguarding} />}
          {tab === "exports" && <ExportCenter user={user} cohorts={data.options.cohorts} facilities={data.options.facilities} onError={onError} />}
        </div>
      ) : null}
    </AdminPage>
  );
}

function ReportSkeleton() {
  return (
    <div className="rp-stack">
      <div className="rp-grid-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/* ---------------------------------------------------------------- Overview */

function change(current: number, previous: number) {
  if (!previous) return current ? "New this period" : "No change";
  const value = Math.round(((current - previous) * 100) / previous);
  return `${value >= 0 ? "+" : ""}${value}% vs previous period`;
}

function Overview({ data, onGo }: { data: ReportInsights; onGo: (tab: Tab) => void }) {
  const k = data.kpis;
  const weekly = data.sessions_weekly.map((row) => ({ label: shortDate(row.week), sessions: row.sessions }));
  return (
    <div className="rp-stack">
      <StatGrid>
        <StatCard icon={<Users />} tone="teal" value={k.students} label="Students on placement" hint={`${k.active_students} active now`} />
        <StatCard icon={<ClipboardCheck />} tone="violet" value={pct(k.induction.rate)} label="Induction completion" hint={`${k.induction.numerator} of ${k.induction.denominator} signed off`} onClick={() => onGo("placements")} />
        <StatCard icon={<Activity />} tone="blue" value={k.sessions} label="Mentorship sessions" hint={change(k.sessions, k.sessions_previous)} onClick={() => onGo("mentorship")} />
        <StatCard icon={<ShieldAlert />} tone={k.overdue_concerns ? "rose" : "amber"} value={k.open_concerns} label="Open concerns" hint={k.overdue_concerns ? `${k.overdue_concerns} overdue` : "None overdue"} onClick={() => onGo("safeguarding")} />
      </StatGrid>
      <StatGrid>
        <StatCard icon={<GraduationCap />} tone="green" value={pct(k.training.rate)} label="Mentors trained" hint={`${k.training.numerator} of ${k.training.denominator} finished required modules`} onClick={() => onGo("training")} />
        <StatCard icon={<Users />} tone="sky" value={k.mentors} label="Mentors supporting students" hint={k.sessions_per_student_week === null ? "No active students" : `${k.sessions_per_student_week} sessions / student / week`} />
        <StatCard icon={<Heart />} tone="rose" value={k.feedback_score === null ? "—" : `${k.feedback_score}/5`} label="Student feedback" hint={k.feedback_score === null ? `Shown once ${data.feedback.min_group}+ responses` : `${data.feedback.submissions} submissions`} onClick={() => onGo("feedback")} />
        <StatCard icon={<LineChart />} tone="amber" value={k.confidence_change === null ? "—" : `${k.confidence_change > 0 ? "+" : ""}${k.confidence_change}`} label="Confidence change" hint={k.confidence_change === null ? `Shown once ${data.confidence.min_group}+ students finish` : "Endline minus baseline (0–100)"} onClick={() => onGo("feedback")} />
      </StatGrid>
      <div className="rp-grid-2">
        <AdminCard title="Mentorship activity" description="Sessions logged each week in the reporting period.">
          <TrendChart data={weekly} series={[{ key: "sessions", label: "Sessions", color: CHART_COLORS.teal }]} summary={`${k.sessions} sessions logged in the period.`} />
        </AdminCard>
        <AdminCard title="Where students are now" description="Placements by lifecycle stage.">
          <BarList
            items={data.funnel.filter((item) => item.count > 0).map((item) => ({ label: item.label, value: item.count }))}
            empty="No placements match these filters."
          />
        </AdminCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Placements & induction */

function Placements({ data, search, onSearch }: { data: ReportInsights; search: string; onSearch: (value: string) => void }) {
  const kind = data.scope.breakdown_kind;
  const noun = kind === "facility" ? "Facility" : "Cohort";
  const rows = data.breakdown.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()));
  const columns: ColumnDef<Breakdown>[] = [
    { accessorKey: "name", header: noun, cell: ({ row }) => <strong>{row.original.name}</strong> },
    { accessorKey: "placements", header: "Placements", meta: { align: "right" } },
    { accessorKey: "active_students", header: "Active students", meta: { align: "right" } },
    { accessorKey: "induction_rate", header: "Induction", cell: ({ row }) => pct(row.original.induction_rate), meta: { align: "right" } },
    { accessorKey: "sessions", header: "Sessions", meta: { align: "right" } },
    { accessorKey: "sessions_per_student_week", header: "Per student / week", cell: ({ row }) => row.original.sessions_per_student_week ?? "—", meta: { align: "right" } },
    { accessorKey: "open_concerns", header: "Open concerns", meta: { align: "right" } },
  ];
  const chart = data.breakdown.map((row) => ({ label: row.name.length > 16 ? `${row.name.slice(0, 15)}…` : row.name, induction: row.induction_rate }));
  return (
    <div className="rp-stack">
      <div className="rp-grid-2">
        <AdminCard title="Placement pipeline" description="Every placement in scope, by lifecycle stage.">
          <BarList items={data.funnel.map((item) => ({ label: item.label, value: item.count }))} max={Math.max(1, ...data.funnel.map((item) => item.count))} />
        </AdminCard>
        <AdminCard title="Induction completion" description="Students past orientation whose mentor signed the checklist.">
          <div className="rp-center">
            <RateRing rate={data.kpis.induction.rate} label="Signed off" detail={`${data.kpis.induction.numerator} of ${data.kpis.induction.denominator} students`} />
          </div>
          <ColumnChart data={chart} series={[{ key: "induction", label: "Induction %", color: CHART_COLORS.violet }]} unit="%" yMax={100} height={170} summary={`Induction completion by ${kind}.`} />
        </AdminCard>
      </div>
      <AdminCard title={`By ${kind}`} description={`How each ${kind} compares on the programme indicators.`} flush>
        <DataTable
          data={rows}
          columns={columns}
          caption={`Indicators by ${kind}`}
          csvName={`mentormama-indicators-by-${kind}`}
          initialSort={[{ id: "placements", desc: true }]}
          toolbar={<SearchField label={`Search ${kind}`} placeholder={`Search ${kind}`} value={search} onChange={onSearch} />}
          empty={<EmptyState icon={<ClipboardCheck />} title="No placements match these filters" text="Widen the reporting period or clear the cohort and facility filters." />}
        />
      </AdminCard>
    </div>
  );
}

/* ---------------------------------------------------------------- Mentorship */

function Mentorship({ data }: { data: ReportInsights }) {
  const k = data.kpis;
  const weekly = data.sessions_weekly.map((row) => ({ label: shortDate(row.week), sessions: row.sessions }));
  const palette = [CHART_COLORS.teal, CHART_COLORS.violet, CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.green, CHART_COLORS.rose, CHART_COLORS.slate];
  return (
    <div className="rp-stack">
      <StatGrid columns={3}>
        <StatCard icon={<Activity />} tone="teal" value={k.sessions} label="Sessions logged" hint={change(k.sessions, k.sessions_previous)} />
        <StatCard icon={<Users />} tone="blue" value={k.sessions_per_student_week ?? "—"} label="Sessions per student per week" hint="Across active students" />
        <StatCard icon={<Users />} tone="violet" value={`${k.students_with_sessions}/${k.students}`} label="Students with a session" hint="In the reporting period" />
      </StatGrid>
      <AdminCard title="Weekly activity" description="Sessions logged by mentors, grouped by week.">
        <TrendChart data={weekly} series={[{ key: "sessions", label: "Sessions", color: CHART_COLORS.teal }]} height={260} summary={`${k.sessions} sessions across ${weekly.length} weeks.`} />
      </AdminCard>
      <div className="rp-grid-2">
        <AdminCard title="Session types" description="What kind of support mentors are giving.">
          <DonutChart
            data={data.session_types.map((item, index) => ({ name: human(item.type), value: item.count, color: palette[index % palette.length] }))}
            centerValue={k.sessions}
            centerLabel="sessions"
            summary="Sessions by type."
          />
        </AdminCard>
        <AdminCard title="Topics covered" description="The ten most common topics.">
          <BarList items={data.topics.map((item) => ({ label: human(item.topic), value: item.count }))} empty="No topics recorded in this period." />
        </AdminCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Training */

function Training({ data }: { data: ReportInsights }) {
  const t = data.kpis.training;
  const columns: ColumnDef<ReportInsights["training"]["modules"][number]>[] = [
    { accessorKey: "title", header: "Module", cell: ({ row }) => <strong>{row.original.title}</strong> },
    { accessorKey: "required", header: "Required", cell: ({ row }) => (row.original.required ? "Yes" : "No") },
    { accessorKey: "completed", header: "Completed", meta: { align: "right" } },
    { accessorKey: "total", header: "Mentors", meta: { align: "right" } },
    {
      id: "rate",
      header: "Completion",
      accessorFn: (row) => (row.total ? Math.round((row.completed * 100) / row.total) : 0),
      cell: ({ row }) => `${row.original.total ? Math.round((row.original.completed * 100) / row.original.total) : 0}%`,
      meta: { align: "right" },
    },
  ];
  return (
    <div className="rp-stack">
      <div className="rp-grid-2">
        <AdminCard title="Required training" description="Mentors who finished every required module.">
          <div className="rp-center">
            <RateRing
              rate={t.rate}
              label="Fully trained"
              detail={data.training.required_modules ? `${t.numerator} of ${t.denominator} mentors · ${data.training.required_modules} required modules` : "No required modules are set"}
              color={CHART_COLORS.green}
            />
          </div>
        </AdminCard>
        <AdminCard title="Module completion" description="Share of mentors in scope who completed each published module.">
          <BarList
            items={data.training.modules.map((item) => ({
              label: item.title,
              value: item.total ? Math.round((item.completed * 100) / item.total) : 0,
              hint: `${item.completed} of ${item.total} mentors${item.required ? " · required" : ""}`,
            }))}
            max={100}
            suffix="%"
            empty="No published modules, or no mentors assigned yet."
          />
        </AdminCard>
      </div>
      <AdminCard title="Module detail" flush>
        <DataTable
          data={data.training.modules}
          columns={columns}
          caption="Mentor training by module"
          csvName="mentormama-training-completion"
          empty={<EmptyState icon={<GraduationCap />} title="No training data yet" text="Completion appears once mentors are assigned and modules are published." />}
        />
      </AdminCard>
    </div>
  );
}

/* ------------------------------------------------------------------ Feedback */

function Feedback({ data }: { data: ReportInsights }) {
  const f = data.feedback;
  const c = data.confidence;
  return (
    <div className="rp-stack">
      <Notice icon={<Heart />}>
        Feedback and confidence figures are shown only for groups of {f.min_group} or more students, and never alongside names or comments, so no one can be identified.
      </Notice>
      <StatGrid columns={3}>
        <StatCard icon={<Heart />} tone="rose" value={f.overall_mean === null ? "—" : `${f.overall_mean}/5`} label="Average rating" hint={`${f.submissions} feedback submissions`} />
        <StatCard icon={<ShieldAlert />} tone="amber" value={f.follow_ups_flagged} label="Marked as needing follow-up" hint="Count only, no details" />
        <StatCard icon={<LineChart />} tone="teal" value={c.change === null ? "—" : `${c.change > 0 ? "+" : ""}${c.change}`} label="Confidence change" hint={`${c.pairs} students with both scores`} />
      </StatGrid>
      <div className="rp-grid-2">
        <AdminCard title="Student experience" description="Average rating out of 5 for each statement.">
          <BarList
            items={f.questions.filter((q) => q.mean !== null).map((q) => ({ label: q.label, value: q.mean ?? 0, hint: `${q.responses} responses` }))}
            max={5}
            suffix="/5"
            empty={`Ratings appear once at least ${f.min_group} students have responded.`}
          />
        </AdminCard>
        <AdminCard title="Confidence growth" description="Average self-rated confidence (0–100) at the start and end of placement.">
          {c.change === null ? (
            <p className="rp-note">Shown once {c.min_group} or more students have both a starting and an ending score. Currently {c.pairs}.</p>
          ) : (
            <ColumnChart
              data={[
                { label: "Start of placement", score: c.baseline_mean },
                { label: "End of placement", score: c.endline_mean },
              ]}
              series={[{ key: "score", label: "Confidence", color: CHART_COLORS.teal }]}
              yMax={100}
              height={220}
              summary={`Confidence rose from ${c.baseline_mean} to ${c.endline_mean}.`}
            />
          )}
        </AdminCard>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Safeguarding */

function Safeguarding({ data, onOpen }: { data: ReportInsights; onOpen?: () => void }) {
  const s = data.safeguarding;
  const colors: Record<string, string> = { low: CHART_COLORS.green, medium: CHART_COLORS.amber, high: CHART_COLORS.rose };
  return (
    <div className="rp-stack">
      <StatGrid>
        <StatCard icon={<ShieldAlert />} tone="rose" value={s.open} label="Open concerns" hint={`${s.overdue} older than ${s.overdue_after_days} days`} />
        <StatCard icon={<ShieldAlert />} tone="amber" value={s.raised_in_period} label="Raised in period" />
        <StatCard icon={<ClipboardCheck />} tone="green" value={s.resolved_in_period} label="Resolved in period" />
        <StatCard icon={<Activity />} tone="blue" value={s.by_state.find((item) => item.state === "under_review")?.count ?? 0} label="Under review" />
      </StatGrid>
      <div className="rp-grid-2">
        <AdminCard title="Concerns by category" description="Raised during the reporting period.">
          <BarList items={s.by_category.map((item) => ({ label: item.category, value: item.count }))} empty="No concerns were raised in this period." />
        </AdminCard>
        <AdminCard title="Open concerns by severity" description="Everything not yet resolved.">
          <DonutChart
            data={s.by_severity.map((item) => ({ name: human(item.severity), value: item.count, color: colors[item.severity] }))}
            centerValue={s.open}
            centerLabel="open"
            summary="Open concerns by severity."
          />
        </AdminCard>
      </div>
      <AdminCard title="Review the concerns themselves" description="Counts here are aggregate. Narratives open only for an authorised reviewer in the safeguarding queue.">
        {onOpen ? (
          <AdminButton icon={<ShieldAlert />} onClick={onOpen}>
            Open safeguarding queue
          </AdminButton>
        ) : (
          <p className="rp-note">Your role can see these totals but not the concern narratives.</p>
        )}
      </AdminCard>
    </div>
  );
}
