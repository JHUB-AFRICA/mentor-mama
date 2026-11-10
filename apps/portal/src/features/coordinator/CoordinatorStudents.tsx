import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Mail, Pause, UserPlus, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { DetailList, Drawer, Field, Modal, SelectInput } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  ApiError,
  bulkEnrolCohort,
  getCohorts,
  getInstitutionStudents,
  previewCohortEnrolment,
  resendInvitation,
  updateAccountStatus,
  type InstitutionStudent,
} from "../../services/api";
import {
  AdminButton,
  AdminPage,
  AdminPageHeader,
  AdminTabs,
  EmptyState,
  SearchField,
  SelectField,
  StatCard,
  StatGrid,
  StatusPill,
  Toolbar,
  type PillTone,
} from "../programme-admin/ui/AdminKit";
import { ServerPager } from "../programme-admin/ui/DataTable";
import { ActionMenu } from "../content/ActionMenu";

type StatusTab = "" | "active" | "invited" | "suspended" | "deactivated";
const TABS: Array<{ value: StatusTab; label: string }> = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
  { value: "deactivated", label: "Deactivated" },
];
const tone = (status: string): PillTone => (status === "active" ? "success" : status === "invited" ? "info" : status === "suspended" ? "warning" : "neutral");
const cap = (value: string) => value.replace(/^\w/, (c) => c.toUpperCase());

