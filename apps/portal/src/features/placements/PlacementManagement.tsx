import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Archive,
  ArrowLeft,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Hash,
  Hospital,
  Mail,
  MessageSquarePlus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  allocateWard,
  addPlacementNote,
  assignMentor,
  createPlacement,
  getCohortStudents,
  getPlacement,
  getPlacementActivity,
  getPlacementNotes,
  getPlacementOptions,
  getPlacementProgress,
  getPlacements,
  getDashboardIndicators,
  getTransitions,
  reassignMentor,
  releasePlacement,
  sendPlacementAcknowledgementReminder,
  updatePlacementLifecycle,
  type CurrentUser,
  type Placement,
  type PlacementPage,
  type PlacementState,
  type PlacementActivityEntry,
  type PlacementOptions,
  type PlacementNote,
  type PlacementProgress,
  type TransitionResponse,
} from "../../services/api";
import { PortalWorkspaceLayout } from "../workspaces/PortalWorkspaceLayout";
import {
  CoordinatorFrame,
  type CoordinatorNav,
} from "../coordinator/CoordinatorFrame";
import {
  ProgrammeAdminFrame,
  type ProgrammeAdminNav,
} from "../programme-admin/ProgrammeAdminFrame";
import { FacilityWorkspaceFrame } from "../nurse-manager/FacilityWorkspaceFrame";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  DetailList,
  Field as KitField,
  FieldRow,
  Modal,
  SelectInput,
  TextArea,
  TextInput,
} from "../../components/kit";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  SearchField,
  SelectField,
  StatusPill,
  Toolbar,
  type PillTone,
} from "../programme-admin/ui/AdminKit";
import { isPlacementClosed, placementJourney } from "./placementJourney";
import "./placement-management.css";
import "./placement-admin.css";
import "./placement-admin-detail.css";

type LifecycleAction = "pause" | "resume" | "complete" | "withdraw" | "archive";

const pauseReasons = [
  ["student_illness", "Student illness"],
  ["personal_family", "Personal or family"],
  ["industrial_action", "Industrial action"],
  ["facility_closure", "Facility closure"],
  ["ward_capacity", "Ward capacity"],
  ["academic_examinations", "Academic or examinations"],
  ["mentor_unavailability", "Mentor unavailability"],
  ["safeguarding_investigation", "Safeguarding investigation"],
  ["public_health_emergency", "Public health emergency"],
  ["other", "Other"],
] as const;

const withdrawalReasons = [
  ["student_withdrew", "Student withdrew"],
  ["academic_decision", "Academic decision"],
  ["facility_capacity", "Facility capacity"],
  ["safeguarding", "Safeguarding concern"],
  ["administrative_error", "Administrative error"],
  ["other", "Other"],
] as const;

