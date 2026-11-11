import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FilePenLine, Send, ShieldCheck } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Field, TextArea, TextInput } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { createConsentDraft, getConsentVersions, publishConsent } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, EmptyState, ListRow, Notice, StatusPill } from "./ui/AdminKit";

/** Programme admins write, version and publish the consent wording students and mentors must accept. */
export function ConsentEditor({ onError }: { onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const data = useQuery({ queryKey: ["consent-versions"], queryFn: getConsentVersions });
  const live = data.data?.versions.find((version) => version.published_at);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["consent-versions"] });
    void queryClient.invalidateQueries({ queryKey: ["consent-current"] });
  };
  const save = useMutation({
    mutationFn: () => createConsentDraft({ title: title.trim(), body: body.trim() }),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Draft saved", message: "Publish it when the programme has approved the wording." });
      setTitle("");
      setBody("");
      refresh();
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not save that draft."),
  });
  const publish = useMutation({
    mutationFn: (id: string) => publishConsent(id),
    onSuccess: () => {
      pushToast({ kind: "success", title: "Consent published", message: "Students and mentors are asked to accept it the next time they act." });
      refresh();
    },
    onError: (cause) => onError(cause instanceof Error ? cause.message : "We could not publish that version."),
  });

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Govern"
        title="Consent wording"
        description="Write the wording, keep every version, and publish it when the programme approves it. Students and mentors must accept the current version before they can make changes."
      />
      <Notice icon={<ShieldCheck />}>
        Nothing is asked of anyone until you publish a version. The starter text is a draft only: your ethics and data-governance owners must approve the final wording before pilot data is collected.
      </Notice>

      <div className="rp-grid-2">
        <AdminCard title="New version" description="Saved as a draft. Publishing is a separate step.">
          <Field label="Title" required>
            <TextInput maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="How MentorMAMA uses your information" />
          </Field>
          <Field label="Wording" required hint="Plain language. Shown exactly as written.">
            <TextArea rows={12} value={body} onChange={(event) => setBody(event.target.value)} />
          </Field>
          <div className="pa-row-actions">
            <AdminButton size="sm" icon={<FilePenLine />} disabled={save.isPending || !title.trim() || body.trim().length < 40} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save draft"}
            </AdminButton>
            {data.data && (
              <AdminButton variant="ghost" size="sm" onClick={() => { setTitle(data.data.starter.title); setBody(data.data.starter.body); }}>
                Load starter wording
              </AdminButton>
            )}
          </div>
        </AdminCard>

        <AdminCard title="Versions" description={live ? `Version ${live.version} is live (${live.accepted_count} accepted).` : "No version is live yet."} flush>
          {data.isPending ? (
            <div className="p-4"><Skeleton className="h-28" /></div>
          ) : data.isError ? (
            <PortalErrorState onRetry={() => void data.refetch()} />
          ) : data.data.versions.length === 0 ? (
            <EmptyState icon={<FilePenLine />} title="No versions yet" text="Save a draft to begin." />
          ) : (
            <div className="pa-list">
              {data.data.versions.map((version) => (
                <ListRow
                  key={version.id}
                  icon={version.published_at ? <CheckCircle2 /> : <FilePenLine />}
                  tone={version.published_at ? "green" : "slate"}
                  title={`Version ${version.version}: ${version.title}`}
                  meta={version.published_at ? `Published ${new Date(version.published_at).toLocaleDateString("en-GB")} · ${version.accepted_count} accepted` : "Draft"}
                  trailing={
                    version.published_at ? (
                      <StatusPill tone="success">Published</StatusPill>
                    ) : (
                      <AdminButton size="sm" icon={<Send />} disabled={publish.isPending} onClick={() => publish.mutate(version.id)}>Publish</AdminButton>
                    )
                  }
                />
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </AdminPage>
  );
}
