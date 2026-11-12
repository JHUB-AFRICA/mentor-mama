import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Copy, Eye, FilePenLine, History, ListChecks, Sparkles, Users } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Modal } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  createTemplateDraft,
  getTemplate,
  getTemplateOverview,
  restoreTemplate,
  type TemplateDetail,
  type TemplateStatus,
  type TemplateSummary,
} from "../../services/induction-templates";
import { InductionDraftEditor } from "./InductionDraftEditor";
import { InductionPreview } from "./InductionPreview";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, ListRow, Notice, StatCard, StatGrid, StatusPill, type PillTone } from "./ui/AdminKit";
import "./induction-editor.css";

const statusLabel: Record<TemplateStatus, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "warning" },
  published: { label: "Live", tone: "success" },
  retired: { label: "Retired", tone: "neutral" },
  discarded: { label: "Discarded", tone: "neutral" },
};

const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const versionName = (version: TemplateSummary) => `Version ${version.version}${version.title ? ` · ${version.title}` : ""}`;

/** Programme Administrator page: the live induction checklist, its history, and the draft editor. */
export function InductionTemplateEditor({ onError }: { onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [editing, setEditing] = useState<TemplateDetail | null>(null);
  const [viewing, setViewing] = useState<TemplateSummary | null>(null);
  const overview = useQuery({ queryKey: ["induction-templates"], queryFn: getTemplateOverview });
  const viewed = useQuery({
    queryKey: ["induction-template", viewing?.id],
    queryFn: () => getTemplate(viewing!.id),
    enabled: Boolean(viewing),
  });

  const start = useMutation({
    mutationFn: (input: { mode: "blank" | "clone" | "enhanced"; from?: string }) => createTemplateDraft(input.mode, input.from),
    onSuccess: (draft) => {
      void queryClient.invalidateQueries({ queryKey: ["induction-templates"] });
      pushToast({ kind: "success", title: "Draft started", message: "Nothing changes for mentors until you publish it." });
      setEditing(draft);
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not start a draft."),
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreTemplate(id),
    onSuccess: (draft) => {
      void queryClient.invalidateQueries({ queryKey: ["induction-templates"] });
      pushToast({ kind: "success", title: "Restored as a new draft", message: "The old version itself is unchanged." });
      setEditing(draft);
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not restore that version."),
  });
  const openDraft = useMutation({
    mutationFn: (id: string) => getTemplate(id),
    onSuccess: setEditing,
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not open the draft."),
  });

  if (editing) {
    return (
      <InductionDraftEditor
        key={editing.id}
        draft={editing}
        live={overview.data?.live ?? null}
        onClose={() => setEditing(null)}
        onError={onError}
      />
    );
  }

  const data = overview.data;
  const live = data?.live ?? null;
  const draft = data?.draft ?? null;
  const busy = start.isPending || restore.isPending || openDraft.isPending;
  const history = (data?.versions ?? []).filter((version) => version.status !== "draft");

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Govern"
        title="Induction checklist"
        description="The checklist a mentor works through with each student before a placement becomes active. Change it by starting a draft, then publish it when the clinical team agrees."
      />
      <Notice icon={<ListChecks />}>
        Publishing affects new inductions only. Checklists already open keep the version they started with, and published versions are never edited. Never ask for patient names or identifiers in an item.
      </Notice>

      {overview.isPending ? (
        <div className="ice-skeletons" role="status" aria-label="Loading the induction checklist">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : overview.isError ? (
        <PortalErrorState title="We couldn’t load the induction checklist" onRetry={() => void overview.refetch()} />
      ) : (
        <div className="ice-stack">
          {draft && (
            <AdminCard
              title={`Draft in progress · version ${draft.version}`}
              description={`${draft.item_count} items · started ${dateText(draft.created_at)}. Mentors do not see it until it is published.`}
              action={<StatusPill tone="warning">Draft</StatusPill>}
              footer={<AdminButton icon={<FilePenLine />} disabled={busy} onClick={() => openDraft.mutate(draft.id)}>{openDraft.isPending ? "Opening…" : "Continue editing"}</AdminButton>}
            >
              <p className="pa-description">Only one draft can be open at a time. Publish it or discard it to start another.</p>
            </AdminCard>
          )}

          {live ? (
            <AdminCard
              title={`Live now · ${versionName(live)}`}
              description={`Published ${dateText(live.published_at)}. New students are given this checklist.`}
              action={<StatusPill tone="success">Live</StatusPill>}
              footer={<AdminButton variant="secondary" icon={<Eye />} onClick={() => setViewing(live)}>Preview as mentor</AdminButton>}
            >
              <StatGrid columns={4}>
                <StatCard icon={<ClipboardList />} tone="teal" value={live.item_count} label="Items" />
                <StatCard icon={<CheckCircle2 />} tone="green" value={live.required_count} label="Required" />
                <StatCard icon={<Users />} tone="amber" value={live.checklists.in_progress} label="In progress" />
                <StatCard icon={<CheckCircle2 />} tone="blue" value={live.checklists.completed} label="Signed" />
              </StatGrid>
            </AdminCard>
          ) : (
            <EmptyState
              icon={<ClipboardList />}
              title="No checklist is live yet"
              text="New programmes receive the standard eight-item checklist from the concept note when the programme is set up. You can start your own draft below."
            />
          )}

          <AdminCard title="Start a draft" description={draft ? "Finish or discard the current draft first." : "A draft is private until you publish it."}>
            <div className="ice-start">
              <button type="button" className="ice-start__option" disabled={busy || Boolean(draft) || !live} onClick={() => live && start.mutate({ mode: "clone", from: live.id })}>
                <Copy size={20} aria-hidden="true" />
                <span className="ice-start__title">Copy the live version</span>
                <span className="ice-start__text">Make small changes to what mentors use today.</span>
              </button>
              <button type="button" className="ice-start__option" disabled={busy || Boolean(draft)} onClick={() => start.mutate({ mode: "enhanced" })}>
                <Sparkles size={20} aria-hidden="true" />
                <span className="ice-start__title">Start from the enhanced draft</span>
                <span className="ice-start__text">A detailed starting point with eight sections covering safety, emergencies, respectful care and learning, for the clinical team to review.</span>
                <span className="ice-start__tag">For clinical review</span>
              </button>
              <button type="button" className="ice-start__option" disabled={busy || Boolean(draft)} onClick={() => start.mutate({ mode: "blank" })}>
                <FilePenLine size={20} aria-hidden="true" />
                <span className="ice-start__title">Start blank</span>
                <span className="ice-start__text">Write your own checklist from nothing.</span>
              </button>
            </div>
          </AdminCard>

          <AdminCard title="Version history" description="Every version is kept. Restoring one creates a new draft; the old version is not changed.">
            {history.length === 0 ? (
              <EmptyState icon={<History />} title="No versions yet" text="Published versions appear here." />
            ) : (
              <div className="pa-list">
                {history.map((version) => (
                  <ListRow
                    key={version.id}
                    icon={<History />}
                    tone={version.status === "published" ? "green" : "slate"}
                    title={versionName(version)}
                    meta={`${version.item_count} items · ${version.checklists.in_progress} in progress · ${version.checklists.completed} signed · ${version.published_at ? `published ${dateText(version.published_at)}` : ""}`}
                    trailing={
                      <span className="pa-row-actions">
                        <StatusPill tone={statusLabel[version.status].tone}>{statusLabel[version.status].label}</StatusPill>
                        <AdminButton size="sm" variant="ghost" icon={<Eye />} aria-label={`View ${versionName(version)}`} onClick={() => setViewing(version)}>View</AdminButton>
                        <AdminButton size="sm" variant="secondary" icon={<Copy />} disabled={busy || Boolean(draft)} title={draft ? "Finish or discard the current draft first" : undefined} aria-label={`Restore ${versionName(version)} as a new draft`} onClick={() => restore.mutate(version.id)}>Restore as draft</AdminButton>
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </AdminCard>
        </div>
      )}

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        size="lg"
        title={viewing ? versionName(viewing) : "Version"}
        description={viewing ? `${statusLabel[viewing.status].label} · read only` : undefined}
        footer={<AdminButton variant="secondary" onClick={() => setViewing(null)}>Close</AdminButton>}
      >
        {viewed.isPending ? (
          <div className="ice-skeletons" role="status" aria-label="Loading version"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : viewed.isError ? (
          <p className="pa-description" role="alert">We couldn’t load this version. Close and try again.</p>
        ) : (
          <InductionPreview title={viewed.data.title} items={viewed.data.items} />
        )}
      </Modal>
    </AdminPage>
  );
}