/** The institution's student register: find people, see who is in a cohort, add them to one. */
export function CoordinatorStudents({ onInvite, onError }: { onInvite: () => void; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [status, setStatus] = useState<StatusTab>("");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [params] = useSearchParams();
  const initialCohortStatus = params.get("cohort_status");
  const [cohortStatus, setCohortStatus] = useState<"" | "assigned" | "unassigned">(
    initialCohortStatus === "assigned" || initialCohortStatus === "unassigned" ? initialCohortStatus : "",
  );
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<InstitutionStudent | null>(null);
  const [enrolIds, setEnrolIds] = useState<string[] | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<InstitutionStudent | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(text.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const list = useQuery({
    queryKey: ["coordinator-students", page, search, status, cohortStatus],
    queryFn: () => getInstitutionStudents({ page, page_size: 15, search, status, cohort_status: cohortStatus || undefined }),
    placeholderData: (previous) => previous,
  });
  const all = useQuery({ queryKey: ["coordinator-students-count", "all"], queryFn: () => getInstitutionStudents({ page_size: 1 }), staleTime: 30_000 });
  const invited = useQuery({ queryKey: ["coordinator-students-count", "invited"], queryFn: () => getInstitutionStudents({ page_size: 1, status: "invited" }), staleTime: 30_000 });
  const unassigned = useQuery({ queryKey: ["coordinator-students-count", "unassigned"], queryFn: () => getInstitutionStudents({ page_size: 1, cohort_status: "unassigned" }), staleTime: 30_000 });

  const rows = list.data?.results ?? [];
  const pageIds = rows.map((row) => row.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["coordinator-students"] });
    void queryClient.invalidateQueries({ queryKey: ["coordinator-students-count"] });
    void queryClient.invalidateQueries({ queryKey: ["institution-students"] });
    void queryClient.invalidateQueries({ queryKey: ["institution-cohorts"] });
  };

  const resend = useMutation({
    mutationFn: (student: InstitutionStudent) => resendInvitation(student.id),
    onSuccess: (_result, student) => pushToast({ kind: "success", title: "Invitation resent", message: `A fresh invitation was queued for ${student.email}.` }),
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not resend this invitation."),
  });
  const suspend = useMutation({
    mutationFn: (student: InstitutionStudent) => updateAccountStatus(student.id, "suspended", "Coordinator initiated student access review"),
    onSuccess: (_result, student) => {
      pushToast({ kind: "success", title: "Access suspended", message: `${student.name} can no longer sign in.` });
      setConfirmSuspend(null);
      setDetail(null);
      refresh();
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not suspend this student."),
  });

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="People"
        title="Students"
        description="Everyone from your institution on MentorMAMA. Add students to a cohort so they can be placed."
        actions={
          <AdminButton size="sm" icon={<UserPlus />} onClick={onInvite}>
            Invite students
          </AdminButton>
        }
      />
      <StatGrid columns={3}>
        <StatCard icon={<Users />} tone="teal" value={all.data?.pagination.total_count ?? 0} label="Students" loading={all.isPending} />
        <StatCard icon={<Mail />} tone="blue" value={invited.data?.pagination.total_count ?? 0} label="Invitation pending" hint="Not yet signed in" loading={invited.isPending} onClick={() => { setStatus("invited"); setPage(1); }} />
        <StatCard icon={<GraduationCap />} tone="amber" value={unassigned.data?.pagination.total_count ?? 0} label="Not in a cohort" hint="Cannot be placed yet" loading={unassigned.isPending} onClick={() => { setCohortStatus("unassigned"); setPage(1); }} />
      </StatGrid>

      <AdminTabs label="Student status" tabs={TABS} value={status} onChange={(value) => { setStatus(value); setPage(1); setSelected([]); }} />
      <Toolbar filters={2}>
        <SearchField label="Search students" placeholder="Search name, email or registration number" value={text} onChange={setText} />
        <SelectField
          label="Cohort membership"
          value={cohortStatus}
          onChange={(value) => { setCohortStatus(value as typeof cohortStatus); setPage(1); }}
          options={[{ value: "", label: "Any cohort status" }, { value: "assigned", label: "In a cohort" }, { value: "unassigned", label: "Not in a cohort" }]}
        />
      </Toolbar>

      {selected.length > 0 && (
        <div className="pa-selection" role="status">
          <span>{selected.length} selected</span>
          <AdminButton size="sm" icon={<GraduationCap />} onClick={() => setEnrolIds(selected)}>
            Add to cohort
          </AdminButton>
          <AdminButton size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </AdminButton>
        </div>
      )}

      {list.isPending ? (
        <Skeleton className="h-72" />
      ) : list.isError ? (
        <PortalErrorState onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={search || status || cohortStatus ? "No students match" : "No students yet"}
          text={search || status || cohortStatus ? "Try another search or clear the filters." : "Invite students from a roster or one at a time."}
          action={<AdminButton size="sm" icon={<UserPlus />} onClick={onInvite}>Invite students</AdminButton>}
        />
      ) : (
        <div className="pa-table-wrap" aria-busy={list.isFetching}>
          <div className="pa-table-scroll">
            <table className="pa-table">
              <caption className="sr-only">Institution students</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "2.5rem" }}>
                    <input type="checkbox" className="pa-check" aria-label="Select all students on this page" checked={allOnPage} onChange={() => setSelected(allOnPage ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])])} />
                  </th>
                  <th scope="col">Student</th>
                  <th scope="col">Registration</th>
                  <th scope="col">Cohorts</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.id} className="is-clickable" onClick={() => setDetail(student)}>
                    <td onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" className="pa-check" aria-label={`Select ${student.name}`} checked={selected.includes(student.id)} onChange={() => setSelected(selected.includes(student.id) ? selected.filter((id) => id !== student.id) : [...selected, student.id])} />
                    </td>
                    <td>
                      <div className="pa-cell-title">
                        <span>
                          <strong>{student.name}</strong>
                          <small>{student.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>{student.registration_number || <span className="pa-muted">—</span>}</td>
                    <td>{student.cohort_names?.length ? student.cohort_names.join(", ") : <span className="pa-muted">Not in a cohort</span>}</td>
                    <td><StatusPill tone={tone(student.status)}>{cap(student.status)}</StatusPill></td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <span className="pa-actions">
                        <ActionMenu
                          label={`Actions for ${student.name}`}
                          items={[
                            { key: "view", label: "View details", icon: <Users size={15} />, onSelect: () => setDetail(student) },
                            { key: "cohort", label: "Add to cohort", icon: <GraduationCap size={15} />, onSelect: () => setEnrolIds([student.id]) },
                            ...(student.status === "invited" ? [{ key: "resend", label: "Resend invitation", icon: <Mail size={15} />, onSelect: () => resend.mutate(student) }] : []),
                            ...(student.status === "active" ? [{ key: "suspend", label: "Suspend access", icon: <Pause size={15} />, danger: true, onSelect: () => setConfirmSuspend(student) }] : []),
                          ]}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data && <ServerPager pagination={list.data.pagination} onPage={setPage} noun="students" />}
        </div>
      )}

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        icon={<Users />}
        title={detail?.name ?? ""}
        description={detail?.email}
        footer={
          detail && (
            <>
              {detail.status === "invited" && (
                <AdminButton variant="secondary" size="sm" icon={<Mail />} disabled={resend.isPending} onClick={() => resend.mutate(detail)}>
                  Resend invitation
                </AdminButton>
              )}
              <AdminButton size="sm" icon={<GraduationCap />} onClick={() => { setEnrolIds([detail.id]); setDetail(null); }}>
                Add to cohort
              </AdminButton>
            </>
          )
        }
      >
        {detail && (
          <DetailList
            items={[
              { label: "Status", value: <StatusPill tone={tone(detail.status)}>{cap(detail.status)}</StatusPill> },
              { label: "Registration number", value: detail.registration_number || "—" },
              { label: "Phone", value: detail.phone || "—" },
              { label: "Cohorts", value: detail.cohort_names?.length ? detail.cohort_names.join(", ") : "Not in a cohort" },
            ]}
          />
        )}
      </Drawer>

      <EnrolModal
        ids={enrolIds}
        names={Object.fromEntries(rows.map((row) => [row.id, row.name]))}
        onClose={() => setEnrolIds(null)}
        onDone={() => { setEnrolIds(null); setSelected([]); refresh(); }}
        onError={onError}
      />

      <Modal
        open={Boolean(confirmSuspend)}
        onClose={() => setConfirmSuspend(null)}
        dismissible={!suspend.isPending}
        size="sm"
        icon={<Pause />}
        title="Suspend this student’s access?"
        description={confirmSuspend ? `${confirmSuspend.name} will not be able to sign in until access is restored by the programme team.` : undefined}
        footer={
          <>
            <AdminButton variant="secondary" size="sm" onClick={() => setConfirmSuspend(null)} disabled={suspend.isPending}>Cancel</AdminButton>
            <AdminButton variant="secondary" size="sm" className="po-danger" disabled={suspend.isPending} onClick={() => confirmSuspend && suspend.mutate(confirmSuspend)}>
              {suspend.isPending ? "Suspending…" : "Suspend access"}
            </AdminButton>
          </>
        }
      >
        <></>
      </Modal>
    </AdminPage>
  );
}

