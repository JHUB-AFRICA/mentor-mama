import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  EyeOff,
  FileText,
  GraduationCap,
  Info,
  Layers,
  Link2,
  ListChecks,
  Lock,
  PlayCircle,
  Users,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { DetailList } from "../../components/kit";
import { AdminButton, AdminCard, AdminPage, StatusPill, type PillTone } from "../programme-admin/ui/AdminKit";
import "../programme-admin/programme-overlays.css";
import "./content-detail.css";
import { PortalErrorState } from "../../components/PortalErrorState";
import {
  ApiError,
  getContentItem,
  getContentRevisions,
  getTrainingModule,
  type ContentItem,
  type CurrentUser,
  type TrainingModule,
} from "../../services/api";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";
import { GuideReader, PlainText, isGuideBodyEmpty } from "./ContentReader";
import {
  actionMeta,
  actionsFor,
  useContentActions,
  type ActionTarget,
  type ContentAction,
  type ContentKindKey,
  type ContentStatus,
} from "./contentActions";
import {
  audienceLabels,
  categoryLabel,
  formatDate,
  formatMinutes,
  kindLabel,
  statusLabel,
} from "./contentMeta";

const kindIcon = { guide: BookOpen, module: GraduationCap, document: FileText, external: Link2 } as const;

