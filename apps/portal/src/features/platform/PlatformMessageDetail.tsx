import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Flag,
  Inbox,
  BookmarkPlus,
  CornerDownLeft,
  Trash2,
  Mail,
  MailCheck,
  MailWarning,
  NotebookPen,
  PlayCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  StickyNote,
  UserCheck,
  XCircle,
} from "lucide-react";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { DetailList, Field, Modal, SelectInput, TextArea, TextInput } from "../../components/kit";
import {
  ApiError,
  addPlatformEnquiryNote,
  deleteSavedReply,
  getSavedReplies,
  saveSavedReply,
  assignPlatformEnquiry,
  convertPlatformEnquiry,
  getPlatformEnquiry,
  replyToPlatformEnquiry,
  resendPlatformEnquiryEmail,
  setPlatformEnquiryPriority,
  setPlatformEnquiryStatus,
  type EnquiryDetail,
  type EnquiryEmail,
  type EnquiryPriority,
  type EnquiryStatus,
  type EnquiryTimelineEntry,
  type PersonInput,
} from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminTabs, EmptyState, Notice, StatusPill } from "../programme-admin/ui/AdminKit";
import { MessageDetailSkeleton } from "./PlatformSkeletons";
import { ENQUIRY_STATUS_LABEL, ENQUIRY_STATUS_TONE, KIND_LABEL, KIND_TONE, PRIORITY_LABEL, TOPIC_LABEL, formatDate, timeAgo } from "./platformUi";

const ORGANISATION_TYPE: Record<string, string> = {
  training_institution: "Training institution",
  health_facility: "Health facility",
  county_or_ministry: "County or ministry",
  ngo: "NGO or partner",
  other: "Other",
};

/** Plain-language promise shown next to a status change: what the sender will be told. */
const SENDER_COPY: Partial<Record<EnquiryStatus, string>> = {
  in_progress: "Tell them we are looking into it",
  resolved: "Tell them it is resolved",
  closed: "Tell them it is closed",
};

type StatusAction = { status: EnquiryStatus; title: string; confirm: string; description: string; danger?: boolean };

