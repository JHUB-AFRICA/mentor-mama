/** Induction checklist template editor (Programme Administrator). Mentor-facing helpers live at the bottom. */
import { request } from "./api";

export type TemplateStatus = "draft" | "published" | "retired" | "discarded";
export type CompletedByRole = "mentor" | "nurse_manager" | "mentor_or_nurse_manager" | "mentor_and_student";
export type ResponseKind = "standard" | "scheduled_date";

export const COMPLETED_BY_OPTIONS: Array<{ value: CompletedByRole; label: string }> = [
  { value: "mentor", label: "Mentor" },
  { value: "nurse_manager", label: "Nurse manager" },
  { value: "mentor_or_nurse_manager", label: "Mentor or nurse manager" },
  { value: "mentor_and_student", label: "Mentor and student" },
];

export const TEMPLATE_LIMITS = { items: 60, label: 300, guidance: 600, section: 80, title: 120, notes: 1000, minLabel: 5 } as const;

export interface TemplateItem {
  id?: string;
  position?: number;
  section: string;
  label: string;
  guidance: string;
  is_required: boolean;
  completed_by_role: CompletedByRole;
  response_kind: ResponseKind;
}

export interface TemplateIssue {
  code: string;
  message: string;
  /** Zero-based index into the item list, or null for the checklist as a whole. */
  item: number | null;
  field: string | null;
}

export interface TemplateSummary {
  id: string;
  version: number;
  status: TemplateStatus;
  title: string;
  notes: string;
  source: string;
  created_at: string;
  published_at: string | null;
  retired_at: string | null;
  item_count: number;
  required_count: number;
  checklists: { in_progress: number; completed: number };
  editable: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  items: TemplateItem[];
  issues: TemplateIssue[];
}

export interface TemplateOverview {
  live: TemplateSummary | null;
  draft: TemplateSummary | null;
  versions: TemplateSummary[];
}

export interface EnhancedDraftPreview {
  title: string;
  notes: string;
  items: TemplateItem[];
  issues: TemplateIssue[];
}

const base = "/api/v1/induction/templates";

export async function getTemplateOverview(): Promise<TemplateOverview> {
  return (await request<{ data: TemplateOverview }>(base)).data;
}

export async function getTemplate(id: string): Promise<TemplateDetail> {
  return (await request<{ data: TemplateDetail }>(`${base}/${id}`)).data;
}

export async function getEnhancedDraft(): Promise<EnhancedDraftPreview> {
  return (await request<{ data: EnhancedDraftPreview }>(`${base}/enhanced-draft`)).data;
}

export async function createTemplateDraft(
  mode: "blank" | "clone" | "enhanced",
  fromVersionId?: string,
): Promise<TemplateDetail> {
  const response = await request<{ data: TemplateDetail }>(base, {
    method: "POST",
    body: JSON.stringify({ mode, from_version_id: fromVersionId ?? null }),
  });
  return response.data;
}

export async function saveTemplateDraft(
  id: string,
  input: { title: string; notes: string; items: TemplateItem[] },
): Promise<TemplateDetail> {
  const items = input.items.map(({ section, label, guidance, is_required, completed_by_role, response_kind }) => ({
    section, label, guidance, is_required, completed_by_role, response_kind,
  }));
  const response = await request<{ data: TemplateDetail }>(`${base}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ title: input.title, notes: input.notes, items }),
  });
  return response.data;
}

async function templateCommand(id: string, action: "publish" | "discard" | "restore" | "validate") {
  return (await request<{ data: TemplateDetail }>(`${base}/${id}/${action}`, { method: "POST", body: "{}" })).data;
}

export const publishTemplate = (id: string) => templateCommand(id, "publish");
export const discardTemplate = (id: string) => templateCommand(id, "discard");
export const restoreTemplate = (id: string) => templateCommand(id, "restore");

// -- client-side mirror of the server rules, so people see problems as they type -------------------
export function validateDraft(items: TemplateItem[]): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const add = (code: string, message: string, item: number | null = null, field: string | null = null) =>
    issues.push({ code, message, item, field });
  if (!items.length) add("no_items", "Add at least one checklist item.");
  if (items.length > TEMPLATE_LIMITS.items) add("too_many_items", `A checklist can have at most ${TEMPLATE_LIMITS.items} items.`);
  if (items.length && !items.some((item) => item.is_required)) {
    add("no_required_item", "Mark at least one item as required, or no one has to complete the induction.");
  }
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const label = item.label.replace(/\s+/g, " ").trim();
    if (!label) add("label_empty", "Write the item text.", index, "label");
    else if (label.length < TEMPLATE_LIMITS.minLabel) add("label_too_short", "Make the item text a little clearer.", index, "label");
    else if (label.length > TEMPLATE_LIMITS.label) add("label_too_long", `Keep item text under ${TEMPLATE_LIMITS.label} characters. Move detail into the guidance.`, index, "label");
    if (label) {
      const key = label.toLowerCase().replace(/[. ]+$/, "");
      const earlier = seen.get(key);
      if (earlier !== undefined) add("duplicate_label", `This is the same as item ${earlier + 1}.`, index, "label");
      else seen.set(key, index);
    }
    if (item.guidance.length > TEMPLATE_LIMITS.guidance) add("guidance_too_long", `Keep guidance under ${TEMPLATE_LIMITS.guidance} characters.`, index, "guidance");
    if (item.section.length > TEMPLATE_LIMITS.section) add("section_too_long", `Keep section names under ${TEMPLATE_LIMITS.section} characters.`, index, "section");
  });
  return issues;
}

// -- mentor-facing: extra fields the API adds to checklist items (old templates return empty values) ----
export interface ItemExtras {
  section?: string;
  guidance?: string;
  response_kind?: string;
  completed_by_role?: string;
}

export function itemExtras<T extends object>(item: T): ItemExtras {
  return item as ItemExtras;
}

/** "2026-07-02T09:00" from a datetime-local input becomes "2026-07-02 09:00" for the note. */
export function agreedDateText(value: string): string {
  return value.replace("T", " ");
}
