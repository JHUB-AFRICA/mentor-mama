import { useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, CheckCircle2, Rocket, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Field, Modal, SelectInput, TextInput } from "../../components/kit";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, Notice, SearchField } from "../programme-admin/ui/AdminKit";
import { ServerPager } from "../programme-admin/ui/DataTable";
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
  const invalidDates = Boolean(start && end && end < start);
  const canCreate = !busy && Boolean(cohort) && selectionCount > 0 && Boolean(start) && Boolean(end) && !invalidDates;
  const cohortName = options?.cohorts.find((item) => item.id === cohort)?.name;
  return (
    <AdminPage>
      <div>
        <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={onBack}>
          All placements
        </AdminButton>
      </div>
      <AdminPageHeader
        eyebrow="Placement setup"
        title="Create placements"
        description="Choose a cohort, the students and the placement window. Then send the drafts to partner facilities, whose nurse managers place students in wards."
      />
      {!options ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="rp-grid-2">
          <AdminCard title="Placement details" description="One window for everyone you select.">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canCreate) setReviewing(true);
              }}
            >
              <Field label="Cohort" required>
                <SelectInput value={cohort} onChange={(event) => chooseCohort(event.target.value)}>
                  <option value="">Choose cohort</option>
                  {options.cohorts.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </SelectInput>
              </Field>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <Field label="Planned start" required>
                  <TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} />
                </Field>
                <Field label="Planned end" required error={invalidDates ? "The end date must be after the start date." : undefined}>
                  <TextInput type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} />
                </Field>
              </div>
              {cohort ? (
                <div className="pa-card" style={{ padding: 14, margin: "6px 0 14px" }}>
                  <strong>
                    {allEligible
                      ? `All ${eligibleCount} eligible students`
                      : selectionCount
                        ? `${selectionCount} student${selectionCount === 1 ? "" : "s"} selected`
                        : `${eligibleCount} eligible student${eligibleCount === 1 ? "" : "s"}`}
                  </strong>
                  <small className="pa-sub">
                    {excluded.length > 0
                      ? `${excluded.length} hidden: already placed in this window.`
                      : "Choose who gets this placement window."}
                  </small>
                  <div style={{ marginTop: 10 }}>
                    <AdminButton type="button" variant="secondary" size="sm" icon={<Users />} onClick={() => setStudentPickerOpen(true)} disabled={!eligibleCount}>
                      {selectionCount ? "Review students" : "Choose students"}
                    </AdminButton>
                  </div>
                </div>
              ) : (
                <Notice icon={<Users />}>Choose a cohort to see its eligible students.</Notice>
              )}
              <AdminButton type="submit" icon={<Rocket />} disabled={!canCreate || reviewing}>
                {busy ? "Creating…" : `Create ${selectionCount || ""} placement${selectionCount === 1 ? "" : "s"}`.replace("  ", " ")}
              </AdminButton>
            </form>
          </AdminCard>

          <AdminCard title="Summary" description="Check this before you create.">
            <dl className="pa-summary">
              <div><dt>Cohort</dt><dd>{cohortName ?? "Not chosen"}</dd></div>
              <div><dt>Students</dt><dd>{selectionCount || "None selected"}</dd></div>
              <div><dt>Window</dt><dd>{start && end ? `${start} → ${end}` : "Not set"}</dd></div>
              <div><dt>Next</dt><dd>Drafts appear in Placements. Select them and use “Send to partner facilities”.</dd></div>
            </dl>
            {result && (
              <Notice icon={<CheckCircle2 />}>
                {result.status === "queued" || result.status === "processing"
                  ? "Batch is processing…"
                  : `${result.created} placement${result.created === 1 ? "" : "s"} created${result.skipped ? ` · ${result.skipped} skipped` : ""}.`}{" "}
                {onOpenBatch && (
                  <button type="button" onClick={() => onOpenBatch(result.batchId)} className="pa-link">
                    View batch details
                  </button>
                )}
              </Notice>
            )}
          </AdminCard>
        </div>
      )}

      <Modal
        open={reviewing}
        onClose={() => !busy && setReviewing(false)}
        dismissible={!busy}
        size="sm"
        icon={<CalendarPlus />}
        title={`Create ${selectionCount} placement${selectionCount === 1 ? "" : "s"}?`}
        description={`${cohortName ?? "Cohort"} · ${start} → ${end}. Facility, ward and mentor are set later.`}
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setReviewing(false)} disabled={busy}>Back</AdminButton>
            <AdminButton size="sm" onClick={() => void submit()} disabled={busy}>{busy ? "Creating…" : "Confirm and create"}</AdminButton>
          </>
        }
      >
        <p className="pa-sub">Each student gets a draft placement. Nobody is emailed until the placement is released.</p>
      </Modal>

      <StudentPickerModal
        open={studentPickerOpen && Boolean(cohort)}
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
          setSelectedStudents((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
        }}
        onToggleAll={toggleAllStudents}
        onClose={() => setStudentPickerOpen(false)}
      />
    </AdminPage>
  );
}

function StudentPickerModal({
  open, students, pagination, search, selectedStudents, allEligible, onSearch, onPageChange, onToggle, onToggleAll, onClose,
}: {
  open: boolean;
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
  const allOnPage = students.length > 0 && students.every((item) => selectedStudents.includes(item.id));
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Users />}
      title="Choose eligible students"
      description="Select individual students, or everyone eligible."
      footer={
        <>
          <span className="pa-sub" style={{ marginRight: "auto" }}>
            {allEligible ? "Every eligible student is selected" : `${selectedStudents.length} selected`} · {pagination?.total_count ?? students.length} eligible
          </span>
          <AdminButton size="sm" onClick={onClose}>Done</AdminButton>
        </>
      }
    >
      <SearchField label="Search eligible students" placeholder="Search name, email or registration number" value={search} onChange={onSearch} />
      <div style={{ margin: "8px 0" }}>
        <AdminButton type="button" variant="ghost" size="sm" onClick={onToggleAll}>{allEligible || allOnPage ? "Clear all" : "Select all eligible"}</AdminButton>
      </div>
      {students.length === 0 ? (
        <EmptyState icon={<Users />} title="No eligible students found" text="Try another search, or resolve existing placements first." />
      ) : (
        <div className="pa-table-scroll" style={{ maxHeight: 340, overflow: "auto" }}>
          <table className="pa-table">
            <caption className="sr-only">Eligible students</caption>
            <thead>
              <tr><th scope="col" style={{ width: 36 }}><span className="sr-only">Select</span></th><th scope="col">Student</th><th scope="col">Registration</th></tr>
            </thead>
            <tbody>
              {students.map((item) => (
                <tr key={item.id} className="is-clickable" onClick={() => onToggle(item.id)}>
                  <td><input type="checkbox" aria-label={`Select ${item.name}`} checked={allEligible || selectedStudents.includes(item.id)} onChange={() => onToggle(item.id)} onClick={(event) => event.stopPropagation()} /></td>
                  <td><strong>{item.name}</strong><small className="pa-sub">{item.email}</small></td>
                  <td>{item.registration_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination && pagination.total_pages > 1 && <ServerPager pagination={pagination} onPage={onPageChange} noun="students" />}
    </Modal>
  );
}
