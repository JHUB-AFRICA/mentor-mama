/** One concern the student raised: what they reported, where it is, the outcome, and what they can do next. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@mentormama/ui";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flag,
  GitBranch,
  Lock,
  MapPin,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Modal } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { ApiError, getEscalation, getEscalations, type Placement } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, EmptyState, ListRow, Notice, StatusPill } from "../programme-admin/ui/AdminKit";
import {
  AUDIENCE_LABEL,
  ConcernSteps,
  RereviewForm,
  canAskAgain,
  concernDay,
  concernLabel,
  severityTone,
  stateLabel,
  statusLine,
} from "../safeguarding/MyConcerns";
import { RaiseConcernForm } from "../safeguarding/RaiseConcernForm";
import "./student-placement.css";

export function StudentConcernDetail({ id, placements, onError }: { id: string; placements: Placement[]; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"rereview" | "followup" | null>(null);
  const detail = useQuery({ queryKey: ["escalation", id], queryFn: () => getEscalation(id), retry: false });
  const all = useQuery({ queryKey: ["escalations"], queryFn: getEscalations });
  const item = detail.data;
  const placement = placements.find((row) => row.id === item?.placement_id);
  const related = useMemo(() => (all.data ?? []).filter((row) => row.related_escalation_id === id), [all.data, id]);
  const parent = useMemo(() => (all.data ?? []).find((row) => row.id === item?.related_escalation_id), [all.data, item?.related_escalation_id]);
  const back = () => navigate("/student?view=concerns");

  if (detail.isPending) {
    return (
      <AdminPage className="sp">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </AdminPage>
    );
  }
  if (detail.isError || !item || item.access !== "full") {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <AdminPage className="sp">
        <button type="button" className="sp-back" onClick={back}><ArrowLeft aria-hidden="true" /> Back to concerns</button>
        {missing || item?.access === "summary" ? (
          <EmptyState icon={<ShieldCheck />} title="This concern is not available" text="It may have been removed, or it was raised by someone else." action={<AdminButton size="sm" onClick={back}>See my concerns</AdminButton>} />
        ) : (
          <PortalErrorState onRetry={() => void detail.refetch()} />
        )}
      </AdminPage>
    );
  }

  const state = stateLabel(item);
  const timeline = [
    { label: "You raised this concern", date: item.submitted_at, icon: <Flag /> },
    item.rereview_requested_at ? { label: `You asked for another review${item.rereview_count > 1 ? ` (${item.rereview_count} times)` : ""}`, date: item.rereview_requested_at, icon: <RefreshCw /> } : null,
    item.closure_date ? { label: "Closed by the reviewer", date: item.closure_date, icon: <CheckCircle2 /> } : null,
    { label: "Last update", date: item.updated_at, icon: <CalendarDays /> },
  ].filter(Boolean) as Array<{ label: string; date: string; icon: React.ReactNode }>;

  return (
    <AdminPage className="sp scd">
      <button type="button" className="sp-back" onClick={back}><ArrowLeft aria-hidden="true" /> Back to concerns</button>

      <section className="sp-hero" aria-labelledby="scd-title">
        <div className="sp-hero__top">
          <span className="sp-hero__icon scd-hero__icon" aria-hidden="true"><ShieldAlert /></span>
          <div className="sp-hero__copy">
            <div className="sp-hero__eyebrow">
              <span className="pa-eyebrow">Private concern</span>
              <StatusPill tone={state.tone}>{state.text}</StatusPill>
              <StatusPill tone={severityTone(item.severity)} dot={false}>{concernLabel(item.severity)} severity</StatusPill>
            </div>
            <h2 id="scd-title" className="sp-hero__title">{item.category}</h2>
            <p className="sp-hero__sub">Raised {concernDay(item.submitted_at)}{placement?.facility_name ? ` · ${placement.facility_name}` : ""}</p>
          </div>
          <span className="sp-chip"><Lock aria-hidden="true" /> {AUDIENCE_LABEL[item.routed_to]}</span>
        </div>
        <div className="scd-progress">
          <ConcernSteps state={item.state} />
          <p>{statusLine(item)}</p>
        </div>
      </section>

      <div className="scd-grid">
        <div className="scd-main">
          <AdminCard title="What you reported" description="Only you and the reviewer handling it can read this.">
            <p className="scd-text">{item.description}</p>
          </AdminCard>

          {item.rereview_reason && (
            <AdminCard title="Why you asked for another review" description={item.rereview_requested_at ? `Sent ${concernDay(item.rereview_requested_at)}` : undefined}>
              <p className="scd-text">{item.rereview_reason}</p>
            </AdminCard>
          )}

          <AdminCard
            title={item.state === "open" && item.action_taken ? "Outcome of the earlier review" : "Outcome"}
            description={item.action_taken ? "What the reviewer found and did." : "The reviewer has not recorded an outcome yet."}
          >
            {item.finding || item.action_taken ? (
              <dl className="mc-facts">
                {item.finding && <div><dt>What the reviewer found</dt><dd>{item.finding}</dd></div>}
                {item.action_taken && <div><dt>Action taken</dt><dd>{item.action_taken}</dd></div>}
                {item.resolution_outcome && <div><dt>Outcome type</dt><dd>{concernLabel(item.resolution_outcome)}</dd></div>}
              </dl>
            ) : (
              <p className="sp-muted">{statusLine(item)}</p>
            )}
          </AdminCard>

          <AdminCard title="Timeline" description="Key dates on this concern.">
            <ol className="scd-timeline">
              {timeline.map((entry) => (
                <li key={entry.label}>
                  <span className="scd-timeline__icon" aria-hidden="true">{entry.icon}</span>
                  <span><strong>{entry.label}</strong><small>{concernDay(entry.date)}</small></span>
                </li>
              ))}
            </ol>
          </AdminCard>
        </div>

        <aside className="scd-side">
          <AdminCard title="What you can do">
            <div className="scd-actions">
              {canAskAgain(item) ? (
                <AdminButton icon={<RefreshCw />} onClick={() => setDialog("rereview")}>Ask for another review</AdminButton>
              ) : (
                <p className="sp-muted">You can ask for another review once the reviewer records an outcome.</p>
              )}
              {item.placement_id && (
                <AdminButton variant="secondary" icon={<GitBranch />} onClick={() => setDialog("followup")}>Raise a follow-up concern</AdminButton>
              )}
              {item.placement_id && (
                <AdminButton variant="ghost" icon={<MapPin />} onClick={() => navigate(`/student/placements/${item.placement_id}`)}>Open the placement</AdminButton>
              )}
            </div>
          </AdminCard>

          <AdminCard title="Details" flush>
            <dl className="scd-details">
              {[
                { label: "Reference", value: `#${item.id.slice(0, 8).toUpperCase()}`, icon: <FileText /> },
                { label: "Placement", value: placement?.facility_name ?? "—", icon: <MapPin /> },
                { label: "Visible to", value: AUDIENCE_LABEL[item.routed_to], icon: <Lock /> },
                { label: "Reviewer", value: item.reviewer ?? "Not taken yet", icon: <UserRound /> },
                { label: "Severity", value: concernLabel(item.severity), icon: <ShieldAlert /> },
                { label: "Raised", value: concernDay(item.submitted_at), icon: <CalendarDays /> },
                ...(item.closure_date ? [{ label: "Closed", value: concernDay(item.closure_date), icon: <CheckCircle2 /> }] : []),
                ...(item.rereview_count ? [{ label: "Reviewed again", value: `${item.rereview_count} ${item.rereview_count === 1 ? "time" : "times"}`, icon: <RefreshCw /> }] : []),
              ].map((row) => (
                <div key={row.label}>
                  <dt><span aria-hidden="true">{row.icon}</span>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </AdminCard>

          {(parent || related.length > 0) && (
            <AdminCard title="Linked concerns" flush>
              {parent && <ListRow icon={<ClipboardList />} tone="slate" title={parent.category} meta={`Earlier concern · ${concernDay(parent.submitted_at)}`} onClick={() => navigate(`/student/concerns/${parent.id}`)} />}
              {related.map((row) => (
                <ListRow key={row.id} icon={<MessageSquareText />} tone="amber" title={row.category} meta={`Follow-up · ${concernDay(row.submitted_at)} · ${stateLabel(row).text}`} onClick={() => navigate(`/student/concerns/${row.id}`)} />
              ))}
            </AdminCard>
          )}
        </aside>
      </div>

      <Notice icon={<ShieldCheck />}>
        Opening this concern is recorded. For a risk to someone&rsquo;s safety right now, tell a senior person at the facility straight away.
      </Notice>

      <Modal open={dialog === "rereview"} onClose={() => setDialog(null)} icon={<RefreshCw />} title="Ask for another review" description={item.category}>
        <RereviewForm id={item.id} onError={onError} onCancel={() => setDialog(null)} onDone={() => setDialog(null)} />
      </Modal>
      <Modal open={dialog === "followup"} onClose={() => setDialog(null)} icon={<GitBranch />} title="Raise a follow-up concern" description={`Linked to “${item.category}”, raised ${concernDay(item.submitted_at)}`} size="lg">
        <RaiseConcernForm
          placementId={item.placement_id ?? undefined}
          relatedEscalationId={item.id}
          defaultAudience={item.routed_to}
          defaultCategory={item.category}
          onError={onError}
          onCancel={() => setDialog(null)}
          onSubmitted={() => setDialog(null)}
        />
      </Modal>
    </AdminPage>
  );
}
