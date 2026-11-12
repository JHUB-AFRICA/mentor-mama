import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  GraduationCap,
  Link2,
  Plus,
  Search,
} from "lucide-react";
import { Button, Skeleton } from "@mentormama/ui";
import { Modal } from "../../components/kit";
import { AdminButton } from "../programme-admin/ui/AdminKit";
import "../programme-admin/programme-overlays.css";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useQuery } from "@tanstack/react-query";
import { Edit3, ExternalLink } from "lucide-react";
import { getLibrary, type LibraryEntry, type CurrentUser } from "../../services/api";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";
import { actionMeta, actionsFor, useContentActions, type ActionTarget } from "./contentActions";
import { audienceSummary, categoryLabel } from "./contentMeta";
import "./content-detail.css";
import { StoredImage } from "../../components/StoredImage";

type Kind = "all" | "guide" | "module" | "document" | "external";
type AddType = Exclude<Kind, "all">;
const audienceOptions = [
  { value: "", label: "All audiences" },
  { value: "mentor", label: "Mentors" },
  { value: "student", label: "Students" },
  { value: "coordinator", label: "Programme staff" },
];
const categoryOptions = [
  { value: "", label: "All categories" },
  { value: "onboarding", label: "Onboarding" },
  { value: "clinical_care", label: "Clinical care" },
  { value: "safeguarding", label: "Safeguarding" },
  { value: "templates", label: "Templates" },
  { value: "reference", label: "Reference" },
];
const kindMeta: Record<
  Exclude<Kind, "all">,
  { label: string; icon: typeof BookOpen; color: string }
> = {
  guide: { label: "Guide", icon: BookOpen, color: "teal" },
  module: { label: "Learning module", icon: GraduationCap, color: "violet" },
  document: { label: "Document", icon: FileText, color: "blue" },
  external: { label: "External resource", icon: Link2, color: "amber" },
};

