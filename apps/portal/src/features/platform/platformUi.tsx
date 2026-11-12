import { useState, type ReactNode } from "react";
import { Field, Modal, TextArea, TextInput } from "../../components/kit";
import { AdminButton, type PillTone } from "../programme-admin/ui/AdminKit";
import type { EnquiryKind, EnquiryPriority, EnquiryStatus, PersonInput, PlatformAccount } from "../../services/api";

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

// ---- Website messages (contact, pilot access, support)


export const KIND_LABEL: Record<EnquiryKind, string> = { contact: "Contact", pilot: "Pilot access", support: "Support" };
export const KIND_TONE: Record<EnquiryKind, PillTone> = { contact: "info", pilot: "teal", support: "warning" };
export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "New",
  in_progress: "In progress",
  waiting: "Waiting for sender",
  resolved: "Resolved",
  closed: "Closed",
  spam: "Spam",
};
export const ENQUIRY_STATUS_TONE: Record<EnquiryStatus, PillTone> = {
  new: "danger",
  in_progress: "info",
  waiting: "warning",
  resolved: "success",
  closed: "neutral",
  spam: "neutral",
};
export const PRIORITY_LABEL: Record<EnquiryPriority, string> = { low: "Low", normal: "Normal", high: "High" };
export const TOPIC_LABEL: Record<string, string> = {
  general: "General question",
  partnership: "Partnership",
  press: "Press",
  pilot: "Pilot access",
  sign_in: "Can’t sign in",
  account: "Account or invitation",
  using_platform: "Using MentorMAMA",
  report_problem: "Something not working",
  other: "Something else",
};

/** "just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
export function timeAgo(value: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} day${seconds >= 2 * 86400 ? "s" : ""} ago`;
  return formatDate(value);
}
