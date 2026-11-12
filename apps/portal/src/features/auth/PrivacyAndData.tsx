import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { ApiError } from "../../services/api";
import {
  areaOptions,
  createDataRequest,
  getMyDataRequests,
  typeOptions,
  withdrawDataRequest,
  type DataRequest,
  type DataRequestArea,
  type DataRequestStatus,
  type DataRequestType,
} from "../../services/data-requests";
import { Field, SelectInput, TextArea } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { AdminButton, AdminCard, Notice, StatusPill, type PillTone } from "../programme-admin/ui/AdminKit";

export const requestStatusTone: Record<DataRequestStatus, PillTone> = {
  received: "info",
  in_review: "warning",
  completed: "success",
  declined: "danger",
  withdrawn: "neutral",
};

export const requestStatusLabel: Record<DataRequestStatus, string> = {
  received: "Received",
  in_review: "In review",
  completed: "Completed",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

/** The "Privacy and data" section of Account settings: ask for a correction, a copy, or account deletion. */
export function PrivacyAndData({ onError }: { onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [requests, setRequests] = useState<DataRequest[] | null>(null);
  const [responseDays, setResponseDays] = useState(30);
  const [loadFailed, setLoadFailed] = useState(false);
  const [type, setType] = useState<DataRequestType>("correction");
  const [area, setArea] = useState<DataRequestArea>("profile");
  const [description, setDescription] = useState("");
  const [change, setChange] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  async function load() {
    try {
      const result = await getMyDataRequests();
      setRequests(result.requests);
      setResponseDays(result.responseDays);
      setLoadFailed(false);
    } catch (cause) {
      setLoadFailed(true);
      onError(cause instanceof ApiError ? cause.message : "Your requests could not be loaded.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const needsChange = type === "correction";
  const hint = typeOptions.find((option) => option.value === type)?.hint;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setFormError(null);
    try {
      await createDataRequest({
        request_type: type,
        subject_area: area,
        description: description.trim(),
        requested_change: needsChange ? change.trim() : "",
        reason: reason.trim(),
      });
      setDescription("");
      setChange("");
      setReason("");
      pushToast({ kind: "success", title: "Request sent", message: "We will tell you when it moves on." });
      await load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "We could not send your request. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function withdraw(id: string) {
    setWithdrawing(id);
    try {
      await withdrawDataRequest(id);
      setConfirming(null);
      pushToast({ kind: "success", title: "Request withdrawn", message: "Nothing more will happen with it." });
      await load();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not withdraw that request.");
    } finally {
      setWithdrawing(null);
    }
  }

  return (
    <>
      <AdminCard
        title="Ask about your information"
        description={`Correct something, see what we hold about you, or ask for your account to be closed. A person in your programme team reads every request and aims to reply within ${responseDays} days.`}
        titleId="privacy-request-title"
        action={<span className="pa-tile pa-tile--sm pa-tile--teal" aria-hidden="true"><ShieldCheck /></span>}
      >
        <Notice icon={<ShieldAlert aria-hidden="true" />}>
          <strong>Do not type patient information.</strong> Describe what is wrong about <em>you</em>, not about anyone you
          cared for. No patient names, numbers or details.
        </Notice>
        <form className="acct-form mt-4" onSubmit={submit} aria-label="Data request">
          <Field label="What would you like?" hint={hint}>
            <SelectInput value={type} onChange={(event) => setType(event.target.value as DataRequestType)}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Which information is it about?">
            <SelectInput value={area} onChange={(event) => setArea(event.target.value as DataRequestArea)}>
              {areaOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label={needsChange ? "What is wrong?" : "Tell us a little more"}
            hint={`${description.length}/2000`}
            required
          >
            <TextArea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={10}
              maxLength={2000}
              required
              placeholder={needsChange ? "For example: my surname is spelled wrongly on my profile." : "Say what you would like us to do."}
            />
          </Field>
          {needsChange && (
            <Field label="What should it say?" required>
              <TextArea
                value={change}
                onChange={(event) => setChange(event.target.value)}
                maxLength={2000}
                required
                placeholder="The correct wording or details."
              />
            </Field>
          )}
          <Field label="Anything else we should know?" optional>
            <TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
          </Field>
          {formError && <p className="acct-message acct-message--error" role="alert">{formError}</p>}
          <div className="acct-form__actions">
            <AdminButton
              type="submit"
              disabled={sending || description.trim().length < 10 || (needsChange && !change.trim())}
              aria-busy={sending}
              icon={sending ? <Loader2 className="acct-spin" aria-hidden="true" /> : undefined}
            >
              {sending ? "Sending…" : "Send request"}
            </AdminButton>
          </div>
        </form>
      </AdminCard>

      <AdminCard title="Your requests" description="What you have asked for, and where it has got to." titleId="privacy-history-title">
        {requests === null ? (
          <p role="status">{loadFailed ? "Your requests could not be loaded." : "Loading your requests…"}</p>
        ) : requests.length === 0 ? (
          <p>You have not sent any requests.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Your data requests">
            {requests.map((item) => (
              <li key={item.id} className="rounded-xl border border-[#dfe7ea] p-4" data-testid="data-request">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{item.request_type_label}</p>
                  <StatusPill tone={requestStatusTone[item.status]}>{requestStatusLabel[item.status]}</StatusPill>
                </div>
                <p className="mt-1 text-sm text-[#5b6b73]">
                  {item.subject_area_label} · Sent {formatDate(item.created_at)}
                  {item.is_open && ` · We aim to reply by ${formatDate(item.due_at)}`}
                  {!item.is_open && item.closed_at && ` · Closed ${formatDate(item.closed_at)}`}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm">{item.description}</p>
                {item.requested_change && (
                  <p className="mt-1 whitespace-pre-line text-sm"><span className="font-medium">It should say: </span>{item.requested_change}</p>
                )}
                {item.response_note && (
                  <div className="mt-3 rounded-lg bg-[#f4f8f9] p-3 text-sm">
                    <p className="font-medium">
                      {item.reviewed_by ? `Reply from ${item.reviewed_by}` : "Reply"}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{item.response_note}</p>
                  </div>
                )}
                {item.routed_to === "platform" && item.is_open && (
                  <p className="mt-2 text-sm text-[#5b6b73]">
                    This is with the MentorMAMA platform team (reference {item.enquiry_reference || "pending"}). They reply by
                    email; answer that email to change or cancel it.
                  </p>
                )}
                {item.is_open && item.routed_to === "programme" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {confirming === item.id ? (
                      <>
                        <span className="text-sm">Withdraw this request?</span>
                        <AdminButton size="sm" variant="secondary" disabled={withdrawing === item.id} onClick={() => void withdraw(item.id)}>
                          {withdrawing === item.id ? "Withdrawing…" : "Yes, withdraw it"}
                        </AdminButton>
                        <AdminButton size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep it</AdminButton>
                      </>
                    ) : (
                      <AdminButton size="sm" variant="secondary" onClick={() => setConfirming(item.id)}>Withdraw request</AdminButton>
                    )}
                  </div>
                )}
                {item.status === "completed" && (
                  <p className="mt-2 flex items-center gap-1 text-sm text-[#2d6b4d]"><CheckCircle2 className="size-4" aria-hidden="true" /> Done</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