export function ContentLibrary({
  user,
  onError,
}: {
  user: CurrentUser;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const canManage = user.role === "program_admin";
  const [kind, setKind] = useState<Kind>("all");
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [addType, setAddType] = useState<AddType | null>(null);
  const query = useQuery({
    queryKey: [
      "library",
      user.id,
      user.role,
      kind,
      search,
      audience,
      category,
      status,
      tag,
      requiredOnly,
    ],
    queryFn: () =>
      getLibrary({
        kind,
        search,
        audience,
        category,
        status,
        tag,
        required: requiredOnly ? "true" : "",
      }),
  });
  const entries = query.data?.data ?? [];
  const counts = query.data?.meta.counts ?? {
    all: 0,
    guide: 0,
    module: 0,
    document: 0,
    external: 0,
  };
  const tabs: Array<{ value: Kind; label: string; icon?: typeof BookOpen }> = [
    { value: "all", label: "All content", icon: BookOpen },
    { value: "guide", label: "Guides", icon: BookOpen },
    { value: "module", label: "Learning modules", icon: GraduationCap },
    { value: "document", label: "Documents", icon: FileText },
    { value: "external", label: "External resources", icon: Link2 },
  ];
  const openEntry = (entry: LibraryEntry) => {
    navigate(
      user.role === "student"
        ? `/student/library/${entry.kind}/${entry.source_id}`
        : user.role === "mentor"
          ? `/mentor/library/${entry.kind}/${entry.source_id}`
          : user.role === "coordinator"
            ? `/coordinator/library/${entry.kind}/${entry.source_id}`
            : user.role === "nurse_manager"
              ? `/facility/library/${entry.kind}/${entry.source_id}`
              : `/admin/content/item/${entry.kind}/${entry.source_id}`,
    );
  };
  const actions = useContentActions({
    onError,
    onDuplicated: (target, copyId) => navigate(`/admin/content/new/${target.kind}?edit=${copyId}`),
  });
  const menuFor = (entry: LibraryEntry): ActionMenuItem[] => {
    const target: ActionTarget = { kind: entry.kind, id: entry.source_id, title: entry.title, status: entry.status };
    return [
      { key: "open", label: "Open", icon: <ExternalLink size={15} />, onSelect: () => openEntry(entry) },
      { key: "edit", label: "Edit", icon: <Edit3 size={15} />, onSelect: () => navigate(`/admin/content/new/${entry.kind}?edit=${entry.source_id}`) },
      ...actionsFor(entry.status).map((action) => ({
        key: action,
        label: actionMeta[action].label,
        icon: actionMeta[action].icon,
        danger: actionMeta[action].danger,
        disabled: action === "publish" && entry.kind === "module" && entry.lessons === 0,
        onSelect: () => actions.request(action, target),
      })),
    ];
  };
  function clearFilters() {
    setKind("all");
    setSearch("");
    setAudience("");
    setCategory("");
    setStatus("");
    setTag("");
    setRequiredOnly(false);
  }
  const hasFilters = Boolean(
    search || audience || category || status || tag || requiredOnly || kind !== "all",
  );
  return (
    <div className="content-library-page">
      <section className="content-library-heading">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Programme library
          </p>
          <h2 className="mt-3 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.25rem]">
            Content library
          </h2>
          <p className="mt-3 max-w-3xl font-body text-base leading-7 text-navy-muted">
            Guides, training modules and resources for your programme team,
            mentors and students.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setAddType("guide")}>
            <Plus size={17} className="mr-2" />
            Add content
            <ChevronDown size={16} className="ml-3" />
          </Button>
        )}
      </section>
      <div
        className="content-library-tabs content-library-tabs--types"
        role="tablist"
      >
        {tabs.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            className={`content-library-tab ${kind === value ? "content-library-tab--active" : ""}`}
          >
            {Icon && <Icon size={16} />}
            {label}
          </button>
        ))}
      </div>
      <section className="content-library-filters content-library-filters--wide">
        <label className="content-library-search">
          <Search size={18} />
          <span className="sr-only">Search library</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, description or keyword..."
          />
        </label>
        <FilterSelect
          value={audience}
          onChange={setAudience}
          options={audienceOptions}
        />
        <FilterSelect
          value={category}
          onChange={setCategory}
          options={categoryOptions}
        />
        {(query.data?.meta.tags ?? []).length > 0 && (
          <FilterSelect
            value={tag}
            onChange={setTag}
            options={[{ value: "", label: "All tags" }, ...(query.data?.meta.tags ?? []).map((item) => ({ value: item, label: item }))]}
          />
        )}
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "All statuses" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <button
          type="button"
          aria-pressed={requiredOnly}
          className={`content-library-more-filter ${requiredOnly ? "active" : ""}`}
          onClick={() => setRequiredOnly((value) => !value)}
        >
          <Filter size={16} />
          {requiredOnly ? "Required only" : "More filters"}
        </button>
      </section>
      {query.isPending ? (
        <LibraryTableSkeleton />
      ) : query.isError ? (
        <PortalErrorState onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section className="content-library-stats">
            {(["all", "module", "document", "external"] as const).map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setKind(value)}
                  className="content-library-stat"
                >
                  <span
                    className={`content-library-stat-icon content-library-stat-icon--${value}`}
                  >
                    <StatIcon type={value} />
                  </span>
                  <span>
                    <strong>{counts[value]}</strong>
                    <small>
                      {value === "all"
                        ? "Total items"
                        : value === "module"
                          ? "Learning modules"
                          : value === "document"
                            ? "Documents"
                            : "External resources"}
                    </small>
                  </span>
                </button>
              ),
            )}
          </section>
          {entries.length === 0 ? (
            <LibraryEmptyState
              hasFilters={hasFilters}
              onClear={clearFilters}
              onAdd={() => setAddType("guide")}
              canManage={canManage}
            />
          ) : (
            <LibraryTable
              entries={entries}
              canManage={canManage}
              menuFor={menuFor}
              onOpen={openEntry}
            />
          )}
        </>
      )}
      {actions.dialog}
      {addType && (
        <AddContentModal
          type={addType}
          onClose={() => setAddType(null)}
          onContinue={(type) => {
            setAddType(null);
            navigate(`/admin/content/new/${type}`);
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="content-library-sort content-library-filter-select">
      <span className="sr-only">{options[0].label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} />
    </label>
  );
}
function StatIcon({ type }: { type: Kind }) {
  return type === "module" ? (
    <GraduationCap size={21} />
  ) : type === "document" ? (
    <FileText size={21} />
  ) : type === "external" ? (
    <Link2 size={21} />
  ) : (
    <BookOpen size={21} />
  );
}
function LibraryTable({
  entries,
  canManage,
  menuFor,
  onOpen,
}: {
  entries: LibraryEntry[];
  canManage: boolean;
  menuFor: (entry: LibraryEntry) => ActionMenuItem[];
  onOpen: (entry: LibraryEntry) => void;
}) {
  return (
    <section className="content-library-table-wrap">
      <div className="content-library-table-scroll">
        <table className="content-library-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Audience</th>
              <th>Category</th>
              <th>Status</th>
              <th>Updated</th>
              {canManage && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <LibraryRow
                key={entry.id}
                entry={entry}
                canManage={canManage}
                menuFor={menuFor}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
      <footer className="content-library-table-footer">
        <span>
          Showing 1–{entries.length} of {entries.length} items
        </span>
        <div className="content-library-pagination">
          <button type="button" disabled aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="active">
            1
          </button>
          <button type="button" disabled aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </section>
  );
}
function LibraryRow({
  entry,
  canManage,
  menuFor,
  onOpen,
}: {
  entry: LibraryEntry;
  canManage: boolean;
  menuFor: (entry: LibraryEntry) => ActionMenuItem[];
  onOpen: (entry: LibraryEntry) => void;
}) {
  const meta = kindMeta[entry.kind];
  const Icon = meta.icon;
  return (
    <tr>
      <td>
        <div className="content-library-title-cell">
          <span
            className={`content-library-row-icon content-library-row-icon--${meta.color}`}
          >
            <StoredImage src={entry.cover_image} fallback={<Icon size={18} />} />
          </span>
          <span>
            <button
              type="button"
              className="content-library-title-link"
              onClick={() => onOpen(entry)}
            >
              <strong>{entry.title}</strong>
            </button>
            <small>{entry.summary || "No description added yet."}</small>
          </span>
        </div>
      </td>
      <td>
        <span
          className={`content-library-kind content-library-kind--${meta.color}`}
        >
          {meta.label}
        </span>
      </td>
      <td>{audienceSummary(entry.audience)}</td>
      <td>{categoryLabel(entry.category)}</td>
      <td>
        <span
          className={`content-library-status-pill content-library-status-pill--${entry.status}`}
        >
          <span />
          {entry.status[0].toUpperCase() + entry.status.slice(1)}
        </span>
      </td>
      <td>
        <span className="content-library-updated">
          {new Date(entry.updated_at).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
          <small>{entry.updated_by}</small>
        </span>
      </td>
      {canManage && (
        <td>
          <div className="cd-row-actions">
            <ActionMenu label={`Actions for ${entry.title}`} items={menuFor(entry)} />
          </div>
        </td>
      )}
    </tr>
  );
}

function LibraryEmptyState({
  hasFilters,
  onClear,
  onAdd,
  canManage,
}: {
  hasFilters: boolean;
  onClear: () => void;
  onAdd: () => void;
  canManage: boolean;
}) {
  return (
    <section className="content-library-empty content-library-empty--catalogue">
      <span className="content-library-empty-icon" aria-hidden="true">
        <span />
        <span />
        <span />
        <BookOpen size={32} />
      </span>
      {hasFilters ? (
        <>
          <h3>No content matches these filters</h3>
          <p>
            Try clearing a filter or searching for a different title, topic or
            audience.
          </p>
          <Button type="button" variant="tertiary" onClick={onClear}>
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <h3>Your content library is empty</h3>
          <p>
            Add guides, policies, training modules and other helpful resources
            for your programme team, students and mentors.
          </p>
          {canManage && (
            <Button type="button" onClick={onAdd}>
              <Plus size={17} className="mr-2" />
              Add your first guide
            </Button>
          )}
        </>
      )}
    </section>
  );
}
const addOptions: Array<{ value: AddType; description: string }> = [
  { value: "guide", description: "Write programme guidance directly in MentorMAMA." },
  { value: "module", description: "Build structured learning with lessons and completion tracking." },
  { value: "document", description: "Add a PDF, Word document or presentation resource." },
  { value: "external", description: "Link to trusted material hosted elsewhere." },
];

function AddContentModal({
  type,
  onClose,
  onContinue,
}: {
  type: AddType;
  onClose: () => void;
  onContinue: (type: AddType) => void;
}) {
  const [selected, setSelected] = useState<AddType>(type);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  function moveSelection(from: number, step: number) {
    const next = (from + step + addOptions.length) % addOptions.length;
    setSelected(addOptions[next].value);
    optionRefs.current[next]?.focus();
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<Plus />}
      title="What would you like to add?"
      description="Choose a content type to add to the programme library."
      footer={
        <>
          <AdminButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton type="button" size="sm" onClick={() => onContinue(selected)}>
            Continue
          </AdminButton>
        </>
      }
    >
      <div className="po-options" role="radiogroup" aria-label="Content type">
        {addOptions.map((option, index) => {
          const meta = kindMeta[option.value];
          const Icon = meta.icon;
          const checked = selected === option.value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className="po-option"
              onClick={() => setSelected(option.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                  event.preventDefault();
                  moveSelection(index, 1);
                } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  moveSelection(index, -1);
                }
              }}
            >
              <span className="po-option__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="po-option__text">
                <span className="po-option__title">{meta.label}</span>
                <span className="po-option__desc">{option.description}</span>
              </span>
              <span className="po-option__radio" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function LibraryTableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}