const RESULT_LABEL: Record<string, { text: string; tone: PillTone }> = {
  ready: { text: "Ready", tone: "success" },
  already_enrolled: { text: "Already enrolled", tone: "neutral" },
  overlap: { text: "Overlapping cohort", tone: "danger" },
  unavailable: { text: "Unavailable", tone: "danger" },
};

function EnrolModal({
  ids,
  names,
  onClose,
  onDone,
  onError,
}: {
  ids: string[] | null;
  names: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const { pushToast } = useToast();
  const [cohortId, setCohortId] = useState("");
  const cohorts = useQuery({ queryKey: ["institution-cohorts"], queryFn: getCohorts, enabled: Boolean(ids), staleTime: 30_000 });
  const options = useMemo(() => (cohorts.data ?? []).filter((cohort) => !cohort.archived_at), [cohorts.data]);
  const preview = useQuery({
    queryKey: ["enrol-preview", cohortId, ids],
    queryFn: () => previewCohortEnrolment(cohortId, ids as string[]),
    enabled: Boolean(ids && cohortId),
  });
  const enrol = useMutation({
    mutationFn: () => bulkEnrolCohort(cohortId, (preview.data?.results ?? []).filter((row) => row.status === "ready").map((row) => row.student_id)),
    onSuccess: (result) => {
      pushToast({ kind: "success", title: "Students added", message: `${result.enrolled_student_ids.length} added to the cohort.` });
      setCohortId("");
      onDone();
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not add these students."),
  });
  const ready = preview.data?.counts.ready ?? 0;
  return (
    <Modal
      open={Boolean(ids)}
      onClose={() => { setCohortId(""); onClose(); }}
      dismissible={!enrol.isPending}
      icon={<GraduationCap />}
      title="Add to a cohort"
      description={ids ? `${ids.length} ${ids.length === 1 ? "student" : "students"} selected.` : undefined}
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={() => { setCohortId(""); onClose(); }} disabled={enrol.isPending}>Cancel</AdminButton>
          <AdminButton size="sm" disabled={!cohortId || ready === 0 || enrol.isPending} onClick={() => enrol.mutate()}>
            {enrol.isPending ? "Adding…" : ready ? `Add ${ready} ${ready === 1 ? "student" : "students"}` : "Add students"}
          </AdminButton>
        </>
      }
    >
      <Field label="Cohort" required hint="Cohort dates must not overlap another cohort the student is already in.">
        <SelectInput value={cohortId} onChange={(event) => setCohortId(event.target.value)}>
          <option value="">{cohorts.isPending ? "Loading cohorts…" : options.length ? "Choose a cohort" : "No cohorts yet. Create one first."}</option>
          {options.map((cohort) => (
            <option key={cohort.id} value={cohort.id}>{cohort.name} · {cohort.start_date} → {cohort.end_date}</option>
          ))}
        </SelectInput>
      </Field>
      {cohortId && preview.isPending && <p className="pa-sub">Checking the selection…</p>}
      {preview.isError && <p className="pa-sub" role="alert">We could not check this selection. Try again.</p>}
      {preview.data && (
        <ul className="pa-result-list" aria-label="Enrolment check">
          {preview.data.results.map((row) => (
            <li key={row.student_id}>
              <span>{row.name ?? names[row.student_id] ?? "Student"}</span>
              <StatusPill tone={RESULT_LABEL[row.status]?.tone ?? "neutral"}>{RESULT_LABEL[row.status]?.text ?? row.status}</StatusPill>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