export function ContentDetailScreen({
  kind,
  id,
  user,
  onBack,
  onError,
}: {
  kind: ContentKindKey;
  id: string;
  user: CurrentUser;
  onBack: () => void;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const isAdmin = user.role === "program_admin";
  const isModule = kind === "module";
  const query = useQuery<TrainingModule | ContentItem>({
    queryKey: ["content-detail", user.id, user.role, kind, id],
    queryFn: () => (isModule ? getTrainingModule(id) : getContentItem(id)),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const revisions = useQuery({
    queryKey: ["content-revisions", id],
    queryFn: () => getContentRevisions(id),
    enabled: isAdmin && !isModule,
  });
  const actions = useContentActions({
    onError,
    onDuplicated: (target, copyId) => navigate(`/admin/content/new/${target.kind}?edit=${copyId}`),
    onDeleted: onBack,
  });

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return (
        <AdminPage>
          <AdminCard>
            <div className="cd-empty" role="status">
              <strong style={{ display: "block", color: "var(--pa-ink)", marginBottom: "0.35rem" }}>
                This content is no longer available
              </strong>
              It may have been unpublished, archived or removed by your programme team.
            </div>
            <div style={{ marginTop: "1rem" }}>
              <AdminButton variant="secondary" size="sm" icon={<ArrowLeft />} onClick={onBack}>
                Back to library
              </AdminButton>
            </div>
          </AdminCard>
        </AdminPage>
      );
    return <PortalErrorState onRetry={() => void query.refetch()} />;
  }

  const module = isModule ? (query.data as TrainingModule) : null;
  const item = !isModule ? (query.data as ContentItem) : null;
  const subject = (module ?? item)!;
  const status: ContentStatus =
    module?.status ?? item?.status ?? (item?.published ? "published" : "draft");
  const title = subject.title;
  const target: ActionTarget = { kind, id, title, status };
  const KindIcon = kindIcon[kind];
  const roles = subject.visible_roles ?? [];
  const audience = audienceLabels(roles);
  const description = module ? module.description : item?.summary;
  const cover = subject.cover_image;
  const lessonCount = module?.lessons.length ?? 0;
  const publishBlocked = isModule && lessonCount === 0;

  const primaryAction: ContentAction | null =
    status === "draft" ? "publish" : status === "archived" ? "restore" : null;
  const secondaryAction: ContentAction | null = status === "published" ? "unpublish" : null;
  const menuItems: ActionMenuItem[] = actionsFor(status)
    .filter((action) => action !== primaryAction && action !== secondaryAction)
    .map((action) => ({
      key: action,
      label: actionMeta[action].label,
      icon: actionMeta[action].icon,
      danger: actionMeta[action].danger,
      onSelect: () => actions.request(action, target),
    }));

  const edit = () => navigate(`/admin/content/new/${kind}?edit=${id}`);
  const trainingHref = `/mentor?view=training&module=${id}`;
  const canTrain = user.role === "mentor" && module?.status === "published";
  const trainingLabel = module?.completed ? "Review training" : (module?.attempt_count ?? 0) > 0 ? "Continue training" : "Start training";

  const detailItems = [
    { label: "Status", value: <StatusPill tone={statusTone(status)}>{statusLabel(status)}</StatusPill>, icon: <Info /> },
    { label: "Audience", value: audience.length ? audience.join(", ") : "Admins only", icon: <Users /> },
    { label: "Category", value: categoryLabel(subject.category), icon: <Layers /> },
    { label: "Last updated", value: formatDate(subject.updated_at), icon: <CalendarClock /> },
    ...(item ? [{ label: "Version", value: `v${item.version ?? 1}`, icon: <ListChecks /> }] : []),
    ...(module
      ? [
          { label: "Lessons", value: String(lessonCount), icon: <GraduationCap /> },
          { label: "Estimated time", value: formatMinutes(module.total_minutes), icon: <Clock /> },
          { label: "Knowledge check", value: module.quiz.length ? `${module.quiz.length} ${module.quiz.length === 1 ? "question" : "questions"} · ${module.pass_mark}% to pass` : "None", icon: <ListChecks /> },
          { label: "Completion", value: module.is_required ? "Required" : "Optional", icon: <CheckCircle2 /> },
        ]
      : []),
  ];

  return (
    <AdminPage>
      <div>
        <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={onBack}>
          {isAdmin ? "Content library" : "Library"}
        </AdminButton>
      </div>

      <header className="cd-hero">
        {cover && <img className="cd-hero__cover" src={cover} alt="" />}
        <div className="cd-hero__body">
          <div className="cd-chips">
            <span className="cd-chip cd-chip--teal">
              <KindIcon aria-hidden="true" />
              {kindLabel(kind)}
            </span>
            <span className="cd-chip">{categoryLabel(subject.category)}</span>
            {isAdmin && <StatusPill tone={statusTone(status)}>{statusLabel(status)}</StatusPill>}
            {module?.is_required && <span className="cd-chip cd-chip--amber">Required</span>}
            {module?.completed && (
              <span className="cd-chip cd-chip--teal">
                <CheckCircle2 aria-hidden="true" /> Completed{module.score != null ? ` · ${module.score}%` : ""}
              </span>
            )}
          </div>
          <h1 className="cd-title">{title}</h1>
          {description && <p className="cd-lede">{description}</p>}
          <div className="cd-facts">
            <span>
              <CalendarClock aria-hidden="true" /> Updated {formatDate(subject.updated_at)}
            </span>
            {module && (
              <>
                <span>
                  <GraduationCap aria-hidden="true" /> {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
                </span>
                {module.total_minutes ? (
                  <span>
                    <Clock aria-hidden="true" /> {formatMinutes(module.total_minutes)}
                  </span>
                ) : null}
              </>
            )}
            {isAdmin && (
              <span>
                <Users aria-hidden="true" /> {audience.length ? audience.join(", ") : "Admins only"}
              </span>
            )}
          </div>

          <div className="cd-actions">
            {canTrain && (
              <Link to={trainingHref} className="pa-btn pa-btn--primary">
                <PlayCircle /> {trainingLabel}
              </Link>
            )}
            {!isModule && item && item.resource_url && kind !== "guide" && (
              <a className="pa-btn pa-btn--primary" href={item.resource_url} target="_blank" rel="noopener noreferrer">
                {kind === "document" ? <Download /> : <ExternalLink />}
                {kind === "document" ? "Open document" : "Open resource"}
              </a>
            )}
            {isAdmin && (
              <>
                <span className="cd-actions__spacer" />
                <AdminButton variant="secondary" size="sm" icon={<Edit3 />} onClick={edit} disabled={actions.busy}>
                  Edit
                </AdminButton>
                {primaryAction && (
                  <AdminButton
                    size="sm"
                    icon={actionMeta[primaryAction].icon}
                    onClick={() => actions.request(primaryAction, target)}
                    disabled={actions.busy || (primaryAction === "publish" && publishBlocked)}
                    title={primaryAction === "publish" && publishBlocked ? "Add at least one lesson before publishing." : undefined}
                  >
                    {actions.busy ? "Working…" : actionMeta[primaryAction].label}
                  </AdminButton>
                )}
                {secondaryAction && (
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    icon={actionMeta[secondaryAction].icon}
                    onClick={() => actions.request(secondaryAction, target)}
                    disabled={actions.busy}
                  >
                    {actionMeta[secondaryAction].label}
                  </AdminButton>
                )}
                <ActionMenu label={`More actions for ${title}`} items={menuItems} />
              </>
            )}
          </div>
        </div>
      </header>

      {isAdmin && <StatusBanner status={status} audience={audience} blocked={publishBlocked} />}

      <div className="cd-grid">
        <div className="cd-main">
          {module ? (
            <ModuleBody module={module} isAdmin={isAdmin} />
          ) : item ? (
            <ItemBody item={item} kind={kind} isAdmin={isAdmin} />
          ) : null}
        </div>
        <aside className="cd-side" aria-label="Details">
          <AdminCard title="Details">
            <DetailList items={detailItems} />
          </AdminCard>
          {module && isAdmin && <LearnerCard module={module} />}
          {module && !isAdmin && user.role === "mentor" && <MyProgressCard module={module} />}
          {isAdmin && item && (
            <AdminCard title="Version history" description="Earlier saved versions, newest first.">
              {revisions.isPending ? (
                <Skeleton className="h-16" />
              ) : revisions.isError ? (
                <p className="cd-empty">History could not be loaded.</p>
              ) : revisions.data.length === 0 ? (
                <p className="cd-empty">No edits yet. This is the original version.</p>
              ) : (
                <ul className="cd-list">
                  {revisions.data.map((row) => (
                    <li key={row.version}>
                      <span>
                        v{row.version} · {row.edited_by}
                      </span>
                      <span>{formatDate(row.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          )}
        </aside>
      </div>
      {actions.dialog}
    </AdminPage>
  );
}

function StatusBanner({ status, audience, blocked }: { status: ContentStatus; audience: string[]; blocked: boolean }) {
  const who = audience.length ? audience.join(" and ") : "no one yet (no audience selected)";
  if (status === "published")
    return (
      <div className="cd-banner cd-banner--live" role="status">
        <CheckCircle2 aria-hidden="true" />
        <span>
          <strong>Live.</strong> Visible to {who}. Editing keeps it live only if you choose “Save changes”; “Save as draft” takes it down.
        </span>
      </div>
    );
  if (status === "archived")
    return (
      <div className="cd-banner cd-banner--archived" role="status">
        <Lock aria-hidden="true" />
        <span>
          <strong>Archived.</strong> Hidden from everyone except programme admins. Restore it to edit and publish again, or delete it permanently.
        </span>
      </div>
    );
  return (
    <div className="cd-banner cd-banner--draft" role="status">
      <EyeOff aria-hidden="true" />
      <span>
        <strong>Draft.</strong>{" "}
        {blocked
          ? "Add at least one lesson before this module can be published."
          : `Only programme admins can see this. Publish it to make it available to ${who}.`}
      </span>
    </div>
  );
}

function ItemBody({ item, kind, isAdmin }: { item: ContentItem; kind: ContentKindKey; isAdmin: boolean }) {
  if (kind === "guide") {
    return (
      <AdminCard>
        {isGuideBodyEmpty(item.body) ? (
          <p className="cd-empty">
            {isAdmin ? "This guide has no content yet. Choose Edit to write it." : "This guide has no content yet."}
          </p>
        ) : (
          <GuideReader body={item.body} />
        )}
      </AdminCard>
    );
  }
  const Icon = kind === "document" ? FileText : Link2;
  const name = item.document_name || (kind === "document" ? "Document" : item.resource_url);
  return (
    <>
      <AdminCard title={kind === "document" ? "Document" : "External resource"}>
        {item.resource_url ? (
          <div className="cd-resource">
            <span className="cd-resource__icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <div className="cd-resource__text">
              <strong>{name}</strong>
              <span>
                {kind === "document"
                  ? "Opens in a new tab. Download it to keep a copy."
                  : "Opens in a new tab at its original destination."}
              </span>
            </div>
            <a className="pa-btn pa-btn--secondary pa-btn--sm" href={item.resource_url} target="_blank" rel="noopener noreferrer">
              {kind === "document" ? <Download /> : <ExternalLink />}
              {kind === "document" ? "Open document" : "Open link"}
            </a>
          </div>
        ) : (
          <p className="cd-empty">No file or link has been attached yet.</p>
        )}
      </AdminCard>
      {item.body && item.body !== item.summary && (
        <AdminCard title="About this resource">
          <PlainText text={item.body} />
        </AdminCard>
      )}
    </>
  );
}

function ModuleBody({ module, isAdmin }: { module: TrainingModule; isAdmin: boolean }) {
  return (
    <>
      <AdminCard
        title="Lessons"
        description={`${module.lessons.length} ${module.lessons.length === 1 ? "lesson" : "lessons"} · ${formatMinutes(module.total_minutes)}`}
      >
        {module.lessons.length === 0 ? (
          <p className="cd-empty">No lessons have been added yet.</p>
        ) : (
          <div className="cd-lessons">
            {module.lessons.map((lesson) => (
              <article key={lesson.id} className="cd-lesson">
                <span className="cd-lesson__num" aria-hidden="true">
                  {lesson.position}
                </span>
                <div>
                  <p className="cd-lesson__meta">
                    {lesson.lesson_type} · {lesson.duration_minutes} min
                  </p>
                  <h4>{lesson.title}</h4>
                  <PlainText text={lesson.body} />
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminCard>
      {module.quiz.length > 0 &&
        (isAdmin ? (
          <AdminCard title="Knowledge check" description={`${module.quiz.length} ${module.quiz.length === 1 ? "question" : "questions"} · pass mark ${module.pass_mark}%`}>
            {module.quiz.map((question, index) => (
              <div key={question.id} className="cd-question">
                <h4>
                  {index + 1}. {question.prompt}
                </h4>
                <ul>
                  {question.options.map((option) => (
                    <li key={option} className={option === question.correct_option ? "is-correct" : undefined}>
                      <span>{option}</span>
                      {option === question.correct_option && <small>Correct</small>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </AdminCard>
        ) : (
          <AdminCard title="Knowledge check" description={`${module.quiz.length} ${module.quiz.length === 1 ? "question" : "questions"} · pass mark ${module.pass_mark}%`}>
            <p className="cd-empty">
              Complete the lessons, then answer the questions to finish this module. Questions are shown when you start the training.
            </p>
          </AdminCard>
        ))}
    </>
  );
}

function LearnerCard({ module }: { module: TrainingModule }) {
  const attempted = module.learners_attempted ?? 0;
  const completed = module.learners_completed ?? 0;
  const rate = attempted ? Math.round((completed * 100) / attempted) : 0;
  return (
    <AdminCard title="Learner progress" description="Across your programme.">
      <div className="cd-stats">
        <div className="cd-stat">
          <strong>{attempted}</strong>
          <small>Started</small>
        </div>
        <div className="cd-stat">
          <strong>{completed}</strong>
          <small>Completed</small>
        </div>
      </div>
      <div style={{ marginTop: "0.8rem" }} role="img" aria-label={`${rate}% of learners who started have completed`}>
        <div className="cd-progress">
          <span style={{ width: `${rate}%` }} />
        </div>
      </div>
      {module.status !== "published" && attempted === 0 && (
        <p className="cd-empty" style={{ marginTop: "0.7rem" }}>
          Progress appears here once mentors start this module.
        </p>
      )}
    </AdminCard>
  );
}

function MyProgressCard({ module }: { module: TrainingModule }) {
  return (
    <AdminCard title="Your progress">
      {module.completed ? (
        <p className="cd-empty">
          Completed{module.completed_at ? ` on ${formatDate(module.completed_at)}` : ""} with {module.score}%.
        </p>
      ) : (module.attempt_count ?? 0) > 0 ? (
        <p className="cd-empty">
          {module.attempt_count} attempt{module.attempt_count === 1 ? "" : "s"} · best score {module.best_score}% · {module.pass_mark}% needed.
        </p>
      ) : (
        <p className="cd-empty">You have not started this module yet.</p>
      )}
    </AdminCard>
  );
}

function statusTone(status: string): PillTone {
  return status === "published" ? "success" : status === "archived" ? "neutral" : "warning";
}

function DetailSkeleton() {
  return (
    <AdminPage>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-56" />
      <Skeleton className="h-96" />
    </AdminPage>
  );
}
