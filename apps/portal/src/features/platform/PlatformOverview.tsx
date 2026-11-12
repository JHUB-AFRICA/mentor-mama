import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Building2, CheckCircle2, CircleSlash, Inbox, LifeBuoy, MailWarning, RefreshCw, UserCheck, Users, XCircle } from "lucide-react";
import { PortalErrorState } from "../../components/PortalErrorState";
import { getPlatformOverview, type SystemCheck } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, ListRow, Notice, StatCard, StatGrid, StatusPill, type PillTone } from "../programme-admin/ui/AdminKit";
import { formatDate } from "./platformUi";
import { OverviewSkeleton } from "./PlatformSkeletons";

const STATE: Record<SystemCheck["state"], { tone: PillTone; label: string; icon: ReactElement }> = {
  ok: { tone: "success", label: "Healthy", icon: <CheckCircle2 /> },
  warning: { tone: "warning", label: "Needs attention", icon: <AlertTriangle /> },
  down: { tone: "danger", label: "Not working", icon: <XCircle /> },
  off: { tone: "neutral", label: "Off", icon: <CircleSlash /> },
};

export function PlatformOverview({ onNavigate }: { onNavigate: (nav: "messages" | "programmes" | "accounts" | "support" | "activity") => void }) {
  // Refreshes every 30 seconds so the page can be left open as a status board.
  const query = useQuery({ queryKey: ["platform-overview"], queryFn: getPlatformOverview, refetchInterval: 30_000 });
  if (query.isPending) return <OverviewSkeleton />;
  if (query.isError) return <PortalErrorState onRetry={() => void query.refetch()} />;
  const data = query.data;
  const system = data.system;
  const overall = STATE[system.overall];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Overview"
        description="System health and the accounts that need you. Updates every 30 seconds."
        meta={
          <span className="pf-meta">
            Release {system.release} · {system.environment} · checked {formatDate(system.checked_at, true)}
          </span>
        }
        actions={
          <AdminButton variant="secondary" size="sm" icon={<RefreshCw />} disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching ? "Checking…" : "Check now"}
          </AdminButton>
        }
      />

      {data.enquiry_emails_failed > 0 && (
        <Notice icon={<MailWarning />}>
          {data.enquiry_emails_failed === 1 ? "A message has" : `${data.enquiry_emails_failed} messages have`} an email that could not be delivered after several tries.{" "}
          <button type="button" className="pf-link pf-link--button" onClick={() => onNavigate("messages")}>Open Messages</button>
        </Notice>
      )}
      <StatGrid columns={3}>
        <StatCard icon={<Building2 />} tone="teal" value={data.programmes} label="Programmes"
          hint={data.programmes_without_admin ? `${data.programmes_without_admin} without an administrator` : "All have an administrator"}
          onClick={() => onNavigate("programmes")} />
        <StatCard icon={<UserCheck />} tone="green" value={data.accounts.active} label="Active accounts"
          hint={`${data.signins_last_7_days} signed in this week`} onClick={() => onNavigate("accounts")} />
        <StatCard icon={<MailWarning />} tone={data.accounts.invitations_expired ? "amber" : "blue"} value={data.accounts.invited} label="Open invitations"
          hint={data.accounts.invitations_expired ? `${data.accounts.invitations_expired} expired` : "None expired"} onClick={() => onNavigate("accounts")} />
        <StatCard icon={<Inbox />} tone={data.enquiries_overdue ? "rose" : data.enquiries_new ? "amber" : "slate"} value={data.enquiries_new} label="New messages"
          hint={data.enquiries_overdue ? `${data.enquiries_overdue} overdue for a reply` : data.enquiries_new ? "From the website" : "Nothing waiting"} onClick={() => onNavigate("messages")} />
        <StatCard icon={<LifeBuoy />} tone={data.support_pending ? "rose" : "slate"} value={data.support_pending} label="Sign-in help requests"
          hint={data.support_pending ? "Waiting for review" : "Nothing waiting"} onClick={() => onNavigate("support")} />
        <StatCard icon={<MailWarning />} tone={data.enquiry_emails_failed ? "rose" : "slate"} value={data.enquiry_emails_failed} label="Undelivered emails"
          hint={data.enquiry_emails_failed ? "Needs a resend" : "All delivered"} onClick={() => onNavigate("messages")} />
      </StatGrid>

      <div className="pf-columns">
        <AdminCard
          title="System status"
          description="Each part of the platform, checked live."
          action={<StatusPill tone={overall.tone}>{overall.label}</StatusPill>}
          flush
        >
          <ul className="pf-checks" aria-label="System checks">
            {system.checks.map((check) => {
              const state = STATE[check.state];
              return (
                <li key={check.name} className={`pf-check pf-check--${check.state}`}>
                  <span className="pf-check__icon" aria-hidden="true">{state.icon}</span>
                  <div className="pf-check__body">
                    <strong>{check.name}</strong>
                    <span>{check.detail}</span>
                  </div>
                  <StatusPill tone={state.tone}>{state.label}</StatusPill>
                </li>
              );
            })}
          </ul>
        </AdminCard>

        <AdminCard title="Accounts by role" description="Active accounts across every programme.">
          <div className="pf-roles">
            {data.accounts.by_role.map((row) => (
              <ListRow key={row.role} icon={<Users />} tone="teal" title={row.label} value={row.active} />
            ))}
            <ListRow icon={<Activity />} tone="amber" title="Suspended" value={data.accounts.suspended} />
            <ListRow icon={<CircleSlash />} tone="slate" title="Deactivated" value={data.accounts.deactivated} />
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
