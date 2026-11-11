import { useState, type ReactNode } from "react";
import { Field, Modal, TextArea, TextInput } from "../../components/kit";
import { AdminButton, type PillTone } from "../programme-admin/ui/AdminKit";
import type { PersonInput, PlatformAccount } from "../../services/api";

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  return withTime
    ? date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function statusTone(status: PlatformAccount["status"]): PillTone {
  return status === "active" ? "success" : status === "invited" ? "info" : status === "suspended" ? "warning" : "neutral";
}

export const STATUS_LABEL: Record<PlatformAccount["status"], string> = {
  active: "Active",
  invited: "Invited",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

export function invitationLabel(account: PlatformAccount): string | null {
  if (account.status !== "invited") return null;
  if (account.invitation === "expired" || account.invitation === "not_sent") return "Invitation expired";
  return `Invited ${formatDate(account.invitation_sent_at)}`;
}

/** Ask for a short reason before an action that is recorded in the activity log. */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 5;
  return (
    <Modal
      open={open}
      onClose={() => {
        setReason("");
        onClose();
      }}
      dismissible={!busy}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <AdminButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton
            size="sm"
            className={danger ? "po-danger" : undefined}
            disabled={busy || tooShort}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Working…" : confirmLabel}
          </AdminButton>
        </>
      }
    >
      <Field label="Reason" hint="Recorded in the activity log. At least 5 characters." required>
        <TextArea rows={3} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Modal>
  );
}

export const EMPTY_PERSON: PersonInput = { email: "", first_name: "", last_name: "", phone: "" };

export function personProblem(person: PersonInput): string | null {
  if (!person.first_name.trim() || !person.last_name.trim()) return "Add a first and last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim())) return "Add a valid email address.";
  return null;
}

export function PersonFields({ value, onChange }: { value: PersonInput; onChange: (value: PersonInput) => void }) {
  return (
    <div className="pf-grid">
      <Field label="First name" required>
        <TextInput value={value.first_name} autoComplete="off" onChange={(event) => onChange({ ...value, first_name: event.target.value })} />
      </Field>
      <Field label="Last name" required>
        <TextInput value={value.last_name} autoComplete="off" onChange={(event) => onChange({ ...value, last_name: event.target.value })} />
      </Field>
      <Field label="Email address" required>
        <TextInput type="email" value={value.email} autoComplete="off" onChange={(event) => onChange({ ...value, email: event.target.value })} />
      </Field>
      <Field label="Phone" optional>
        <TextInput type="tel" value={value.phone ?? ""} autoComplete="off" onChange={(event) => onChange({ ...value, phone: event.target.value })} />
      </Field>
    </div>
  );
}