export function PlatformMessageDetail({ id, onError }: { id: string; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const go = useNavigate();
  const [composer, setComposer] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [converting, setConverting] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [replyTitle, setReplyTitle] = useState("");

  const key = ["platform-enquiry", id];
  const query = useQuery({ queryKey: key, queryFn: () => getPlatformEnquiry(id), refetchInterval: 30_000 });

  const update = (data: EnquiryDetail) => {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: ["platform-enquiries"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
  };
  const fail = (fallback: string) => (cause: unknown) => onError(cause instanceof ApiError ? cause.message : fallback);

  const savedReplies = useQuery({ queryKey: ["platform-saved-replies"], queryFn: getSavedReplies, staleTime: 5 * 60_000 });
  const saveReply = useMutation({
    mutationFn: () => saveSavedReply(replyTitle.trim(), text.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-saved-replies"] });
      pushToast({ kind: "success", title: "Saved reply added", message: "Insert it from “Saved replies” on any message." });
      setSavingReply(false);
      setReplyTitle("");
    },
    onError: fail("We could not save this reply."),
  });
  const removeReply = useMutation({
    mutationFn: (replyId: string) => deleteSavedReply(replyId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["platform-saved-replies"] }),
    onError: fail("We could not delete this saved reply."),
  });

  const send = useMutation({
    mutationFn: () => (composer === "reply" ? replyToPlatformEnquiry(id, text.trim()) : addPlatformEnquiryNote(id, text.trim())),
    onSuccess: (data) => {
      update(data);
      pushToast(
        composer === "reply"
          ? { kind: "success", title: "Reply on its way", message: `${data.name} will receive it by email in a moment.` }
          : { kind: "success", title: "Note added", message: "Only platform administrators can see it." },
      );
      setText("");
    },
    onError: fail("We could not save this. What you wrote is still here."),
  });
  const assign = useMutation({
    mutationFn: (userId: string | null) => assignPlatformEnquiry(id, userId),
    onSuccess: update,
    onError: fail("We could not change the owner."),
  });
  const priority = useMutation({
    mutationFn: (value: EnquiryPriority) => setPlatformEnquiryPriority(id, value),
    onSuccess: update,
    onError: fail("We could not change the priority."),
  });
  const status = useMutation({
    mutationFn: ({ target, note, notify }: { target: EnquiryStatus; note: string; notify: boolean }) => setPlatformEnquiryStatus(id, target, note, notify),
    onSuccess: (data, { notify }) => {
      update(data);
      setStatusAction(null);
      pushToast({
        kind: "success",
        title: `Marked ${ENQUIRY_STATUS_LABEL[data.status].toLowerCase()}`,
        message: notify && SENDER_COPY[data.status] ? `${data.name} was emailed an update.` : "No email was sent.",
      });
    },
    onError: fail("We could not change the status."),
  });
  const resend = useMutation({
    mutationFn: (eventId: string) => resendPlatformEnquiryEmail(id, eventId),
    onSuccess: (data) => {
      update(data);
      pushToast({ kind: "success", title: "Email queued", message: "We are sending it again now." });
    },
    onError: fail("We could not resend that email."),
  });

  if (query.isPending) return <MessageDetailSkeleton />;
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return missing ? (
      <AdminPage>
        <BackLink />
        <EmptyState icon={<Inbox />} title="This message no longer exists" action={<AdminButton onClick={() => go("/platform/messages")}>Back to messages</AdminButton>} />
      </AdminPage>
    ) : (
      <PortalErrorState onRetry={() => void query.refetch()} />
    );
  }

  const item = query.data;
  const open = ["new", "in_progress", "waiting"].includes(item.status);
  const closedLike = ["resolved", "closed"].includes(item.status);
  const actions = statusActions(item);
  const detailRows = pilotRows(item);
  const trouble = item.timeline.filter((entry) => entry.email?.status === "failed").length + (item.team_alert === "failed" ? 1 : 0);

  return (
    <AdminPage>
      <BackLink />
      <header className="pf-detail-head">
        <div className="pf-detail-head__copy">
          <p className="pa-eyebrow">
            {item.reference} · {KIND_LABEL[item.kind]}
            {TOPIC_LABEL[item.topic] && item.kind !== "pilot" ? ` · ${TOPIC_LABEL[item.topic]}` : ""}
          </p>
          <h2 className="pa-title">{item.subject || `${KIND_LABEL[item.kind]} from ${item.name}`}</h2>
          <div className="pf-line">
            <StatusPill tone={ENQUIRY_STATUS_TONE[item.status]}>{ENQUIRY_STATUS_LABEL[item.status]}</StatusPill>
            <StatusPill tone={KIND_TONE[item.kind]} dot={false}>{KIND_LABEL[item.kind]}</StatusPill>
            {item.priority !== "normal" && <StatusPill tone={item.priority === "high" ? "danger" : "neutral"} dot={false}>{PRIORITY_LABEL[item.priority]} priority</StatusPill>}
            <small className="pf-muted">Received {timeAgo(item.created_at)}</small>
          </div>
        </div>
        <div className="pf-actions pf-actions--start">
          {actions.map((action) => (
            <AdminButton
              key={action.status}
              variant={action.primary ? "primary" : "secondary"}
              size="sm"
              icon={action.icon}
              className={action.danger ? "pf-btn-quiet" : undefined}
              onClick={() => setStatusAction(action)}
            >
              {action.label}
            </AdminButton>
          ))}
        </div>
      </header>

      {item.overdue && (
        <Notice icon={<Clock />}>
          This message has waited over 2 working days without a reply. The sender was told to expect one within 2 working days.
        </Notice>
      )}
      {trouble > 0 && (
        <Notice icon={<MailWarning />}>
          {trouble === 1 ? "An email" : `${trouble} emails`} could not be delivered. Use “Send again” in the activity below; the message itself is safe.
        </Notice>
      )}
      {item.status === "spam" && <Notice icon={<ShieldAlert />}>Marked as spam. The sender is never emailed about spam. Use “Not spam” to restore it.</Notice>}

      <div className="pf-columns pf-columns--detail">
        <div className="pf-stack">
          <AdminCard title="Message" description={`${item.name} wrote${item.organisation ? ` from ${item.organisation}` : ""}.`}>
            <p className="pf-message">{item.message}</p>
            {detailRows.length > 0 && (
              <div className="pf-detail-block">
                <h4 className="pf-subhead">Pilot details</h4>
                <DetailList items={detailRows} />
              </div>
            )}
          </AdminCard>

          {item.status !== "spam" && (
            <AdminCard
              title="Respond"
              description={composer === "reply" ? `Emails ${item.name} at ${item.email}. Their original message is quoted below your reply.` : "Only platform administrators can see notes. They are never emailed."}
            >
              <AdminTabs
                label="How to respond"
                value={composer}
                onChange={(value) => setComposer(value)}
                tabs={[
                  { value: "reply", label: "Reply to sender", icon: <Send /> },
                  { value: "note", label: "Internal note", icon: <StickyNote /> },
                ]}
              />
              <form
                className="pf-form pf-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (text.trim().length >= 2 && !send.isPending) send.mutate();
                }}
              >
                {composer === "reply" && (savedReplies.data?.length ?? 0) > 0 && (
                  <Field label="Saved replies" optional>
                    <SelectInput
                      value=""
                      onChange={(event) => {
                        const chosen = savedReplies.data?.find((reply) => reply.id === event.target.value);
                        if (chosen) setText(chosen.body.replaceAll("{{name}}", item.name.split(" ")[0] ?? item.name));
                      }}
                    >
                      <option value="">Insert a saved reply…</option>
                      {savedReplies.data?.map((reply) => (
                        <option key={reply.id} value={reply.id}>{reply.title}</option>
                      ))}
                    </SelectInput>
                  </Field>
                )}
                <Field label={composer === "reply" ? "Your reply" : "Note"} hint={composer === "reply" ? "Write it as an email. Your first name signs it for you." : undefined}>
                  <TextArea rows={composer === "reply" ? 6 : 3} value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} />
                </Field>
                {composer === "reply" && closedLike && <p className="pf-problem">Replying reopens this message and waits for {item.name}.</p>}
                <div className="pf-actions pf-actions--start">
                  <AdminButton type="submit" size="sm" icon={composer === "reply" ? <Send /> : <NotebookPen />} disabled={send.isPending || text.trim().length < 2} aria-busy={send.isPending}>
                    {send.isPending ? "Saving…" : composer === "reply" ? "Send reply" : "Add note"}
                  </AdminButton>
                  {composer === "reply" && (
                    <AdminButton variant="ghost" size="sm" icon={<BookmarkPlus />} disabled={text.trim().length < 2} onClick={() => setSavingReply(true)}>
                      Save as template
                    </AdminButton>
                  )}
                  <small className="pf-muted">{text.length} / 5000</small>
                </div>
              </form>
            </AdminCard>
          )}

          <AdminCard title="Activity" description="Everything that happened, newest at the bottom." flush>
            <ol className="pf-activity" aria-label="Activity">
              {item.timeline.map((entry) => (
                <TimelineItem key={entry.id} entry={entry} senderName={item.name} onResend={(eventId) => resend.mutate(eventId)} resending={resend.isPending} />
              ))}
            </ol>
          </AdminCard>
        </div>

        <div className="pf-stack">
          <AdminCard title="Handling">
            <div className="pf-form">
              <Field label="Owner">
                <SelectInput
                  value={item.assigned_to?.id ?? ""}
                  disabled={assign.isPending}
                  onChange={(event) => assign.mutate(event.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {item.assignees.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Priority">
                <SelectInput value={item.priority} disabled={priority.isPending} onChange={(event) => priority.mutate(event.target.value as EnquiryPriority)}>
                  {(["low", "normal", "high"] as const).map((value) => (
                    <option key={value} value={value}>{PRIORITY_LABEL[value]}</option>
                  ))}
                </SelectInput>
              </Field>
              {item.kind === "pilot" && !item.converted_programme && open && (
                <AdminButton variant="secondary" size="sm" icon={<Building2 />} onClick={() => setConverting(true)}>
                  Create the programme
                </AdminButton>
              )}
              {item.converted_programme && (
                <Notice icon={<CheckCircle2 />}>
                  Programme <strong>{item.converted_programme.name}</strong> was created from this request.{" "}
                  <Link to="/platform/programmes" className="pf-link">View programmes</Link>
                </Notice>
              )}
            </div>
          </AdminCard>

          <AdminCard title="Sender">
            <dl className="pf-kv">
              <div><dt>Name</dt><dd>{item.name}</dd></div>
              <div><dt>Email</dt><dd><a className="pf-link" href={`mailto:${item.email}`}>{item.email}</a></dd></div>
              {item.phone && <div><dt>Phone</dt><dd><a className="pf-link" href={`tel:${item.phone}`}>{item.phone}</a></dd></div>}
              {item.organisation && <div><dt>Organisation</dt><dd>{item.organisation}</dd></div>}
              <div><dt>Received</dt><dd>{formatDate(item.created_at, true)}</dd></div>
              <div><dt>First response</dt><dd>{item.first_response_at ? formatDate(item.first_response_at, true) : <span className="pf-muted">None yet</span>}</dd></div>
              <div><dt>Agreed to be contacted</dt><dd>{formatDate(item.consent_at, true)}</dd></div>
              <div><dt>Sent from</dt><dd>{item.source_page || "—"}</dd></div>
            </dl>
          </AdminCard>
        </div>
      </div>

      {savingReply && (
        <Modal
          open
          onClose={() => setSavingReply(false)}
          dismissible={!saveReply.isPending}
          size="sm"
          title="Save as a template"
          description="Anyone on the platform team can insert it into a reply. Use {{name}} where the sender’s first name should go."
          footer={
            <>
              <AdminButton variant="secondary" size="sm" disabled={saveReply.isPending} onClick={() => setSavingReply(false)}>Cancel</AdminButton>
              <AdminButton size="sm" disabled={saveReply.isPending || replyTitle.trim().length < 2} onClick={() => saveReply.mutate()}>
                {saveReply.isPending ? "Saving…" : "Save template"}
              </AdminButton>
            </>
          }
        >
          <div className="pf-form">
            <Field label="Title" required hint="Saving with an existing title replaces it.">
              <TextInput value={replyTitle} maxLength={80} onChange={(event) => setReplyTitle(event.target.value)} />
            </Field>
            {(savedReplies.data?.length ?? 0) > 0 && (
              <ul className="pf-saved">
                {savedReplies.data?.map((reply) => (
                  <li key={reply.id}>
                    <span>{reply.title}</span>
                    <AdminButton variant="ghost" size="sm" icon={<Trash2 />} aria-label={`Delete ${reply.title}`} disabled={removeReply.isPending} onClick={() => removeReply.mutate(reply.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
      {statusAction && (
        <StatusDialog
          action={statusAction}
          name={item.name}
          busy={status.isPending}
          onClose={() => setStatusAction(null)}
          onConfirm={(note, notify) => status.mutate({ target: statusAction.status, note, notify })}
        />
      )}
      {converting && (
        <ConvertDialog
          item={item}
          onClose={() => setConverting(false)}
          onDone={(data) => {
            update(data);
            setConverting(false);
            pushToast({ kind: "success", title: "Programme created", message: `An invitation was sent to ${data.converted_programme ? "its administrator" : "the contact"}, and ${data.name} was told.` });
          }}
          onError={onError}
        />
      )}
    </AdminPage>
  );
}

function BackLink() {
  return (
    <Link to="/platform/messages" className="pf-back">
      <ArrowLeft aria-hidden="true" /> All messages
    </Link>
  );
}

function statusActions(item: EnquiryDetail): Array<StatusAction & { label: string; icon: ReactNode; primary?: boolean }> {
  const resolve = {
    status: "resolved" as const, label: "Mark resolved", icon: <CheckCircle2 />, title: "Mark as resolved?",
    confirm: "Mark resolved", description: "The sender is told it is resolved and can reply to reopen it.",
  };
  const close = {
    status: "closed" as const, label: "Close", icon: <XCircle />, title: "Close this message?", confirm: "Close message",
    description: "Use this when no answer is needed. You can reopen it later.",
  };
  const spam = {
    status: "spam" as const, label: "Spam", icon: <ShieldAlert />, title: "Mark as spam?", confirm: "Mark as spam", danger: true,
    description: "Hidden from the open list. The sender is not emailed.",
  };
  const start = {
    status: "in_progress" as const, label: "Start working", icon: <PlayCircle />, primary: true, title: "Start working on this?",
    confirm: "Start working", description: "You become the owner if nobody is. You can tell the sender we are looking into it.",
  };
  const reopen = {
    status: "in_progress" as const, label: "Reopen", icon: <RotateCcw />, primary: true, title: "Reopen this message?", confirm: "Reopen",
    description: "It returns to the open list as in progress.",
  };
  switch (item.status) {
    case "new": return [start, resolve, close, spam];
    case "in_progress": return [{ ...resolve, primary: true }, close, spam];
    case "waiting": return [{ ...resolve, primary: true }, close, spam];
    case "resolved":
    case "closed": return [reopen, spam];
    default:
      return [{ status: "new", label: "Not spam", icon: <Flag />, primary: true, title: "Restore this message?", confirm: "Restore", description: "It returns to the open list as new." }];
  }
}

function pilotRows(item: EnquiryDetail) {
  const d = item.details ?? {};
  const rows: Array<{ label: string; value: ReactNode }> = [];
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") rows.push({ label, value: String(value) });
  };
  add("Their role", d.role_title);
  add("Type of organisation", typeof d.organisation_type === "string" ? ORGANISATION_TYPE[d.organisation_type] ?? d.organisation_type : "");
  add("County", d.county);
  add("Mentors", d.mentors);
  add("Students per cohort", d.students);
  add("Preferred start", d.start_term);
  return rows;
}

const ENTRY_ICON: Record<EnquiryTimelineEntry["type"], ReactNode> = {
  received: <Inbox />,
  reply: <Send />,
  inbound: <CornerDownLeft />,
  note: <StickyNote />,
  status: <Flag />,
  assignment: <UserCheck />,
  priority: <AlertCircle />,
  converted: <Building2 />,
  email: <MailCheck />,
};

const EMAIL_NAME: Record<string, string> = {
  acknowledgement: "Confirmation",
  reply: "Reply",
  progress: "Update",
  staff_alert: "Alert",
};

function TimelineItem({ entry, senderName, onResend, resending }: { entry: EnquiryTimelineEntry; senderName: string; onResend: (eventId: string) => void; resending: boolean }) {
  const who = entry.actor?.name ?? "MentorMAMA";
  let title: ReactNode;
  switch (entry.type) {
    case "received": title = <>{senderName} sent this message</>; break;
    case "reply": title = <><strong>{who}</strong> replied to {senderName}</>; break;
    case "inbound": title = <><strong>{senderName}</strong> replied by email</>; break;
    case "note": title = <><strong>{who}</strong> added an internal note</>; break;
    case "status": title = <><strong>{who}</strong>: {entry.text}</>; break;
    case "assignment": title = <><strong>{who}</strong>: {entry.body}</>; break;
    case "priority": title = <><strong>{who}</strong>: {entry.body}</>; break;
    case "converted": title = <><strong>{who}</strong> created the programme {entry.meta.programme}</>; break;
    default: title = <>Confirmation sent automatically</>;
  }
  const showBody = entry.body && !["assignment", "priority"].includes(entry.type);
  return (
    <li className={`pf-activity__item pf-activity__item--${entry.type}`}>
      <span className="pf-activity__icon" aria-hidden="true">{ENTRY_ICON[entry.type]}</span>
      <div className="pf-activity__body">
        <p className="pf-activity__title">{title}</p>
        {showBody && <p className="pf-activity__text">{entry.body}</p>}
        {entry.email && <EmailLine email={entry.email} eventId={entry.id} onResend={onResend} resending={resending} />}
        <time dateTime={entry.created_at} title={formatDate(entry.created_at, true)}>{formatDate(entry.created_at, true)}</time>
      </div>
    </li>
  );
}

function EmailLine({ email, eventId, onResend, resending }: { email: EnquiryEmail; eventId: string; onResend: (eventId: string) => void; resending: boolean }) {
  const label = EMAIL_NAME[email.template] ?? "Email";
  if (email.status === "sent")
    return (
      <p className="pf-email pf-email--sent">
        <MailCheck aria-hidden="true" /> {label} emailed to {email.to}
        {email.sent_at ? ` · ${formatDate(email.sent_at, true)}` : ""}
      </p>
    );
  if (email.status === "queued")
    return (
      <p className="pf-email pf-email--queued">
        <Mail aria-hidden="true" /> {label} email to {email.to} is being sent
        {email.attempts > 0 ? ` (retrying, attempt ${email.attempts + 1})` : ""}…
      </p>
    );
  return (
    <p className="pf-email pf-email--failed" role="alert">
      <MailWarning aria-hidden="true" /> {label} email to {email.to} could not be delivered.
      <AdminButton variant="secondary" size="sm" disabled={resending} onClick={() => onResend(eventId)}>
        Send again
      </AdminButton>
    </p>
  );
}

function StatusDialog({ action, name, busy, onClose, onConfirm }: { action: StatusAction; name: string; busy: boolean; onClose: () => void; onConfirm: (note: string, notify: boolean) => void }) {
  const [note, setNote] = useState("");
  const canNotify = Boolean(SENDER_COPY[action.status]);
  const [notify, setNotify] = useState(canNotify);
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={action.title}
      description={action.description}
      footer={
        <>
          <AdminButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>Cancel</AdminButton>
          <AdminButton size="sm" className={action.danger ? "po-danger" : undefined} disabled={busy} onClick={() => onConfirm(note.trim(), canNotify && notify)}>
            {busy ? "Saving…" : action.confirm}
          </AdminButton>
        </>
      }
    >
      <div className="pf-form">
        {canNotify && (
          <>
            <label className="pf-check-row">
              <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
              {SENDER_COPY[action.status]} by email to {name}
            </label>
            {notify && (
              <Field label="Add a note to the email" optional hint="Shown to the sender.">
                <TextArea rows={3} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
              </Field>
            )}
          </>
        )}
        {!canNotify && (
          <Field label="Note" optional hint="Kept on the activity, not emailed.">
            <TextArea rows={3} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ConvertDialog({ item, onClose, onDone, onError }: { item: EnquiryDetail; onClose: () => void; onDone: (data: EnquiryDetail) => void; onError: (message: string) => void }) {
  const [first = "", ...rest] = item.name.trim().split(/\s+/);
  const [name, setName] = useState(item.organisation);
  const [year, setYear] = useState(String(item.details?.start_term ?? "").match(/\d{4}/)?.[0] ?? "");
  const [admin, setAdmin] = useState<PersonInput>({ email: item.email, first_name: first, last_name: rest.join(" "), phone: item.phone });
  const [note, setNote] = useState("");
  const problem = !name.trim() ? "Give the programme a name." : !admin.first_name.trim() || !admin.last_name.trim() ? "Add the administrator’s first and last name." : null;
  const create = useMutation({
    mutationFn: () => convertPlatformEnquiry(item.id, { name: name.trim(), academic_year: year.trim(), note: note.trim(), admin: { ...admin, email: admin.email.trim() } }),
    onSuccess: onDone,
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not create the programme."),
  });
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!create.isPending}
      icon={<Building2 />}
      title="Create the programme"
      description={`Sets up the programme with the default induction checklist and invites its first administrator. ${item.name} is emailed that it is being set up.`}
      footer={
        <>
          <AdminButton variant="secondary" size="sm" disabled={create.isPending} onClick={onClose}>Cancel</AdminButton>
          <AdminButton size="sm" disabled={create.isPending || Boolean(problem)} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create and invite"}
          </AdminButton>
        </>
      }
    >
      <div className="pf-form">
        <div className="pf-grid">
          <Field label="Programme name" required><TextInput value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Academic year" optional><TextInput value={year} maxLength={20} placeholder="2027" onChange={(event) => setYear(event.target.value)} /></Field>
          <Field label="Administrator first name" required><TextInput value={admin.first_name} onChange={(event) => setAdmin({ ...admin, first_name: event.target.value })} /></Field>
          <Field label="Administrator last name" required><TextInput value={admin.last_name} onChange={(event) => setAdmin({ ...admin, last_name: event.target.value })} /></Field>
          <Field label="Administrator email" required><TextInput type="email" value={admin.email} onChange={(event) => setAdmin({ ...admin, email: event.target.value })} /></Field>
          <Field label="Phone" optional><TextInput type="tel" value={admin.phone ?? ""} onChange={(event) => setAdmin({ ...admin, phone: event.target.value })} /></Field>
        </div>
        <Field label="Note to the sender" optional hint="Added to the “your pilot is being set up” email.">
          <TextArea rows={3} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {problem && <p className="pf-problem">{problem}</p>}
      </div>
    </Modal>
  );
}
