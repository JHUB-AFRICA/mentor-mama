import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  getFacilities,
  getInstitutions,
  inviteTeamMember,
} from "../../services/api";
import { Field, FieldRow, Modal, SelectInput, TextInput } from "../../components/kit";
import { AdminButton } from "./ui/AdminKit";

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

const roleHints: Record<InviteRole, string> = {
  coordinator: "Manages students and placements for one institution.",
  nurse_manager: "Oversees mentors and student placements at one facility.",
  mentor: "Supervises and assesses students on the ward.",
  student: "Completes the programme and logs clinical learning.",
  program_admin: "Full access to every institution, facility and report.",
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

  const scopeId = institutionRole ? form.institution_id : form.facility_id;
  const scopeBlocked = !scopeLoading && (scopeError || scopeItems.length === 0);
  const scopeProblem = scopeError
    ? `We could not load the available ${scopeLabel.toLowerCase()}s.`
    : scopeBlocked
      ? `Add a ${scopeLabel.toLowerCase()} in Programme Settings → Directory before sending this invitation.`
      : undefined;

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      dismissible={!submitting}
      size="md"
      closeLabel="Close invitation"
      icon={<Mail />}
      title="Invite a team member"
      description="Choose their role and where they’ll work. Their account stays pending until they accept the secure invitation."
      footer={
        <>
          <AdminButton type="button" variant="secondary" size="sm" onClick={closeDialog} disabled={submitting}>
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            form="invite-member-form"
            variant="primary"
            size="sm"
            disabled={submitting || scopeLoading || scopeError || (!programmeWideRole && scopeItems.length === 0)}
          >
            {submitting ? "Queueing invitation…" : "Send invitation"}
          </AdminButton>
        </>
      }
    >
      <form id="invite-member-form" className="space-y-4" onSubmit={submit}>
        <FieldRow>
          <Field label="First name" required>
            <TextInput value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="Last name" required>
            <TextInput value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required autoComplete="off" />
          </Field>
        </FieldRow>
        <Field label="Work email" required>
          <TextInput type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required autoComplete="off" />
        </Field>
        <Field id="invite-role" label="Role" hint={roleHints[form.role]}>
          <SelectInput value={form.role} onChange={(e) => updateRole(e.target.value as InviteRole)}>
            <option value="coordinator">University Coordinator</option>
            <option value="nurse_manager">Nurse Manager</option>
            <option value="mentor">Clinical Mentor</option>
            <option value="student">Student</option>
            <option value="program_admin">Programme Admin</option>
          </SelectInput>
        </Field>
        {!programmeWideRole && (
          <Field
            id="invite-scope"
            label={scopeLabel}
            required
            error={scopeProblem}
            hint={
              scopeLoading ? (
                <Skeleton className="mt-1 h-3 w-56" />
              ) : (
                scopeDescription
              )
            }
          >
            <SelectInput
              required
              value={scopeId}
              onChange={(e) => update(institutionRole ? "institution_id" : "facility_id", e.target.value)}
              disabled={scopeLoading || scopeError || scopeItems.length === 0}
            >
              <option value="">Select a {scopeLabel.toLowerCase()}</option>
              {scopeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}
        {form.role === "student" && (
          <Field label="Student registration number" required>
            <TextInput
              value={form.registration_number}
              onChange={(e) => update("registration_number", e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
        )}
        <Field label="Phone" optional>
          <TextInput type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="off" />
        </Field>
      </form>
    </Modal>
  );
}
