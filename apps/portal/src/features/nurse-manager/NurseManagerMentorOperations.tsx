import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Gauge, Mail, RefreshCw, Send, UserPlus, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { getFacilityMentors, resendInvitation, type CurrentUser, type FacilityMentor } from "../../services/api";
import { AdminButton, AdminPage, AdminPageHeader, EmptyState, SearchField, SelectField, StatCard, StatGrid, StatusPill, Toolbar } from "../programme-admin/ui/AdminKit";
import { ServerPager } from "../programme-admin/ui/DataTable";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
  { value: "deactivated", label: "Deactivated" },
];

/** The facility's mentors: who is ready, who is full, and who still needs to accept an invitation. */
export function NurseManagerMentorOperations({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? "1") || 1;
  const [text, setText] = useState(search);
  const [busyId, setBusyId] = useState<string | null>(null);

  const patch = (next: Record<string, string>) => {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    if (!("page" in next)) copy.delete("page");
    setParams(copy, { replace: true });
  };
  useEffect(() => {
    const timer = window.setTimeout(() => text !== search && patch({ search: text }), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const mentors = useQuery({
    queryKey: ["facility-mentors", search, status, page],
    queryFn: () => getFacilityMentors({ search, status, page, page_size: 15 }),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
  const rows = mentors.data?.results ?? [];
  const active = rows.filter((mentor) => mentor.status === "active").length;
  const full = rows.filter((mentor) => mentor.active_placements >= mentor.max_active_placements).length;
  const paused = rows.filter((mentor) => mentor.status === "active" && !mentor.accepting_students).length;
  const assigned = rows.reduce((total, mentor) => total + mentor.active_placements, 0);
  const hasFilters = Boolean(search || status);

  async function resend(mentor: FacilityMentor) {
    setBusyId(mentor.id);
    try {
      await resendInvitation(mentor.id);
      pushToast({ kind: "success", title: "Invitation resent", message: `${mentor.name} will get a fresh link by email.` });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not resend that invitation.");
    } finally {
      setBusyId(null);
    }
  }
  const nav = (destination: string) => navigate(destination === "overview" ? "/facility" : destination === "placements" ? "/placements" : `/facility/${destination}`);

  return (
    <FacilityWorkspaceFrame user={user} active="mentors" title="Mentors" onNavigate={nav} onAccount={() => navigate("/facility/account")} onError={onError}>
      <AdminPage>
        <AdminPageHeader
          eyebrow="Facility operations"
          title="Mentors"
          description="Keep the mentors at your facility ready, visible and matched to the students they support."
          actions={
            <>
              <AdminButton variant="ghost" size="sm" icon={<RefreshCw />} disabled={mentors.isFetching} onClick={() => void mentors.refetch()}>
                Refresh
              </AdminButton>
              <AdminButton size="sm" icon={<UserPlus />} onClick={() => navigate("/facility/mentors/invite")}>
                Invite mentors
              </AdminButton>
            </>
          }
        />
        <StatGrid>
          <StatCard icon={<Users />} tone="teal" value={mentors.data?.pagination.total_count ?? rows.length} label="Mentors" hint="Facility register" loading={mentors.isPending} />
          <StatCard icon={<Users />} tone="green" value={active} label="Active" hint="On this page" loading={mentors.isPending} />
          <StatCard icon={<Gauge />} tone={full ? "amber" : "green"} value={full} label="At capacity" hint={paused ? `${paused} not accepting` : "On this page"} loading={mentors.isPending} />
          <StatCard icon={<Send />} tone="blue" value={assigned} label="Student assignments" hint="On this page" loading={mentors.isPending} />
        </StatGrid>
        <Toolbar filters={2}>
          <SearchField label="Search mentors" placeholder="Search name or email" value={text} onChange={setText} />
          <SelectField label="Status" value={status} onChange={(value) => patch({ status: value })} options={STATUSES} />
        </Toolbar>

        {mentors.isPending ? (
          <Skeleton className="h-72" />
        ) : mentors.isError ? (
          <PortalErrorState onRetry={() => void mentors.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={hasFilters ? "No mentors match" : "No mentors yet"}
            text={hasFilters ? "Try another status or search term." : "Invite the clinical mentors at your facility so students can be matched."}
            action={
              hasFilters ? (
                <AdminButton variant="secondary" size="sm" onClick={() => { setText(""); setParams({}, { replace: true }); }}>Clear filters</AdminButton>
              ) : (
                <AdminButton size="sm" icon={<UserPlus />} onClick={() => navigate("/facility/mentors/invite")}>Invite mentors</AdminButton>
              )
            }
          />
        ) : (
          <div className="pa-table-wrap" aria-busy={mentors.isFetching}>
            <div className="pa-table-scroll">
              <table className="pa-table">
                <caption className="sr-only">Facility mentors</caption>
                <thead>
                  <tr>
                    <th scope="col">Mentor</th>
                    <th scope="col">Status</th>
                    <th scope="col">Workload</th>
                    <th scope="col">Contact</th>
                    <th scope="col" className="is-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((mentor) => {
                    const fill = mentor.max_active_placements ? Math.min(100, (mentor.active_placements / mentor.max_active_placements) * 100) : 0;
                    const isFull = mentor.active_placements >= mentor.max_active_placements;
                    return (
                      <tr
                        key={mentor.id}
                        className="is-clickable"
                        tabIndex={0}
                        onClick={() => navigate(`/facility/mentors/${mentor.id}`)}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault();
                            navigate(`/facility/mentors/${mentor.id}`);
                          }
                        }}
                      >
                        <td>
                          <div className="pa-cell-title">
                            <span>
                              <strong>{mentor.name}</strong>
                              <small>{mentor.email}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusPill tone={mentor.status === "active" ? "success" : mentor.status === "invited" ? "warning" : "neutral"}>
                            {mentor.status.charAt(0).toUpperCase() + mentor.status.slice(1)}
                          </StatusPill>
                        </td>
                        <td>
                          <span className="pa-cell-fill">
                            <span>
                              {mentor.active_placements} / {mentor.max_active_placements}
                              {mentor.status === "active" && !mentor.accepting_students && <small className="pa-sub">Not accepting</small>}
                            </span>
                            <span className="pa-meter" aria-hidden="true"><span style={{ width: `${fill}%` }} /></span>
                            {isFull && <StatusPill tone="warning">Full</StatusPill>}
                          </span>
                        </td>
                        <td>{mentor.phone || <span className="pa-muted">No phone recorded</span>}</td>
                        <td className="is-right" onClick={(event) => event.stopPropagation()}>
                          {mentor.status === "invited" ? (
                            <AdminButton variant="secondary" size="sm" icon={<Mail />} disabled={busyId === mentor.id} onClick={() => void resend(mentor)}>
                              {busyId === mentor.id ? "Sending…" : "Resend invite"}
                            </AdminButton>
                          ) : (
                            <AdminButton variant="ghost" size="sm" onClick={() => navigate(`/facility/mentors/${mentor.id}`)}>View</AdminButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {mentors.data && <ServerPager pagination={mentors.data.pagination} onPage={(next) => patch({ page: String(next) })} noun="mentors" />}
          </div>
        )}
      </AdminPage>
    </FacilityWorkspaceFrame>
  );
}
