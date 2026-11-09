import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Archive, Edit3, ExternalLink, Send } from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  ApiError,
  archiveContentItem,
  getAdminTrainingModules,
  getContentItem,
  getTrainingModules,
  publishContentItem,
  publishTrainingModule,
  type ContentItem,
  type CurrentUser,
  type TrainingModule,
} from "../../services/api";

export function ContentDetailScreen({
  kind,
  id,
  user,
  onBack,
  onError,
}: {
  kind: "guide" | "module" | "document" | "external";
  id: string;
  user: CurrentUser;
  onBack: () => void;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const content = useQuery<TrainingModule[] | ContentItem>({
    queryKey: ["content-detail", user.id, user.role, kind, id],
    queryFn: () =>
      kind === "module"
        ? user.role === "program_admin"
          ? getAdminTrainingModules()
          : getTrainingModules()
        : getContentItem(id),
  });
  if (content.isPending) return <DetailSkeleton />;
  if (content.isError)
    return <PortalErrorState onRetry={() => void content.refetch()} />;
  const item =
    kind === "module"
      ? (content.data as TrainingModule[]).find((row) => row.id === id)
      : (content.data as ContentItem);
  if (!item) return <PortalErrorState onRetry={() => void content.refetch()} />;
  const status =
    kind === "module"
      ? (item as TrainingModule).status
      : ((item as ContentItem).status ??
        ((item as ContentItem).published ? "published" : "draft"));
  const title = item.title;
  const edit = () => {
    navigate(`/admin/content/new/${kind}?edit=${id}`);
  };
  const updateStatus = async () => {
    try {
      if (kind === "module") {
        await publishTrainingModule(id);
      } else if (status === "published") {
        await archiveContentItem(id);
      } else {
        await publishContentItem(id);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["library"] }),
        queryClient.invalidateQueries({ queryKey: ["content-items"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-library-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-training-modules"] }),
      ]);
      await content.refetch();
      pushToast({ kind: "success", title: status === "published" && kind !== "module" ? "Content archived" : "Content published", message: `“${title}” was updated.` });
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not update this content.",
      );
    }
  };
  return (
    <div className="content-detail-page">
      <button type="button" className="content-detail-back" onClick={onBack}>
        <ArrowLeft size={16} /> Content library
      </button>
      <header className="content-detail-header">
        <div>
          <p className="content-library-eyebrow">{kindLabel(kind)} · Detail</p>
          <h1>{title}</h1>
          <p>
            {kind === "module"
              ? (item as TrainingModule).description
              : (item as ContentItem).summary || "No description added yet."}
          </p>
        </div>
        {user.role === "program_admin" && (
          <div className="content-detail-actions">
            <Button type="button" variant="tertiary" onClick={edit}>
              <Edit3 size={16} /> Edit
            </Button>
            <Button type="button" onClick={() => void updateStatus()}>
              {status === "published" && kind !== "module" ? (
                <Archive size={16} />
              ) : (
                <Send size={16} />
              )}
              {status === "published" && kind !== "module"
                ? "Archive"
                : "Publish"}
            </Button>
          </div>
        )}
      </header>
      <div className="content-detail-grid">
        <main className="content-detail-card content-detail-preview">
          {"cover_image" in item && item.cover_image && (
            <img
              className="content-detail-cover"
              src={item.cover_image}
              alt=""
            />
          )}
          {kind === "module" ? (
            <ModuleDetailPreview module={item as TrainingModule} />
          ) : (
            <ContentDetailPreview item={item as ContentItem} kind={kind} />
          )}
        </main>
        <aside className="content-detail-card content-detail-meta">
          <h2>Content details</h2>
          <DetailMeta label="Status" value={status} />
          <DetailMeta
            label="Audience"
            value={(item.visible_roles ?? []).join(", ") || "Not set"}
          />
          <DetailMeta label="Category" value={item.category || "Not set"} />
          {kind === "module" && (
            <DetailMeta
              label="Lessons"
              value={String((item as TrainingModule).lessons.length)}
            />
          )}
          {kind === "module" && (item as TrainingModule).quiz.length > 0 && (
            <DetailMeta
              label="Pass mark"
              value={`${(item as TrainingModule).pass_mark}%`}
            />
          )}
          {"resource_url" in item && item.resource_url && (
            <a
              className="content-detail-open-link"
              href={item.resource_url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} /> Open resource
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}

function ContentDetailPreview({
  item,
  kind,
}: {
  item: ContentItem;
  kind: string;
}) {
  if (kind !== "guide" && item.resource_url) {
    return (
      <div className="content-detail-resource">
        <p>This resource opens in its original destination.</p>
        <a href={item.resource_url} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Open {kind}
        </a>
      </div>
    );
  }
  let body: {
    type?: string;
    content?: Array<{ type?: string; text?: string; content?: unknown[] }>;
  } | null = null;
  try {
    body = JSON.parse(item.body);
  } catch {
    body = null;
  }
  return (
    <article className="content-detail-rich-text">
      <p className="content-detail-summary">{item.summary}</p>
      {body?.content?.map((node, index) => (
        <p key={index}>
          {node.content
            ?.map((child) =>
              typeof child === "object" && child && "text" in child
                ? String(child.text)
                : "",
            )
            .join("")}
        </p>
      ))}
    </article>
  );
}

function ModuleDetailPreview({ module }: { module: TrainingModule }) {
  return (
    <div className="content-detail-module">
      {module.lessons.map((lesson) => (
        <article key={lesson.id}>
          <small>
            {lesson.lesson_type} · {lesson.duration_minutes} min
          </small>
          <h2>{lesson.title}</h2>
          <p>{lesson.body}</p>
        </article>
      ))}
      {module.quiz.length > 0 && (
        <section className="content-detail-quiz">
          <small>Knowledge check · Pass mark {module.pass_mark}%</small>
          {module.quiz.map((question) => (
            <div key={question.id}>
              <h3>{question.prompt}</h3>
              <ul>
                {question.options.map((option) => (
                  <li key={option}>{option}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="content-detail-meta-row">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
function kindLabel(kind: string) {
  return kind === "module"
    ? "Learning module"
    : kind[0].toUpperCase() + kind.slice(1);
}
function DetailSkeleton() {
  return (
    <div className="content-detail-page">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-24" />
      <Skeleton className="mt-6 h-96" />
    </div>
  );
}
