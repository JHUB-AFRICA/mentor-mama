import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, ClipboardCheck, Clock, FileSearch, UserSearch } from "lucide-react";
import { TableSkeleton } from "@mentormama/ui";
import { ApiError } from "../../services/api";
import {
  actOnDataRequest,
  getDataRequestQueue,
  type AdminDataRequest,
  type DataRequestArea,
  type DataRequestType,
} from "../../services/data-requests";
import { DetailList, DetailSection, Drawer, Field, TextArea } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { formatDate, requestStatusLabel, requestStatusTone } from "../auth/PrivacyAndData";
import {
  AdminButton,
  EmptyState,
  Notice,
  SearchField,
  SelectField,
  StatCard,
  StatGrid,
  StatusPill,
  Toolbar,
} from "./ui/AdminKit";

const statusFilters = [
  { value: "open", label: "Open requests" },
  { value: "all", label: "All requests" },
  { value: "received", label: "Received" },
  { value: "in_review", label: "In review" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
];
const typeFilters = [
  { value: "", label: "All kinds" },
  { value: "correction", label: "Corrections" },
  { value: "access", label: "Copies of information" },
  { value: "erasure", label: "Account deletion" },
];

/** What a programme administrator can actually do for each kind of request, using the tools that already exist. */
function guidance(type: DataRequestType, area: DataRequestArea): string {
  if (type === "access") {
    return "Gather what you can share with this person: their profile, their placements, and the sessions and feedback they gave. Send it to them in a way that keeps it private, and say how in your reply. Please do not paste records into the reply itself.";
  }
  if (type === "erasure") {
    return "Use the account actions on their record in People to deactivate the account. Some records (for example safeguarding and assessment records) may have to be kept; say plainly which ones in your reply. Nothing is deleted automatically.";
  }
  if (area === "profile") {
    return "They can change their own name and phone number under Settings, then Profile; tell them so. If their role, institution or facility is wrong, use Edit access on their record in People. An email address or registration number that cannot be changed that way is a question for the platform team.";
  }
  if (area === "placement") {
    return "Placement dates, ward and mentor are changed through the placement tools by the coordinator or nurse manager who owns them. Ask them to make the change, then record here what was done.";
  }
  if (area === "session") {
    return "A session record is corrected by the mentor who logged it, while the correction window is open. Ask the mentor to correct it, or explain in your reply why it cannot be changed.";
  }
  if (area === "feedback") {
    return "Submitted feedback cannot be edited. Explain this in your reply, or ask how they would like it handled.";
  }
  return "Make the change through the normal tools for that record, then say what you changed. If it cannot be changed, decline with the reason.";
}

function Sla({ item }: { item: AdminDataRequest }) {
  if (!item.is_open) return null;
  if (item.overdue) return <StatusPill tone="danger">{item.days_overdue} {item.days_overdue === 1 ? "day" : "days"} overdue</StatusPill>;
  const left = item.days_left ?? 0;
  return <StatusPill tone={left <= 7 ? "warning" : "neutral"}>{left} {left === 1 ? "day" : "days"} left</StatusPill>;
}

export function DataRequestsTab({ onFindPerson }: { onFindPerson: (email: string) => void }) {
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Kept as a whole record, not an id, so the drawer stays open on the outcome after it leaves the "open" list.
  const [picked, setPicked] = useState<AdminDataRequest | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queue = useQuery({
    queryKey: ["data-requests", { status, type, search, overdue, page }],
    queryFn: () => getDataRequestQueue({ status, request_type: type, search, overdue, page }),
  });
  const selected = picked ? (queue.data?.results.find((item) => item.id === picked.id) ?? picked) : null;
  const counts = queue.data?.counts;

  return (
    <>
      <StatGrid columns={3}>
        <StatCard icon={<ClipboardCheck />} tone="teal" value={counts?.open ?? 0} label="Open requests" hint="Waiting for a reply" loading={queue.isPending}
          onClick={() => { setStatus("open"); setOverdue(false); setPage(1); }} />
        <StatCard icon={<FileSearch />} tone="blue" value={counts?.in_review ?? 0} label="In review" hint="Someone is working on it" loading={queue.isPending}
          onClick={() => { setStatus("in_review"); setOverdue(false); setPage(1); }} />
        <StatCard icon={<Clock />} tone="rose" value={counts?.overdue ?? 0} label="Overdue" hint="Past the 30-day aim" loading={queue.isPending}
          onClick={() => { setStatus("open"); setOverdue(true); setPage(1); }} />
      </StatGrid>
      <Toolbar>
        <SearchField value={searchInput} onChange={setSearchInput} placeholder="Search by name, email or wording" label="Search data requests" />
        <SelectField value={status} onChange={(value) => { setStatus(value); setOverdue(false); setPage(1); }} options={statusFilters} label="Filter by status" />
        <SelectField value={type} onChange={(value) => { setType(value); setPage(1); }} options={typeFilters} label="Filter by kind" />
      </Toolbar>
      {overdue && (
        <Notice icon={<CircleAlert aria-hidden="true" />}>
          Showing only overdue requests. <button type="button" className="underline" onClick={() => setOverdue(false)}>Show all open requests</button>
        </Notice>
      )}
      {queue.isPending ? (
        <TableSkeleton rows={4} />
      ) : queue.isError ? (
        <EmptyState icon={<CircleAlert />} title="Data requests could not be loaded"
          text={queue.error instanceof ApiError ? queue.error.message : "Please try again."}
          action={<AdminButton variant="secondary" onClick={() => void queue.refetch()}>Try again</AdminButton>} />
      ) : queue.data.results.length === 0 ? (
        <EmptyState icon={<ClipboardCheck />} title="No requests here"
          text={status === "open" ? "Nobody is waiting for a reply." : "Nothing matches these filters."} />
      ) : (
        <ul className="grid gap-2" aria-label="Data requests">
          {queue.data.results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setPicked(item)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe7ea] bg-white p-4 text-left hover:bg-[#f7fafb]"
                aria-label={`Open request from ${item.requester.name}`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{item.requester.name}</span>
                  <span className="block text-sm text-[#5b6b73]">
                    {item.requester.role_label} · {item.request_type_label} · {item.subject_area_label}
                  </span>
                  <span className="block text-xs text-[#5b6b73]">Sent {formatDate(item.created_at)} · {item.age_days} {item.age_days === 1 ? "day" : "days"} ago</span>
                </span>
                <span className="flex items-center gap-2">
                  <Sla item={item} />
                  <StatusPill tone={requestStatusTone[item.status]}>{requestStatusLabel[item.status]}</StatusPill>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {queue.data && queue.data.pagination.total_pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <AdminButton variant="secondary" size="sm" disabled={!queue.data.pagination.has_previous} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</AdminButton>
          <span>Page {queue.data.pagination.page} of {queue.data.pagination.total_pages}</span>
          <AdminButton variant="secondary" size="sm" disabled={!queue.data.pagination.has_next} onClick={() => setPage((p) => p + 1)}>Next</AdminButton>
        </div>
      )}
      <RequestDrawer item={selected} onClose={() => setPicked(null)} onChanged={setPicked} onFindPerson={onFindPerson} />
    </>
  );
}

function RequestDrawer({ item, onClose, onChanged, onFindPerson }: { item: AdminDataRequest | null; onClose: () => void; onChanged: (item: AdminDataRequest) => void; onFindPerson: (email: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemId = item?.id;
  useEffect(() => { setNote(""); setError(null); }, [itemId]);

  async function act(action: "review" | "complete" | "decline") {
    if (!item) return;
    if (action !== "review" && !note.trim()) {
      setError(action === "decline" ? "Say why you are declining, so the person understands." : "Describe what was done, so the person knows.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await actOnDataRequest(item.id, action, note));
      setNote("");
      pushToast({
        kind: "success",
        title: action === "review" ? "Review started" : action === "complete" ? "Request completed" : "Request declined",
        message: action === "review" ? "The person has been told you are looking at it." : "The person has been told.",
      });
      await queryClient.invalidateQueries({ queryKey: ["data-requests"] });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={Boolean(item)}
      onClose={onClose}
      closeLabel="Close request"
      title={item ? `${item.request_type_label}` : "Data request"}
      description={item ? `From ${item.requester.name} · ${item.requester.role_label}` : undefined}
      footer={item?.is_open ? (
        <>
          {item.status === "received" && (
            <AdminButton variant="secondary" size="sm" disabled={busy} onClick={() => void act("review")}>Start review</AdminButton>
          )}
          <AdminButton variant="secondary" size="sm" disabled={busy} onClick={() => void act("decline")}>Decline</AdminButton>
          <AdminButton size="sm" disabled={busy} onClick={() => void act("complete")}>Mark as completed</AdminButton>
        </>
      ) : undefined}
    >
      {item && (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={requestStatusTone[item.status]}>{requestStatusLabel[item.status]}</StatusPill>
            <Sla item={item} />
          </div>
          <DetailSection title="The request">
            <DetailList items={[
              { label: "About", value: item.subject_area_label },
              { label: "What is wrong, or what they want", value: <span className="whitespace-pre-line">{item.description}</span> },
              ...(item.requested_change ? [{ label: "What it should say", value: <span className="whitespace-pre-line">{item.requested_change}</span> }] : []),
              ...(item.reason ? [{ label: "Anything else", value: <span className="whitespace-pre-line">{item.reason}</span> }] : []),
              { label: "Sent", value: formatDate(item.created_at) },
              { label: "Aim to reply by", value: formatDate(item.due_at) },
            ]} />
          </DetailSection>
          <DetailSection
            title="The person"
            action={<AdminButton variant="ghost" size="sm" icon={<UserSearch />} onClick={() => onFindPerson(item.requester.email)}>Find in People</AdminButton>}
          >
            <DetailList items={[
              { label: "Name", value: item.requester.name },
              { label: "Email", value: item.requester.email },
              { label: "Role", value: item.requester.role_label },
              { label: "Account", value: item.requester.status },
            ]} />
          </DetailSection>
          <DetailSection title="How to make the change">
            <p className="text-sm">{guidance(item.request_type, item.subject_area)}</p>
          </DetailSection>
          {item.is_open ? (
            <DetailSection title="Your reply">
              <Field label="Note for the person" hint="Required to complete or decline. It is shown to them in the app, not sent by email. Do not include patient information." error={error ?? undefined}>
                <TextArea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={4} />
              </Field>
            </DetailSection>
          ) : (
            <DetailSection title="Outcome">
              <DetailList items={[
                { label: "Closed", value: formatDate(item.closed_at) },
                { label: "Handled by", value: item.reviewed_by ?? "—" },
                { label: "Reply", value: <span className="whitespace-pre-line">{item.response_note || "—"}</span> },
              ]} />
            </DetailSection>
          )}
        </div>
      )}
    </Drawer>
  );
}