export function ProgrammeAdminPlacementManagement({
  user,
  onError,
  managerMode = false,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
  managerMode?: boolean;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [searchParams] = useSearchParams();
  const placementBasePath =
    user.role === "coordinator" ? "/coordinator/placements" : "/placements";
  const [rows, setRows] = useState<Placement[]>([]);
  const [options, setOptions] = useState<PlacementOptions | null>(null);
  const [selected, setSelected] = useState<Placement | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [cohortFilter, setCohortFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("");
  const [wardFilter, setWardFilter] = useState(
    () => searchParams.get("ward") ?? "",
  );
  const [mentorFilter, setMentorFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<
    PlacementPage["pagination"] | null
  >(null);
  const [dashboardCounts, setDashboardCounts] = useState<
    Record<string, number>
  >({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const canCreate = Boolean(user.capabilities.create_placement);
  const hasFilters = Boolean(
    searchInput ||
    stateFilter ||
    cohortFilter ||
    institutionFilter ||
    facilityFilter ||
    wardFilter ||
    mentorFilter,
  );
  const activeFilterCount = [
    stateFilter,
    cohortFilter,
    institutionFilter,
    facilityFilter,
    wardFilter,
    mentorFilter,
  ].filter(Boolean).length;
  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStateFilter("");
    setCohortFilter("");
    setInstitutionFilter("");
    setFacilityFilter("");
    setWardFilter("");
    setMentorFilter("");
    setPage(1);
  }
  async function refresh() {
    setLoading(true);
    try {
      const [pageResult, reference, dashboard] = await Promise.all([
        getPlacements({
          page,
          search,
          state: stateFilter,
          cohort: cohortFilter,
          institution: institutionFilter,
          facility: facilityFilter,
          ward: wardFilter,
          mentor: mentorFilter,
        }),
        getPlacementOptions(),
        getDashboardIndicators().catch(() => ({
          role: user.role,
          indicators: {} as Record<string, number>,
        })),
      ]);
      setRows(pageResult.results);
      setPagination(pageResult.pagination);
      setOptions(reference);
      setDashboardCounts(dashboard.indicators);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not load placements.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [
    page,
    search,
    stateFilter,
    cohortFilter,
    institutionFilter,
    facilityFilter,
    wardFilter,
    mentorFilter,
  ]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  async function open(id: string) {
    try {
      routerNavigate(`${placementBasePath}/${id}`);
      setSelected(await getPlacement(id));
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not load that placement.",
      );
    }
  }
  useEffect(() => {
    const routeId = location.pathname.match(
      new RegExp(`^${placementBasePath.replaceAll("/", "\\/")}/([^/]+)$`),
    )?.[1];
    if (routeId === "new") {
      setSelected({
        id: "new",
        state: "draft",
        planned_start: "",
        planned_end: "",
        actual_end: null,
        active_mentor_id: null,
      });
    } else if (routeId) void open(routeId);
    const onPopState = () => {
      const id = location.pathname.match(
        new RegExp(`^${placementBasePath.replaceAll("/", "\\/")}/([^/]+)$`),
      )?.[1];
      if (!id) {
        setSelected(null);
        return;
      }
      void getPlacement(id)
        .then(setSelected)
        .catch((cause) =>
          onError(
            cause instanceof Error
              ? cause.message
              : "We could not load that placement.",
          ),
        );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [location.pathname]);
  async function run(command: () => Promise<Placement>): Promise<boolean> {
    setBusy(true);
    try {
      setSelected(await command());
      setNotice("Placement updated successfully.");
      pushToast({ kind: "success", title: "Placement updated", message: "The change was saved." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-indicators"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["report-overview"] }),
      ]);
      await refresh();
      return true;
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not complete that placement action.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const adminView = user.role === "program_admin" && !managerMode;
  const adminCreating = adminView && selected?.id === "new";
  if (selected && !adminCreating) {
    const Detail = adminView ? ProgrammeAdminPlacementDetail : PlacementDetail;
    return (
      <Detail
        user={user}
        managerMode={managerMode}
        placement={selected}
        options={options}
        canCreate={canCreate}
        canWard={Boolean(user.capabilities.allocate_ward) && !isPlacementClosed(selected.state)}
        canMentor={Boolean(user.capabilities.assign_mentor) && !isPlacementClosed(selected.state)}
        canRelease={Boolean(user.capabilities.release_placement)}
        canPause={Boolean(user.capabilities.pause_placement)}
        canResume={Boolean(user.capabilities.resume_placement)}
        canComplete={Boolean(user.capabilities.complete_placement)}
        canArchive={Boolean(user.capabilities.archive_placement)}
        canWithdraw={Boolean(user.capabilities.withdraw_placement)}
        busy={busy}
        onBack={() => {
          setSelected(null);
          routerNavigate(placementBasePath);
        }}
        onError={onError}
        notice={notice}
        onDismissNotice={() => setNotice("")}
        onWard={(id) => void run(() => allocateWard(selected.id, id))}
        onMentor={(id, reason) =>
          void run(() =>
            selected.mentor?.id && selected.mentor.id !== id
              ? reassignMentor(selected.id, id, reason ?? "")
              : assignMentor(selected.id, id),
          )
        }
        onRelease={() => void run(() => releasePlacement(selected.id))}
        onReminder={async () => {
          const sent = await run(() =>
            sendPlacementAcknowledgementReminder(selected.id),
          );
          if (sent) setNotice("Reminder sent to the student.");
          return sent;
        }}
        onNote={async (body) => {
          await addPlacementNote(selected.id, body);
          setNotice("Note added to this placement.");
          pushToast({ kind: "success", title: "Note added", message: "Your note was saved to this placement." });
        }}
        onCreate={(input) => void run(() => createPlacement(input))}
        onLifecycle={(action, reason, note) =>
          void run(() =>
            updatePlacementLifecycle(selected.id, action, reason, note),
          )
        }
      />
    );
  }
  if (user.role === "program_admin") {
    const newPlacement = () =>
      setSelected({
        id: "new",
        state: "draft",
        planned_start: "",
        planned_end: "",
        actual_end: null,
        active_mentor_id: null,
      });
    const toOptions = (items: Array<[string, string]>) =>
      items.map(([value, label]) => ({ value, label }));
    const facilityOptions: Array<[string, string]> = [
      ["", "All facilities"],
      ...Array.from(
        new Map(
          (options?.wards ?? []).map((item) => [
            item.facility_id,
            item.facility_name,
          ]),
        ).entries(),
      ),
    ];
    return (
      <PlacementWorkspaceFrame user={user} title="Placements" onError={onError}>
        <AdminPage className="placement-management-page">
          {notice && (
            <Notice message={notice} onDismiss={() => setNotice("")} />
          )}
          <AdminPageHeader
            eyebrow="Placements"
            title="Placements"
            description="See where each student is in the placement lifecycle and resolve the next operational handoff."
            actions={
              canCreate && (
                <AdminButton icon={<Plus />} onClick={newPlacement}>
                  New placement
                </AdminButton>
              )
            }
          />
          {!adminCreating && (
          <>
          <AdminTabs
            label="Placement lifecycle"
            value={stateFilter}
            onChange={(value) => {
              setStateFilter(value);
              setPage(1);
            }}
            tabs={placementLifecycleTabs.map((tab) => ({
              value: tab.value,
              label: tab.label,
              count: placementTabCount(tab.value, dashboardCounts, pagination),
            }))}
          />
          <Toolbar filters={3}>
            <SearchField
              label="Search placements"
              placeholder="Search student, mentor, cohort, facility or ward"
              value={searchInput}
              onChange={setSearchInput}
            />
            <SelectField
              label="Filter by status"
              value={stateFilter}
              onChange={(value) => {
                setStateFilter(value);
                setPage(1);
              }}
              options={toOptions(placementStateOptions)}
            />
            <SelectField
              label="Filter by cohort"
              value={cohortFilter}
              onChange={(value) => {
                setCohortFilter(value);
                setPage(1);
              }}
              options={toOptions([
                ["", "All cohorts"],
                ...(options?.cohorts.map(
                  (item) => [item.id, item.name] as [string, string],
                ) ?? []),
              ])}
            />
            <SelectField
              label="Filter by facility"
              value={facilityFilter}
              onChange={(value) => {
                setFacilityFilter(value);
                setPage(1);
              }}
              options={toOptions(facilityOptions)}
            />
            <span className="pm-toolbar-actions">
              <button
                type="button"
                className="pa-filter-btn"
                aria-expanded={filtersOpen}
                aria-pressed={filtersOpen}
                onClick={() => setFiltersOpen((value) => !value)}
              >
                <SlidersHorizontal size={16} />
                More filters
                {activeFilterCount > 0 && (
                  <span className="pa-tab__count">{activeFilterCount}</span>
                )}
              </button>
              {hasFilters && (
                <AdminButton variant="ghost" size="sm" onClick={clearFilters}>
                  Clear
                </AdminButton>
              )}
            </span>
          </Toolbar>
          {filtersOpen && (
            <div className="pm-filters-extra">
              <SelectField
                label="Filter by institution"
                value={institutionFilter}
                onChange={(value) => {
                  setInstitutionFilter(value);
                  setPage(1);
                }}
                options={toOptions([
                  ["", "All institutions"],
                  ...Array.from(
                    new Map(
                      (options?.cohorts ?? []).map((item) => [
                        item.institution_id,
                        item.institution_name,
                      ]),
                    ).entries(),
                  ),
                ])}
              />
              <SelectField
                label="Filter by ward"
                value={wardFilter}
                onChange={(value) => {
                  setWardFilter(value);
                  setPage(1);
                }}
                options={toOptions([
                  ["", "All wards"],
                  ...(options?.wards.map(
                    (item) => [item.id, item.name] as [string, string],
                  ) ?? []),
                ])}
              />
              <SelectField
                label="Filter by mentor"
                value={mentorFilter}
                onChange={(value) => {
                  setMentorFilter(value);
                  setPage(1);
                }}
                options={toOptions([
                  ["", "All mentors"],
                  ...(options?.mentors.map(
                    (item) => [item.id, item.name] as [string, string],
                  ) ?? []),
                ])}
              />
            </div>
          )}
          <section className="pa-table-wrap" aria-label="Placements register">
            {loading ? (
              <div className="pm-skeleton">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="animate-pulse" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<FileText size={22} />}
                title={hasFilters ? "No placements match" : "No placements yet"}
                text={
                  hasFilters
                    ? "Try a different search or filter, or clear the current filters."
                    : "Create the first placement from an enrolled student and cohort."
                }
                action={
                  !hasFilters && canCreate ? (
                    <AdminButton size="sm" onClick={newPlacement}>
                      Create placement
                    </AdminButton>
                  ) : undefined
                }
              />
            ) : (
              <>
              <ul className="pm-cards" aria-label="Placements">
                {rows.map((placement) => (
                  <AdminPlacementCard
                    key={placement.id}
                    placement={placement}
                    onOpen={() => void open(placement.id)}
                  />
                ))}
              </ul>
              <div className="pa-table-scroll pm-table-scroll">
                <table className="pa-table pm-table">
                  <thead>
                    <tr>
                      <th scope="col">Student / cohort</th>
                      <th scope="col">Facility</th>
                      <th scope="col">Ward</th>
                      <th scope="col">Mentor</th>
                      <th scope="col">Status</th>
                      <th scope="col">Next step</th>
                      <th scope="col">Updated</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((placement) => (
                      <AdminPlacementRow
                        key={placement.id}
                        placement={placement}
                        onOpen={() => void open(placement.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
            {pagination && rows.length > 0 && (
              <div className="pa-table-footer">
                <span>
                  Showing {(pagination.page - 1) * pagination.page_size + 1}–
                  {Math.min(
                    pagination.page * pagination.page_size,
                    pagination.total_count,
                  )}{" "}
                  of {pagination.total_count} placements
                </span>
                <span className="pm-pager">
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    disabled={!pagination.has_previous}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </AdminButton>
                  <span>
                    Page {pagination.page} of {pagination.total_pages}
                  </span>
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    disabled={!pagination.has_next}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </AdminButton>
                </span>
              </div>
            )}
          </section>
          </>
          )}
          {adminCreating && (
            <NewPlacementModal
              options={options}
              canCreate={canCreate}
              busy={busy}
              onError={onError}
              onClose={() => {
                setSelected(null);
                routerNavigate(placementBasePath);
              }}
              onCreate={(input) => run(() => createPlacement(input))}
            />
          )}
        </AdminPage>
      </PlacementWorkspaceFrame>
    );
  }
  return (
    <PlacementWorkspaceFrame user={user} title="Placements" onError={onError}>
      <div className="placement-management-page text-navy">
        <main className="mx-auto max-w-[82rem] py-8">
          {notice && (
            <Notice message={notice} onDismiss={() => setNotice("")} />
          )}
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="font-body text-[0.68rem] font-bold uppercase tracking-[0.18em] text-teal">
                Placements
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Placements
              </h1>
              <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-navy-muted sm:text-base">
                See where each student is in the placement lifecycle and resolve
                the next operational handoff.
              </p>
            </div>
            {canCreate && (
              <Button
                onClick={() =>
                  setSelected({
                    id: "new",
                    state: "draft",
                    planned_start: "",
                    planned_end: "",
                    actual_end: null,
                    active_mentor_id: null,
                  })
                }
              >
                <Plus size={17} className="mr-2" />
                New placement
              </Button>
            )}
          </div>
          <div className="placement-register mt-7">
            <div className="placement-lifecycle-tabs border-b border-border px-4 pt-3 sm:px-5">
              {placementLifecycleTabs.map((tab) => {
                const selectedTab = stateFilter === tab.value;
                return (
                  <button
                    key={tab.value || "all"}
                    type="button"
                    aria-current={selectedTab ? "page" : undefined}
                    onClick={() => {
                      setStateFilter(tab.value);
                      setPage(1);
                    }}
                    className={`placement-lifecycle-tab ${selectedTab ? "placement-lifecycle-tab--active" : ""}`}
                  >
                    <span>{tab.label}</span>
                    <span className="placement-tab-count">
                      {placementTabCount(
                        tab.value,
                        dashboardCounts,
                        pagination,
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="placement-filter-bar border-b border-border px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="placement-search-field flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-white px-4 py-1">
                  <Search size={17} className="text-navy-muted" />
                  <input
                    aria-label="Search placements"
                    placeholder="Search student, mentor, cohort, facility or ward"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    className="min-h-11 flex-1 bg-transparent font-body text-sm outline-none placeholder:text-navy-muted"
                  />
                </div>
                <FilterSelect
                  compact
                  label="Status"
                  value={stateFilter}
                  onChange={(value) => {
                    setStateFilter(value);
                    setPage(1);
                  }}
                  options={placementStateOptions}
                />
                <FilterSelect
                  compact
                  label="Cohort"
                  value={cohortFilter}
                  onChange={(value) => {
                    setCohortFilter(value);
                    setPage(1);
                  }}
                  options={[
                    ["", "All cohorts"],
                    ...(options?.cohorts.map(
                      (item) => [item.id, item.name] as [string, string],
                    ) ?? []),
                  ]}
                />
                <FilterSelect
                  compact
                  label="Facility"
                  value={facilityFilter}
                  onChange={(value) => {
                    setFacilityFilter(value);
                    setPage(1);
                  }}
                  options={[
                    ["", "All facilities"],
                    ...Array.from(
                      new Map(
                        (options?.wards ?? []).map((item) => [
                          item.facility_id,
                          item.facility_name,
                        ]),
                      ).entries(),
                    ),
                  ]}
                />
                <button
                  type="button"
                  onClick={() => setFiltersOpen((value) => !value)}
                  aria-expanded={filtersOpen}
                  className="placement-filter-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 font-body text-sm font-semibold text-navy transition hover:border-teal hover:text-teal"
                >
                  <SlidersHorizontal size={16} />
                  More filters
                  {activeFilterCount > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-teal text-xs text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="min-h-11 px-2 font-body text-sm font-semibold text-teal underline underline-offset-4"
                  >
                    Clear
                  </button>
                )}
              </div>
              {filtersOpen && (
                <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
                  <FilterSelect
                    label="Institution"
                    value={institutionFilter}
                    onChange={(value) => {
                      setInstitutionFilter(value);
                      setPage(1);
                    }}
                    options={[
                      ["", "All institutions"],
                      ...Array.from(
                        new Map(
                          (options?.cohorts ?? []).map((item) => [
                            item.institution_id,
                            item.institution_name,
                          ]),
                        ).entries(),
                      ),
                    ]}
                  />
                  <FilterSelect
                    label="Ward"
                    value={wardFilter}
                    onChange={(value) => {
                      setWardFilter(value);
                      setPage(1);
                    }}
                    options={[
                      ["", "All wards"],
                      ...(options?.wards.map(
                        (item) => [item.id, item.name] as [string, string],
                      ) ?? []),
                    ]}
                  />
                  <FilterSelect
                    label="Mentor"
                    value={mentorFilter}
                    onChange={(value) => {
                      setMentorFilter(value);
                      setPage(1);
                    }}
                    options={[
                      ["", "All mentors"],
                      ...(options?.mentors.map(
                        (item) => [item.id, item.name] as [string, string],
                      ) ?? []),
                    ]}
                  />
                </div>
              )}
            </div>
            <div className="placement-table-wrap">
              <div className="placement-table placement-table--header hidden border-b border-border bg-mist/45 px-4 py-3 md:grid">
                <PlacementHeader>Student / cohort</PlacementHeader>
                <PlacementHeader>Facility</PlacementHeader>
                <PlacementHeader>Ward</PlacementHeader>
                <PlacementHeader>Mentor</PlacementHeader>
                <PlacementHeader>Status</PlacementHeader>
                <PlacementHeader>Next step</PlacementHeader>
                <PlacementHeader>Updated</PlacementHeader>
                <span aria-hidden="true" />
              </div>
              {loading ? (
                <div className="space-y-px bg-white">
                  {Array.from({ length: 5 }, (_, index) => (
                    <div
                      key={index}
                      className="h-20 animate-pulse border-b border-border bg-mist/40"
                    />
                  ))}
                </div>
              ) : (
                rows.map((placement) => (
                  <PlacementRow
                    key={placement.id}
                    placement={placement}
                    onOpen={() => void open(placement.id)}
                  />
                ))
              )}
              {!loading && rows.length === 0 && (
                <div className="px-5 py-14 text-center">
                  <p className="font-display text-xl font-bold">
                    {hasFilters ? "No placements match" : "No placements yet"}
                  </p>
                  <p className="mx-auto mt-2 max-w-md font-body text-sm leading-6 text-navy-muted">
                    {hasFilters
                      ? "Try a different search or filter, or clear the current filters."
                      : "Create the first placement from an enrolled student and cohort."}
                  </p>
                  {!hasFilters && canCreate && (
                    <Button
                      className="mt-5"
                      size="sm"
                      onClick={() =>
                        setSelected({
                          id: "new",
                          state: "draft",
                          planned_start: "",
                          planned_end: "",
                          actual_end: null,
                          active_mentor_id: null,
                        })
                      }
                    >
                      Create placement
                    </Button>
                  )}
                </div>
              )}
            </div>
            {pagination && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4">
                <p className="font-body text-sm text-navy-muted">
                  Showing {(pagination.page - 1) * pagination.page_size + 1}–
                  {Math.min(
                    pagination.page * pagination.page_size,
                    pagination.total_count,
                  )}{" "}
                  of {pagination.total_count} placements
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="tertiary"
                    disabled={!pagination.has_previous}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <span className="self-center font-body text-xs font-semibold text-navy-muted">
                    Page {pagination.page} of {pagination.total_pages}
                  </span>
                  <Button
                    size="sm"
                    variant="tertiary"
                    disabled={!pagination.has_next}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </PlacementWorkspaceFrame>
  );
}

function adminStatusTone(state: PlacementState): PillTone {
  if (state === "active") return "success";
  if (state === "awaiting_student" || state === "paused") return "warning";
  if (state === "withdrawn") return "danger";
  if (state === "draft" || state === "scheduled") return "info";
  if (state === "orientation" || state === "induction") return "teal";
  return "neutral";
}

function AdminPlacementRow({
  placement,
  onOpen,
}: {
  placement: Placement;
  onOpen: () => void;
}) {
  const studentName = placement.student?.name ?? "Student pending";
  return (
    <tr className="pm-row" onClick={onOpen}>
      <td>
        <div className="pa-cell-title">
          <div className="min-w-0">
            <button
              type="button"
              className="pm-name"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              {studentName}
            </button>
            <small>{placement.cohort_name ?? "Cohort pending"}</small>
          </div>
        </div>
      </td>
      <td>{placement.facility_name ?? "Not allocated"}</td>
      <td>{placement.ward?.name ?? "Pending"}</td>
      <td>{placement.mentor?.name ?? "Pending"}</td>
      <td>
        <StatusPill tone={adminStatusTone(placement.state)}>
          {placementStateLabel(placement.state)}
        </StatusPill>
      </td>
      <td>
        <span className="pm-next">{placementNextStep(placement.state)}</span>
      </td>
      <td className="whitespace-nowrap">
        {formatShortDate(placement.planned_start)}
      </td>
      <td className="text-right">
        <button
          type="button"
          className="pm-icon-btn"
          aria-label={`Open placement for ${studentName}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function AdminPlacementCard({
  placement,
  onOpen,
}: {
  placement: Placement;
  onOpen: () => void;
}) {
  const studentName = placement.student?.name ?? "Student pending";
  return (
    <li>
      <button
        type="button"
        className="pm-card"
        onClick={onOpen}
        aria-label={`Open placement for ${studentName}`}
      >
        <span className="pm-card__top">
          <span className="pm-card__who">
            <strong>{studentName}</strong>
            <small>{placement.cohort_name ?? "Cohort pending"}</small>
          </span>
          <StatusPill tone={adminStatusTone(placement.state)}>
            {placementStateLabel(placement.state)}
          </StatusPill>
        </span>
        <span className="pm-card__next">
          <ChevronRight size={14} aria-hidden="true" />
          Next: {placementNextStep(placement.state)}
        </span>
        <span className="pm-card__meta">
          <span>
            <Hospital size={13} aria-hidden="true" />
            {placement.facility_name ?? "Not allocated"}
            {placement.ward?.name ? ` · ${placement.ward.name}` : ""}
          </span>
          <span>
            <UserRound size={13} aria-hidden="true" />
            {placement.mentor?.name ?? "Mentor pending"}
          </span>
        </span>
      </button>
    </li>
  );
}

function PlacementHeader({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
      {children}
    </span>
  );
}
const placementLifecycleTabs = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "awaiting_student", label: "Awaiting student" },
  { value: "scheduled", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const placementStateOptions: Array<[string, string]> = [
  ["", "All statuses"],
  ["draft", "Draft"],
  ["scheduled", "Upcoming"],
  ["awaiting_student", "Awaiting student"],
  ["orientation", "Orientation"],
  ["induction", "Induction"],
  ["active", "Active"],
  ["paused", "Paused"],
  ["completed", "Completed"],
  ["archived", "Archived"],
  ["withdrawn", "Withdrawn"],
];

function placementTabCount(
  state: string,
  counts: Record<string, number>,
  pagination: PlacementPage["pagination"] | null,
) {
  if (!state) return pagination?.total_count ?? 0;
  const key = `placements_${state === "scheduled" ? "scheduled" : state}`;
  return counts[key] ?? 0;
}

function placementNextStep(state: PlacementState) {
  const steps: Record<PlacementState, string> = {
    draft: "Complete setup",
    scheduled: "Release placement",
    awaiting_student: "Student confirmation",
    orientation: "Complete orientation",
    induction: "Complete induction",
    active: "Ongoing placement",
    paused: "Resume placement",
    completed: "Archive record",
    archived: "—",
    withdrawn: "—",
  };
  return steps[state];
}

function placementStatusTone(state: PlacementState) {
  if (state === "active") return "placement-status-pill--active";
  if (state === "awaiting_student") return "placement-status-pill--awaiting";
  if (state === "orientation" || state === "induction")
    return "placement-status-pill--progress";
  if (state === "scheduled") return "placement-status-pill--upcoming";
  if (state === "completed" || state === "archived")
    return "placement-status-pill--complete";
  if (state === "paused" || state === "withdrawn")
    return "placement-status-pill--attention";
  return "placement-status-pill--neutral";
}
function LifecycleStepper({ state }: { state: string }) {
  const journey = placementJourney(state, "staff");
  return (
    <section
      aria-label="Placement lifecycle"
      className="mt-7 overflow-x-auto border-y border-border py-6"
    >
      <ol className="flex min-w-[46rem] items-start">
        {journey.stages.map((stage, index) => {
          const done = stage.status === "done";
          const active = done || stage.status !== "upcoming";
          const stopped = stage.status === "stopped";
          const attention = stage.status === "attention";
          const isCurrent = stage.status === "current" || attention || stopped;
          return (
            <li
              key={stage.key}
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex min-w-20 flex-1 flex-col items-center text-center"
            >
              <span
                aria-hidden="true"
                className={`absolute left-1/2 top-3 h-px w-full ${index < journey.stages.length - 1 && done ? "bg-teal" : index < journey.stages.length - 1 ? "bg-border" : "bg-transparent"}`}
              />
              <span
                className={`relative z-10 flex size-6 items-center justify-center rounded-full border font-body text-xs font-bold ${active ? (stopped ? "border-error bg-error text-white" : attention ? "border-warning bg-warning text-white" : "border-teal bg-teal text-white") : "border-border bg-white text-navy-muted"}`}
              >
                {done ? <Check size={14} strokeWidth={3} /> : index + 1}
              </span>
              <p
                className={`relative z-10 mt-3 max-w-20 font-body text-[0.68rem] font-bold leading-4 ${isCurrent ? (stopped ? "text-error" : "text-navy") : "text-navy-muted"}`}
              >
                {stage.label}
                <span className="sr-only">{done ? " (complete)" : isCurrent ? " (current)" : " (upcoming)"}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
function blockerOwner(code: string) {
  const owners: Record<string, string> = {
    FinalAssessmentMissing: "Student action",
    OpenEscalationBlocksCompletion: "Authorised safeguarding review",
  };
  return owners[code] ?? "Programme team review";
}
function PlacementRow({
  placement,
  onOpen,
}: {
  placement: Placement;
  onOpen: () => void;
}) {
  const state = placement.state.replaceAll("_", " ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="placement-table placement-table--row group block w-full border-b border-border px-4 py-4 text-left transition last:border-0 hover:bg-mist/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
    >
      <div className="hidden items-center gap-4 md:contents">
        <div>
          <p className="font-body text-sm font-semibold text-navy group-hover:text-teal">
            {placement.student?.name ?? "Student pending"}
          </p>
          <p className="mt-1 font-body text-xs text-navy-muted">
            {placement.cohort_name ?? "Cohort pending"}
          </p>
        </div>
        <p className="font-body text-sm text-navy-muted">
          {placement.facility_name ?? "Not allocated"}
        </p>
        <p className="flex items-center gap-2 font-body text-sm text-navy-muted">
          <Building2 size={15} className="text-teal" />
          {placement.ward?.name ?? "Pending"}
        </p>
        <p className="truncate font-body text-sm text-navy-muted">
          {placement.mentor?.name ?? "Pending"}
        </p>
        <span
          className={`placement-status-pill ${placementStatusTone(placement.state)}`}
        >
          {state}
        </span>
        <p className="truncate font-body text-xs font-semibold text-navy-muted">
          {placementNextStep(placement.state)}
        </p>
        <p className="whitespace-nowrap font-body text-xs text-navy-muted">
          {formatShortDate(placement.planned_start)}
        </p>
        <MoreHorizontal
          size={17}
          className="justify-self-end text-navy-muted"
          aria-hidden="true"
        />
      </div>
      <div className="md:hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-body text-sm font-semibold text-navy group-hover:text-teal">
              {placement.student?.name ?? "Student pending"}
            </p>
            <p className="mt-1 truncate font-body text-xs text-navy-muted">
              {placement.cohort_name ?? "Cohort pending"}
            </p>
          </div>
          <span
            className={`placement-status-pill shrink-0 ${placementStatusTone(placement.state)}`}
          >
            {state}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
              Facility
            </dt>
            <dd className="mt-1 truncate font-body text-sm text-navy-muted">
              {placement.facility_name ?? "Not allocated"}
            </dd>
          </div>
          <div>
            <dt className="font-body text-[0.68rem] font-bold uppercase tracking-[0.12em] text-navy-muted">
              Ward
            </dt>
            <dd className="mt-1 flex items-center gap-1 truncate font-body text-sm text-navy-muted">
              <Building2 size={14} className="shrink-0 text-teal" />
              {placement.ward?.name ?? "Pending"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 flex items-center gap-2 font-body text-xs text-navy-muted">
          <Users size={14} className="text-teal" />
          {placement.mentor?.name ?? "Mentor pending"}
          <span aria-hidden="true">·</span>
          {placement.planned_start} → {placement.planned_end}
        </p>
      </div>
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  compact?: boolean;
}) {
  return (
    <label
      className={
        compact
          ? "placement-compact-filter"
          : "font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted"
      }
    >
      {!compact && label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          compact
            ? "placement-compact-filter-select"
            : "mt-1 h-11 w-full rounded-xl border border-border bg-white px-3 font-body text-sm font-normal normal-case tracking-normal text-navy outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        }
        aria-label={`Filter by ${label.toLowerCase()}`}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || "all"} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProgrammeAdminDetailSurface({
  placement,
  options,
  available,
  blocked,
  activity,
  busy,
  canPause,
  canResume,
  canComplete,
  canArchive,
  canWithdraw,
  canRelease,
  canWard,
  canMentor,
  onPause,
  onResume,
  onComplete,
  onArchive,
  onWithdraw,
  onRelease,
  onReminder,
  onNote,
  onWard,
  onMentor,
  onError,
}: {
  placement: Placement;
  options: PlacementOptions | null;
  available: PlacementState[];
  blocked: TransitionResponse["blocked"];
  activity: PlacementActivityEntry[];
  busy: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
  canArchive: boolean;
  canWithdraw: boolean;
  canRelease: boolean;
  canWard: boolean;
  canMentor: boolean;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onWithdraw: () => void;
  onRelease: () => void;
  onReminder: () => Promise<boolean>;
  onNote: (body: string) => Promise<void>;
  onWard: (id: string) => void;
  onMentor: (id: string, reason?: string) => void;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState("Overview");
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [ward, setWard] = useState(placement.ward?.id ?? "");
  const [mentor, setMentor] = useState(placement.mentor?.id ?? "");
  const [mentorReason, setMentorReason] = useState("");
  const [progress, setProgress] = useState<PlacementProgress | null>(null);
  const [notes, setNotes] = useState<PlacementNote[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const can = (target: PlacementState, allowed: boolean) =>
    allowed && available.includes(target);
  const primaryAction = can("awaiting_student", canRelease)
    ? "Release placement to student"
    : can("active", canResume)
      ? "Resume placement"
      : can("completed", canComplete)
        ? "Complete placement"
        : blocked.length
          ? "Resolve remaining requirements"
          : "No action available right now";
  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploaded((current) => [...current, file.name]);
    onError(
      "Document selected. Upload persistence will be connected to the placement documents API.",
    );
  }
  function saveSetup() {
    if (canWard && ward && ward !== placement.ward?.id) onWard(ward);
    if (canMentor && mentor && mentor !== placement.mentor?.id) {
      if (placement.mentor?.id && !mentorReason.trim()) {
        onError("Add a reason before requesting a mentor reassignment.");
        return;
      }
      onMentor(mentor, mentorReason.trim() || undefined);
    }
    setEditOpen(false);
    setMentorReason("");
  }
  function submitMentorChange() {
    if (!mentor || mentor === placement.mentor?.id) {
      onError("Choose a different mentor before saving.");
      return;
    }
    if (placement.mentor?.id && !mentorReason.trim()) {
      onError("A reason is required when changing an assigned mentor.");
      return;
    }
    onMentor(mentor, mentorReason.trim() || undefined);
    setMentorOpen(false);
    setMentorReason("");
  }
  useEffect(() => {
    void getPlacementProgress(placement.id)
      .then(setProgress)
      .catch(() => setProgress(null));
    void getPlacementNotes(placement.id)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [placement.id]);
  async function saveNote() {
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    try {
      await onNote(noteBody.trim());
      setNotes((current) => [
        {
          id: `local-${Date.now()}`,
          body: noteBody.trim(),
          author: "You",
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setNoteBody("");
      setNoteOpen(false);
    } catch {
      onError("We could not save that note. Please try again.");
    } finally {
      setNoteBusy(false);
    }
  }
  async function sendReminder() {
    if (reminderSent) return;
    if (await onReminder()) setReminderSent(true);
  }
  function renderTabPanel() {
    if (tab === "Student")
      return (
        <section className="placement-admin-tab-grid">
          <div className="placement-admin-card">
            <h2 className="placement-admin-card-title">Student profile</h2>
            <div className="placement-admin-detail-list">
              <DetailInfo
                icon={<Users />}
                label="Name"
                value={placement.student?.name ?? "Pending"}
              />
              <DetailInfo
                icon={<FileText />}
                label="Email"
                value={placement.student?.email ?? "Pending"}
              />
              <DetailInfo
                icon={<FileText />}
                label="Registration number"
                value={placement.student?.registration_number ?? "Not recorded"}
              />
            </div>
          </div>
          <section className="placement-admin-card">
            <h2 className="placement-admin-card-title">Placement context</h2>
            <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
              {placement.cohort_name ?? "Cohort pending"} ·{" "}
              {formatShortDate(placement.planned_start)} –{" "}
              {formatShortDate(placement.planned_end)}
            </p>
          </section>
        </section>
      );
    if (tab === "Facility & ward")
      return (
        <section className="placement-admin-tab-grid">
          <div className="placement-admin-card">
            <h2 className="placement-admin-card-title">Facility assignment</h2>
            <div className="placement-admin-detail-list">
              <DetailInfo
                icon={<Building2 />}
                label="Institution"
                value={placement.institution_name ?? "Pending"}
              />
              <DetailInfo
                icon={<Building2 />}
                label="Facility"
                value={placement.facility_name ?? "Pending"}
              />
              <DetailInfo
                icon={<Building2 />}
                label="Ward"
                value={
                  placement.ward
                    ? `${placement.ward.name} · ${placement.ward.occupied}/${placement.ward.capacity} occupied`
                    : "Not allocated"
                }
              />
            </div>
          </div>
          <div className="placement-admin-card">
            <h2 className="placement-admin-card-title">
              Operational ownership
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
              Ward allocation controls the clinical handoff and capacity checks
              for this placement.
            </p>
          </div>
        </section>
      );
    if (tab === "Mentor")
      return (
        <section className="placement-admin-tab-grid">
          <div className="placement-admin-card">
            <h2 className="placement-admin-card-title">Assigned mentor</h2>
            <div className="placement-admin-detail-list">
              <DetailInfo
                icon={<Users />}
                label="Name"
                value={placement.mentor?.name ?? "Not assigned"}
              />
              <DetailInfo
                icon={<FileText />}
                label="Email"
                value={placement.mentor?.email ?? "Not recorded"}
              />
            </div>
          </div>
          <div className="placement-admin-card">
            <h2 className="placement-admin-card-title">Mentor handoff</h2>
            <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
              Use Change mentor in Quick actions to record a new assignment or
              reassignment.
            </p>
          </div>
        </section>
      );
    if (tab === "Progress")
      return (
        <section className="placement-admin-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="placement-admin-card-title">Progress evidence</h2>
              <p className="mt-1 font-body text-sm text-navy-muted">
                Safe operational milestones from the placement record.
              </p>
            </div>
            <strong className="placement-progress-value">
              {progress ? `${progress.overall_percentage ?? 0}%` : "—"}
            </strong>
          </div>
          <div className="placement-admin-progress-list">
            {[
              [
                "Orientation",
                progress?.orientation?.acknowledged
                  ? "Acknowledged"
                  : progress
                    ? "Awaiting acknowledgement"
                    : "Not available",
              ],
              [
                "Induction",
                progress
                  ? `${progress.induction.completed}/${progress.induction.total} completed`
                  : "Not available",
              ],
              [
                "Mentorship",
                progress
                  ? `${progress.mentorship.sessions_logged} sessions logged`
                  : "Not available",
              ],
              [
                "Assessment",
                progress?.assessment.final_submitted
                  ? "Final assessment submitted"
                  : progress
                    ? "Final assessment pending"
                    : "Not available",
              ],
              [
                "Safeguarding",
                progress
                  ? `${progress.safeguarding.open_concerns} open concerns`
                  : "Not available",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      );
    return (
      <section className="placement-admin-card">
        <h2 className="placement-admin-card-title">Placement history</h2>
        <p className="mt-1 font-body text-sm text-navy-muted">
          A record of placement changes and the people who made them.
        </p>
        <div className="placement-admin-progress-list">
          {activity.length ? (
            activity.map((entry) => (
              <div key={entry.id}>
                <span>{formatActivityDate(entry.occurred_at)}</span>
                <strong>
                  {formatActivityAction(entry.action)} · {entry.actor}
                </strong>
              </div>
            ))
          ) : (
            <p className="mt-4 font-body text-sm text-navy-muted">
              No activity has been recorded for this placement yet.
            </p>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="placement-admin-detail-surface">
      <div className="placement-admin-guidance-strip">
        <div>
          <strong>
            {placement.state === "orientation"
              ? "Await induction completion"
              : primaryAction}
          </strong>
          <span>
            The next command is determined by the placement state and your role.
          </span>
        </div>
        <button
          type="button"
          className="placement-admin-text-action"
          onClick={() => setGuidanceOpen(true)}
        >
          View guidance <ChevronRight size={15} />
        </button>
      </div>
      <div
        className="placement-admin-detail-tabs"
        role="tablist"
        aria-label="Placement detail sections"
      >
        {[
          "Overview",
          "Student",
          "Facility & ward",
          "Mentor",
          "Progress",
          "History",
        ].map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={
              tab === item
                ? "placement-admin-detail-tab placement-admin-detail-tab--active"
                : "placement-admin-detail-tab"
            }
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab !== "Overview" ? (
        <div className="placement-admin-detail-tab-panel">
          {renderTabPanel()}
        </div>
      ) : (
        <>
          <div className="placement-admin-detail-columns">
            <div className="space-y-4">
              <section className="placement-admin-card">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="placement-admin-card-title">
                    Placement snapshot
                  </h2>
                  <button
                    type="button"
                    className="placement-admin-secondary-action"
                    onClick={() => setEditOpen((open) => !open)}
                  >
                    Edit details
                  </button>
                </div>
                {editOpen && (
                  <div className="placement-admin-inline-editor">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="placement-admin-field">
                        <span>Ward</span>
                        <select
                          disabled={!canWard || busy}
                          value={ward}
                          onChange={(event) => setWard(event.target.value)}
                        >
                          <option value="">Choose ward</option>
                          {options?.wards.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.facility_name} · {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="placement-admin-field">
                        <span>Mentor</span>
                        <select
                          disabled={!canMentor || busy}
                          value={mentor}
                          onChange={(event) => setMentor(event.target.value)}
                        >
                          <option value="">Choose mentor</option>
                          {options?.mentors.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {item.email}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {placement.mentor?.id && mentor !== placement.mentor.id && (
                      <label className="placement-admin-field mt-3">
                        <span>Reason for reassignment</span>
                        <textarea
                          value={mentorReason}
                          onChange={(event) =>
                            setMentorReason(event.target.value)
                          }
                          placeholder="Explain why the mentor needs to change"
                          rows={2}
                        />
                      </label>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        className="placement-admin-secondary-action"
                        onClick={() => setEditOpen(false)}
                      >
                        Cancel
                      </button>
                      <Button size="sm" disabled={busy} onClick={saveSetup}>
                        Save changes
                      </Button>
                    </div>
                  </div>
                )}
                <div className="placement-snapshot-grid">
                  <DetailInfo
                    icon={<Users />}
                    label="Student"
                    value={placement.student?.name ?? "Pending"}
                  />
                  <DetailInfo
                    icon={<Building2 />}
                    label="Facility"
                    value={placement.facility_name ?? "Pending"}
                  />
                  <DetailInfo
                    icon={<FileText />}
                    label="Email"
                    value={placement.student?.email ?? "Pending"}
                  />
                  <DetailInfo
                    icon={<Building2 />}
                    label="Ward"
                    value={
                      placement.ward
                        ? `${placement.ward.name} · ${placement.ward.occupied}/${placement.ward.capacity}`
                        : "Pending"
                    }
                  />
                  <DetailInfo
                    icon={<FileText />}
                    label="Registration number"
                    value={placement.student?.registration_number ?? "Pending"}
                  />
                  <DetailInfo
                    icon={<Users />}
                    label="Mentor"
                    value={placement.mentor?.name ?? "Pending"}
                  />
                  <DetailInfo
                    icon={<Users />}
                    label="Cohort"
                    value={placement.cohort_name ?? "Pending"}
                  />
                  <DetailInfo
                    icon={<CalendarDays />}
                    label="Placement window"
                    value={`${formatShortDate(placement.planned_start)} – ${formatShortDate(placement.planned_end)}`}
                  />
                </div>
              </section>
              <section className="placement-admin-card">
                <h2 className="placement-admin-card-title">Current status</h2>
                <div className="placement-current-status">
                  <span
                    className={`placement-detail-status ${placementStatusTone(placement.state)}`}
                  >
                    {placement.state.replaceAll("_", " ")}
                  </span>
                  <div>
                    <strong>
                      {placement.state === "orientation"
                        ? "Awaiting acknowledgement"
                        : primaryAction}
                    </strong>
                    <span>Overall placement progress</span>
                  </div>
                  <strong className="placement-progress-value">
                    {progress ? `${progress.overall_percentage ?? 0}%` : "—"}
                  </strong>
                </div>
                <div className="placement-progress-track">
                  <span
                    style={{ width: `${progress?.overall_percentage ?? 0}%` }}
                  />
                </div>
                <div className="placement-admin-info-strip">
                  <span className="flex size-7 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    i
                  </span>
                  <div>
                    <strong>
                      {placement.state === "orientation"
                        ? "Student acknowledgement pending"
                        : primaryAction}
                    </strong>
                    <span>
                      {blocked[0]?.reasons[0]?.message ??
                        "The next step will appear here when this placement needs your attention."}
                    </span>
                  </div>
                  {placement.state === "orientation" && canRelease && (
                    <Button
                      size="sm"
                      disabled={busy || reminderSent}
                      onClick={() => void sendReminder()}
                    >
                      {reminderSent ? "Reminder sent" : "Send reminder"}
                    </Button>
                  )}
                  {can("awaiting_student", canRelease) && (
                    <Button size="sm" disabled={busy} onClick={onRelease}>
                      Send invitation
                    </Button>
                  )}
                </div>
              </section>
              <section className="placement-admin-card">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-teal" />
                  <div>
                    <h2 className="placement-admin-card-title">
                      What is still needed
                    </h2>
                    <p className="font-body text-xs text-navy-muted">
                      Items required before the next stage can begin.
                    </p>
                  </div>
                </div>
                {blocked.length ? (
                  <ul className="mt-5 space-y-3">
                    {blocked
                      .flatMap((item) => item.reasons)
                      .slice(0, 4)
                      .map((reason, index) => (
                        <li
                          key={`${reason.code}-${index}`}
                          className="flex gap-3 font-body text-sm text-navy"
                        >
                          <span className="mt-0.5 size-4 rounded-full border-2 border-border" />{" "}
                          <span>
                            {reason.message ?? reason.code}
                            <small className="mt-1 block text-xs text-navy-muted">
                              {blockerOwner(reason.code)}
                            </small>
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-5 font-body text-sm text-navy-muted">
                    No blockers are currently recorded.
                  </p>
                )}
              </section>
            </div>
            <aside className="space-y-4">
              <section className="placement-admin-card">
                <h2 className="placement-admin-card-title">Quick actions</h2>
                <p className="mt-1 font-body text-xs text-navy-muted">
                  Actions are determined by the placement state and your role.
                </p>
                <div className="mt-4 space-y-2">
                  {can("withdrawn", canWithdraw) && (
                    <Button
                      className="placement-admin-quick-action placement-admin-quick-action--primary w-full"
                      disabled={busy}
                      onClick={onWithdraw}
                    >
                      Withdraw placement
                    </Button>
                  )}
                  {canPause && (
                    <Button
                      variant="tertiary"
                      className="placement-admin-quick-action w-full"
                      disabled={busy || !can("paused", canPause)}
                      onClick={onPause}
                    >
                      Pause placement
                    </Button>
                  )}
                  {can("active", canResume) && (
                    <Button
                      variant="tertiary"
                      className="placement-admin-quick-action w-full"
                      disabled={busy}
                      onClick={onResume}
                    >
                      Resume placement
                    </Button>
                  )}
                  {canMentor && (
                    <Button
                      variant="tertiary"
                      className="placement-admin-quick-action w-full"
                      disabled={busy}
                      onClick={() => setMentorOpen(true)}
                    >
                      Change mentor
                    </Button>
                  )}
                  {can("completed", canComplete) && (
                    <Button
                      variant="tertiary"
                      className="placement-admin-quick-action w-full"
                      disabled={busy}
                      onClick={onComplete}
                    >
                      Complete placement
                    </Button>
                  )}
                  {can("archived", canArchive) && (
                    <Button
                      variant="tertiary"
                      className="placement-admin-quick-action w-full"
                      disabled={busy}
                      onClick={onArchive}
                    >
                      Archive placement
                    </Button>
                  )}
                  <Button
                    variant="tertiary"
                    className="placement-admin-quick-action w-full"
                    disabled={busy}
                    onClick={() => setNoteOpen(true)}
                  >
                    Add note
                  </Button>
                </div>
              </section>
              <section className="placement-admin-card">
                <h2 className="placement-admin-card-title">
                  Placement documents
                </h2>
                <div className="placement-documents-empty">
                  <FileText size={25} />
                  <strong>
                    {uploaded.length
                      ? `${uploaded.length} document${uploaded.length === 1 ? "" : "s"} selected`
                      : "No documents yet"}
                  </strong>
                  <span>Upload relevant placement documents.</span>
                  <label className="placement-upload-button">
                    <Upload size={15} /> Upload document
                    <input type="file" onChange={handleUpload} hidden />
                  </label>
                  {uploaded.map((name) => (
                    <small key={name} className="truncate text-teal">
                      {name}
                    </small>
                  ))}
                </div>
              </section>
              <section className="placement-admin-card">
                <h2 className="placement-admin-card-title">Recent history</h2>
                <div className="mt-3 space-y-3">
                  {activity.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="border-b border-border pb-2">
                      <p className="font-body text-xs font-semibold text-navy">
                        {formatActivityAction(entry.action)}
                      </p>
                      <p className="mt-1 font-body text-[0.68rem] text-navy-muted">
                        {entry.actor} · {formatActivityDate(entry.occurred_at)}
                      </p>
                    </div>
                  ))}
                  {notes.slice(0, 2).map((note) => (
                    <div key={note.id} className="border-b border-border pb-2">
                      <p className="font-body text-xs font-semibold text-navy">
                        Placement note
                      </p>
                      <p className="mt-1 font-body text-xs text-navy-muted">
                        {note.body}
                      </p>
                      <p className="mt-1 font-body text-[0.68rem] text-navy-muted">
                        {note.author} · {formatActivityDate(note.created_at)}
                      </p>
                    </div>
                  ))}
                  {!activity.length && !notes.length && (
                    <p className="font-body text-xs text-navy-muted">
                      No activity or notes have been recorded yet.
                    </p>
                  )}
                </div>
              </section>
            </aside>
          </div>
          {mentorOpen && (
            <div className="placement-admin-modal-backdrop" role="presentation">
              <div
                className="placement-admin-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="change-mentor-heading"
              >
                <h2
                  id="change-mentor-heading"
                  className="placement-admin-card-title"
                >
                  Change mentor
                </h2>
                <p className="mt-1 font-body text-sm text-navy-muted">
                  Mentor changes are recorded as an assignment command and
                  require a reason when replacing an existing mentor.
                </p>
                <label className="placement-admin-field mt-4">
                  <span>New mentor</span>
                  <select
                    value={mentor}
                    onChange={(event) => setMentor(event.target.value)}
                  >
                    <option value="">Choose mentor</option>
                    {options?.mentors
                      .filter((item) => item.id !== placement.mentor?.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.email}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="placement-admin-field mt-3">
                  <span>
                    Reason {placement.mentor?.id ? "(required)" : "(optional)"}
                  </span>
                  <textarea
                    value={mentorReason}
                    onChange={(event) => setMentorReason(event.target.value)}
                    rows={3}
                    placeholder="Why is this mentor change needed?"
                  />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="placement-admin-secondary-action"
                    onClick={() => setMentorOpen(false)}
                  >
                    Cancel
                  </button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={submitMentorChange}
                  >
                    Save mentor
                  </Button>
                </div>
              </div>
            </div>
          )}
          {guidanceOpen && (
            <div className="placement-admin-modal-backdrop" role="presentation">
              <div
                className="placement-admin-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="guidance-heading"
              >
                <h2
                  id="guidance-heading"
                  className="placement-admin-card-title"
                >
                  Placement guidance
                </h2>
                <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                  {placement.state === "orientation"
                    ? "The student must acknowledge orientation before induction can open."
                    : primaryAction}
                </p>
                <div className="mt-4 space-y-2">
                  {blocked.length ? (
                    blocked
                      .flatMap((item) => item.reasons)
                      .slice(0, 4)
                      .map((reason, index) => (
                        <div
                          key={`${reason.code}-${index}`}
                          className="rounded-xl bg-mist px-3 py-2 font-body text-sm text-navy"
                        >
                          <strong>{reason.message ?? reason.code}</strong>
                          <span className="ml-2 text-xs text-navy-muted">
                            {blockerOwner(reason.code)}
                          </span>
                        </div>
                      ))
                  ) : (
                    <p className="font-body text-sm text-navy-muted">
                      No blocking requirements are recorded. Use the available
                      action buttons to continue the placement.
                    </p>
                  )}
                </div>
                <div className="mt-5 flex justify-end">
                  <Button size="sm" onClick={() => setGuidanceOpen(false)}>
                    Close guidance
                  </Button>
                </div>
              </div>
            </div>
          )}
          {noteOpen && (
            <div className="placement-admin-modal-backdrop" role="presentation">
              <div
                className="placement-admin-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="note-heading"
              >
                <h2 id="note-heading" className="placement-admin-card-title">
                  Add placement note
                </h2>
                <p className="mt-2 font-body text-sm text-navy-muted">
                  Add an operational note for the programme team. Avoid
                  sensitive clinical or safeguarding details.
                </p>
                <label className="placement-admin-field mt-4">
                  <span>Note</span>
                  <textarea
                    autoFocus
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Write a short operational note"
                  />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="placement-admin-secondary-action"
                    onClick={() => {
                      setNoteOpen(false);
                      setNoteBody("");
                    }}
                  >
                    Cancel
                  </button>
                  <Button
                    size="sm"
                    disabled={!noteBody.trim() || noteBusy}
                    onClick={saveNote}
                  >
                    {noteBusy ? "Saving…" : "Save note"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DetailInfo({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="placement-detail-info">
      <span className="placement-detail-info-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function PlacementDetail({
  user,
  managerMode,
  placement,
  options,
  canCreate,
  canWard,
  canMentor,
  canRelease,
  canPause,
  canResume,
  canComplete,
  canArchive,
  canWithdraw,
  busy,
  onBack,
  onError,
  notice,
  onDismissNotice,
  onWard,
  onMentor,
  onRelease,
  onReminder,
  onNote,
  onCreate,
  onLifecycle,
}: {
  user: CurrentUser;
  managerMode?: boolean;
  placement: Placement;
  options: PlacementOptions | null;
  canCreate: boolean;
  canWard: boolean;
  canMentor: boolean;
  canRelease: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
  canArchive: boolean;
  canWithdraw: boolean;
  busy: boolean;
  onBack: () => void;
  onError: (message: string) => void;
  notice: string;
  onDismissNotice: () => void;
  onWard: (id: string) => void;
  onMentor: (id: string, reason?: string) => void;
  onRelease: () => void;
  onReminder: () => Promise<boolean>;
  onNote: (body: string) => Promise<void>;
  onCreate: (input: {
    cohort_id: string;
    student_id: string;
    planned_start: string;
    planned_end: string;
  }) => void;
  onLifecycle: (
    action: LifecycleAction,
    reason?: string,
    note?: string,
  ) => void;
}) {
  const isNew = placement.id === "new";
  const [ward, setWard] = useState(placement.ward?.id ?? "");
  const [mentor, setMentor] = useState(placement.mentor?.id ?? "");
  const [cohort, setCohort] = useState("");
  const [student, setStudent] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [students, setStudents] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [transitions, setTransitions] = useState<TransitionResponse | null>(
    null,
  );
  const [activity, setActivity] = useState<PlacementActivityEntry[]>([]);
  const [reasonAction, setReasonAction] = useState<
    "pause" | "withdraw" | "reassign" | null
  >(null);
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    "complete" | "archive" | null
  >(null);
  useEffect(() => {
    if (!isNew) {
      void getTransitions(placement.id)
        .then(setTransitions)
        .catch((cause) => {
          setTransitions(null);
          onError(
            cause instanceof ApiError
              ? cause.message
              : "We could not load the available placement actions.",
          );
        });
      void getPlacementActivity(placement.id)
        .then(setActivity)
        .catch((cause) => {
          setActivity([]);
          onError(
            cause instanceof ApiError
              ? cause.message
              : "We could not load placement activity.",
          );
        });
    }
  }, [isNew, placement.id, placement.state, onError]);
  async function loadStudents(id: string) {
    setCohort(id);
    setStudent("");
    if (!id) return;
    try {
      setStudents(await getCohortStudents(id));
    } catch {
      setStudents([]);
    }
  }
  const available = transitions?.available ?? [];
  const assignmentActivity = activity.filter((entry) =>
    /assign|allocate_ward/.test(entry.action),
  );
  const lifecycleActivity = activity.filter(
    (entry) => !assignmentActivity.includes(entry),
  );
  const show = (target: string, allowed: boolean) =>
    allowed && available.includes(target as never);
  return (
    <PlacementWorkspaceFrame
      user={user}
      title={
        isNew
          ? "Create placement"
          : managerMode
            ? "Handoff detail"
            : "Placement detail"
      }
      onError={onError}
    >
      <div className="text-navy">
        <main className="placement-detail-page mx-auto max-w-[82rem]">
          {notice && <Notice message={notice} onDismiss={onDismissNotice} />}
          <div className="placement-detail-breadcrumb">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 font-body text-sm font-semibold text-teal"
            >
              <ArrowLeft size={16} />
              {managerMode ? "Placement queue" : "All placements"}
            </button>
            <span className="hidden font-body text-xs text-navy-muted sm:inline">
              Programme Administration{" "}
              <ChevronRight size={13} className="mx-1 inline" /> Placements{" "}
              <ChevronRight size={13} className="mx-1 inline" />{" "}
              {isNew
                ? "New placement"
                : (placement.student?.name ?? "Placement")}
            </span>
          </div>
          <div className="placement-detail-heading mt-6 border-b border-border pb-6">
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
                {isNew
                  ? "Create placement"
                  : managerMode
                    ? "Facility handoff"
                    : placement.state.replaceAll("_", " ")}
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {isNew
                  ? "Plan a student placement."
                  : managerMode
                    ? "Keep this student moving."
                    : (placement.student?.name ?? "Placement detail")}
              </h1>
              {!isNew && (
                <div className="mt-3 flex flex-wrap items-center gap-2 font-body text-sm text-navy-muted">
                  {placement.student?.name ?? "Student"} ·{" "}
                  {placement.cohort_name} · {placement.institution_name} ·{" "}
                  {placement.facility_name ?? "Facility pending"}
                </div>
              )}
              {!isNew &&
                (placement.completed_at ||
                  placement.archived_at ||
                  placement.withdrawal_reason) && (
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-body text-xs text-navy-muted">
                    {placement.completed_at && (
                      <span>
                        Completed {formatLifecycleDate(placement.completed_at)}
                      </span>
                    )}
                    {placement.archived_at && (
                      <span>
                        Archived {formatLifecycleDate(placement.archived_at)}
                      </span>
                    )}
                    {placement.withdrawal_reason && (
                      <span>
                        Withdrawal reason:{" "}
                        {formatLifecycleReason(placement.withdrawal_reason)}
                      </span>
                    )}
                  </div>
                )}
            </div>
            {!isNew && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`placement-detail-status ${placementStatusTone(placement.state)}`}
                >
                  {placement.state.replaceAll("_", " ")}
                </span>
                <span className="placement-detail-meta">
                  <CalendarDays size={14} /> Student placement
                </span>
                <span className="placement-detail-meta">
                  <CalendarDays size={14} />{" "}
                  {formatShortDate(placement.planned_start)} –{" "}
                  {formatShortDate(placement.planned_end)}
                </span>
              </div>
            )}
          </div>
          {!isNew && (
            <>
              <LifecycleStepper state={placement.state} />
            </>
          )}
          {isNew ? (
            <section
              aria-labelledby="create-placement-heading"
              className="mt-8 max-w-3xl border-t-2 border-teal pt-6"
            >
              <div className="mb-7">
                <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
                  Placement details
                </p>
                <h2
                  id="create-placement-heading"
                  className="mt-2 font-display text-2xl font-bold text-navy"
                >
                  Set the placement foundation
                </h2>
                <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                  Choose the enrolled student and the dates that define this
                  placement. Ward and mentor ownership can be added after
                  creation.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Cohort">
                  <select
                    value={cohort}
                    onChange={(e) => void loadStudents(e.target.value)}
                    className="input"
                  >
                    <option value="">Choose cohort</option>
                    {options?.cohorts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Student">
                  <select
                    value={student}
                    onChange={(e) => setStudent(e.target.value)}
                    className="input"
                  >
                    <option value="">Choose enrolled student</option>
                    {students.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Planned start">
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Planned end">
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
              {start && end && end < start && (
                <p
                  className="mt-4 border-l-2 border-error bg-error/5 px-4 py-3 font-body text-sm text-error"
                  role="alert"
                >
                  The planned end date must be on or after the start date.
                </p>
              )}
              <Button
                className="mt-7"
                disabled={
                  !canCreate ||
                  !cohort ||
                  !student ||
                  !start ||
                  !end ||
                  (Boolean(start && end) && end < start)
                }
                onClick={() =>
                  onCreate({
                    cohort_id: cohort,
                    student_id: student,
                    planned_start: start,
                    planned_end: end,
                  })
                }
              >
                Create placement
              </Button>
            </section>
          ) : (
            <>
              <ProgrammeAdminDetailSurface
                placement={placement}
                options={options}
                available={available}
                blocked={transitions?.blocked ?? []}
                activity={activity}
                busy={busy}
                canPause={canPause}
                canResume={canResume}
                canComplete={canComplete}
                canArchive={canArchive}
                canWithdraw={canWithdraw}
                canRelease={canRelease}
                canWard={canWard}
                canMentor={canMentor}
                onPause={() => setReasonAction("pause")}
                onResume={() => onLifecycle("resume")}
                onComplete={() => setConfirmAction("complete")}
                onArchive={() => setConfirmAction("archive")}
                onWithdraw={() => setReasonAction("withdraw")}
                onRelease={onRelease}
                onReminder={onReminder}
                onNote={onNote}
                onWard={onWard}
                onMentor={onMentor}
                onError={onError}
              />
              <div className="placement-detail-legacy mt-6 grid gap-5">
                <section
                  className={
                    managerMode
                      ? "rounded-2xl border border-border bg-white p-6 shadow-[0_8px_24px_rgba(8,25,53,0.04)]"
                      : "rounded-none border-y border-border bg-transparent px-0 py-6 shadow-none"
                  }
                >
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="text-teal" />
                    <div>
                      <h2 className="font-display text-xl font-bold">
                        {managerMode
                          ? "Facility setup & ownership"
                          : "Setup and ownership"}
                      </h2>
                      <p className="mt-1 font-body text-sm text-navy-muted">
                        Allocate the operational context before the placement
                        moves forward.
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <Field label="Ward">
                      <select
                        disabled={!canWard || busy}
                        value={ward}
                        onChange={(e) => setWard(e.target.value)}
                        className="input"
                      >
                        <option value="">Choose ward</option>
                        {options?.wards.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.facility_name} · {item.name} ({item.capacity})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Mentor">
                      <select
                        disabled={!canMentor || busy}
                        value={mentor}
                        onChange={(e) => setMentor(e.target.value)}
                        className="input"
                      >
                        <option value="">Choose mentor</option>
                        {options?.mentors.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.email}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    {canWard && ward && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => onWard(ward)}
                      >
                        Save ward
                      </Button>
                    )}
                    {canMentor && mentor && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          if (
                            placement.mentor?.id &&
                            placement.mentor.id !== mentor
                          ) {
                            setReasonAction("reassign");
                          } else {
                            onMentor(mentor);
                          }
                        }}
                      >
                        {placement.mentor?.id && placement.mentor.id !== mentor
                          ? "Request reassignment"
                          : "Save mentor"}
                      </Button>
                    )}
                  </div>
                </section>
                <section
                  className={
                    managerMode
                      ? "rounded-2xl border border-border bg-white p-6 shadow-[0_8px_24px_rgba(8,25,53,0.04)]"
                      : "rounded-none border-y border-border bg-transparent px-0 py-6 shadow-none"
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
                        Placement record
                      </p>
                      <h2 className="mt-1 font-display text-xl font-bold">
                        Operational history
                      </h2>
                      <p className="mt-1 font-body text-sm text-navy-muted">
                        A clear record of who changed the placement and when.
                      </p>
                    </div>
                    <span className="rounded-full bg-mist px-3 py-1 font-body text-xs font-semibold text-navy-muted">
                      {activity.length} event{activity.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {show("awaiting_student", canRelease) && (
                    <div className="mt-6 rounded-xl border border-teal/25 bg-teal-light/30 p-4">
                      <h3 className="font-display text-lg font-bold">
                        Release to student
                      </h3>
                      <p className="mt-1 font-body text-sm text-navy-muted">
                        Send the scheduled placement to the assigned student for
                        confirmation.
                      </p>
                      <Button
                        className="mt-4"
                        size="sm"
                        disabled={busy}
                        onClick={onRelease}
                      >
                        Send placement invitation
                      </Button>
                    </div>
                  )}
                  {assignmentActivity.length > 0 && (
                    <div className="mt-6 border-t border-border pt-5">
                      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
                        Assignment changes
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {assignmentActivity.map((entry) => (
                          <div
                            key={`assignment-${entry.id}`}
                            className="border-l-2 border-teal bg-mist/45 px-3 py-3"
                          >
                            <p className="font-body text-sm font-semibold text-navy">
                              {formatActivityAction(entry.action)}
                            </p>
                            <p className="mt-1 font-body text-xs text-navy-muted">
                              {entry.actor} ·{" "}
                              {formatActivityDate(entry.occurred_at)}
                            </p>
                            {entry.override_reason && (
                              <p className="mt-2 font-body text-xs text-navy-muted">
                                Reason: {entry.override_reason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {lifecycleActivity.length ? (
                    <ol className="mt-6 space-y-5 border-l border-border pl-5">
                      {lifecycleActivity.map((entry) => (
                        <li key={entry.id} className="relative">
                          <span className="absolute -left-[1.65rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal shadow-[0_0_0_1px_#168f91]" />
                          <div className="flex flex-col justify-between gap-1 sm:flex-row">
                            <p className="font-body text-sm font-semibold text-navy">
                              {formatActivityAction(entry.action)}
                            </p>
                            <time className="font-body text-xs text-navy-muted">
                              {formatActivityDate(entry.occurred_at)}
                            </time>
                          </div>
                          <p className="mt-1 font-body text-xs text-navy-muted">
                            {entry.actor} ·{" "}
                            {entry.actor_role.replaceAll("_", " ")}
                          </p>
                          {entry.override_reason && (
                            <p className="mt-2 rounded-lg bg-warm/40 px-3 py-2 font-body text-xs text-navy-muted">
                              Reason: {entry.override_reason}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-6 rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy-muted">
                      No placement activity has been recorded yet.
                    </p>
                  )}
                </section>
                <section
                  className={
                    managerMode
                      ? "rounded-2xl border border-border bg-white p-6 shadow-[0_8px_24px_rgba(8,25,53,0.04)]"
                      : "rounded-none border-y border-border bg-transparent px-0 py-6 shadow-none"
                  }
                >
                  <h2 className="font-display text-xl font-bold">
                    Placement snapshot
                  </h2>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <Info
                      label="Student"
                      value={placement.student?.name ?? "Pending"}
                    />
                    <Info
                      label="Student email"
                      value={placement.student?.email ?? "Pending"}
                    />
                    <Info
                      label="Registration number"
                      value={
                        placement.student?.registration_number ?? "Pending"
                      }
                    />
                    <Info
                      label="Facility"
                      value={placement.facility_name ?? "Pending"}
                    />
                    <Info
                      label="Planned window"
                      value={`${formatShortDate(placement.planned_start)} → ${formatShortDate(placement.planned_end)}`}
                    />
                    <Info
                      label={
                        placement.actual_end
                          ? "Effective end (extended)"
                          : "Effective end"
                      }
                      value={formatShortDate(
                        placement.actual_end ?? placement.planned_end,
                      )}
                    />
                    <Info
                      label="Ward"
                      value={
                        placement.ward
                          ? `${placement.ward.name} · ${placement.ward.occupied}/${placement.ward.capacity}`
                          : "Pending"
                      }
                    />
                    <Info
                      label="Mentor"
                      value={placement.mentor?.name ?? "Pending"}
                    />
                  </div>
                </section>
                <section className="rounded-none border-y border-border bg-transparent px-0 py-6 shadow-none">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="text-teal" />
                    <div>
                      <h2 className="font-display text-xl font-bold">
                        Next action
                      </h2>
                      <p className="mt-1 font-body text-sm text-navy-muted">
                        Actions are determined by the placement state and your
                        role.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {show("paused", canPause) && (
                      <Button
                        size="sm"
                        variant="tertiary"
                        disabled={busy}
                        onClick={() => setReasonAction("pause")}
                      >
                        Pause placement
                      </Button>
                    )}
                    {show("active", canResume) && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => onLifecycle("resume")}
                      >
                        Resume placement
                      </Button>
                    )}
                    {show("completed", canComplete) && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmAction("complete")}
                      >
                        Complete placement
                      </Button>
                    )}
                    {show("archived", canArchive) && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmAction("archive")}
                      >
                        Archive placement
                      </Button>
                    )}
                    {show("withdrawn", canWithdraw) && (
                      <Button
                        size="sm"
                        className="bg-error text-white hover:bg-error/90 hover:shadow-md hover:shadow-error/20"
                        disabled={busy}
                        onClick={() => setReasonAction("withdraw")}
                      >
                        Withdraw placement
                      </Button>
                    )}
                    {available.length === 0 && (
                      <p className="flex items-center gap-2 font-body text-sm text-navy-muted">
                        <CircleAlert size={16} />
                        No manual action is available at this stage.
                      </p>
                    )}
                  </div>
                  {transitions?.blocked.length ? (
                    <div className="mt-5 border-t border-border pt-4">
                      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
                        What is still needed
                      </p>
                      <ul className="mt-2 space-y-1 font-body text-sm text-navy-muted">
                        {transitions.blocked
                          .slice(0, 3)
                          .flatMap((item) => item.reasons)
                          .map((item, index) => (
                            <li key={`${item.code}-${index}`}>
                              • {item.message ?? item.code}{" "}
                              <span className="text-navy-muted">
                                {blockerOwner(item.code)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              </div>
            </>
          )}
        </main>
        {confirmAction && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-5"
            onClick={() => setConfirmAction(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="placement-confirm-title"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md border border-border bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3 border-l-2 border-teal bg-teal-light/40 px-4 py-3">
                <CircleAlert className="mt-0.5 shrink-0 text-teal" size={20} />
                <div>
                  <h2
                    id="placement-confirm-title"
                    className="font-display text-xl font-bold"
                  >
                    {confirmAction === "complete"
                      ? "Complete this placement?"
                      : "Archive this placement?"}
                  </h2>
                  <p className="mt-1 font-body text-sm leading-5 text-navy-muted">
                    {confirmAction === "complete"
                      ? "This records the placement as complete once the required milestones are satisfied."
                      : "This moves the completed placement into the archive. Archived records are retained for governance and cannot be edited."}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="tertiary"
                  onClick={() => setConfirmAction(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    onLifecycle(confirmAction);
                    setConfirmAction(null);
                  }}
                >
                  {confirmAction === "complete"
                    ? "Complete placement"
                    : "Archive placement"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {reasonAction && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-5"
            onClick={() => {
              setReasonAction(null);
              setReason("");
              setReasonNote("");
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="lifecycle-confirmation-title"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md border border-border bg-white p-6 shadow-2xl"
            >
              <div
                className={`mb-5 flex items-start gap-3 border-l-2 px-4 py-3 ${reasonAction === "withdraw" ? "border-error bg-error/5" : "border-teal bg-teal-light/40"}`}
              >
                <CircleAlert
                  className={
                    reasonAction === "withdraw"
                      ? "mt-0.5 shrink-0 text-error"
                      : "mt-0.5 shrink-0 text-teal"
                  }
                  size={20}
                />
                <div>
                  <h2
                    id="lifecycle-confirmation-title"
                    className="font-display text-xl font-bold"
                  >
                    {reasonAction === "pause"
                      ? "Pause this placement?"
                      : reasonAction === "withdraw"
                        ? "Withdraw this placement?"
                        : "Reassign this mentor?"}
                  </h2>
                  {reasonAction === "withdraw" && (
                    <p className="mt-1 font-body text-sm leading-5 text-error">
                      This removes the placement from the active workflow and
                      cannot be undone from this screen.
                    </p>
                  )}
                  {reasonAction === "reassign" && (
                    <p className="mt-1 font-body text-sm leading-5 text-navy-muted">
                      The current mentor will be closed out in the assignment
                      history and the new mentor will become responsible for
                      future activity.
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                {reasonAction === "withdraw"
                  ? "Confirm the action and record why the placement is being withdrawn."
                  : reasonAction === "reassign"
                    ? "Record why the mentor assignment needs to change."
                    : "Record why the placement is being paused."}
              </p>
              {reasonAction === "reassign" ? (
                <Field label="Reassignment reason">
                  <textarea
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="input min-h-24 resize-y"
                    placeholder="Why does this mentor assignment need to change?"
                    required
                  />
                </Field>
              ) : (
                <Field
                  label={
                    reasonAction === "pause"
                      ? "Pause reason"
                      : "Withdrawal reason"
                  }
                >
                  <select
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="input"
                    required
                  >
                    <option value="">Choose a reason</option>
                    {(reasonAction === "pause"
                      ? pauseReasons
                      : withdrawalReasons
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {reasonAction === "pause" && reason === "other" && (
                <Field label="Explain the reason">
                  <textarea
                    autoFocus
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                    className="input min-h-24 resize-y"
                    placeholder="Add a short explanation for this interruption"
                    required
                  />
                </Field>
              )}
              <div className="mt-5 flex justify-end gap-3">
                <Button
                  variant="tertiary"
                  onClick={() => {
                    setReasonAction(null);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className={
                    reasonAction === "withdraw"
                      ? "bg-error text-white hover:bg-error/90 hover:shadow-md hover:shadow-error/20"
                      : ""
                  }
                  disabled={
                    !reason.trim() ||
                    (reasonAction === "pause" &&
                      reason === "other" &&
                      !reasonNote.trim()) ||
                    busy
                  }
                  onClick={() => {
                    if (reasonAction === "reassign") {
                      if (mentor) onMentor(mentor, reason.trim());
                    } else {
                      onLifecycle(
                        reasonAction,
                        reason.trim(),
                        reasonAction === "pause"
                          ? reasonNote.trim()
                          : undefined,
                      );
                    }
                    setReasonAction(null);
                    setReason("");
                    setReasonNote("");
                  }}
                >
                  {reasonAction === "pause"
                    ? "Pause placement"
                    : reasonAction === "withdraw"
                      ? "Withdraw placement"
                      : "Confirm reassignment"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PlacementWorkspaceFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Programme Admin: new placement modal, lifecycle stepper and detail  */
/* ------------------------------------------------------------------ */

function NewPlacementModal({
  options,
  canCreate,
  busy,
  onClose,
  onCreate,
  onError,
}: {
  options: PlacementOptions | null;
  canCreate: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: {
    cohort_id: string;
    student_id: string;
    planned_start: string;
    planned_end: string;
  }) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [cohort, setCohort] = useState("");
  const [student, setStudent] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [students, setStudents] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dateError = start && end && end < start ? "The planned end date must be on or after the start date." : "";
  const missing = !cohort || !student || !start || !end;
  async function loadStudents(id: string) {
    setCohort(id);
    setStudent("");
    setStudents([]);
    if (!id) return;
    setLoadingStudents(true);
    try {
      setStudents(await getCohortStudents(id));
    } catch {
      setStudents([]);
      onError("We could not load the enrolled students for that cohort.");
    } finally {
      setLoadingStudents(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!canCreate || missing || dateError) return;
    await onCreate({ cohort_id: cohort, student_id: student, planned_start: start, planned_end: end });
  }
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="md"
      icon={<CalendarDays />}
      title="New placement"
      description="Choose the enrolled student and the dates that define this placement. Ward and mentor can be added after creation."
      footer={
        <>
          <AdminButton variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" form="new-placement-form" disabled={busy || !canCreate} aria-busy={busy}>
            {busy ? "Creating…" : "Create placement"}
          </AdminButton>
        </>
      }
    >
      <form id="new-placement-form" className="pmd-form" onSubmit={(event) => void submit(event)} noValidate>
        <KitField label="Cohort" required error={submitted && !cohort ? "Choose a cohort." : undefined}>
          <SelectInput value={cohort} onChange={(event) => void loadStudents(event.target.value)}>
            <option value="">Choose cohort</option>
            {options?.cohorts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectInput>
        </KitField>
        <KitField
          label="Student"
          required
          hint={cohort && !loadingStudents && !students.length ? "No enrolled students were found in this cohort." : undefined}
          error={submitted && cohort && !student ? "Choose an enrolled student." : undefined}
        >
          <SelectInput value={student} disabled={!cohort || loadingStudents} onChange={(event) => setStudent(event.target.value)}>
            <option value="">{loadingStudents ? "Loading students…" : "Choose enrolled student"}</option>
            {students.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectInput>
        </KitField>
        <FieldRow>
          <KitField label="Planned start" required error={submitted && !start ? "Choose a start date." : undefined}>
            <TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </KitField>
          <KitField label="Planned end" required error={dateError || (submitted && !end ? "Choose an end date." : undefined)}>
            <TextInput type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} />
          </KitField>
        </FieldRow>
        {!canCreate && <p className="pmd-callout pmd-callout--warn">Your role cannot create placements.</p>}
      </form>
    </Modal>
  );
}

function PlacementStepper({ state }: { state: PlacementState }) {
  const journey = placementJourney(state, "staff");
  const steps = journey.stages;
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    // Bring the current step into view on narrow screens without scrolling the page.
    const list = listRef.current;
    if (node && list && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = Math.max(0, node.offsetLeft - list.clientWidth / 2 + node.clientWidth / 2);
    }
  }, [state]);
  return (
    <nav aria-label="Placement lifecycle" className="pmd-stepper-wrap">
      <ol className="pmd-stepper" ref={listRef}>
        {steps.map((step, index) => {
          const done = step.status === "done";
          const isCurrent = step.status === "current" || step.status === "attention" || step.status === "stopped";
          const tone = step.status === "stopped" ? "danger" : step.status === "attention" ? "warn" : "ok";
          return (
            <li
              key={step.key}
              className={`pmd-step is-${done ? "done" : isCurrent ? "current" : "todo"} is-${tone}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="pmd-step__dot" aria-hidden="true">
                {done ? <Check /> : step.status === "attention" ? <Pause /> : step.status === "stopped" ? <XCircle /> : index + 1}
              </span>
              <span className="pmd-step__label">
                {step.label}
                <span className="sr-only">{done ? " (complete)" : isCurrent ? " (current)" : " (upcoming)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type DialogKind = "pause" | "withdraw" | "reassign" | "complete" | "archive" | "note" | null;

function ProgrammeAdminPlacementDetail({
  user,
  placement,
  options,
  canWard,
  canMentor,
  canRelease,
  canPause,
  canResume,
  canComplete,
  canArchive,
  canWithdraw,
  busy,
  onBack,
  onError,
  notice,
  onDismissNotice,
  onWard,
  onMentor,
  onRelease,
  onReminder,
  onNote,
  onLifecycle,
}: ComponentProps<typeof PlacementDetail>) {
  const [ward, setWard] = useState(placement.ward?.id ?? "");
  const [mentor, setMentor] = useState(placement.mentor?.id ?? "");
  const [transitions, setTransitions] = useState<TransitionResponse | null>(null);
  const [activity, setActivity] = useState<PlacementActivityEntry[]>([]);
  const [progress, setProgress] = useState<PlacementProgress | null>(null);
  const [notes, setNotes] = useState<PlacementNote[]>([]);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);

  useEffect(() => {
    void getTransitions(placement.id)
      .then(setTransitions)
      .catch((cause) => {
        setTransitions(null);
        onError(cause instanceof ApiError ? cause.message : "We could not load the available placement actions.");
      });
    void getPlacementActivity(placement.id)
      .then(setActivity)
      .catch((cause) => {
        setActivity([]);
        onError(cause instanceof ApiError ? cause.message : "We could not load placement activity.");
      });
  }, [placement.id, placement.state, onError]);
  useEffect(() => {
    void getPlacementProgress(placement.id)
      .then(setProgress)
      .catch(() => setProgress(null));
    void getPlacementNotes(placement.id)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [placement.id]);

  const available = transitions?.available ?? [];
  const blocked = transitions?.blocked ?? [];
  const blockers = blocked.flatMap((item) => item.reasons).slice(0, 4);
  const show = (target: PlacementState, allowed: boolean) => allowed && available.includes(target);
  const studentName = placement.student?.name ?? "Placement";

  function closeDialog() {
    setDialog(null);
    setReason("");
    setReasonNote("");
    setNoteBody("");
  }

  type Act = { key: string; label: string; icon: React.ReactNode; danger?: boolean; disabled?: boolean; run: () => void };
  const primaryCandidates: Act[] = [];
  if (show("awaiting_student", canRelease))
    primaryCandidates.push({ key: "invite", label: "Send placement invitation", icon: <Send />, run: onRelease });
  if (placement.state === "orientation" && canRelease)
    primaryCandidates.push({
      key: "reminder",
      label: reminderSent ? "Reminder sent" : "Send reminder",
      icon: <Mail />,
      disabled: reminderSent,
      run: () => {
        void onReminder().then((sent) => {
          if (sent) setReminderSent(true);
        });
      },
    });
  if (show("active", canResume))
    primaryCandidates.push({ key: "resume", label: "Resume placement", icon: <Play />, run: () => onLifecycle("resume") });
  if (show("completed", canComplete))
    primaryCandidates.push({ key: "complete", label: "Complete placement", icon: <CheckCircle2 />, run: () => setDialog("complete") });
  if (show("archived", canArchive))
    primaryCandidates.push({ key: "archive", label: "Archive placement", icon: <Archive />, run: () => setDialog("archive") });
  const primary = primaryCandidates[0];
  const secondary: Act[] = primaryCandidates.slice(1);
  if (show("paused", canPause))
    secondary.push({ key: "pause", label: "Pause placement", icon: <Pause />, run: () => setDialog("pause") });
  if (show("withdrawn", canWithdraw))
    secondary.push({ key: "withdraw", label: "Withdraw placement", icon: <XCircle />, danger: true, run: () => setDialog("withdraw") });

  const nextStep =
    primary?.label ??
    (placement.state === "orientation"
      ? "Await induction completion"
      : blocked.length
        ? "Resolve remaining requirements"
        : "No action available right now");

  async function saveNote() {
    if (!noteBody.trim()) return;
    setNoteBusy(true);
    try {
      await onNote(noteBody.trim());
      setNotes((current) => [
        { id: `local-${Date.now()}`, body: noteBody.trim(), author: "You", created_at: new Date().toISOString() },
        ...current,
      ]);
      closeDialog();
    } catch {
      onError("We could not save that note. Please try again.");
    } finally {
      setNoteBusy(false);
    }
  }

  const reassigning = Boolean(placement.mentor?.id && mentor && placement.mentor.id !== mentor);
  const eventLabel = `${activity.length} event${activity.length === 1 ? "" : "s"}`;
  const reasonRequired = dialog === "pause" || dialog === "withdraw" || dialog === "reassign";
  const reasonInvalid =
    !reason.trim() || (dialog === "pause" && reason === "other" && !reasonNote.trim());

  function submitReason() {
    if (dialog === "reassign") {
      if (mentor) onMentor(mentor, reason.trim());
    } else if (dialog === "pause" || dialog === "withdraw") {
      onLifecycle(dialog, reason.trim(), dialog === "pause" ? reasonNote.trim() : undefined);
    }
    closeDialog();
  }

  return (
    <PlacementWorkspaceFrame user={user} title="Placement detail" onError={onError}>
      <AdminPage className="pmd">
        {notice && <Notice message={notice} onDismiss={onDismissNotice} />}
        <div className="pmd-sticky">
          <button type="button" onClick={onBack} className="pmd-back">
            <ArrowLeft size={16} aria-hidden="true" /> All placements
          </button>
          <AdminPageHeader
            eyebrow={`Placement · ${placement.cohort_name ?? "Cohort pending"}`}
            title={studentName}
            meta={
              <>
                <StatusPill tone={adminStatusTone(placement.state)}>
                  <span className="pmd-cap">{placement.state.replaceAll("_", " ")}</span>
                </StatusPill>
                <span>
                  <CalendarDays aria-hidden="true" size={14} /> {formatShortDate(placement.planned_start)} – {formatShortDate(placement.planned_end)}
                </span>
                {placement.facility_name && (
                  <span>
                    <Hospital aria-hidden="true" size={14} /> {placement.facility_name}
                  </span>
                )}
                {placement.completed_at && <span>Completed {formatLifecycleDate(placement.completed_at)}</span>}
                {placement.archived_at && <span>Archived {formatLifecycleDate(placement.archived_at)}</span>}
                {placement.withdrawal_reason && <span>Withdrawal reason: {formatLifecycleReason(placement.withdrawal_reason)}</span>}
              </>
            }
            actions={
              <>
                <AdminButton variant="secondary" icon={<MessageSquarePlus />} disabled={busy} onClick={() => setDialog("note")}>
                  Add note
                </AdminButton>
                {primary && (
                  <AdminButton icon={primary.icon} disabled={busy || primary.disabled} onClick={primary.run}>
                    {primary.label}
                  </AdminButton>
                )}
              </>
            }
          />
        </div>

        <PlacementStepper state={placement.state} />

        <div className="pmd-grid">
          <div className="pmd-col">
            <AdminCard title="Placement details" description="Who, where and when for this placement.">
              <DetailList
                items={[
                  { label: "Student", value: placement.student?.name ?? "Pending", icon: <GraduationCap /> },
                  { label: "Email", value: placement.student?.email ?? "Pending", icon: <Mail /> },
                  { label: "Registration number", value: placement.student?.registration_number ?? "Pending", icon: <Hash /> },
                  { label: "Cohort", value: placement.cohort_name ?? "Pending", icon: <Users /> },
                  { label: "Institution", value: placement.institution_name ?? "Pending", icon: <Building2 /> },
                  { label: "Facility", value: placement.facility_name ?? "Pending", icon: <Hospital /> },
                  {
                    label: "Ward",
                    value: placement.ward ? `${placement.ward.name} · ${placement.ward.occupied}/${placement.ward.capacity}` : "Pending",
                    icon: <BedDouble />,
                  },
                  { label: "Mentor", value: placement.mentor?.name ?? "Pending", icon: <UserRound /> },
                  {
                    label: "Planned window",
                    value: `${formatShortDate(placement.planned_start)} → ${formatShortDate(placement.planned_end)}`,
                    icon: <CalendarDays />,
                  },
                  {
                    label: placement.actual_end ? "Effective end (extended)" : "Effective end",
                    value: formatShortDate(placement.actual_end ?? placement.planned_end),
                    icon: <Clock />,
                  },
                ]}
              />
            </AdminCard>

            <AdminCard title="Setup and ownership" description="Allocate the operational context before the placement moves forward.">
              <div className="pmd-form">
                <FieldRow>
                  <label className="ui-field">
                    <span className="ui-label">Ward</span>
                    <SelectInput disabled={!canWard || busy} value={ward} onChange={(event) => setWard(event.target.value)}>
                      <option value="">Choose ward</option>
                      {options?.wards.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.facility_name} · {item.name} ({item.capacity})
                        </option>
                      ))}
                    </SelectInput>
                  </label>
                  <label className="ui-field">
                    <span className="ui-label">Mentor</span>
                    <SelectInput disabled={!canMentor || busy} value={mentor} onChange={(event) => setMentor(event.target.value)}>
                      <option value="">Choose mentor</option>
                      {options?.mentors.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.email}
                        </option>
                      ))}
                    </SelectInput>
                  </label>
                </FieldRow>
                {((canWard && ward) || (canMentor && mentor)) && (
                  <div className="pmd-actions-row">
                    {canWard && ward && (
                      <AdminButton size="sm" variant="secondary" disabled={busy || ward === placement.ward?.id} onClick={() => onWard(ward)}>
                        Save ward
                      </AdminButton>
                    )}
                    {canMentor && mentor && (
                      <AdminButton
                        size="sm"
                        variant="secondary"
                        disabled={busy || mentor === placement.mentor?.id}
                        onClick={() => (reassigning ? setDialog("reassign") : onMentor(mentor))}
                      >
                        {reassigning ? "Request reassignment" : "Save mentor"}
                      </AdminButton>
                    )}
                  </div>
                )}
              </div>
            </AdminCard>

            <AdminCard
              title="History"
              description="A clear record of who changed the placement and when."
              action={<StatusPill tone="neutral" dot={false}>{eventLabel}</StatusPill>}
            >
              {activity.length ? (
                <ol className="pmd-timeline">
                  {activity.map((entry) => (
                    <li key={entry.id}>
                      <span className="pmd-timeline__dot" aria-hidden="true" />
                      <div className="pmd-timeline__head">
                        <strong>{formatActivityAction(entry.action)}</strong>
                        <time dateTime={entry.occurred_at}>{formatActivityDate(entry.occurred_at)}</time>
                      </div>
                      <p>
                        {entry.actor} · {entry.actor_role.replaceAll("_", " ")}
                      </p>
                      {entry.override_reason && <p className="pmd-timeline__reason">Reason: {entry.override_reason}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon={<FileText size={22} />} title="No placement activity has been recorded yet." />
              )}
            </AdminCard>
          </div>

          <div className="pmd-col">
            <AdminCard title="Next step" description="Actions depend on the placement state and your role.">
              <div className="pmd-next">
                <div className="pmd-next__row">
                  <StatusPill tone={adminStatusTone(placement.state)}>{placementStateLabel(placement.state)}</StatusPill>
                  <strong>{nextStep}</strong>
                </div>
                <div className="pmd-progress">
                  <div className="pmd-progress__head">
                    <span>Overall placement progress</span>
                    <strong>{progress ? `${progress.overall_percentage ?? 0}%` : "—"}</strong>
                  </div>
                  <div
                    className="pmd-progress__track"
                    role="progressbar"
                    aria-label="Overall placement progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress?.overall_percentage ?? 0}
                  >
                    <span style={{ width: `${progress?.overall_percentage ?? 0}%` }} />
                  </div>
                </div>
                <div>
                  <p className="pmd-eyebrow">What is still needed</p>
                  {blockers.length ? (
                    <ul className="pmd-blockers">
                      {blockers.map((item, index) => (
                        <li key={`${item.code}-${index}`}>
                          <CircleAlert aria-hidden="true" />
                          <span>
                            {item.message ?? item.code}
                            <small>{blockerOwner(item.code)}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pmd-muted">No blockers are currently recorded.</p>
                  )}
                </div>
              </div>
            </AdminCard>

            <AdminCard title="More actions">
              {secondary.length ? (
                <div className="pmd-action-list">
                  {secondary.map((item) => (
                    <AdminButton
                      key={item.key}
                      variant="secondary"
                      className={item.danger ? "pmd-btn-danger" : undefined}
                      icon={item.icon}
                      disabled={busy || item.disabled}
                      onClick={item.run}
                    >
                      {item.label}
                    </AdminButton>
                  ))}
                </div>
              ) : (
                <p className="pmd-muted">
                  <CircleAlert aria-hidden="true" /> No other manual action is available at this stage.
                </p>
              )}
            </AdminCard>

            <AdminCard title="Progress evidence" description="Safe operational milestones from the placement record.">
              <DetailList
                items={[
                  {
                    label: "Orientation",
                    value: progress?.orientation?.acknowledged ? "Acknowledged" : progress ? "Awaiting acknowledgement" : "Not available",
                    icon: <ClipboardList />,
                  },
                  {
                    label: "Induction",
                    value: progress ? `${progress.induction.completed}/${progress.induction.total} completed` : "Not available",
                    icon: <CheckCircle2 />,
                  },
                  {
                    label: "Mentorship",
                    value: progress ? `${progress.mentorship.sessions_logged} sessions logged` : "Not available",
                    icon: <Users />,
                  },
                  {
                    label: "Assessment",
                    value: progress?.assessment.final_submitted ? "Final assessment submitted" : progress ? "Final assessment pending" : "Not available",
                    icon: <FileText />,
                  },
                  {
                    label: "Safeguarding",
                    value: progress ? `${progress.safeguarding.open_concerns} open concerns` : "Not available",
                    icon: <ShieldCheck />,
                  },
                ]}
              />
            </AdminCard>

            {notes.length > 0 && (
              <AdminCard title="Notes">
                <ul className="pmd-notes">
                  {notes.slice(0, 5).map((note) => (
                    <li key={note.id}>
                      <p>{note.body}</p>
                      <small>
                        {note.author} · {formatActivityDate(note.created_at)}
                      </small>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            )}
          </div>
        </div>

        {(dialog === "complete" || dialog === "archive") && (
          <Modal
            open
            onClose={closeDialog}
            size="sm"
            icon={dialog === "complete" ? <CheckCircle2 /> : <Archive />}
            title={dialog === "complete" ? "Complete this placement?" : "Archive this placement?"}
            description={
              dialog === "complete"
                ? "This records the placement as complete once the required milestones are satisfied."
                : "This moves the completed placement into the archive. Archived records are retained for governance and cannot be edited."
            }
            footer={
              <>
                <AdminButton variant="secondary" onClick={closeDialog}>
                  Cancel
                </AdminButton>
                <AdminButton
                  disabled={busy}
                  onClick={() => {
                    onLifecycle(dialog);
                    closeDialog();
                  }}
                >
                  {dialog === "complete" ? "Complete placement" : "Archive placement"}
                </AdminButton>
              </>
            }
          >
            <p className="pmd-muted">You can review the history afterwards from this page.</p>
          </Modal>
        )}

        {reasonRequired && (
          <Modal
            open
            onClose={closeDialog}
            size="md"
            icon={dialog === "withdraw" ? <XCircle className="pmd-icon-danger" /> : dialog === "pause" ? <Pause /> : <UserRound />}
            title={
              dialog === "pause"
                ? "Pause this placement?"
                : dialog === "withdraw"
                  ? "Withdraw this placement?"
                  : "Reassign this mentor?"
            }
            description={
              dialog === "withdraw"
                ? "Confirm the action and record why the placement is being withdrawn."
                : dialog === "reassign"
                  ? "Record why the mentor assignment needs to change."
                  : "Record why the placement is being paused."
            }
            footer={
              <>
                <AdminButton variant="secondary" onClick={closeDialog}>
                  Cancel
                </AdminButton>
                <AdminButton
                  className={dialog === "withdraw" ? "pmd-btn-solid-danger" : undefined}
                  disabled={reasonInvalid || busy}
                  onClick={submitReason}
                >
                  {dialog === "pause" ? "Pause placement" : dialog === "withdraw" ? "Withdraw placement" : "Confirm reassignment"}
                </AdminButton>
              </>
            }
          >
            <div className="pmd-form">
              {dialog === "withdraw" && (
                <p className="pmd-callout pmd-callout--danger" role="note">
                  <CircleAlert aria-hidden="true" />
                  This removes the placement from the active workflow and cannot be undone from this screen.
                </p>
              )}
              {dialog === "reassign" && (
                <p className="pmd-callout" role="note">
                  <CircleAlert aria-hidden="true" />
                  The current mentor will be closed out in the assignment history and the new mentor will become responsible for future activity.
                </p>
              )}
              {dialog === "reassign" ? (
                <KitField label="Reassignment reason" required>
                  <TextArea
                    autoFocus
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why does this mentor assignment need to change?"
                    required
                  />
                </KitField>
              ) : (
                <KitField label={dialog === "pause" ? "Pause reason" : "Withdrawal reason"} required>
                  <SelectInput autoFocus value={reason} onChange={(event) => setReason(event.target.value)} required>
                    <option value="">Choose a reason</option>
                    {(dialog === "pause" ? pauseReasons : withdrawalReasons).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                </KitField>
              )}
              {dialog === "pause" && reason === "other" && (
                <KitField label="Explain the reason" required>
                  <TextArea
                    autoFocus
                    value={reasonNote}
                    onChange={(event) => setReasonNote(event.target.value)}
                    placeholder="Add a short explanation for this interruption"
                    required
                  />
                </KitField>
              )}
            </div>
          </Modal>
        )}

        {dialog === "note" && (
          <Modal
            open
            onClose={closeDialog}
            dismissible={!noteBusy}
            size="md"
            icon={<MessageSquarePlus />}
            title="Add placement note"
            description="Add an operational note for the programme team. Avoid sensitive clinical or safeguarding details."
            footer={
              <>
                <AdminButton variant="secondary" onClick={closeDialog} disabled={noteBusy}>
                  Cancel
                </AdminButton>
                <AdminButton disabled={!noteBody.trim() || noteBusy} aria-busy={noteBusy} onClick={() => void saveNote()}>
                  {noteBusy ? "Saving…" : "Save note"}
                </AdminButton>
              </>
            }
          >
            <KitField label="Note" hint={`${noteBody.length}/2000`}>
              <TextArea
                autoFocus
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Write a short operational note"
              />
            </KitField>
          </Modal>
        )}
      </AdminPage>
    </PlacementWorkspaceFrame>
  );
}

function PlacementWorkspaceFrame({
  user,
  title,
  onError,
  children,
}: {
  user: CurrentUser;
  title: string;
  onError: (message: string) => void;
  children: React.ReactNode;
}) {
  const navigateRoute = useNavigate();
  if (user.role === "coordinator") {
    function navigate(destination: CoordinatorNav) {
      if (destination === "placements") return;
      const path =
        destination === "overview" ? "/" : `/coordinator/${destination}`;
      navigateRoute(path);
    }
    return (
      <CoordinatorFrame
        user={user}
        active="placements"
        title={title}
        onNavigate={navigate}
        onAccount={() => navigateRoute("/coordinator/account")}
        onSignedOut={() => window.location.assign("/")}
        onError={onError}
      >
        {children}
      </CoordinatorFrame>
    );
  }
  if (user.role === "nurse_manager")
    return (
      <FacilityWorkspaceFrame
        user={user}
        active="placements"
        title={title}
        onAccount={() => navigateRoute("/facility/account")}
        onError={onError}
      >
        {children}
      </FacilityWorkspaceFrame>
    );
  if (user.role !== "program_admin")
    return (
      <PortalWorkspaceLayout user={user}>{children}</PortalWorkspaceLayout>
    );
  function navigate(destination: ProgrammeAdminNav) {
    if (destination === "placements") return;
    const path =
      destination === "overview"
        ? "/admin"
        : destination === "setup"
          ? "/admin/settings"
          : `/admin/${destination}`;
    navigateRoute(path);
  }
  return (
    <ProgrammeAdminFrame
      user={user}
      active="placements"
      title={title}
      onNavigate={navigate}
      onSettings={() => navigateRoute("/admin/account?tab=security")}
      onAccount={() => navigateRoute("/admin/account?tab=overview")}
      onSignedOut={() => window.location.assign("/")}
      onError={onError}
    >
      {children}
    </ProgrammeAdminFrame>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="font-body text-sm font-semibold text-navy">
      {label}
      {children}
    </label>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </p>
      <p className="mt-2 font-body text-sm font-semibold text-navy">{value}</p>
    </div>
  );
}

function Notice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-6 flex items-center justify-between gap-4 border-l-2 border-teal bg-teal-light/40 px-4 py-3 font-body text-sm font-semibold text-navy"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="font-body text-xs font-bold text-teal underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}

function formatActivityAction(action: string) {
  return action.replaceAll(".", " · ").replaceAll("_", " ");
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatLifecycleDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatLifecycleReason(value: string) {
  return value.replaceAll("_", " ");
}

function placementStateLabel(state: string) {
  const label = state.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
