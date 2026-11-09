import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, Search, UserPlus, Users, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Skeleton } from "@mentormama/ui";
import {
  ApiError,
  createCohort,
  enrolStudent,
  getCohorts,
  getInstitutionStudents,
  previewCohortEnrolment,
  bulkEnrolCohort,
  resendInvitation,
  type InstitutionStudent,
} from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import { TablePagination } from "../../components/TablePagination";

export function CohortManagement({
  onError,
  onInviteStudents,
  onManageStudents,
  onOpenCohort,
}: {
  onError: (message: string) => void;
  onInviteStudents?: () => void;
  onManageStudents?: () => void;
  onOpenCohort?: (id: string) => void;
}) {
  const cohorts = useQuery({
    queryKey: ["institution-cohorts"],
    queryFn: getCohorts,
  });
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [cohortFilter, setCohortFilter] = useState<"" | "assigned" | "unassigned">("");
  const students = useQuery({
    queryKey: ["institution-students", studentPage, studentSearch, cohortFilter],
    queryFn: () =>
      getInstitutionStudents({
        page: studentPage,
        page_size: 20,
        search: studentSearch,
        cohort_status: cohortFilter || undefined,
      }),
  });
  const rosterSummary = useQuery({
    queryKey: ["institution-student-roster-count"],
    queryFn: () => getInstitutionStudents({ page: 1, page_size: 1 }),
  });
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [enrollingOpen, setEnrollingOpen] = useState(false);
  const [detailStudent, setDetailStudent] = useState<InstitutionStudent | null>(
    null,
  );
  const [enrolling, setEnrolling] = useState(false);
  const [selectedCohort, setSelectedCohort] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [bulkStudentIds, setBulkStudentIds] = useState<string[]>([]);
  const [bulkPreview, setBulkPreview] = useState<Awaited<ReturnType<typeof previewCohortEnrolment>> | null>(null);
  const [resendingStudent, setResendingStudent] = useState(false);
  const { pushToast } = useToast();
  const [form, setForm] = useState({
    name: "",
    start_date: "",
    end_date: "",
    planned_capacity: "",
  });
  useEffect(() => {
    if (!creating && !enrollingOpen && !detailStudent) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEnrollingOpen(false);
        setCreating(false);
        setDetailStudent(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [creating, enrollingOpen, detailStudent]);
  useEffect(() => {
    setStudentPage(1);
  }, [studentSearch]);
  const filteredStudents = useMemo(
    () => students.data?.results ?? [],
    [students.data],
  );
  async function submitCohort(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingBusy(true);
    try {
      await createCohort({
        ...form,
        planned_capacity: form.planned_capacity
          ? Number(form.planned_capacity)
          : null,
      });
      await queryClient.invalidateQueries({
        queryKey: ["institution-cohorts"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["institution-students"],
      });
      setForm({ name: "", start_date: "", end_date: "", planned_capacity: "" });
      setCreating(false);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not create the cohort.",
      );
    } finally {
      setCreatingBusy(false);
    }
  }
  async function submitEnrolment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnrolling(true);
    try {
      await enrolStudent(selectedCohort, selectedStudent);
      await queryClient.invalidateQueries({
        queryKey: ["institution-cohorts"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["institution-students"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["cohort-students"],
      });
      setSelectedStudent("");
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not enrol that student.",
      );
    } finally {
      setEnrolling(false);
    }
  }
  async function resendStudentInvitation(student: InstitutionStudent) {
    setResendingStudent(true);
    try {
      await resendInvitation(student.id);
      pushToast({
        kind: "success",
        title: "Invitation resent",
        message: `A fresh invitation was queued for ${student.email}.`,
      });
      setDetailStudent(null);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not resend this invitation.",
      );
    } finally {
      setResendingStudent(false);
    }
  }
  const totalMembers =
    cohorts.data?.reduce((total, cohort) => total + cohort.member_count, 0) ??
    0;
  return (
    <section className="space-y-8" aria-labelledby="cohorts-heading">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Institution register
          </p>
          <h2
            id="cohorts-heading"
            className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl"
          >
            Cohorts & students
          </h2>
          <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">
            Prepare student groups and keep enrolment ready for placement
            handoffs.
          </p>
        </div>
      </header>
      <div
        className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3"
        aria-label="Cohort summary"
      >
        <Summary
          label="Cohorts"
          value={cohorts.data?.length}
          loading={cohorts.isPending}
          unavailable={cohorts.isError}
        />
        <Summary
          label="Enrolled students"
          value={totalMembers}
          loading={cohorts.isPending}
          unavailable={cohorts.isError}
        />
        <Summary
          label="Students in roster"
          value={rosterSummary.data?.pagination?.total_count}
          loading={rosterSummary.isPending}
          unavailable={rosterSummary.isError}
        />
      </div>
      {creating && (
        <div
          className="fixed left-0 top-0 z-[70] flex h-[100dvh] w-full items-center justify-center bg-navy/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreating(false);
          }}
        >
          <Card
            padding="lg"
            className="relative max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border-border bg-white shadow-[0_24px_70px_rgba(13,27,51,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cohort-modal-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-5">
              <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Cohort setup
              </p>
              <h3
                id="cohort-modal-heading"
                className="mt-1 font-display text-xl font-bold text-navy"
              >
                Create a planning group
              </h3>
              <p className="mt-1 font-body text-sm text-navy-muted">
                Capacity helps planning; it does not block placement workflows.
              </p>
            </div>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={submitCohort}
            >
              <Field
                label="Cohort name"
                value={form.name}
                onChange={(value) =>
                  setForm((current) => ({ ...current, name: value }))
                }
                placeholder="e.g. BSc Midwifery · 2026"
                required
              />
              <Field
                label="Planned capacity"
                type="number"
                min="1"
                value={form.planned_capacity}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    planned_capacity: value,
                  }))
                }
                placeholder="Optional"
              />
              <Field
                label="Start date"
                type="date"
                value={form.start_date}
                onChange={(value) =>
                  setForm((current) => ({ ...current, start_date: value }))
                }
                required
              />
              <Field
                label="End date"
                type="date"
                value={form.end_date}
                onChange={(value) =>
                  setForm((current) => ({ ...current, end_date: value }))
                }
                required
              />
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={creatingBusy}>
                  {creatingBusy ? "Creating…" : "Create cohort"}
                </Button>
              </div>
            </form>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-xl text-navy-muted transition hover:bg-mist hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              aria-label="Close cohort dialog"
            >
              <X size={19} aria-hidden="true" />
            </button>
          </Card>
        </div>
      )}
      <div className="space-y-8">
        <section aria-labelledby="student-register-heading" className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm shadow-navy/[0.025]">
          <div className="flex flex-col justify-between gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h3
                id="student-register-heading"
                className="font-display text-xl font-bold tracking-tight text-navy sm:text-2xl"
              >
                Students in your institution
              </h3>
              <p className="mt-1 font-body text-sm text-navy-muted">
                View student records and manage cohort membership.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-body text-sm text-navy-muted" aria-live="polite" aria-atomic="true">
                {students.data?.pagination?.total_count ?? 0} {students.data?.pagination?.total_count === 1 ? "student" : "students"}
              </span>
              {onManageStudents && <Button type="button" size="sm" variant="tertiary" onClick={onManageStudents}>Manage students</Button>}
              {onInviteStudents && <Button type="button" size="sm" variant="secondary" onClick={onInviteStudents}><UserPlus size={16} className="mr-2" aria-hidden="true" />Invite students</Button>}
              <Button type="button" size="sm" onClick={() => { setCohortFilter("unassigned"); setStudentPage(1); setEnrollingOpen(true); }}><UserPlus size={16} className="mr-2" aria-hidden="true" />Add to cohort</Button>
            </div>
          </div>
          <div className="grid gap-3 border-b border-border bg-mist/25 px-5 py-4 sm:grid-cols-[minmax(15rem,1fr)_minmax(12rem,15rem)_auto] sm:items-end sm:px-6">
            <label className="block font-body text-xs font-semibold text-navy-muted">
              Search students
              <span className="mt-1.5 flex h-11 items-center gap-2.5 rounded-lg border border-border bg-white px-3 transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
                <Search size={17} className="shrink-0 text-navy-muted" aria-hidden="true" />
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Name, email, or registration number"
                  className="min-w-0 flex-1 bg-transparent font-body text-sm font-normal text-navy outline-none placeholder:text-navy-muted/65"
                />
              </span>
            </label>
            <label className="block font-body text-xs font-semibold text-navy-muted">
              Cohort membership
              <select value={cohortFilter} onChange={(event) => { setCohortFilter(event.target.value as "" | "assigned" | "unassigned"); setStudentPage(1); }} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-white px-3 font-body text-sm font-normal text-navy outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/15">
                <option value="">All students</option>
                <option value="unassigned">Not assigned</option>
                <option value="assigned">Assigned to a cohort</option>
              </select>
            </label>
            {(studentSearch || cohortFilter) && <button type="button" onClick={() => { setStudentSearch(""); setCohortFilter(""); setStudentPage(1); }} className="min-h-11 rounded-lg px-3 text-left font-body text-sm font-semibold text-teal transition hover:bg-teal-light/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal">Clear filters</button>}
          </div>
          <div className="overflow-hidden">
            {students.isPending && (
              <div className="space-y-3 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            )}
            {students.isError && (
              <InlineRetry
                message="We could not load students."
                onRetry={() => void students.refetch()}
              />
            )}
            {students.isSuccess && filteredStudents.length === 0 && (
              <EmptyState
                title={
                  studentSearch || cohortFilter
                    ? "No students match these filters"
                    : "No students yet"
                }
                detail={
                  studentSearch || cohortFilter
                    ? "Try a different search or cohort membership filter."
                    : "Students invited to your institution will appear here."
                }
              />
            )}
            {students.isSuccess && filteredStudents.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] table-fixed text-left">
                  <caption className="sr-only">Students in your institution and their cohort membership</caption>
                  <colgroup><col className="w-[34%]" /><col className="w-[19%]" /><col className="w-[13%]" /><col className="w-[22%]" /><col className="w-[12%]" /></colgroup>
                  <thead className="border-b border-border bg-white">
                    <tr>
                      <th scope="col" className="px-5 py-3.5 font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                        Student
                      </th>
                      <th scope="col" className="px-4 py-3.5 font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                        Registration
                      </th>
                      <th scope="col" className="px-4 py-3.5 font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-3.5 font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                        Cohort
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-right font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStudents.map((student) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        onOpen={() => setDetailStudent(student)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {students.isSuccess && students.data.pagination.total_pages > 1 && (
              <TablePagination
                page={students.data.pagination.page}
                totalPages={students.data.pagination.total_pages}
                totalCount={students.data.pagination.total_count}
                pageSize={students.data.pagination.page_size}
                onPage={setStudentPage}
              />
            )}
          </div>
        </section>
        {enrollingOpen && (
          <div
            className="fixed left-0 top-0 z-[70] flex h-[100dvh] w-full items-center justify-center bg-navy/35 p-4 backdrop-blur-[2px]"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEnrollingOpen(false);
            }}
          >
            <Card
              padding="lg"
              className="relative max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border-border bg-white shadow-[0_24px_70px_rgba(13,27,51,0.22)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="enrolment-modal-heading"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-light text-teal">
                  <UserPlus size={19} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                    Enrolment
                  </p>
                  <h3
                    id="enrolment-modal-heading"
                    className="mt-1 font-display text-xl font-bold text-navy"
                  >
                    Add a student to a cohort
                  </h3>
                  <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                    Select an existing group and a student from your
                    institution.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnrollingOpen(false)}
                className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-xl text-navy-muted transition hover:bg-mist hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                aria-label="Close enrolment dialog"
              >
                <X size={19} aria-hidden="true" />
              </button>
              {cohorts.isError || students.isError ? (
                <InlineRetry
                  message="Enrolment options are unavailable."
                  onRetry={() => {
                    void cohorts.refetch();
                    void students.refetch();
                  }}
                />
              ) : (
                <form className="mt-6 space-y-4" onSubmit={submitEnrolment}>
                  <label className="block font-body text-sm font-semibold text-navy">
                    Find a student
                    <input
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder="Search name, email, or registration number"
                      className="auth-control mt-2 w-full"
                    />
                  </label>
                  <SelectField label="Show students" value={cohortFilter} onChange={(value) => { setCohortFilter(value as "" | "assigned" | "unassigned"); setStudentPage(1); }}>
                    <option value="unassigned">Not in a cohort</option>
                    <option value="assigned">Already in a cohort</option>
                    <option value="">All students</option>
                  </SelectField>
                  <p className="-mt-2 font-body text-xs leading-5 text-navy-muted">
                    Students can join another planning group when its dates do not overlap their current cohort.
                  </p>
                  <SelectField
                    label="Cohort"
                    value={selectedCohort}
                    onChange={setSelectedCohort}
                    disabled={!cohorts.data?.length}
                  >
                    <option value="">Select a cohort</option>
                    {cohorts.data?.map((cohort) => (
                      <option key={cohort.id} value={cohort.id}>
                        {cohort.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Student"
                    value={selectedStudent}
                    onChange={setSelectedStudent}
                    disabled={!students.data?.pagination?.total_count}
                  >
                    <option value="">Select a student</option>
                    {students.data?.results.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} · {student.registration_number}{student.cohort_names?.length ? ` · ${student.cohort_names.join(", ")}` : " · Not assigned"}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={enrolling || !selectedCohort || !selectedStudent}
                  >
                    {enrolling ? "Adding…" : "Add student to cohort"}
                  </Button>
                  <div className="border-t border-border pt-4">
                    <p className="font-body text-sm font-semibold text-navy">Add several students</p>
                    <p className="mt-1 text-xs text-navy-muted">Select students shown on this page, then preview date overlaps before adding them.</p>
                    <select aria-label="Select students for bulk enrolment" multiple value={bulkStudentIds} onChange={(event) => { setBulkStudentIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value)); setBulkPreview(null); }} className="mt-3 min-h-32 w-full rounded-xl border border-border bg-white p-2 text-sm">
                      {filteredStudents.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.registration_number}</option>)}
                    </select>
                    {students.data?.pagination && <TablePagination page={students.data.pagination.page} totalPages={students.data.pagination.total_pages} totalCount={students.data.pagination.total_count} pageSize={20} onPage={(page) => { setStudentPage(page); setBulkPreview(null); }} />}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" disabled={!selectedCohort || !bulkStudentIds.length || bulkStudentIds.length > 100} onClick={async () => { try { setBulkPreview(await previewCohortEnrolment(selectedCohort, bulkStudentIds)); } catch (cause) { onError(cause instanceof ApiError ? cause.message : "We could not preview these enrolments."); } }}>Preview {bulkStudentIds.length || "selected"}</Button>
                      {bulkPreview && <Button type="button" size="sm" disabled={enrolling || bulkPreview.counts.overlap > 0 || bulkPreview.counts.unavailable > 0 || bulkPreview.counts.ready === 0} onClick={async () => { setEnrolling(true); try { await bulkEnrolCohort(selectedCohort, bulkStudentIds); await queryClient.invalidateQueries({ queryKey: ["institution-cohorts"] }); await queryClient.invalidateQueries({ queryKey: ["institution-students"] }); await queryClient.invalidateQueries({ queryKey: ["cohort-students"] }); setBulkStudentIds([]); setBulkPreview(null); pushToast({ kind: "success", title: "Students added", message: "Eligible students were enrolled." }); } catch (cause) { setBulkPreview(null); onError(cause instanceof ApiError ? cause.message : "The roster changed. Review a fresh preview."); } finally { setEnrolling(false); } }}>Confirm eligible students</Button>}
                    </div>
                    {bulkPreview && <div className="mt-3 rounded-xl bg-mist p-3 text-sm" role="status"><p className="font-semibold">{bulkPreview.counts.ready} ready · {bulkPreview.counts.already_enrolled} already enrolled · {bulkPreview.counts.overlap} date conflicts · {bulkPreview.counts.unavailable} unavailable</p>{bulkPreview.results.filter((row) => row.status === "overlap" || row.status === "unavailable").map((row) => <p key={row.student_id} className="mt-1 text-xs text-navy-muted">{row.name ?? row.student_id}: {row.status === "overlap" ? "dates overlap another cohort" : "student is unavailable"}</p>)}</div>}
                  </div>
                </form>
              )}
            </Card>
          </div>
        )}
      </div>
      {detailStudent && (
        <StudentDetail
          student={detailStudent}
          busy={resendingStudent}
          onResend={() => void resendStudentInvitation(detailStudent)}
          onClose={() => setDetailStudent(null)}
        />
      )}
      <section aria-labelledby="cohort-list-heading" className="border-t-2 border-navy pt-8">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
            Planning groups
          </p>
          <h3
            id="cohort-list-heading"
            className="mt-1 font-display text-2xl font-bold text-navy"
          >
            Your cohorts
          </h3>
          </div>
          <Button type="button" size="sm" onClick={() => setCreating((current) => !current)}><Plus size={16} className="mr-2" aria-hidden="true" />{creating ? "Close setup" : "New cohort"}</Button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          {cohorts.isPending ? (
            [1, 2, 3].map((item) => (
              <Skeleton key={item} className="m-4 h-16 rounded-xl" />
            ))
          ) : cohorts.isError ? (
            <div>
              <InlineRetry
                message="We could not load cohorts."
                onRetry={() => void cohorts.refetch()}
              />
            </div>
          ) : cohorts.data.length === 0 ? (
            <div>
              <EmptyState
                title="No cohorts created"
                detail="Create your first cohort to organise student enrolment."
              />
            </div>
          ) : (
            cohorts.data.map((cohort) => (
              <div
                key={cohort.id}
                role="button"
                tabIndex={0}
                onClick={() => { if (onOpenCohort) onOpenCohort(cohort.id); else setSelectedCohort(cohort.id); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (onOpenCohort) onOpenCohort(cohort.id); else setSelectedCohort(cohort.id); } }}
                className={`flex w-full items-center gap-4 border-b border-border px-5 py-4 text-left transition last:border-0 hover:bg-mist/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal ${selectedCohort === cohort.id ? "bg-teal-light/20" : ""}`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-teal">
                  <CalendarDays size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <h4 className="font-body text-sm font-bold text-navy">
                    {cohort.name}
                  </h4>
                  <p className="mt-1 font-body text-xs text-navy-muted">
                    {cohort.start_date} – {cohort.end_date}
                    {cohort.planned_capacity
                      ? ` · plan for ${cohort.planned_capacity}`
                      : ""}
                  </p>
                </span>
                <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-mist px-2.5 py-1 font-body text-xs font-semibold text-navy-muted">{cohort.member_count} enrolled</span>{onOpenCohort && <button type="button" onClick={(event) => { event.stopPropagation(); onOpenCohort(cohort.id); }} className="rounded-lg px-2 py-1 font-body text-xs font-semibold text-teal hover:bg-teal-light focus:outline-none focus-visible:ring-2 focus-visible:ring-teal">Open cohort</button>}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
function Summary({
  label,
  value,
  loading,
  unavailable,
}: {
  label: string;
  value?: number;
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : unavailable ? (
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-navy" aria-label={`${label} unavailable`}>
          —
        </p>
      ) : (
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-navy">
          {value ?? 0}
        </p>
      )}
    </div>
  );
}
function StudentRow({
  student,
  onOpen,
}: {
  student: InstitutionStudent;
  onOpen: () => void;
}) {
  return (
    <tr className="border-b border-border/80 transition-colors last:border-0 hover:bg-mist/25">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-light font-body text-sm font-bold text-teal">
            {student.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-body text-sm font-semibold text-navy">
              {student.name}
            </span>
            <span className="block truncate font-body text-xs text-navy-muted">
              {student.email}
            </span>
          </span>
        </div>
      </td>
      <td className="break-words px-4 py-4 font-body text-sm tabular-nums text-navy-muted">
        {student.registration_number || "—"}
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex rounded-full px-2.5 py-1 font-body text-xs font-semibold capitalize ${student.status === "active" ? "bg-teal-light/60 text-teal" : student.status === "invited" ? "bg-warning/10 text-warning" : "bg-mist text-navy-muted"}`}>
          {student.status.replaceAll("_", " ")}
        </span>
      </td>
      <td className="px-4 py-4 font-body text-sm text-navy-muted">
        {student.cohort_names?.length ? <span className="line-clamp-2">{student.cohort_names.join(", ")}</span> : <span className="text-navy-muted/75">Not assigned</span>}
      </td>
      <td className="px-4 py-4 text-right">
        <button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center justify-end gap-1 rounded-md px-1 font-body text-xs font-semibold text-teal transition hover:text-teal/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal">
          View <span className="sr-only">{student.name}</span><span aria-hidden="true">→</span>
        </button>
      </td>
    </tr>
  );
}
function StudentDetail({
  student,
  busy,
  onResend,
  onClose,
}: {
  student: InstitutionStudent;
  busy: boolean;
  onResend: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed left-0 top-0 z-[70] flex h-[100dvh] w-full items-center justify-center bg-navy/35 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        padding="lg"
        className="relative w-full max-w-lg rounded-2xl border-border bg-white shadow-[0_24px_70px_rgba(13,27,51,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-xl text-navy-muted transition hover:bg-mist hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          aria-label="Close student profile"
        >
          <X size={19} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-xl bg-teal-light font-body text-lg font-bold text-teal">
            {student.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Student profile
            </p>
            <h3
              id="student-detail-heading"
              className="mt-1 font-display text-2xl font-bold text-navy"
            >
              {student.name}
            </h3>
          </div>
        </div>
        <dl className="mt-7 grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
          <Detail label="Email" value={student.email} />
          <Detail
            label="Registration number"
            value={student.registration_number}
          />
          <Detail
            label="Account status"
            value={student.status.replaceAll("_", " ")}
          />
          <Detail label="Phone" value={student.phone || "Not provided"} />
        </dl>
        <p className="mt-7 rounded-xl bg-mist px-4 py-3 font-body text-sm leading-6 text-navy-muted">
          Placement progress and cohort membership are managed from their
          respective operational workspaces.
        </p>
        {student.status === "invited" && (
          <Button
            type="button"
            className="mt-5"
            size="sm"
            onClick={onResend}
            disabled={busy}
          >
            {busy ? "Resending…" : "Resend invitation"}
          </Button>
        )}
      </Card>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-xs font-bold uppercase tracking-[0.12em] text-navy-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-body text-sm font-semibold capitalize text-navy">
        {value}
      </dd>
    </div>
  );
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <Users size={22} className="mx-auto text-teal" aria-hidden="true" />
      <p className="mt-3 font-body text-sm font-semibold text-navy">{title}</p>
      <p className="mt-1 font-body text-sm text-navy-muted">{detail}</p>
    </div>
  );
}
function InlineRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-5"
    >
      <p className="font-body text-sm text-error">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-9 font-body text-sm font-bold text-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        Try again
      </button>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
}) {
  return (
    <label className="block font-body text-sm font-semibold text-navy">
      {label}
      <input
        type={type}
        value={value}
        min={min}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="auth-control mt-2"
      />
    </label>
  );
}
function SelectField({
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
        className="auth-control mt-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </label>
  );
}
