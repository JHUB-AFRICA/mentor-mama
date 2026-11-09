import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  getFacilities,
  getInstitutions,
  inviteTeamMember,
} from "../../services/api";
import { useAccessibleDialog } from "./useAccessibleDialog";

type InviteForm = {
  first_name: string;
  last_name: string;
  email: string;
  role: "coordinator" | "nurse_manager" | "mentor" | "student" | "program_admin";
  phone: string;
  registration_number: string;
  institution_id: string;
  facility_id: string;
};

type InviteRole = InviteForm["role"];
type Props = {
  open: boolean;
  initialRole?: InviteRole | null;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: (details: { roleLabel: string; scopeName: string }) => void;
};

const initialForm: InviteForm = {
  first_name: "",
  last_name: "",
  email: "",
  role: "coordinator",
  phone: "",
  registration_number: "",
  institution_id: "",
  facility_id: "",
};

export function InviteMemberModal({
  open,
  initialRole,
  onClose,
  onError,
  onSuccess,
}: Props) {
  const institutions = useQuery({
    queryKey: ["programme-institutions"],
    queryFn: getInstitutions,
    enabled: open,
  });
  const facilities = useQuery({
    queryKey: ["programme-facilities"],
    queryFn: getFacilities,
    enabled: open,
  });
  const [form, setForm] = useState<InviteForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  function closeDialog() {
    if (!submitting) onClose();
  }
  const dialogRef = useAccessibleDialog<HTMLElement>(closeDialog, open);
  useEffect(() => {
    if (!open) return;
    setForm({ ...initialForm, role: initialRole ?? "coordinator" });
  }, [open, initialRole]);
  const institutionRole =
    form.role === "coordinator" || form.role === "student";
  const programmeWideRole = form.role === "program_admin";
  const scopeItems = (
    programmeWideRole ? [] : institutionRole ? (institutions.data ?? []) : (facilities.data ?? [])
  ).filter(
    (item) =>
      !item.archived_at &&
      (!institutionRole ||
        (item as { is_active?: boolean }).is_active !== false),
  );
  const scopeLoading = programmeWideRole ? false : institutionRole
    ? institutions.isPending
    : facilities.isPending;
  const scopeError = programmeWideRole ? false : institutionRole
    ? institutions.isError
    : facilities.isError;
  const scopeLabel = programmeWideRole ? "Programme-wide" : institutionRole ? "Institution" : "Facility";
  const scopeDescription = programmeWideRole ? "Programme-wide access for a Programme Admin." : institutionRole
    ? "The university or training institution this person belongs to."
    : "The hospital or maternity unit where this person operates.";

  function update(field: keyof InviteForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateRole(value: InviteForm["role"]) {
    setForm((current) => ({
      ...current,
      role: value,
      institution_id: "",
      facility_id: "",
    }));
  }

  useEffect(() => {
    if (!open) return;
    if (institutionRole) {
      const activeInstitutions = (institutions.data ?? []).filter(
        (item) => !item.archived_at && item.is_active !== false,
      );
      if (activeInstitutions.length === 1 && !form.institution_id) {
        setForm((current) =>
          current.institution_id
            ? current
            : { ...current, institution_id: activeInstitutions[0].id },
        );
      }
    } else {
      const activeFacilities = (facilities.data ?? []).filter(
        (item) => !item.archived_at,
      );
      if (activeFacilities.length === 1 && !form.facility_id) {
        setForm((current) =>
          current.facility_id
            ? current
            : { ...current, facility_id: activeFacilities[0].id },
        );
      }
    }
  }, [
    open,
    institutionRole,
    institutions.data,
    facilities.data,
    form.institution_id,
    form.facility_id,
  ]);

  if (!open) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await inviteTeamMember({
        ...form,
        institution_id: institutionRole ? form.institution_id : undefined,
        facility_id: institutionRole || programmeWideRole ? undefined : form.facility_id,
      });
      const scopeName =
        scopeItems.find(
          (item) =>
            item.id ===
            (institutionRole ? form.institution_id : form.facility_id),
        )?.name ?? scopeLabel.toLowerCase();
      const roleLabel =
        form.role === "coordinator"
          ? "Coordinator"
          : form.role === "nurse_manager"
            ? "Nurse Manager"
          : form.role === "program_admin" ? "Programme Admin"
          : form.role === "mentor"
              ? "Clinical Mentor"
              : "Student";
      onSuccess({ roleLabel, scopeName });
      onClose();
      setForm(initialForm);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not send the invitation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-member-title"
        className="max-h-[calc(100vh-1rem)] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl focus:outline-none sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-light text-teal">
              <Mail size={19} />
            </span>
            <h2
              id="invite-member-title"
              className="mt-4 font-display text-2xl font-bold text-navy"
            >
              Invite a team member
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
              Choose their programme role and the institution or facility
              they’ll work in. Their account stays pending until they accept the
              secure invitation.
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            className="rounded-full p-2 text-navy-muted hover:bg-mist"
            aria-label="Close invitation"
          >
            <X size={19} />
          </button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              value={form.first_name}
              onChange={(value) => update("first_name", value)}
              required
            />
            <Field
              label="Last name"
              value={form.last_name}
              onChange={(value) => update("last_name", value)}
              required
            />
          </div>
          <Field
            label="Work email"
            type="email"
            value={form.email}
            onChange={(value) => update("email", value)}
            required
          />
          <div>
            <label
              htmlFor="invite-role"
              className="font-body text-sm font-semibold text-navy"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={form.role}
              onChange={(event) =>
                updateRole(event.target.value as InviteForm["role"])
              }
              className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-4 font-body text-sm text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            >
              <option value="coordinator">University Coordinator</option>
              <option value="nurse_manager">Nurse Manager</option>
              <option value="mentor">Clinical Mentor</option>
              <option value="student">Student</option>
              <option value="program_admin">Programme Admin</option>
            </select>
          </div>
          {!programmeWideRole && <div>
            <label
              htmlFor="invite-scope"
              className="font-body text-sm font-semibold text-navy"
            >
              {scopeLabel}
            </label>
            <select
              id="invite-scope"
              required
              value={institutionRole ? form.institution_id : form.facility_id}
              onChange={(event) =>
                update(
                  institutionRole ? "institution_id" : "facility_id",
                  event.target.value,
                )
              }
              disabled={scopeLoading || scopeError || scopeItems.length === 0}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-4 font-body text-sm text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:cursor-not-allowed disabled:bg-mist"
            >
              <option value="">Select a {scopeLabel.toLowerCase()}</option>
              {scopeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <p className="mt-2 font-body text-xs leading-5 text-navy-muted">
              {scopeDescription}
            </p>
            {scopeLoading && (
              <div className="mt-2">
                <Skeleton className="h-3 w-56" />
              </div>
            )}
            {scopeError && (
              <p className="mt-2 font-body text-xs text-error">
                We could not load the available {scopeLabel.toLowerCase()}s.
              </p>
            )}
            {!scopeLoading && !scopeError && scopeItems.length === 0 && (
              <p className="mt-2 font-body text-xs text-error">
                Add a {scopeLabel.toLowerCase()} in Programme Settings →
                Directory before sending this invitation.
              </p>
            )}
          </div>}
          {form.role === "student" && (
            <Field
              label="Student registration number"
              value={form.registration_number}
              onChange={(value) => update("registration_number", value)}
              required
            />
          )}
          <Field
            label="Phone (optional)"
            type="tel"
            value={form.phone}
            onChange={(value) => update("phone", value)}
          />
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="tertiary" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                scopeLoading ||
                scopeError ||
                (!programmeWideRole && scopeItems.length === 0)
              }
            >
              {submitting ? "Queueing invitation…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block font-body text-sm font-semibold text-navy">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-4 font-body text-sm font-normal text-navy outline-none placeholder:text-navy-muted/55 focus:border-teal focus:ring-2 focus:ring-teal/20"
      />
    </label>
  );
}
