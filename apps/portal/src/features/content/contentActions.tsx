/**
 * Shared lifecycle actions for library content and learning modules.
 *
 * Library rows and the detail page use the same rules, confirmations and
 * messages, so an item behaves identically wherever it is managed:
 *   draft ──publish──▶ published ──unpublish──▶ draft
 *   draft/published ──archive──▶ archived ──restore──▶ draft
 *   draft/archived ──delete──▶ gone (modules with learner records cannot be deleted)
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { Modal } from "../../components/kit";
import { AdminButton } from "../programme-admin/ui/AdminKit";
import { useToast } from "../../components/ToastProvider";
import {
  ApiError,
  archiveContentItem,
  archiveTrainingModule,
  deleteContentItem,
  deleteTrainingModule,
  duplicateContentItem,
  duplicateTrainingModule,
  publishContentItem,
  publishTrainingModule,
  unpublishContentItem,
  unpublishTrainingModule,
} from "../../services/api";

export type ContentKindKey = "guide" | "module" | "document" | "external";
export type ContentStatus = "draft" | "published" | "archived";
export type ContentAction = "publish" | "unpublish" | "archive" | "restore" | "duplicate" | "delete";

export interface ActionTarget {
  kind: ContentKindKey;
  id: string;
  title: string;
  status: ContentStatus;
}

export const actionMeta: Record<ContentAction, { label: string; icon: ReactNode; danger?: boolean }> = {
  publish: { label: "Publish", icon: <Eye size={15} /> },
  unpublish: { label: "Unpublish", icon: <EyeOff size={15} /> },
  archive: { label: "Archive", icon: <Archive size={15} /> },
  restore: { label: "Restore as draft", icon: <ArchiveRestore size={15} /> },
  duplicate: { label: "Duplicate", icon: <Copy size={15} /> },
  delete: { label: "Delete", icon: <Trash2 size={15} />, danger: true },
};

/** Which lifecycle actions make sense for an item in this state. */
export function actionsFor(status: ContentStatus): ContentAction[] {
  if (status === "published") return ["unpublish", "duplicate", "archive"];
  if (status === "archived") return ["restore", "duplicate", "delete"];
  return ["publish", "duplicate", "archive", "delete"];
}

const needsConfirmation: ContentAction[] = ["unpublish", "archive", "delete"];

function kindNoun(kind: ContentKindKey) {
  return kind === "module" ? "learning module" : kind === "external" ? "external resource" : kind;
}

function confirmCopy(action: ContentAction, target: ActionTarget) {
  const noun = kindNoun(target.kind);
  const title = `“${target.title}”`;
  if (action === "unpublish")
    return {
      heading: `Unpublish this ${noun}?`,
      body: `${title} will be hidden from its audience and return to draft. ${
        target.kind === "module" ? "Completion records already earned are kept. " : ""
      }You can publish it again at any time.`,
      confirm: "Unpublish",
    };
  if (action === "archive")
    return {
      heading: `Archive this ${noun}?`,
      body: `${title} will be removed from the library for everyone except programme admins. Nothing is deleted, and you can restore it later.`,
      confirm: "Archive",
    };
  return {
    heading: `Delete this ${noun}?`,
    body: `${title} will be permanently deleted. This cannot be undone.${
      target.kind === "module" ? " Modules that learners have already started can only be archived." : ""
    }`,
    confirm: "Delete permanently",
  };
}

const SUCCESS: Record<ContentAction, string> = {
  publish: "Published",
  unpublish: "Unpublished",
  archive: "Archived",
  restore: "Restored as draft",
  duplicate: "Duplicate created",
  delete: "Deleted",
};

export function useContentActions({
  onError,
  onDuplicated,
  onDeleted,
  onChanged,
}: {
  onError: (message: string) => void;
  onDuplicated?: (target: ActionTarget, copyId: string) => void;
  onDeleted?: (target: ActionTarget) => void;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [pending, setPending] = useState<{ action: ContentAction; target: ActionTarget } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const execute = useCallback(
    async (action: ContentAction, target: ActionTarget) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const isModule = target.kind === "module";
      try {
        let copyId: string | undefined;
        if (action === "publish") await (isModule ? publishTrainingModule(target.id) : publishContentItem(target.id));
        else if (action === "unpublish") await (isModule ? unpublishTrainingModule(target.id) : unpublishContentItem(target.id));
        else if (action === "archive") await (isModule ? archiveTrainingModule(target.id) : archiveContentItem(target.id));
        else if (action === "restore") await (isModule ? archiveTrainingModule(target.id, true) : archiveContentItem(target.id, true));
        else if (action === "duplicate") copyId = (await (isModule ? duplicateTrainingModule(target.id) : duplicateContentItem(target.id))).id;
        else await (isModule ? deleteTrainingModule(target.id) : deleteContentItem(target.id));
        await Promise.all(
          ["library", "content-items", "content-detail", "content-edit", "module-edit", "admin-library-overview", "admin-training-modules", "training-modules", "training-progress"].map(
            (key) => queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        pushToast({ kind: "success", title: SUCCESS[action], message: `“${target.title}” was updated.` });
        if (action === "duplicate" && copyId) onDuplicated?.(target, copyId);
        if (action === "delete") onDeleted?.(target);
        onChanged?.();
      } catch (cause) {
        onError(cause instanceof ApiError ? cause.message : "We could not update this content. Please try again.");
      } finally {
        busyRef.current = false;
        setBusy(false);
        setPending(null);
      }
    },
    [onChanged, onDeleted, onDuplicated, onError, pushToast, queryClient],
  );

  const request = useCallback(
    (action: ContentAction, target: ActionTarget) => {
      if (needsConfirmation.includes(action)) setPending({ action, target });
      else void execute(action, target);
    },
    [execute],
  );

  const copy = pending ? confirmCopy(pending.action, pending.target) : null;
  const dialog = (
    <Modal
      open={Boolean(pending)}
      onClose={() => setPending(null)}
      dismissible={!busy}
      size="sm"
      icon={pending?.action === "delete" ? <Trash2 /> : pending?.action === "archive" ? <Archive /> : <EyeOff />}
      title={copy?.heading ?? ""}
      description={copy?.body}
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton
            variant={pending?.action === "unpublish" ? "primary" : "secondary"}
            size="sm"
            className={pending?.action === "unpublish" ? undefined : "po-danger"}
            disabled={busy}
            onClick={() => pending && void execute(pending.action, pending.target)}
          >
            {busy ? "Working…" : copy?.confirm}
          </AdminButton>
        </>
      }
    >
      <></>
    </Modal>
  );

  return { request, busy, dialog };
}
