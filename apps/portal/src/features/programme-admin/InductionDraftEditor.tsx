import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { Field, Modal, SelectInput, TextArea, TextInput } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import {
  COMPLETED_BY_OPTIONS,
  TEMPLATE_LIMITS,
  discardTemplate,
  publishTemplate,
  saveTemplateDraft,
  validateDraft,
  type CompletedByRole,
  type TemplateDetail,
  type TemplateIssue,
  type TemplateItem,
  type TemplateSummary,
} from "../../services/induction-templates";
import { InductionPreview } from "./InductionPreview";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, AdminTabs, Notice, StatusPill } from "./ui/AdminKit";
import "./induction-editor.css";

interface EditorItem extends TemplateItem {
  key: string;
}
interface EditorSection {
  key: string;
  title: string;
  items: EditorItem[];
}

let counter = 0;
const nextKey = () => `k${++counter}`;

function toSections(items: TemplateItem[]): EditorSection[] {
  const sections: EditorSection[] = [];
  for (const item of items) {
    let section = sections.find((candidate) => candidate.title === item.section);
    if (!section) {
      section = { key: nextKey(), title: item.section, items: [] };
      sections.push(section);
    }
    section.items.push({ ...item, key: nextKey() });
  }
  return sections;
}

function flatten(sections: EditorSection[]): TemplateItem[] {
  return sections.flatMap((section) =>
    section.items.map(({ key: _key, ...item }) => ({ ...item, section: section.title.trim() })),
  );
}

const blankItem = (): EditorItem => ({
  key: nextKey(), section: "", label: "", guidance: "", is_required: true,
  completed_by_role: "mentor", response_kind: "standard",
});

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [picked] = copy.splice(from, 1);
  copy.splice(to, 0, picked);
  return copy;
}

