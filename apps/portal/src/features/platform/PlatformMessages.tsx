import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Inbox } from "lucide-react";
import { PortalErrorState } from "../../components/PortalErrorState";
import { getPlatformEnquiries } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, AdminTabs, EmptyState, SearchField, SelectField, StatusPill, Toolbar } from "../programme-admin/ui/AdminKit";
import { ENQUIRY_STATUS_LABEL, ENQUIRY_STATUS_TONE, KIND_LABEL, KIND_TONE, PRIORITY_LABEL, TOPIC_LABEL, formatDate, timeAgo } from "./platformUi";
import { TableRowsSkeleton } from "./PlatformSkeletons";

type View = "open" | "done" | "spam";

/** The inbox for the website's contact, pilot access and support forms. */
export function PlatformMessages() {
  const go = useNavigate();
  const [view, setView] = useState<View>("open");
  const [kind, setKind] = useState("");
  const [assigned, setAssigned] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [view, kind, assigned, debounced]);

  const filters = { page, page_size: 25, view, kind, assigned, search: debounced };
  const query = useQuery({
    queryKey: ["platform-enquiries", filters],
    queryFn: () => getPlatformEnquiries(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const counts = query.data?.counts;
  const results = query.data?.results ?? [];
  const pagination = query.data?.pagination;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Messages"
        description="Everything sent from the website: contact messages, pilot access requests and support requests. Senders get a confirmation straight away and an email at each step."
        meta={
          counts?.overdue ? (
            <span className="pf-meta pf-meta--warn">
              <AlertTriangle aria-hidden="true" /> {counts.overdue} without a reply for over 2 working days
            </span>
          ) : undefined
        }
      />
      <AdminTabs
        label="Message views"
        value={view}
        onChange={setView}
        tabs={[
          { value: "open", label: "Open", count: counts?.open },
          { value: "done", label: "Resolved & closed", count: counts?.done },
          { value: "spam", label: "Spam", count: counts?.spam },
        ]}
      />
      <Toolbar filters={3}>
        <SearchField label="Search messages" placeholder="Search by name, email, organisation or reference" value={search} onChange={setSearch} />
        <SelectField
          label="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "", label: "All types" },
            { value: "contact", label: "Contact" },
            { value: "pilot", label: "Pilot access" },
            { value: "support", label: "Support" },
          ]}
        />
        <SelectField
          label="Owner"
          value={assigned}
          onChange={setAssigned}
          options={[
            { value: "", label: "Anyone" },
            { value: "me", label: "Assigned to me" },
            { value: "unassigned", label: "Unassigned" },
          ]}
        />
      </Toolbar>

      {query.isPending ? (
        <TableRowsSkeleton rows={8} columns={5} label="messages" />
      ) : query.isError ? (
        <PortalErrorState onRetry={() => void query.refetch()} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={view === "open" && !debounced && !kind && !assigned ? "Nothing waiting" : "No messages match"}
          text={view === "open" && !debounced && !kind && !assigned ? "New messages from the website appear here automatically." : "Try a different search or filter."}
        />
      ) : (
        <AdminCard flush>
          <div className="pf-table-wrap">
            <table className="pf-table pf-table--rows" aria-label="Messages">
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">About</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Received</th>
                </tr>
              </thead>
              <tbody aria-busy={query.isFetching}>
                {results.map((row) => {
                  const open = () => go(`/platform/messages/${row.id}`);
                  return (
                    <tr key={row.id} className={row.unread ? "pf-row--unread" : undefined} onClick={open}>
                      <td>
                        <span className="pf-cell-stack">
                          <a
                            href={`/platform/messages/${row.id}`}
                            className="pf-link"
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                              event.preventDefault();
                              event.stopPropagation();
                              open();
                            }}
                          >
                            {row.unread && <span className="pf-unread-dot" aria-label="Unread" role="img" />}
                            {row.name}
                          </a>
                          <small>{row.organisation || row.email}</small>
                        </span>
                      </td>
                      <td>
                        <span className="pf-cell-stack">
                          <span className="pf-line">
                            <StatusPill tone={KIND_TONE[row.kind]} dot={false}>
                              {KIND_LABEL[row.kind]}
                            </StatusPill>
                            {row.kind !== "pilot" && <small>{TOPIC_LABEL[row.topic] ?? ""}</small>}
                            {row.priority === "high" && <StatusPill tone="danger" dot={false}>{PRIORITY_LABEL.high} priority</StatusPill>}
                          </span>
                          <small className="pf-clip">{row.subject || row.preview}</small>
                        </span>
                      </td>
                      <td>
                        <span className="pf-cell-stack">
                          <StatusPill tone={ENQUIRY_STATUS_TONE[row.status]}>{ENQUIRY_STATUS_LABEL[row.status]}</StatusPill>
                          {row.overdue && <small className="pf-warn">No reply yet · overdue</small>}
                        </span>
                      </td>
                      <td>{row.assigned_to?.name ?? <span className="pf-muted">Unassigned</span>}</td>
                      <td>
                        <span className="pf-cell-stack">
                          <span title={formatDate(row.created_at, true)}>{timeAgo(row.created_at)}</span>
                          <small>{row.reference}</small>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pagination && pagination.pages > 1 && (
            <div className="pf-pager">
              <span>
                Page {pagination.page} of {pagination.pages} · {pagination.total} messages
              </span>
              <AdminButton variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </AdminButton>
              <AdminButton variant="secondary" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>
                Next
              </AdminButton>
            </div>
          )}
        </AdminCard>
      )}
    </AdminPage>
  );
}
