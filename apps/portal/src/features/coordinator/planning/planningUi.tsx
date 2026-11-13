import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatusPill, type PillTone } from "../../programme-admin/ui/AdminKit";
import type { PipelineStatus, StatusCounts } from "../../../services/placement-planning";
import "./placement-planning.css";

export const PLANNING_PATH = "/coordinator/placements/planning";
export const RUNS_PATH = "/coordinator/placements/runs";

/** British short date, e.g. 3 Feb 2027. Tolerates null and date-times. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dateRange(start: string | null, end: string | null): string {
  return start && end ? `${fmtDate(start)} – ${fmtDate(end)}` : "—";
}

export const STATUS_TONE: Record<PipelineStatus, PillTone> = {
  not_placed: "neutral",
  not_requested: "neutral",
  declined: "danger",
  requested: "info",
  partly_arranged: "warning",
  arranged: "teal",
  shared: "teal",
  released: "info",
  confirmed: "success",
  active: "success",
  paused: "warning",
  completed: "neutral",
  withdrawn: "neutral",
  archived: "neutral",
};

export function StatusChip({ status, label }: { status: PipelineStatus; label: string }) {
  return <StatusPill tone={STATUS_TONE[status] ?? "neutral"}>{label}</StatusPill>;
}

/** The five steps shown in the progress strip, each covering one or more pipeline statuses. */
export const PIPELINE_STEPS: Array<{ id: string; label: string; statuses: PipelineStatus[] }> = [
  { id: "not-placed", label: "Not placed", statuses: ["not_placed", "not_requested", "declined"] },
  { id: "requested", label: "Requested", statuses: ["requested", "partly_arranged"] },
  { id: "arranged", label: "Arranged", statuses: ["arranged", "shared"] },
  { id: "released", label: "Released", statuses: ["released"] },
  { id: "confirmed", label: "Confirmed or active", statuses: ["confirmed", "active", "paused", "completed"] },
];

export const sumStatuses = (counts: StatusCounts, statuses: PipelineStatus[]) => statuses.reduce((total, code) => total + (counts[code] ?? 0), 0);

export type PlacementsSection = "planning" | "register" | "batches" | "runs";

/** Sub-navigation shared by every page in the Placements area, so none of them is orphaned. */
export function PlacementsTabs({ active }: { active: PlacementsSection }) {
  const items: Array<{ id: PlacementsSection; label: string; to: string }> = [
    { id: "planning", label: "Planning", to: PLANNING_PATH },
    { id: "register", label: "Placements register", to: "/coordinator/placements" },
    { id: "batches", label: "Batch activity", to: "/coordinator/placements/batches" },
    { id: "runs", label: "Allocation runs", to: RUNS_PATH },
  ];
  return (
    <nav className="pp-subnav" aria-label="Placements sections">
      {items.map((item) => (
        <Link key={item.id} to={item.to} aria-current={item.id === active ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** A labelled bar: places held before a run (muted), places added by it (teal), against the total places. */
export function Meter({
  label,
  detail,
  total,
  before,
  added,
  summary,
}: {
  label: ReactNode;
  detail?: ReactNode;
  total: number | null | undefined;
  before: number | null | undefined;
  added: number;
  summary: string;
}) {
  const known = typeof total === "number" && total > 0;
  const base = typeof before === "number" ? before : 0;
  const scale = known ? Math.max(total, base + added) : Math.max(added, 1);
  const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  return (
    <div className="pp-meter">
      <div className="pp-meter__head">
        <span>{label}</span>
        <span>{detail}</span>
      </div>
      <div className="pp-meter__track" role="img" aria-label={summary}>
        {known && typeof before === "number" && <span className="pp-meter__before" style={{ width: pct(base) }} />}
        <span className={known && base + added > (total ?? 0) ? "pp-meter__over" : "pp-meter__added"} style={{ width: pct(added) }} />
      </div>
    </div>
  );
}

export const STRATEGY_LABEL: Record<string, string> = {
  balanced: "Balanced across wards",
  fill: "Fill one ward at a time",
  capacity: "In proportion to free places",
  even: "Evenly",
  manual: "One chosen facility",
};
export const MODE_LABEL: Record<string, string> = {
  facility_split: "Facility requests",
  auto_arrange: "Wards and mentors",
};
export const RUN_STATUS: Record<string, { label: string; tone: PillTone }> = {
  completed: { label: "Completed", tone: "success" },
  partial: { label: "Partly placed", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  undone: { label: "Undone", tone: "neutral" },
  running: { label: "Running", tone: "info" },
};
