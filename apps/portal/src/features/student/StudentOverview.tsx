import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import { getPlacementActivity, type Placement, type PlacementActivityEntry } from "../../services/api";
import type { WorkspaceProps } from "../workspaces/WorkspaceTypes";
import "./StudentOverview.css";

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function state(value: string) {
  return (
    {
      active: "Active placement",
      induction: "Induction in progress",
      orientation: "Orientation next",
      awaiting_student: "Your confirmation is needed",
      paused: "Paused",
    } as Record<string, string>
  )[value] ?? value.replaceAll("_", " ");
}

function stateTone(value: string) {
  switch (value) {
    case "active":
      return "active";
    case "induction":
      return "induction";
    case "orientation":
      return "orientation";
    case "awaiting_student":
      return "attention";
    case "paused":
      return "paused";
    default:
      return "neutral";
  }
}

export function StudentOverview({
  placements,
  mode,
  onOpen,
}: WorkspaceProps & {
  mode: "overview" | "placements";
  onOpen: (id: string) => void;
}) {
  const current =
    placements.find((item) => item.state === "active") ??
    placements.find((item) => item.state === "awaiting_student") ??
    placements.find((item) => item.state === "induction") ??
    placements.find((item) => item.state === "orientation") ??
    placements[0];

  const activeCount = placements.filter(
    (item) => item.state === "active",
  ).length;

  const awaiting = placements.filter(
    (item) => item.state === "awaiting_student",
  ).length;

  const inProgress = placements.filter((item) =>
    ["active", "induction", "orientation"].includes(item.state),
  ).length;

  if (mode === "placements") {
    return (
      <div className="student-page-container">
        <section className="student-records-header">
          <div className="student-records-header__copy">
            <p className="student-kicker">Learning record</p>

            <h1>My placements</h1>

            <p>
              Keep track of your placement history, current assignment, and
              everything you need to complete along the way.
            </p>
          </div>

          <div className="student-record-count">
            <strong>{placements.length}</strong>
            <span>
              placement
              {placements.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>

        {placements.length ? (
          <PlacementTable placements={placements} onOpen={onOpen} />
        ) : (
          <EmptyState />
        )}
      </div>
    );
  }

  return (
    <div className="student-page-container">
      {/* ---------------------------------------------------------------
          Welcome
      ---------------------------------------------------------------- */}
      <section className="student-welcome">
        <div className="student-welcome__content">
          <div className="student-welcome__eyebrow">
            <Sparkles size={15} />
            <span>Your learning record</span>
          </div>

          <h1>Stay clear on what comes next.</h1>

          <p>
            Track your placement, complete the steps assigned to you, and
            keep your conversations with your mentor useful.
          </p>
        </div>

        <div className="student-welcome__privacy">
          <ShieldCheck size={17} />
          <span>Private student record</span>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Metrics
      ---------------------------------------------------------------- */}
      <section
        className="student-metric-grid"
        aria-label="Placement summary"
      >
        <Metric
          icon={<MapPin size={18} />}
          value={placements.length}
          label="Placements"
          detail={
            activeCount
              ? `${activeCount} active now`
              : placements.length
                ? "No active placement"
                : "No placement yet"
          }
        />

        <Metric
          icon={<CheckCircle2 size={18} />}
          value={awaiting}
          label="Needs your action"
          detail={
            awaiting
              ? "Review and confirm when ready"
              : "Nothing waiting for you"
          }
          tone={awaiting ? "attention" : "default"}
        />

        <Metric
          icon={<Clock3 size={18} />}
          value={inProgress}
          label="In progress"
          detail={
            inProgress
              ? "Placement activities underway"
              : "No active learning journey"
          }
        />
      </section>

      {/* ---------------------------------------------------------------
          Primary action
      ---------------------------------------------------------------- */}
      {current ? (
        <NextStep placement={current} onOpen={onOpen} />
      ) : (
        <EmptyState />
      )}

      {/* ---------------------------------------------------------------
          Placement overview
      ---------------------------------------------------------------- */}
      <section className="student-section">
        <div className="student-section-heading">
          <div>
            <p className="student-kicker">Your placements</p>
            <h2>Placement overview</h2>
            <p>
              Quickly see where you are placed and open a record for more
              details.
            </p>
          </div>

          {placements.length > 3 && (
            <button
              type="button"
              className="student-text-button"
              onClick={() => onOpen(current?.id ?? "")}
              disabled={!current}
            >
              View all
              <ArrowRight size={16} />
            </button>
          )}
        </div>

        {placements.length ? (
          <PlacementTable placements={placements.slice(0, 3)} onOpen={onOpen} />
        ) : (
          <EmptyState />
        )}
      </section>
      {current && <StudentActivityTimeline placementId={current.id} />}
    </div>
  );
}

/* =========================================================================
   Next Step
=========================================================================== */