export function InductionDraftEditor({
  draft,
  live,
  onClose,
  onError,
}: {
  draft: TemplateDetail;
  live: TemplateSummary | null;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [title, setTitle] = useState(draft.title);
  const [notes, setNotes] = useState(draft.notes);
  const [sections, setSections] = useState<EditorSection[]>(() => toSections(draft.items));
  const [dirty, setDirty] = useState(false);
  const [serverIssues, setServerIssues] = useState<TemplateIssue[]>(draft.issues);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [dialog, setDialog] = useState<null | "publish" | "discard" | "leave">(null);
  const [showProblems, setShowProblems] = useState(false);
  const problemsRef = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => flatten(sections), [sections]);
  const clientIssues = useMemo(() => validateDraft(flat), [flat]);
  // Server-only rules (such as patient identifiers) show until the next edit, then return on save.
  const issues = useMemo(() => {
    const seen = new Set(clientIssues.map((issue) => `${issue.code}:${issue.item}`));
    return [...clientIssues, ...(dirty ? [] : serverIssues).filter((issue) => !seen.has(`${issue.code}:${issue.item}`))];
  }, [clientIssues, serverIssues, dirty]);
  const issuesByItem = useMemo(() => {
    const map = new Map<number, TemplateIssue[]>();
    issues.forEach((issue) => {
      if (issue.item !== null) map.set(issue.item, [...(map.get(issue.item) ?? []), issue]);
    });
    return map;
  }, [issues]);
  const generalIssues = issues.filter((issue) => issue.item === null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (update: (current: EditorSection[]) => EditorSection[]) => {
    setSections(update);
    setDirty(true);
  };
  const patchItem = (sectionKey: string, itemKey: string, patch: Partial<TemplateItem>) =>
    edit((current) => current.map((section) => section.key !== sectionKey ? section : {
      ...section, items: section.items.map((item) => item.key === itemKey ? { ...item, ...patch } : item),
    }));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["induction-templates"] });
  };

  const save = useMutation({
    mutationFn: () => saveTemplateDraft(draft.id, { title, notes, items: flat }),
    onSuccess: (saved) => {
      setServerIssues(saved.issues);
      setDirty(false);
      refresh();
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not save the draft."),
  });
  const publish = useMutation({
    mutationFn: () => publishTemplate(draft.id),
    onSuccess: (published) => {
      pushToast({ kind: "success", title: `Version ${published.version} is now live`, message: "New inductions will use it. Checklists already open keep their own version." });
      refresh();
      onClose();
    },
    onError: (cause) => {
      setDialog(null);
      onError(cause instanceof Error ? cause.message : "We could not publish this version.");
      refresh();
    },
  });
  const discard = useMutation({
    mutationFn: () => discardTemplate(draft.id),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Draft discarded", message: "The live checklist was not changed." });
      refresh();
      onClose();
    },
    onError: (cause) => {
      setDialog(null);
      onError(cause instanceof Error ? cause.message : "We could not discard the draft.");
    },
  });

  async function startPublish() {
    setShowProblems(true);
    if (clientIssues.length) {
      problemsRef.current?.focus();
      return;
    }
    if (dirty) {
      const saved = await save.mutateAsync().catch(() => null);
      if (!saved || saved.issues.length) {
        problemsRef.current?.focus();
        return;
      }
    } else if (serverIssues.length) {
      problemsRef.current?.focus();
      return;
    }
    setDialog("publish");
  }

  function jumpTo(index: number | null) {
    if (index === null) return;
    document.getElementById(`ice-item-${index}`)?.scrollIntoView({ block: "center" });
    (document.querySelector(`#ice-item-${index} textarea`) as HTMLElement | null)?.focus();
  }

  const sectionNames = sections.map((section) => section.title).filter(Boolean);
  let counterIndex = -1;
  const busy = save.isPending || publish.isPending || discard.isPending;
  const inProgress = live?.checklists.in_progress ?? 0;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Induction checklist"
        title={`Draft version ${draft.version}`}
        description="Edit the draft, check how it looks to a mentor, then publish it. The live checklist does not change until you publish."
        meta={<StatusPill tone="warning">Draft{dirty ? " · unsaved changes" : ""}</StatusPill>}
        actions={
          <>
            <AdminButton variant="ghost" icon={<ArrowLeft />} onClick={() => (dirty ? setDialog("leave") : onClose())}>Back</AdminButton>
            <AdminButton variant="secondary" icon={<Save />} disabled={busy || !dirty} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save draft"}
            </AdminButton>
            <AdminButton icon={<Rocket />} disabled={busy} onClick={() => void startPublish()}>Publish</AdminButton>
          </>
        }
      />
      <Notice icon={<Eye />}>
        This is an orientation checklist. Do not write wording that asks for patient names, hospital numbers or other identifiers: MentorMAMA never records them.
      </Notice>

      {showProblems && issues.length > 0 && (
        <div className="ice-problems" role="alert" tabIndex={-1} ref={problemsRef}>
          <h3>Fix {issues.length} {issues.length === 1 ? "problem" : "problems"} before publishing</h3>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.item}-${index}`}>
                {issue.item !== null ? <button type="button" onClick={() => jumpTo(issue.item)}>Item {issue.item + 1}</button> : "Checklist"}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AdminTabs
        label="Draft view"
        value={tab}
        onChange={setTab}
        tabs={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview as mentor", icon: <Eye size={15} aria-hidden="true" /> }]}
      />

      {tab === "preview" ? (
        <InductionPreview title={title} items={flat} />
      ) : (
        <div className="ice-stack">
          <AdminCard title="Details" description="Only the programme team sees these. Mentors see the items.">
            <Field label="Name for this version" optional hint="For example, Labour ward induction, January 2027.">
              <TextInput value={title} maxLength={TEMPLATE_LIMITS.title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} />
            </Field>
            <Field label="Notes for the programme team" optional hint="What changed, or why. Not shown to mentors.">
              <TextArea rows={2} value={notes} maxLength={TEMPLATE_LIMITS.notes} onChange={(event) => { setNotes(event.target.value); setDirty(true); }} />
            </Field>
            {generalIssues.length > 0 && showProblems && (
              <p className="ui-field__error" role="note">{generalIssues.map((issue) => issue.message).join(" ")}</p>
            )}
          </AdminCard>

          {sections.length === 0 && (
            <p className="pa-description">This draft has no items yet. Add a section to begin.</p>
          )}

          {sections.map((section, sectionIndex) => (
            <section key={section.key} className="ice-section" aria-label={section.title || "Items without a section"}>
              <div className="ice-section__head">
                <Field label="Section name" optional hint="Groups related items for the mentor.">
                  <TextInput
                    value={section.title}
                    maxLength={TEMPLATE_LIMITS.section}
                    onChange={(event) => edit((current) => current.map((candidate) => candidate.key === section.key ? { ...candidate, title: event.target.value } : candidate))}
                  />
                </Field>
                <div className="ice-section__tools">
                  <AdminButton size="sm" variant="secondary" icon={<ArrowUp />} disabled={sectionIndex === 0} aria-label={`Move section ${section.title || sectionIndex + 1} up`} onClick={() => edit((current) => move(current, sectionIndex, sectionIndex - 1))}>Up</AdminButton>
                  <AdminButton size="sm" variant="secondary" icon={<ArrowDown />} disabled={sectionIndex === sections.length - 1} aria-label={`Move section ${section.title || sectionIndex + 1} down`} onClick={() => edit((current) => move(current, sectionIndex, sectionIndex + 1))}>Down</AdminButton>
                  <AdminButton size="sm" variant="ghost" icon={<Trash2 />} disabled={section.items.length > 0} title={section.items.length ? "Remove or move the items first" : undefined} aria-label={`Remove section ${section.title || sectionIndex + 1}`} onClick={() => edit((current) => current.filter((candidate) => candidate.key !== section.key))}>Remove</AdminButton>
                </div>
              </div>
              <ol className="ice-items">
                {section.items.map((item, itemIndex) => {
                  counterIndex += 1;
                  const index = counterIndex;
                  const itemIssues = issuesByItem.get(index) ?? [];
                  const fieldError = (name: string) => itemIssues.find((issue) => issue.field === name)?.message;
                  return (
                    <li key={item.key} id={`ice-item-${index}`} className={`ice-item${itemIssues.length ? " ice-item--flagged" : ""}`}>
                      <div className="ice-item__top">
                        <span className="ice-item__num" aria-hidden="true">{index + 1}</span>
                        <Field label={`Item ${index + 1} text`} required error={fieldError("label")} hint={`${item.label.length}/${TEMPLATE_LIMITS.label} characters`}>
                          <TextArea rows={2} value={item.label} onChange={(event) => patchItem(section.key, item.key, { label: event.target.value })} />
                        </Field>
                      </div>
                      <div className="ice-item__options">
                        <label className="ice-check">
                          <input type="checkbox" checked={item.is_required} onChange={(event) => patchItem(section.key, item.key, { is_required: event.target.checked })} />
                          <span>Required before the placement can start</span>
                        </label>
                        <Field label="Completed by" error={fieldError("completed_by_role")}>
                          <SelectInput value={item.completed_by_role} onChange={(event) => patchItem(section.key, item.key, { completed_by_role: event.target.value as CompletedByRole })}>
                            {COMPLETED_BY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </SelectInput>
                        </Field>
                        <Field label="Move to section">
                          <SelectInput
                            value={section.key}
                            onChange={(event) => {
                              const target = event.target.value;
                              if (target === section.key) return;
                              edit((current) => current.map((candidate) => {
                                if (candidate.key === section.key) return { ...candidate, items: candidate.items.filter((entry) => entry.key !== item.key) };
                                if (candidate.key === target) return { ...candidate, items: [...candidate.items, item] };
                                return candidate;
                              }));
                            }}
                          >
                            {sections.map((option, optionIndex) => <option key={option.key} value={option.key}>{option.title || `Section ${optionIndex + 1} (no name)`}</option>)}
                          </SelectInput>
                        </Field>
                      </div>
                      <label className="ice-check">
                        <input type="checkbox" checked={item.response_kind === "scheduled_date"} onChange={(event) => patchItem(section.key, item.key, { response_kind: event.target.checked ? "scheduled_date" : "standard" })} />
                        <span>Mentor must add an agreed date and time (for example, the first mentorship session)</span>
                      </label>
                      <Field label="Guidance for the mentor" optional error={fieldError("guidance")} hint={`${item.guidance.length}/${TEMPLATE_LIMITS.guidance} characters`}>
                        <TextArea rows={2} value={item.guidance} onChange={(event) => patchItem(section.key, item.key, { guidance: event.target.value })} />
                      </Field>
                      <div className="ice-item__tools">
                        <AdminButton size="sm" variant="secondary" icon={<ArrowUp />} disabled={itemIndex === 0} aria-label={`Move item ${index + 1} up`} onClick={() => edit((current) => current.map((candidate) => candidate.key === section.key ? { ...candidate, items: move(candidate.items, itemIndex, itemIndex - 1) } : candidate))}>Up</AdminButton>
                        <AdminButton size="sm" variant="secondary" icon={<ArrowDown />} disabled={itemIndex === section.items.length - 1} aria-label={`Move item ${index + 1} down`} onClick={() => edit((current) => current.map((candidate) => candidate.key === section.key ? { ...candidate, items: move(candidate.items, itemIndex, itemIndex + 1) } : candidate))}>Down</AdminButton>
                        <AdminButton size="sm" variant="ghost" icon={<Trash2 />} aria-label={`Remove item ${index + 1}`} onClick={() => edit((current) => current.map((candidate) => candidate.key === section.key ? { ...candidate, items: candidate.items.filter((entry) => entry.key !== item.key) } : candidate))}>Remove</AdminButton>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="ice-item" style={{ borderBottom: 0 }}>
                <div><AdminButton size="sm" variant="secondary" icon={<Plus />} disabled={flat.length >= TEMPLATE_LIMITS.items} onClick={() => edit((current) => current.map((candidate) => candidate.key === section.key ? { ...candidate, items: [...candidate.items, blankItem()] } : candidate))}>Add item{section.title ? ` to ${section.title}` : ""}</AdminButton></div>
              </div>
            </section>
          ))}

          <div className="pa-row-actions">
            <AdminButton variant="secondary" icon={<Plus />} onClick={() => edit((current) => [...current, { key: nextKey(), title: "", items: [blankItem()] }])}>Add section</AdminButton>
            <AdminButton variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => setDialog("discard")}>Discard this draft</AdminButton>
          </div>
          {sectionNames.length !== new Set(sectionNames).size && (
            <p className="pa-description" role="note">Two sections share a name. Mentors will see their items together under one heading.</p>
          )}
        </div>
      )}

      <Modal
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        dismissible={!publish.isPending}
        title={`Publish version ${draft.version}?`}
        description="This becomes the checklist for new inductions."
        footer={
          <>
            <AdminButton variant="ghost" disabled={publish.isPending} onClick={() => setDialog(null)}>Keep editing</AdminButton>
            <AdminButton icon={<Rocket />} disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? "Publishing…" : "Publish version"}</AdminButton>
          </>
        }
      >
        <ul className="ice-impact">
          <li>Students who start induction from now on use version {draft.version} ({flat.length} items, {flat.filter((item) => item.is_required).length} required).</li>
          <li>
            {inProgress > 0
              ? `${inProgress} ${inProgress === 1 ? "checklist is" : "checklists are"} in progress and keep the version they started with. Nothing already answered or signed changes.`
              : "No checklists are in progress, so nobody is affected mid-way."}
          </li>
          {live && <li>Version {live.version} is retired for new inductions. You can restore it later as a new draft.</li>}
          <li>Published versions cannot be edited. To change this one later, start a new draft.</li>
        </ul>
      </Modal>

      <Modal
        open={dialog === "discard"}
        onClose={() => setDialog(null)}
        dismissible={!discard.isPending}
        title="Discard this draft?"
        description="Your edits will be lost. The live checklist is not affected."
        footer={
          <>
            <AdminButton variant="ghost" disabled={discard.isPending} onClick={() => setDialog(null)}>Keep draft</AdminButton>
            <AdminButton icon={<Trash2 />} disabled={discard.isPending} onClick={() => discard.mutate()}>{discard.isPending ? "Discarding…" : "Discard draft"}</AdminButton>
          </>
        }
      >
        <p className="pa-description">The draft is removed from the list. Version numbers are not reused.</p>
      </Modal>

      <Modal
        open={dialog === "leave"}
        onClose={() => setDialog(null)}
        title="Leave without saving?"
        description="You have changes that are not saved."
        footer={
          <>
            <AdminButton variant="ghost" onClick={() => setDialog(null)}>Keep editing</AdminButton>
            <AdminButton variant="secondary" onClick={onClose}>Leave without saving</AdminButton>
            <AdminButton icon={<Save />} disabled={save.isPending} onClick={() => void save.mutateAsync().then(onClose).catch(() => setDialog(null))}>Save and leave</AdminButton>
          </>
        }
      >
        <p className="pa-description">Your last saved draft stays available from the Induction checklist page.</p>
      </Modal>
    </AdminPage>
  );
}
