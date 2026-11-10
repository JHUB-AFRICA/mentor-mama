/** Shared labels and audience helpers for library content and learning modules. */

export type AudienceGroup = "mentor" | "student" | "staff";

export const audienceOptions: Array<{ value: AudienceGroup; label: string; hint: string; roles: string[] }> = [
  { value: "mentor", label: "Mentors", hint: "Clinical mentors", roles: ["mentor"] },
  { value: "student", label: "Students", hint: "Placement students", roles: ["student"] },
  { value: "staff", label: "Programme staff", hint: "Coordinators and nurse managers", roles: ["coordinator", "nurse_manager"] },
];

export function rolesFromGroups(groups: AudienceGroup[]): string[] {
  return audienceOptions.filter((option) => groups.includes(option.value)).flatMap((option) => option.roles);
}

export function groupsFromRoles(roles: string[] | undefined): AudienceGroup[] {
  const set = new Set(roles ?? []);
  return audienceOptions.filter((option) => option.roles.some((role) => set.has(role))).map((option) => option.value);
}

/** e.g. ["Mentors", "Students"] — an empty audience reads as "Admins only". */
export function audienceLabels(roles: string[] | undefined): string[] {
  const groups = groupsFromRoles(roles);
  return audienceOptions.filter((option) => groups.includes(option.value)).map((option) => option.label);
}

export function audienceSummary(roles: string[] | undefined): string {
  const labels = audienceLabels(roles);
  if (labels.length === 0) return "Admins only";
  if (labels.length === audienceOptions.length) return "Everyone";
  return labels.join(", ");
}

export function categoryLabel(value: string | undefined) {
  if (!value) return "General";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function kindLabel(kind: string) {
  return kind === "module" ? "Learning module" : kind === "external" ? "External resource" : kind[0].toUpperCase() + kind.slice(1);
}

export function statusLabel(status: string | undefined) {
  return status ? status[0].toUpperCase() + status.slice(1) : "Draft";
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatMinutes(total: number | undefined) {
  if (!total) return "—";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}
