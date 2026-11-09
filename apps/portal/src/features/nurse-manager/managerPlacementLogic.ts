import type { Placement } from "../../services/api";

export type ManagerPlacementAction = {
  label: string;
  detail: string;
  actionable: boolean;
};

export function managerPlacementAction(
  placement: Placement,
): ManagerPlacementAction {
  const terminal: Record<string, string> = {
    completed: "Placement completed",
    archived: "Placement archived",
    withdrawn: "Placement withdrawn",
  };
  if (terminal[placement.state]) {
    return {
      label: terminal[placement.state],
      detail: "Monitor only",
      actionable: false,
    };
  }
  if (!placement.ward) {
    return {
      label: "Allocate a ward",
      detail: "Facility decision",
      actionable: true,
    };
  }
  if (!placement.mentor) {
    return {
      label: "Assign a mentor",
      detail: "Facility decision",
      actionable: true,
    };
  }
  if (placement.state === "paused") {
    return {
      label: "Review paused placement",
      detail: "Facility decision",
      actionable: true,
    };
  }
  const waiting: Record<string, string> = {
    awaiting_student: "Awaiting student confirmation",
    orientation: "Awaiting student orientation",
    induction: "Awaiting induction completion",
    scheduled: "Awaiting programme release",
    draft: "Awaiting programme setup",
    active: "Monitor active placement",
  };
  const label = waiting[placement.state] ?? "Review placement";
  return {
    label,
    detail: label.startsWith("Awaiting")
      ? "Waiting on another owner"
      : "Monitor only",
    actionable: false,
  };
}

export function isManagerActionablePlacement(placement: Placement) {
  return managerPlacementAction(placement).actionable;
}
