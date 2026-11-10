/**
 * Single source of truth for placement progress, shared by every role.
 *
 * Every journey, stepper, status chip and "what next" line is derived from the
 * placement's server `state` through this module, so two screens can never
 * disagree (for example "Orientation" in one place and "Completed" in another).
 * Learner and staff views use the same ranks; staff additionally see the
 * pre-release stages (Draft, Scheduled).
 */

export type JourneyAudience = "learner" | "staff";
export type StageStatus = "done" | "current" | "upcoming" | "attention" | "stopped";

export interface JourneyStage {
  key: string;
  label: string;
  status: StageStatus;
}

export interface PlacementJourney {
  stages: JourneyStage[];
  /** Index of the current stage, or -1 when the placement is finished or stopped. */
  currentIndex: number;
  /** "Step 3 of 6", "Completed", "Paused", "Withdrawn" — never contradicts the stages. */
  progressLabel: string;
  /** Short status chip text. */
  statusLabel: string;
  /** One sentence that says where things stand. */
  summary: string;
  finished: boolean;
  interrupted: "paused" | "withdrawn" | null;
  /** The placement can no longer change mentor, ward or lifecycle (completed, archived, withdrawn). */
  closed: boolean;
}

/** Position of each server state along the lifecycle. */
const RANK: Record<string, number> = {
  draft: 0,
  scheduled: 1,
  awaiting_student: 2,
  orientation: 3,
  induction: 4,
  active: 5,
  paused: 5,
  completed: 6,
  archived: 7,
};

interface StageDef {
  key: string;
  label: string;
  startAt: number;
  completeAt: number;
}

const LEARNER_STAGES: StageDef[] = [
  { key: "assigned", label: "Assigned", startAt: 0, completeAt: 2 },
  { key: "acknowledged", label: "Acknowledged", startAt: 2, completeAt: 3 },
  { key: "orientation", label: "Orientation", startAt: 3, completeAt: 4 },
  { key: "induction", label: "Induction", startAt: 4, completeAt: 5 },
  { key: "active", label: "Active", startAt: 5, completeAt: 6 },
  { key: "closeout", label: "Close-out", startAt: 6, completeAt: 6 },
];

const STAFF_STAGES: StageDef[] = [
  { key: "draft", label: "Draft", startAt: 0, completeAt: 1 },
  { key: "scheduled", label: "Scheduled", startAt: 1, completeAt: 2 },
  { key: "awaiting_student", label: "Awaiting student", startAt: 2, completeAt: 3 },
  { key: "orientation", label: "Orientation", startAt: 3, completeAt: 4 },
  { key: "induction", label: "Induction", startAt: 4, completeAt: 5 },
  { key: "active", label: "Active", startAt: 5, completeAt: 6 },
  { key: "completed", label: "Completed", startAt: 6, completeAt: 6 },
];

const LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  awaiting_student: "Awaiting your confirmation",
  orientation: "Orientation",
  induction: "Induction in progress",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  withdrawn: "Withdrawn",
};
const STAFF_LABEL: Record<string, string> = { ...LABEL, awaiting_student: "Awaiting student", induction: "Induction" };

const LEARNER_SUMMARY: Record<string, string> = {
  draft: "Your placement is being set up by your programme team.",
  scheduled: "Your placement is scheduled. You will be asked to confirm it when it is released.",
  awaiting_student: "Your placement has been assigned and is waiting for your acknowledgement.",
  orientation: "Your placement has been acknowledged. Complete the required orientation before you begin.",
  induction: "Your mentor is completing the required induction steps.",
  active: "Your placement is active. Continue your learning, attendance and mentor sessions.",
  paused: "This placement is paused. Your programme team will share updates.",
  completed: "This placement is complete. Your record stays available to you for reference.",
  archived: "This placement has been archived. Your record stays available to you for reference.",
  withdrawn: "This placement was withdrawn. Contact your programme team if you have questions.",
};
const STAFF_SUMMARY: Record<string, string> = {
  draft: "Finish setup, then release the placement to the student.",
  scheduled: "Waiting for the programme to release this placement.",
  awaiting_student: "Waiting for the student to acknowledge the assignment.",
  orientation: "Waiting for the student to complete orientation.",
  induction: "Waiting for the mentor to complete the induction checklist.",
  active: "The placement is running. Monitor sessions and progress.",
  paused: "The placement is paused until it is resumed.",
  completed: "The placement is complete. Only the record remains; it can be archived.",
  archived: "The placement is archived and read-only.",
  withdrawn: "The placement was withdrawn and is read-only.",
};

export function placementStateLabel(state: string, audience: JourneyAudience = "staff"): string {
  const table = audience === "learner" ? LABEL : STAFF_LABEL;
  return table[state] ?? state.replaceAll("_", " ");
}

/** True when mentor, ward and lifecycle changes are no longer possible. */
export function isPlacementClosed(state: string): boolean {
  return state === "completed" || state === "archived" || state === "withdrawn";
}

export function placementJourney(state: string, audience: JourneyAudience = "learner"): PlacementJourney {
  const defs = audience === "learner" ? LEARNER_STAGES : STAFF_STAGES;
  const summary = (audience === "learner" ? LEARNER_SUMMARY : STAFF_SUMMARY)[state] ?? "Placement status is being updated.";
  const statusLabel = placementStateLabel(state, audience);

  if (state === "withdrawn") {
    return {
      stages: [
        ...defs.map((def) => ({ key: def.key, label: def.label, status: "upcoming" as const })),
        { key: "withdrawn", label: "Withdrawn", status: "stopped" as const },
      ],
      currentIndex: -1,
      progressLabel: "Withdrawn",
      statusLabel,
      summary,
      finished: true,
      interrupted: "withdrawn",
      closed: true,
    };
  }

  const rank = RANK[state] ?? 0;
  const paused = state === "paused";
  const stages: JourneyStage[] = defs.map((def) => {
    if (rank >= def.completeAt) return { key: def.key, label: def.label, status: "done" };
    if (rank >= def.startAt) return { key: def.key, label: def.label, status: paused ? "attention" : "current" };
    return { key: def.key, label: def.label, status: "upcoming" };
  });
  const currentIndex = stages.findIndex((stage) => stage.status === "current" || stage.status === "attention");
  const finished = rank >= 6;
  return {
    stages,
    currentIndex: finished ? -1 : currentIndex,
    progressLabel: finished
      ? state === "archived"
        ? "Archived"
        : "Completed"
      : paused
        ? "Paused"
        : `Step ${currentIndex + 1} of ${stages.length}`,
    statusLabel,
    summary,
    finished,
    interrupted: paused ? "paused" : null,
    closed: isPlacementClosed(state),
  };
}
