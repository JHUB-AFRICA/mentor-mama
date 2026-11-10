import { useEffect, useState } from "react";
import { AdminPageHeader } from "../programme-admin/ui/AdminKit";
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button, Card, Skeleton } from "@mentormama/ui";
import {
  ApiError,
  createPlacementsBulk,
  getPlacementBatch,
  getPlacementEligibleStudents,
  getPlacementOptions,
  type PlacementEligibleStudent,
  type PlacementEligibility,
  type PlacementBatchResult,
  type PlacementOptions,
} from "../../services/api";

export function CoordinatorPlacementCreate({
  onBack,
  onError,
  onOpenBatch,
}: {
  onBack: () => void;
  onError: (message: string) => void;
  onOpenBatch?: (id: string) => void;
}) {
  const [options, setOptions] = useState<PlacementOptions | null>(null);
  const [cohort, setCohort] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [allEligible, setAllEligible] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [students, setStudents] = useState<PlacementEligibleStudent[]>([]);
  const [studentPagination, setStudentPagination] = useState<
    PlacementEligibility["pagination"] | null
  >(null);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [excluded, setExcluded] = useState<
    Array<{ id: string; name: string; reason: string; dates?: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    batchId: string;
    status: PlacementBatchResult["status"];
  } | null>(null);
  useEffect(() => {
    void getPlacementOptions()
      .then(setOptions)
      .catch((cause) =>
        onError(
          cause instanceof ApiError
            ? cause.message
            : "We could not load placement options.",
        ),
      );
  }, [onError]);
  useEffect(() => {
    if (!studentPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStudentPickerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [studentPickerOpen]);
  function chooseCohort(id: string) {
    setCohort(id);
    setStudentPickerOpen(false);
    setSelectedStudents([]);
    setAllEligible(false);
    setStudentSearch("");
    setStudentPage(1);
    setExcluded([]);
    setResult(null);
  }
  useEffect(() => {
    if (!cohort) {
      setStudents([]);
      setExcluded([]);
      return;
    }
    let active = true;
    void getPlacementEligibleStudents(cohort, {
      plannedStart: start || undefined,
      plannedEnd: end || undefined,
      page: studentPage,
      search: studentSearch || undefined,
    })
      .then((eligibility) => {
        if (!active) return;
        setStudents(eligibility.eligible);
        setExcluded(eligibility.excluded);
        setStudentPagination(eligibility.pagination);
      })
      .catch((cause) => {
        if (!active) return;
        setStudents([]);
        onError(
          cause instanceof ApiError
            ? cause.message
            : "We could not load students for this cohort.",
        );
      });
    return () => {
      active = false;
    };
  }, [cohort, start, end, studentPage, studentSearch, onError]);
  async function submit() {
    setBusy(true);
    try {
      const created = await createPlacementsBulk({
        cohort_id: cohort,
        student_ids: allEligible ? [] : selectedStudents,
        all_eligible: allEligible,
        planned_start: start,
        planned_end: end,
      });
      setResult({
        created: created.created.length,
        skipped: created.skipped.length,
        batchId: created.batch_id,
        status: created.status,
      });
      if (created.status !== "completed") setBatchId(created.batch_id);
      setReviewing(false);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not create this placement.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!batchId) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const current = await getPlacementBatch(batchId);
        if (!active) return;
        setResult({
          created: current.created.length,
          skipped: current.skipped.length,
          batchId: current.batch_id,
          status: current.status,
        });
        if (current.status === "queued" || current.status === "processing")
          timer = window.setTimeout(() => void poll(), 1500);
        else setBatchId("");
      } catch (cause) {
        if (active)
          onError(
            cause instanceof ApiError
              ? cause.message
              : "We could not check batch progress.",
          );
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [batchId, onError]);
  const selectionCount = allEligible
    ? (studentPagination?.total_count ?? students.length)
    : selectedStudents.length;
  const eligibleCount = studentPagination?.total_count ?? students.length;
  function toggleAllStudents() {
    if (allEligible || selectedStudents.length >= eligibleCount) {
      setAllEligible(false);
      setSelectedStudents([]);
      return;
    }
    setAllEligible(true);
    setSelectedStudents([]);
  }
  return (
    <section
      className="mx-auto w-full max-w-[75rem] space-y-5"
      aria-labelledby="create-coordinator-placement-heading"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-semibold text-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All placements
      </button>
      <AdminPageHeader
        eyebrow="Placement setup"
        title="Create a placement"
        description="Choose an enrolled student and define the planned placement window. Facility allocation and mentor assignment remain with the operational facility team."
      />
      <Card
        padding="lg"
        className="max-w-4xl rounded-2xl border-border shadow-[0_4px_18px_rgba(13,27,51,0.05)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-teal-light text-teal">
            <CalendarPlus size={19} aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-navy">
              Placement foundation
            </h3>
            <p className="mt-1 font-body text-sm text-navy-muted">
              This creates the institution-side handoff record.
            </p>
          </div>
        </div>
        {!options ? (
          <Skeleton className="mt-7 h-48 rounded-xl" />
        ) : (
          <form
            className="mt-7 space-y-7"
            onSubmit={(event) => {
              event.preventDefault();
              setReviewing(true);
            }}
          >
            <Select label="Cohort" value={cohort} onChange={chooseCohort}>
              <option value="">Choose cohort</option>
              {options.cohorts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            {cohort && (
              <div className="rounded-2xl border border-border bg-mist/25 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal">
                      <Users size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
                        Student selection
                      </p>
                      <p className="mt-1 font-body text-sm font-semibold text-navy">
                        {allEligible
                          ? `All ${eligibleCount} eligible students selected`
                          : selectionCount
                            ? `${selectionCount} student${selectionCount === 1 ? "" : "s"} selected`
                            : `${eligibleCount} eligible students`}
                      </p>
                      <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
                        Choose who should receive the same placement window.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="tertiary"
                    onClick={() => setStudentPickerOpen(true)}
                    disabled={!eligibleCount}
                  >
                    {selectionCount ? "Review students" : "Choose students"}
                  </Button>
                </div>
                {excluded.length > 0 && (
                  <p className="mt-4 border-t border-border pt-3 font-body text-xs text-navy-muted">
                    {excluded.length} student
                    {excluded.length === 1 ? " is" : "s are"} hidden because
                    they already have an active placement in this window.
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Planned start" value={start} onChange={setStart} />
              <Field label="Planned end" value={end} onChange={setEnd} />
            </div>
            {reviewing && (
              <div
                className="rounded-2xl border border-teal/30 bg-teal-light/40 p-4"
                role="dialog"
                aria-label="Review bulk placement creation"
              >
                <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">
                  Review before creating
                </p>
                <p className="mt-2 font-display text-lg font-bold text-navy">
                  Create {selectionCount} placement
                  {selectionCount === 1 ? "" : "s"}?
                </p>
                <p className="mt-1 font-body text-sm text-navy-muted">
                  {start} → {end}. Facility, ward, and mentor details will be
                  added by the operational team later.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy}
                  >
                    {busy ? "Creating…" : "Confirm and create"}
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    onClick={() => setReviewing(false)}
                    disabled={busy}
                  >
                    Back to selection
                  </Button>
                </div>
              </div>
            )}
            {result && (
              <div
                role="status"
                className="rounded-xl bg-teal-light px-4 py-3 font-body text-sm text-navy"
              >
                {result.status === "queued" || result.status === "processing"
                  ? "Batch is processing"
                  : `${result.created} placement${result.created === 1 ? "" : "s"} created${result.skipped ? ` · ${result.skipped} skipped` : ""}.`}{" "}
                Batch {result.batchId.slice(0, 8)}.{" "}
                {onOpenBatch && (
                  <button type="button" onClick={() => onOpenBatch(result.batchId)} className="font-semibold text-teal underline underline-offset-2 hover:text-teal-dark">
                    View batch details
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
              <Button
                type="submit"
                disabled={
                  busy ||
                  reviewing ||
                  !cohort ||
                  !selectionCount ||
                  !start ||
                  !end ||
                  end < start
                }
              >
                {busy
                  ? "Creating…"
                  : `Create ${selectionCount || ""} placement${selectionCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </form>
        )}
      </Card>
      {studentPickerOpen && cohort && (
        <StudentPickerModal
          students={students}
          pagination={studentPagination}
          search={studentSearch}
          selectedStudents={selectedStudents}
          allEligible={allEligible}
          onSearch={(value) => {
            setStudentSearch(value);
            setStudentPage(1);
            setAllEligible(false);
          }}
          onPageChange={setStudentPage}
          onToggle={(id) => {
            setAllEligible(false);
            setSelectedStudents((current) =>
              current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id],
            );
          }}
          onToggleAll={toggleAllStudents}
          onClose={() => setStudentPickerOpen(false)}
        />
      )}
    </section>
  );
}

function StudentPickerModal({
  students,
  pagination,
  search,
  selectedStudents,
  allEligible,
  onSearch,
  onPageChange,
  onToggle,
  onToggleAll,
  onClose,
}: {
  students: PlacementEligibleStudent[];
  pagination: PlacementEligibility["pagination"] | null;
  search: string;
  selectedStudents: string[];
  allEligible: boolean;
  onSearch: (value: string) => void;
  onPageChange: (page: number) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onClose: () => void;
}) {
  const selectedOnPage = students.filter((item) =>
    selectedStudents.includes(item.id),
  ).length;
  const allOnPage = students.length > 0 && selectedOnPage === students.length;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_70px_rgba(13,27,51,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-picker-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal">
              <Users size={19} aria-hidden="true" />
            </span>
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Placement students
              </p>
              <h3
                id="student-picker-heading"
                className="mt-1 font-display text-xl font-bold text-navy sm:text-2xl"
              >
                Choose eligible students
              </h3>
              <p className="mt-1 font-body text-sm leading-6 text-navy-muted">
                Select individual students or apply the same placement window to
                everyone eligible.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-navy-muted transition hover:bg-mist hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            aria-label="Close student picker"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="flex flex-col gap-3 border-b border-border bg-mist/25 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-white px-3 focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20">
            <Search
              size={17}
              className="shrink-0 text-navy-muted"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search name, email, or registration number"
              aria-label="Search eligible students"
              className="min-w-0 flex-1 bg-transparent font-body text-sm text-navy outline-none placeholder:text-navy-muted/70"
            />
          </label>
          <button
            type="button"
            onClick={onToggleAll}
            className="min-h-11 shrink-0 rounded-xl px-3 text-left font-body text-sm font-bold text-teal transition hover:bg-teal-light focus:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:text-center"
          >
            {allEligible || allOnPage ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {students.length ? (
            <div className="divide-y divide-border">
              {students.map((item) => {
                const selected =
                  allEligible || selectedStudents.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 px-5 py-4 transition hover:bg-mist/35 sm:px-7"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(item.id)}
                      className="size-4 accent-teal"
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-light font-body text-sm font-bold text-teal">
                        {item.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-body text-sm font-semibold text-navy">
                          {item.name}
                        </span>
                        <span className="block truncate font-body text-xs text-navy-muted">
                          {item.email}
                        </span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block font-body text-xs font-semibold text-navy">
                        {item.registration_number}
                      </span>
                      <span className="mt-1 block font-body text-[0.68rem] text-navy-muted">
                        Eligible
                      </span>
                    </span>
                    {selected && (
                      <Check
                        size={17}
                        className="shrink-0 text-teal"
                        aria-hidden="true"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-14 text-center sm:px-7">
              <Users
                size={24}
                className="mx-auto text-navy-muted"
                aria-hidden="true"
              />
              <p className="mt-3 font-body text-sm font-semibold text-navy">
                No eligible students found
              </p>
              <p className="mt-1 font-body text-sm text-navy-muted">
                Try another search or return to the cohort after resolving
                existing placements.
              </p>
            </div>
          )}
        </div>
        <footer className="flex flex-col gap-3 border-t border-border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="font-body text-xs text-navy-muted">
            {allEligible
              ? "Every eligible student is selected"
              : `${selectedStudents.length} selected`}{" "}
            · {pagination?.total_count ?? students.length} eligible
          </p>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {pagination && pagination.total_pages > 1 && (
              <>
                <button
                  type="button"
                  disabled={!pagination.has_previous}
                  onClick={() => onPageChange(pagination.page - 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-body text-xs font-semibold text-teal disabled:opacity-40"
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>
                <span className="font-body text-xs font-semibold text-navy-muted">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <button
                  type="button"
                  disabled={!pagination.has_next}
                  onClick={() => onPageChange(pagination.page + 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-body text-xs font-semibold text-teal disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </>
            )}
            <Button type="button" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block font-body text-sm font-semibold text-navy">
      {label}
      <select
        required
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="auth-control mt-2 disabled:opacity-60"
      >
        {children}
      </select>
    </label>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block font-body text-sm font-semibold text-navy">
      {label}
      <input
        required
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="auth-control mt-2"
      />
    </label>
  );
}