function NextStep({
  placement,
  onOpen,
}: {
  placement: Placement;
  onOpen: (id: string) => void;
}) {
  const action =
    placement.state === "awaiting_student"
      ? "Confirm your placement"
      : placement.state === "orientation"
        ? "Complete orientation"
        : placement.state === "induction"
          ? "Continue induction"
          : "Open placement record";

  const requiresAction = [
    "awaiting_student",
    "orientation",
    "induction",
  ].includes(placement.state);

  return (
    <section
      className={`student-next-step ${
        requiresAction ? "student-next-step--action" : ""
      }`}
    >
      <div className="student-next-step__leading">
        <div className="student-next-step__icon">
          <CalendarDays size={21} />
        </div>

        <div className="student-next-step__copy">
          <div className="student-next-step__label">
            {requiresAction ? "Next useful step" : "Current placement"}
          </div>

          <h2>{action}</h2>

          <div className="student-next-step__details">
            <span>{placement.facility_name ?? "Your placement team"}</span>

            <span className="student-dot" />

            <span>
              {date(placement.planned_start)} –{" "}
              {date(placement.planned_end)}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="student-button student-button--dark"
        onClick={() => onOpen(placement.id)}
      >
        <span>{action}</span>
        <ArrowRight size={17} />
      </button>
    </section>
  );
}

/* =========================================================================
   Placement Card
=========================================================================== */

function PlacementTable({ placements, onOpen }: { placements: Placement[]; onOpen: (id: string) => void }) {
  return <div className="student-placement-table-wrap"><table className="student-placement-table"><thead><tr><th>Placement</th><th>Ward</th><th>Placement window</th><th>Status</th><th aria-label="Open placement" /></tr></thead><tbody>{placements.map((placement) => <tr key={placement.id} tabIndex={0} onClick={() => onOpen(placement.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(placement.id); } }}><td><strong>{placement.facility_name ?? "Placement record"}</strong><small>{placement.cohort_name ?? "Programme placement"}</small></td><td>{placement.ward?.name ?? "Details pending"}</td><td>{date(placement.planned_start)} – {date(placement.planned_end)}</td><td><span className={`student-status student-status--${stateTone(placement.state)}`}><span className="student-status__dot" />{state(placement.state)}</span></td><td><ArrowRight size={17} /></td></tr>)}</tbody></table>{placements.length === 0 && <EmptyState />}</div>;
}

function StudentActivityTimeline({ placementId }: { placementId: string }) {
  const [entries, setEntries] = useState<PlacementActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  function load() {
    setLoading(true);
    setFailed(false);
    void getPlacementActivity(placementId).then((items) => setEntries(items.slice(0, 4))).catch(() => { setEntries([]); setFailed(true); }).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [placementId]);
  return <section className="student-activity"><div className="student-section-heading"><div><p className="student-kicker">Recent movement</p><h2>Your activity</h2><p>A short view of the latest updates on your current placement.</p></div></div>{loading ? <div className="student-activity__empty" role="status">Loading recent activity…</div> : failed ? <div className="student-activity__error" role="alert"><span>We could not load recent activity.</span><Button size="sm" variant="tertiary" onClick={load}>Try again</Button></div> : entries.length ? <ol className="student-activity__list">{entries.map((entry) => { const occurredAt = new Date(entry.occurred_at); return <li key={entry.id}><span className="student-activity__dot" aria-hidden="true" /><div><strong>{activityLabel(entry.action)}</strong><small>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(occurredAt)}</small></div><time dateTime={occurredAt.toISOString()}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(occurredAt)}</time></li>; })}</ol> : <div className="student-activity__empty">Placement updates will appear here as your journey progresses.</div>}</section>;
}

function activityLabel(action: string) {
  const labels: Record<string, string> = { "placement.transition.t-03": "Placement released to you", "placement.transition.t-06": "Placement confirmed", "placement.assign_mentor": "Mentor assigned", "placement.allocate_ward": "Ward assigned", "placement.created": "Placement created" };
  return labels[action.toLowerCase()] ?? action.replaceAll(".", " · ").replaceAll("_", " ");
}

/* =========================================================================
   Metric
=========================================================================== */

function Metric({
  icon,
  value,
  label,
  detail,
  tone = "default",
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  detail: string;
  tone?: "default" | "attention";
}) {
  return (
    <Card
      className={`student-metric ${
        tone === "attention" ? "student-metric--attention" : ""
      }`}
    >
      <div className="student-metric__top">
        <span className="student-metric__icon">{icon}</span>

        <span className="student-metric__label">{label}</span>
      </div>

      <div className="student-metric__value">{value}</div>

      <p>{detail}</p>
    </Card>
  );
}

/* =========================================================================
   Empty State
=========================================================================== */

function EmptyState() {
  return (
    <Card className="student-empty">
      <div className="student-empty__icon">
        <CalendarDays size={21} />
      </div>

      <div>
        <p className="student-kicker">Placement record</p>
        <h2>Your placement will appear here.</h2>

        <p>
          The programme team will add your placement record once your
          assignment is ready.
        </p>
      </div>
    </Card>
  );
}
