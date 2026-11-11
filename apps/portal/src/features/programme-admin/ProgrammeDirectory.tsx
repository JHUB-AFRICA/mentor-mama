import { useEffect, useRef, useState } from "react";
import { csvBlob, datedFilename, saveBlob } from "../../lib/download";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  Hospital,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { Button } from "./SetupControls";
import {
  AdminButton,
  AdminCard,
  EmptyState,
  ListRow,
  SearchField,
  SelectField,
  StatCard,
  StatGrid,
  StatusPill,
} from "./ui/AdminKit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createFacility,
  createInstitution,
  createWard,
  getFacilities,
  getInstitutions,
  getWards,
  updateFacility,
  updateInstitution,
  updateWard,
  type Facility,
  type Institution,
  type Ward,
  type DirectoryImportKind,
  type DirectoryImportPreview,
  previewDirectoryImport,
  commitDirectoryImport,
} from "../../services/api";
import { useSearchParams } from "react-router-dom";
import {
  ProgrammeDirectoryRecordDetail,
  type DirectoryRecordSelection,
} from "./ProgrammeDirectoryRecordDetail";
import { Field, FieldRow, Modal, SelectInput, TextInput } from "../../components/kit";
import "./directory-kit.css";
import { useToast } from "../../components/ToastProvider";

type ResourceTab = "institutions" | "facilities" | "wards";
type ResourceKind = "institution" | "facility" | "ward";
type EditableResource = {
  kind: "institution" | "facility";
  item: Institution | Facility;
};

export function ProgrammeDirectory({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const { pushToast } = useToast();
  const institutions = useQuery({
    queryKey: ["programme-institutions"],
    queryFn: getInstitutions,
  });
  const facilities = useQuery({
    queryKey: ["programme-facilities"],
    queryFn: getFacilities,
  });
  const wards = useQuery({ queryKey: ["programme-wards"], queryFn: getWards });
  const [tab, setTab] = useState<ResourceTab>("institutions");
  const [kind, setKind] = useState<ResourceKind | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingResource, setEditingResource] =
    useState<EditableResource | null>(null);
  const [archivingResource, setArchivingResource] =
    useState<EditableResource | null>(null);
  const [editingWard, setEditingWard] = useState<Ward | null>(null);
  const [prefillFacilityId, setPrefillFacilityId] = useState<string | null>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const recordKindParam = searchParams.get("record_type");
  const recordId = searchParams.get("record_id");
  const recordKind: ResourceTab | null = recordKindParam === "institutions" || recordKindParam === "facilities" || recordKindParam === "wards"
    ? recordKindParam
    : null;
  const queryClient = useQueryClient();
  const loading =
    institutions.isPending || facilities.isPending || wards.isPending;
  const counts = {
    institutions: institutions.data?.filter((item) => !item.archived_at && item.is_active !== false).length ?? 0,
    facilities: facilities.data?.filter((item) => !item.archived_at).length ?? 0,
    wards: wards.data?.filter((item) => item.available).length ?? 0,
  };

  useEffect(() => {
    if (recordKind) setTab(recordKind);
  }, [recordKind]);

  function openRecord(kind: ResourceTab, id: string) {
    setTab(kind);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("section", "directory");
      next.set("record_type", kind);
      next.set("record_id", id);
      return next;
    });
  }

  function backToDirectory() {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("record_type");
      next.delete("record_id");
      next.set("section", "directory");
      return next;
    }, { replace: true });
  }

  function selectDirectoryTab(nextTab: ResourceTab) {
    setTab(nextTab);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("section", "directory");
      next.delete("record_type");
      next.delete("record_id");
      return next;
    });
  }

  const recordSelection: DirectoryRecordSelection | null = !recordId || !recordKind
    ? null
    : recordKind === "institutions"
      ? (() => { const record = institutions.data?.find((item) => item.id === recordId); return record ? { kind: "institution" as const, record } : null; })()
      : recordKind === "facilities"
        ? (() => { const record = facilities.data?.find((item) => item.id === recordId); return record ? { kind: "facility" as const, record } : null; })()
        : (() => { const record = wards.data?.find((item) => item.id === recordId); return record ? { kind: "ward" as const, record } : null; })();
  const detailLoading = recordKind === "institutions"
    ? institutions.isPending
    : recordKind === "facilities"
      ? facilities.isPending || wards.isPending
      : recordKind === "wards"
        ? wards.isPending || facilities.isPending
        : false;
  const detailError = recordKind === "institutions"
    ? institutions.isError
    : recordKind === "facilities"
      ? facilities.isError || wards.isError
      : recordKind === "wards"
        ? wards.isError || facilities.isError
        : false;
  const detailRetry = () => {
    if (recordKind === "institutions") void institutions.refetch();
    else if (recordKind === "facilities") {
      void facilities.refetch();
      void wards.refetch();
    } else if (recordKind === "wards") {
      void wards.refetch();
      void facilities.refetch();
    }
  };

  function editRecord() {
    if (!recordSelection) return;
    if (recordSelection.kind === "ward") setEditingWard(recordSelection.record);
    else setEditingResource({ kind: recordSelection.kind, item: recordSelection.record });
  }

  function archiveRecord() {
    if (!recordSelection || recordSelection.kind === "ward") return;
    setArchivingResource({ kind: recordSelection.kind, item: recordSelection.record });
  }

  async function toggleDetailedWard() {
    if (!recordSelection || recordSelection.kind !== "ward") return;
    setBusy(true);
    try {
      await updateWard(recordSelection.record.id, { archived: !recordSelection.record.archived_at });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["programme-wards"] }),
        queryClient.invalidateQueries({ queryKey: ["programme-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      pushToast({ kind: "success", title: "Ward updated", message: "The ward availability was changed." });
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not update this ward.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const submittedLogo = form.get("logo");
      if (submittedLogo instanceof File && submittedLogo.size > 2 * 1024 * 1024) {
        onError("Choose a logo that is 2 MB or smaller.");
        return;
      }
      if (kind === "institution")
        await createInstitution({
          name: String(form.get("name") ?? name).trim(),
          type: String(form.get("type") ?? "").trim(),
          county: String(form.get("county") ?? "").trim(),
          contact_person: String(form.get("contact_person") ?? "").trim(),
          contact_email: String(form.get("contact_email") ?? "").trim(),
          contact_phone: String(form.get("contact_phone") ?? "").trim(),
          logo: form.get("logo") instanceof File && (form.get("logo") as File).size ? form.get("logo") as File : null,
        });
      else if (kind === "facility")
        await createFacility({
          name: String(form.get("name") ?? name).trim(),
          county: String(form.get("county") ?? "").trim(),
          level: String(form.get("level") ?? "").trim(),
          maternity_unit_name: String(form.get("maternity_unit_name") ?? "").trim(),
          contact_person: String(form.get("contact_person") ?? "").trim(),
          contact_email: String(form.get("contact_email") ?? "").trim(),
          contact_phone: String(form.get("contact_phone") ?? "").trim(),
          logo: form.get("logo") instanceof File && (form.get("logo") as File).size ? form.get("logo") as File : null,
        });
      else if (kind === "ward")
        await createWard({
          facility_id: String(form.get("facility_id") ?? ""),
          name: String(form.get("name") ?? name).trim(),
          shift_pattern: String(form.get("shift_pattern") ?? "").trim(),
          max_students: Number(form.get("max_students")),
        });
      await queryClient.invalidateQueries({ queryKey: [`programme-${kind === "facility" ? "facilities" : `${kind}s`}`] });
      await queryClient.invalidateQueries({ queryKey: ["programme-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      pushToast({ kind: "success", title: "Directory record added", message: `${kind === "institution" ? "Institution" : kind === "facility" ? "Facility" : "Ward"} saved successfully.` });
      setKind(null);
      setName("");
      setPrefillFacilityId(null);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this directory record.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveResource() {
    if (!archivingResource) return;
    setBusy(true);
    try {
      const archived = !archivingResource.item.archived_at;
      if (archivingResource.kind === "institution")
        await updateInstitution(archivingResource.item.id, { archived });
      else await updateFacility(archivingResource.item.id, { archived });
      await queryClient.invalidateQueries({
        queryKey: [`programme-${archivingResource.kind === "facility" ? "facilities" : `${archivingResource.kind}s`}`],
      });
      await queryClient.invalidateQueries({ queryKey: ["programme-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      pushToast({ kind: "success", title: archived ? "Record archived" : "Record restored", message: `${archivingResource.kind === "institution" ? "Institution" : "Facility"} status was updated.` });
      setArchivingResource(null);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not update this directory record.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="programme-directory-page">
      {recordId ? (
        <ProgrammeDirectoryRecordDetail
          selection={recordSelection}
          wards={wards.data ?? []}
          facilities={facilities.data ?? []}
          loading={detailLoading}
          error={detailError}
          onRetry={detailRetry}
          onBack={backToDirectory}
          onEdit={editRecord}
          onArchive={archiveRecord}
          onAddWard={(facilityId) => {
            setPrefillFacilityId(facilityId);
            setKind("ward");
          }}
          onSelectWard={(wardId) => openRecord("wards", wardId)}
          onSelectFacility={(facilityId) => openRecord("facilities", facilityId)}
          onToggleWard={() => void toggleDetailedWard()}
          busy={busy}
        />
      ) : (
        <>
      <section className="pa-card" aria-labelledby="directory-heading">
        <header className="pa-card__header">
          <div className="min-w-0">
            <h3 id="directory-heading" className="pa-card__title">Directory</h3>
            <p className="pa-card__description">
              Set up the institutions, facilities, and wards that placements will use. Facilities are programme-wide and can serve more than one institution.
            </p>
          </div>
        </header>
      </section>
      <StatGrid columns={3}>
        <StatCard
          icon={<Building2 />}
          tone="teal"
          label="Institutions"
          value={counts.institutions}
          hint="Universities and training institutions"
          loading={loading}
        />
        <StatCard
          icon={<Hospital />}
          tone="blue"
          label="Facilities"
          value={counts.facilities}
          hint="Hospitals, clinics and training sites"
          loading={loading}
        />
        <StatCard
          icon={<BedDouble />}
          tone="violet"
          label="Wards"
          value={counts.wards}
          hint="Placement wards and departments"
          loading={loading}
        />
      </StatGrid>
      <div className="pd-layout">
        <div className="ps-stack">
          <nav className="pa-tabs" aria-label="Directory resources">
            {(
              [
                ["institutions", "Institutions"],
                ["facilities", "Facilities"],
                ["wards", "Wards"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? "page" : undefined}
                className="pa-tab"
                onClick={() => selectDirectoryTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="pa-table-wrap">
            {tab === "institutions" && (
              <ResourceTable
                title="Institutions"
                description="Add and manage the universities and training institutions in your programme."
                searchPlaceholder="Search institutions…"
                items={institutions.data ?? []}
                loading={institutions.isPending}
                error={institutions.isError}
                onRetry={() => void institutions.refetch()}
                onView={(item) => openRecord("institutions", item.id)}
                onAdd={() => setKind("institution")}
                columns={[
                  [
                    "Type",
                    (item) => (item as Institution).type || "Not specified",
                  ],
                  ["Location", (item) => item.county || "Not specified"],
                  [
                    "Status",
                    (item) => (item.archived_at ? "Archived" : (item as Institution).is_active === false ? "Inactive" : "Active"),
                  ],
                  ["Contact", (item) => (item as Institution).contact_email || (item as Institution).contact_phone || "Not added"],
                ]}
                onEdit={(item) =>
                  setEditingResource({
                    kind: "institution",
                    item: item as Institution,
                  })
                }
                onArchive={(item) =>
                  setArchivingResource({
                    kind: "institution",
                    item: item as Institution,
                  })
                }
              />
            )}
            {tab === "facilities" && (
              <ResourceTable
                title="Facilities"
                description="Add and manage the hospitals, clinics and training sites used for placements."
                searchPlaceholder="Search facilities…"
                items={facilities.data ?? []}
                loading={facilities.isPending}
                error={facilities.isError}
                onRetry={() => void facilities.refetch()}
                onView={(item) => openRecord("facilities", item.id)}
                onAdd={() => setKind("facility")}
                columns={[
                  [
                    "Level",
                    (item) => (item as Facility).level || "Not specified",
                  ],
                  ["Location", (item) => item.county || "Not specified"],
                  [
                    "Status",
                    (item) => (item.archived_at ? "Inactive" : "Active"),
                  ],
                  ["Contact", (item) => (item as Facility).contact_email || (item as Facility).contact_phone || "Not added"],
                ]}
                onEdit={(item) =>
                  setEditingResource({
                    kind: "facility",
                    item: item as Facility,
                  })
                }
                onArchive={(item) =>
                  setArchivingResource({
                    kind: "facility",
                    item: item as Facility,
                  })
                }
              />
            )}
            {tab === "wards" && (
              <WardTable
                wards={wards.data ?? []}
                facilities={facilities.data ?? []}
                loading={wards.isPending || facilities.isPending}
                error={wards.isError || facilities.isError}
                onRetry={() => {
                  void wards.refetch();
                  void facilities.refetch();
                }}
                onAdd={() => setKind("ward")}
                onView={(wardId) => openRecord("wards", wardId)}
                onError={onError}
              />
            )}
          </div>
        </div>
        <aside className="ps-stack">
          <AdminCard title="Quick actions" flush>
            <div className="pa-list">
              <ListRow
                icon={<Building2 />}
                tone="teal"
                title="Add institution"
                meta={<span className="ap-wrap">Include a new university or training institution</span>}
                onClick={() => setKind("institution")}
              />
              <ListRow
                icon={<Hospital />}
                tone="blue"
                title="Add facility"
                meta={<span className="ap-wrap">Add a hospital, clinic or training site</span>}
                onClick={() => setKind("facility")}
              />
              <ListRow
                icon={<BedDouble />}
                tone="violet"
                title="Add ward"
                meta={<span className="ap-wrap">Add a ward or department</span>}
                onClick={() => {
                  setPrefillFacilityId(null);
                  setKind("ward");
                }}
              />
            </div>
          </AdminCard>
          <AdminCard title="Import from file">
            <p className="ps-copy">
              Add up to 500 institutions, facilities, or wards from a reviewed CSV file.
            </p>
            <div className="ps-actions-col">
              <AdminButton
                variant="secondary"
                size="sm"
                icon={<Upload />}
                onClick={() => setShowImport(true)}
              >
                Import CSV
              </AdminButton>
            </div>
          </AdminCard>
          <AdminCard title="Need help?">
            <p className="ps-copy">
              Learn more about setting up your programme directory.
            </p>
            <div className="ps-actions-col">
              <AdminButton
                variant="ghost"
                size="sm"
                icon={<ArrowRight />}
                onClick={() => setShowGuidance(true)}
              >
                View documentation
              </AdminButton>
            </div>
          </AdminCard>
        </aside>
      </div>
        </>
      )}
      {kind && (
        <CreateDirectoryModal
          kind={kind}
          name={name}
          setName={setName}
          facilities={facilities.data ?? []}
          prefilledFacilityId={prefillFacilityId}
          existingNames={kind === "institution" ? (institutions.data ?? []).map((item) => item.name) : kind === "facility" ? (facilities.data ?? []).map((item) => item.name) : []}
          busy={busy}
          onClose={() => {
            setKind(null);
            setName("");
            setPrefillFacilityId(null);
          }}
          onSubmit={submit}
        />
      )}
      {editingResource && (
        <EditDirectoryModal
          resource={editingResource}
          busy={busy}
          onClose={() => setEditingResource(null)}
          onError={onError}
        />
      )}
      {archivingResource && (
        <ArchiveDirectoryModal
          resource={archivingResource}
          activeWardCount={archivingResource.kind === "facility" ? (wards.data ?? []).filter((ward) => ward.facility_id === archivingResource.item.id && ward.available).length : 0}
          occupiedPlacementCount={archivingResource.kind === "facility" ? (wards.data ?? []).filter((ward) => ward.facility_id === archivingResource.item.id).reduce((total, ward) => total + ward.allocated_students, 0) : 0}
          busy={busy}
          onClose={() => setArchivingResource(null)}
          onConfirm={() => void archiveResource()}
        />
      )}
      {editingWard && (
        <WardDialog
          ward={editingWard}
          facilities={facilities.data ?? []}
          busy={busy}
          onClose={() => setEditingWard(null)}
          onError={onError}
        />
      )}
      {showGuidance && (
        <DirectoryGuidanceModal
          onClose={() => setShowGuidance(false)}
          onError={onError}
        />
      )}
      {showImport && (
        <DirectoryImportModal
          facilities={(facilities.data ?? []).filter((item) => !item.archived_at)}
          onClose={() => setShowImport(false)}
          onComplete={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["programme-institutions"] }),
              queryClient.invalidateQueries({ queryKey: ["programme-facilities"] }),
              queryClient.invalidateQueries({ queryKey: ["programme-wards"] }),
              queryClient.invalidateQueries({ queryKey: ["programme-settings"] }),
              queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
            ]);
          }}
        />
      )}
    </div>
  );
}

function ResourceTable({
  title,
  description,
  searchPlaceholder,
  items,
  loading,
  error,
  onRetry,
  onView,
  onAdd,
  onEdit,
  onArchive,
  columns,
}: {
  title: string;
  description: string;
  searchPlaceholder: string;
  items: (Institution | Facility)[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onView: (item: Institution | Facility) => void;
  onAdd: () => void;
  onEdit: (item: Institution | Facility) => void;
  onArchive: (item: Institution | Facility) => void;
  columns: [string, (item: Institution | Facility) => string][];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "archived">("active");
  const filtered = items.filter((item) => {
    const itemIsActive = !item.archived_at && (! ("is_active" in item) || item.is_active !== false);
    const statusMatches = statusFilter === "all" || (statusFilter === "active" ? itemIsActive : statusFilter === "archived" ? Boolean(item.archived_at) : !item.archived_at && "is_active" in item && item.is_active === false);
    const classification = "type" in item ? item.type : item.level;
    const searchText = [item.name, item.contact_person, item.contact_email, item.contact_phone, item.county, classification]
      .filter(Boolean).join(" ").toLowerCase();
    return statusMatches && searchText.includes(query.trim().toLowerCase());
  });
  return (
    <>
      <div className="pa-card__header">
        <div className="min-w-0">
          <h3 className="pa-card__title">{title}</h3>
          <p className="pa-card__description">{description}</p>
        </div>
        <AdminButton size="sm" icon={<Plus />} onClick={onAdd}>
          Add {title.slice(0, -1).toLowerCase()}
        </AdminButton>
      </div>
      <div className="pd-filter">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
          label={searchPlaceholder}
        />
        <SelectField
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
          label={`Filter ${title.toLowerCase()} by status`}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "archived", label: "Archived" },
            { value: "all", label: "All records" },
          ]}
        />
        <span className="pd-count">{`${filtered.length} shown · ${items.length} total`}</span>
      </div>
      {loading ? (
        <div className="pd-state space-y-3">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="pd-error">
          <p>We could not load {title.toLowerCase()}.</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : filtered.length ? (
        <div className="pa-table-scroll">
          <table className="pa-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                {columns.map(([label]) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
                <th scope="col" className="text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="pa-cell-title">
                      {item.logo_url ? (
                        <img src={item.logo_url} alt="" className="pd-logo pd-logo--img" />
                      ) : (
                        <span aria-hidden="true" className="pd-logo pd-logo--ph">
                          <Building2 size={16} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <strong>{item.name}</strong>
                        <button type="button" onClick={() => onView(item)} className="pd-link">
                          View details <ArrowRight size={12} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </td>
                  {columns.map(([label, value]) => (
                    <td key={label}>
                      {label === "Status" ? (
                        <StatusPill tone={statusTone(value(item))}>{value(item)}</StatusPill>
                      ) : label === "Contact" && (item.contact_email || item.contact_phone) ? (
                        <span className="pd-contact block" title={[item.contact_email, item.contact_phone].filter(Boolean).join(" · ")}>
                          {item.contact_email && <a href={`mailto:${item.contact_email}`}>{item.contact_email}</a>}
                          {item.contact_phone && <a href={`tel:${item.contact_phone}`}>{item.contact_phone}</a>}
                        </span>
                      ) : (
                        value(item)
                      )}
                    </td>
                  ))}
                  <td className="text-right">
                    <ResourceActionMenu
                      item={item}
                      onEdit={() => onEdit(item)}
                      onArchive={() => onArchive(item)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Building2 size={22} />}
          title={`No ${title.toLowerCase()} found`}
          text="Add the first record to make it available to placements."
        />
      )}
    </>
  );
}

function statusTone(label: string): "success" | "neutral" | "warning" {
  if (label === "Active") return "success";
  if (label === "Archived") return "neutral";
  return "warning";
}

function ResourceActionMenu({
  item,
  onEdit,
  onArchive,
}: {
  item: Institution | Facility;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span ref={menuRef} className="pd-menu">
      <button
        type="button"
        aria-label={`Actions for ${item.name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="pd-icon-btn"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="pd-menu__list">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit details
          </button>
          <button
            type="button"
            className={item.archived_at ? "is-teal" : "is-danger"}
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
          >
            {item.archived_at ? "Restore record" : "Archive record"}
          </button>
        </div>
      )}
    </span>
  );
}
function DirectoryFormFooter({
  formId,
  onCancel,
  busy,
  label,
  busyLabel = "Saving…",
}: {
  formId: string;
  onCancel: () => void;
  busy: boolean;
  label: string;
  busyLabel?: string;
}) {
  return (
    <>
      <Button type="button" variant="tertiary" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" form={formId} disabled={busy} aria-busy={busy}>
        {busy ? busyLabel : label}
      </Button>
    </>
  );
}

function ContactFields({ defaults, optional }: { defaults?: Institution | Facility; optional?: boolean }) {
  return (
    <fieldset className="pd-group">
      <legend>Contact</legend>
      <Field label="Contact person" optional={optional}>
        <TextInput name="contact_person" defaultValue={defaults?.contact_person} autoComplete="off" />
      </Field>
      <FieldRow>
        <Field label="Contact email" optional>
          <TextInput name="contact_email" type="email" autoComplete="email" defaultValue={defaults?.contact_email} leading={<Mail />} />
        </Field>
        <Field label="Contact phone" optional hint={defaults ? undefined : "Include the country code where possible."}>
          <TextInput name="contact_phone" type="tel" autoComplete="tel" defaultValue={defaults?.contact_phone} leading={<Phone />} />
        </Field>
      </FieldRow>
    </fieldset>
  );
}

function EditDirectoryModal({
  resource,
  busy,
  onClose,
  onError,
}: {
  resource: EditableResource;
  busy: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState("");
  const working = busy || saving;
  const isInstitution = resource.kind === "institution";
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: {
      name: string; type: string; county: string; level: string;
      contact_person: string; contact_email: string; contact_phone: string;
      logo?: File; clear_logo?: boolean;
    } = {
      name: String(form.get("name") ?? "").trim(),
      type: String(form.get("type") ?? "").trim(),
      county: String(form.get("county") ?? "").trim(),
      level: String(form.get("level") ?? "").trim(),
      contact_person: String(form.get("contact_person") ?? "").trim(),
      contact_email: String(form.get("contact_email") ?? "").trim(),
      contact_phone: String(form.get("contact_phone") ?? "").trim(),
    };
    const logo = form.get("logo");
    if (logo instanceof File && logo.size > 2 * 1024 * 1024) {
      setLogoError("Choose a logo that is 2 MB or smaller.");
      onError("Choose a logo that is 2 MB or smaller.");
      return;
    }
    setLogoError("");
    if (logo instanceof File && logo.size) input.logo = logo;
    if (form.get("clear_logo") === "on") input.clear_logo = true;
    setSaving(true);
    try {
      if (resource.kind === "institution")
        await updateInstitution(resource.item.id, input);
      else
        await updateFacility(resource.item.id, {
          ...input,
          maternity_unit_name: String(
            form.get("maternity_unit_name") ?? "",
          ).trim(),
        });
      await queryClient.invalidateQueries({
        queryKey: [`programme-${resource.kind === "facility" ? "facilities" : `${resource.kind}s`}`],
      });
      await queryClient.invalidateQueries({ queryKey: ["programme-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      pushToast({ kind: "success", title: "Directory record updated", message: `${resource.kind === "institution" ? "Institution" : "Facility"} details were saved.` });
      onClose();
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this directory record.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!working}
      size="md"
      icon={isInstitution ? <Building2 /> : <Hospital />}
      title={`Edit ${resource.kind}`}
      description={resource.item.name}
      footer={<DirectoryFormFooter formId="edit-directory-form" onCancel={onClose} busy={working} label="Save changes" />}
    >
      <form id="edit-directory-form" onSubmit={save} className="pd-form">
        <Field label="Name" required>
          <TextInput name="name" defaultValue={resource.item.name} required minLength={2} />
        </Field>
        <FieldRow>
          <Field label={isInstitution ? "Type" : "Level"}>
            <TextInput
              name={isInstitution ? "type" : "level"}
              defaultValue={isInstitution ? (resource.item as Institution).type : (resource.item as Facility).level}
            />
          </Field>
          <Field label="County / location">
            <TextInput name="county" defaultValue={resource.item.county} leading={<MapPin />} />
          </Field>
        </FieldRow>
        {resource.kind === "facility" && (
          <Field label="Maternity unit name">
            <TextInput name="maternity_unit_name" defaultValue={(resource.item as Facility).maternity_unit_name} />
          </Field>
        )}
        <ContactFields defaults={resource.item} />
        <Field label="Logo" optional error={logoError || undefined} hint="PNG, JPEG or WebP, up to 2 MB.">
          <TextInput name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="pd-file" />
        </Field>
        {resource.item.logo_url && (
          <div className="pd-logo-current">
            <img src={resource.item.logo_url} alt={`${resource.item.name} logo`} />
            <label className="pd-check">
              <input name="clear_logo" type="checkbox" /> Remove current logo
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}

function ArchiveDirectoryModal({
  resource,
  activeWardCount,
  occupiedPlacementCount,
  busy,
  onClose,
  onConfirm,
}: {
  resource: EditableResource;
  activeWardCount: number;
  occupiedPlacementCount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const restoring = Boolean(resource.item.archived_at);
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      icon={restoring ? <ArchiveRestore /> : <Archive className="pd-icon-danger" />}
      title={restoring ? `Restore ${resource.item.name}?` : `Archive ${resource.item.name}?`}
      description={restoring ? "Restore directory record" : "Archive directory record"}
      footer={
        <>
          <Button type="button" variant="tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant={restoring ? "primary" : "danger"} onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? "Updating…" : restoring ? "Restore record" : "Archive record"}
          </Button>
        </>
      }
    >
      <p>
        {restoring
          ? "This will make the record available for new programme operations again."
          : "This will hide the record from active programme operations. Existing historical references are retained."}
      </p>
      {!restoring && resource.kind === "facility" && (
        <div className="pd-callout pd-callout--warn" role="note">
          <AlertTriangle aria-hidden="true" />
          <p>
            This facility currently has {activeWardCount} active {activeWardCount === 1 ? "ward" : "wards"} and {occupiedPlacementCount} occupying {occupiedPlacementCount === 1 ? "placement" : "placements"}. Archiving prevents new ward allocations; existing placement history remains available.
          </p>
        </div>
      )}
    </Modal>
  );
}

function WardTable({
  wards,
  facilities,
  loading,
  error,
  onRetry,
  onAdd,
  onView,
  onError,
}: {
  wards: Ward[];
  facilities: Facility[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onAdd: () => void;
  onView: (wardId: string) => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [editing, setEditing] = useState<Ward | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [busy, setBusy] = useState(false);
  const filtered = wards.filter((ward) => {
    const statusMatches = statusFilter === "all" || (statusFilter === "active") === ward.available;
    return statusMatches && `${ward.name} ${ward.facility_name}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  async function toggle(ward: Ward) {
    setBusy(true);
    try {
      await updateWard(ward.id, { archived: !ward.archived_at });
      await queryClient.invalidateQueries({ queryKey: ["programme-wards"] });
      await queryClient.invalidateQueries({ queryKey: ["programme-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      pushToast({ kind: "success", title: ward.archived_at ? "Ward restored" : "Ward archived", message: `${ward.name} is ${ward.archived_at ? "available" : "no longer available"} for new allocations.` });
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not update ward status.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="pa-card__header">
        <div className="min-w-0">
          <h3 className="pa-card__title">Wards</h3>
          <p className="pa-card__description">
            Placement wards and departments available for allocation.
          </p>
        </div>
        <AdminButton size="sm" icon={<Plus />} onClick={onAdd}>
          Add ward
        </AdminButton>
      </div>
      <div className="pd-filter">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search wards or facilities…"
          label="Search wards or facilities"
        />
        <SelectField
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
          label="Filter wards by status"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "all", label: "All wards" },
          ]}
        />
        <span className="pd-count">
          {filtered.length} of {wards.length}
        </span>
      </div>
      {loading ? (
        <div className="pd-state space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <div className="pd-error">
          <p>We could not load wards.</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : filtered.length ? (
        <div className="pa-table-scroll">
          <table className="pa-table">
            <thead>
              <tr>
                <th scope="col">Ward</th>
                <th scope="col">Occupancy</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ward) => {
                const facilityArchived = Boolean(
                  facilities.find((facility) => facility.id === ward.facility_id)?.archived_at,
                );
                return (
                  <tr key={ward.id}>
                    <td>
                      <div className="pa-cell-title">
                        <div className="min-w-0">
                          <strong>{ward.name}</strong>
                          <small>{ward.facility_name}</small>
                          <button type="button" onClick={() => onView(ward.id)} className="pd-link">
                            View details <ArrowRight size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      {ward.allocated_students}/{ward.max_students} occupying placements · {ward.available_slots}{" "}
                      capacity remaining
                    </td>
                    <td>
                      <StatusPill tone={ward.available ? "success" : "neutral"}>
                        {facilityArchived ? "Facility archived" : ward.archived_at ? "Archived" : "Active"}
                      </StatusPill>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(ward)}
                          aria-label={`Edit ${ward.name}`}
                          className="pd-icon-btn"
                        >
                          <Pencil size={15} />
                        </button>
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => void toggle(ward)}
                          disabled={busy || facilityArchived}
                        >
                          {facilityArchived ? "Facility archived" : ward.archived_at ? "Restore" : "Archive"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<BedDouble size={22} />}
          title="No wards found"
          text="Add the first ward to make it available to placements."
        />
      )}
      {editing && (
        <WardDialog
          ward={editing}
          facilities={facilities}
          busy={busy}
          onClose={() => setEditing(null)}
          onError={onError}
        />
      )}
    </>
  );
}

function CreateDirectoryModal({
  kind,
  name,
  setName,
  facilities,
  prefilledFacilityId,
  existingNames,
  busy,
  onClose,
  onSubmit,
}: {
  kind: ResourceKind;
  name: string;
  setName: (value: string) => void;
  facilities: Facility[];
  prefilledFacilityId: string | null;
  existingNames: string[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const duplicate =
    (kind === "institution" || kind === "facility") &&
    name.trim() !== "" &&
    existingNames.some((existing) => existing.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const description =
    kind === "institution"
      ? "A university or training institution that sends students on placement."
      : kind === "facility"
        ? "A hospital, clinic or training site. Facilities are programme-wide."
        : "A ward or department students are allocated to.";
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="md"
      icon={kind === "institution" ? <Building2 /> : kind === "facility" ? <Hospital /> : <BedDouble />}
      title={`Add ${kind}`}
      description={description}
      footer={<DirectoryFormFooter formId="create-directory-form" onCancel={onClose} busy={busy} label={`Add ${kind}`} />}
    >
      <form id="create-directory-form" className="pd-form" onSubmit={onSubmit}>
        {kind === "ward" && (
          <Field label="Facility" required>
            <SelectInput name="facility_id" required defaultValue={prefilledFacilityId ?? ""}>
              <option value="" disabled>
                Select facility
              </option>
              {facilities
                .filter((facility) => !facility.archived_at)
                .map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
            </SelectInput>
          </Field>
        )}
        <Field label="Name" required>
          <TextInput value={name} name="name" onChange={(event) => setName(event.target.value)} required minLength={2} autoFocus />
        </Field>
        {duplicate && (
          <div role="status" className="pd-callout pd-callout--warn">
            <AlertTriangle aria-hidden="true" />
            <p>
              A {kind} with this name already exists. Check the directory before continuing; same-name campuses or sites may still be valid.
            </p>
          </div>
        )}
        {(kind === "institution" || kind === "facility") && (
          <>
            <FieldRow>
              <Field label={kind === "institution" ? "Type" : "Level"} optional>
                <TextInput name={kind === "institution" ? "type" : "level"} />
              </Field>
              <Field label="County / location" optional>
                <TextInput name="county" leading={<MapPin />} />
              </Field>
            </FieldRow>
            {kind === "facility" && (
              <Field label="Maternity unit name" optional>
                <TextInput name="maternity_unit_name" />
              </Field>
            )}
            <ContactFields optional />
            <Field label="Logo" optional hint="PNG, JPEG or WebP, up to 2 MB.">
              <TextInput name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="pd-file" />
            </Field>
            <p className="pd-fineprint">Contact details and logos are stored for programme directory use. Public partner display is not enabled.</p>
          </>
        )}
        {kind === "ward" && (
          <>
            <Field
              label="Student capacity"
              required
              hint="Counts Orientation, Induction, Active, and Paused placements. This is a hard limit; reductions below current occupancy are blocked."
            >
              <TextInput name="max_students" type="number" min="1" inputMode="numeric" placeholder="Enter the maximum active placements" required />
            </Field>
            <Field label="Shift pattern" optional>
              <TextInput name="shift_pattern" placeholder="e.g. Day and night" />
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}

function WardDialog({
  ward,
  facilities,
  busy,
  onClose,
  onError,
}: {
  ward: Ward;
  facilities: Facility[];
  busy: boolean;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const working = busy || saving;
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await updateWard(ward.id, {
        name: String(form.get("name") ?? "").trim(),
        shift_pattern: String(form.get("shift_pattern") ?? "").trim(),
        max_students: Number(form.get("max_students")),
      });
      await queryClient.invalidateQueries({ queryKey: ["programme-wards"] });
      await queryClient.invalidateQueries({ queryKey: ["programme-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      pushToast({ kind: "success", title: "Ward details updated", message: `${ward.name} was saved.` });
      onClose();
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not save this ward.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!working}
      size="md"
      icon={<BedDouble />}
      title="Edit ward"
      description={ward.name}
      footer={<DirectoryFormFooter formId="edit-ward-form" onCancel={onClose} busy={working} label="Save changes" />}
    >
      <form id="edit-ward-form" onSubmit={save} className="pd-form">
        <Field label="Facility" hint="A ward cannot be moved to another facility.">
          <TextInput
            value={facilities.find((item) => item.id === ward.facility_id)?.name ?? ward.facility_name}
            readOnly
            leading={<Hospital />}
          />
        </Field>
        <Field label="Ward name" required>
          <TextInput name="name" defaultValue={ward.name} required />
        </Field>
        <FieldRow>
          <Field label="Student capacity" required>
            <TextInput name="max_students" type="number" min="1" inputMode="numeric" defaultValue={ward.max_students} required />
          </Field>
          <Field label="Shift pattern">
            <TextInput name="shift_pattern" defaultValue={ward.shift_pattern} />
          </Field>
        </FieldRow>
        <p className="pd-fineprint">
          Current occupancy is {ward.allocated_students}. Counts Orientation, Induction, Active, and Paused placements; reductions below occupancy are blocked.
        </p>
      </form>
    </Modal>
  );
}

function DirectoryGuidanceModal({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (message: string) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<BookOpen />}
      title="Keep your operating context accurate"
      description="Programme directory"
      footer={
        <>
          <Button type="button" variant="tertiary" to="mailto:support@mentormama.org?subject=Programme directory guidance" onClick={onClose}>
            Contact support
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose();
              onError(
                "Directory guidance reviewed. Add institutions, facilities, and wards individually until bulk import is enabled.",
              );
            }}
          >
            Done
          </Button>
        </>
      }
    >
      <ul className="pd-guide">
        <li>
          <span aria-hidden="true"><Building2 /></span>
          <p>
            Add institutions and facilities used by your programme, then add wards under each facility. Facilities are programme-wide; they are not owned by a single institution and can serve multiple institutions.
          </p>
        </li>
        <li>
          <span aria-hidden="true"><Archive /></span>
          <p>
            Archive records when they are no longer available. Historical placements remain intact, and archived facilities cannot receive new wards.
          </p>
        </li>
        <li>
          <span aria-hidden="true"><FileUp /></span>
          <p>
            CSV imports use a type-specific template, a row-by-row preview, and an all-or-nothing commit. Institution and facility contacts can be imported; logos must be added to each record separately.
          </p>
        </li>
      </ul>
    </Modal>
  );
}

const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const IMPORT_STEPS = ["Choose file", "Review", "Done"] as const;

function ImportSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="pd-steps" aria-label="Import progress">
      {IMPORT_STEPS.map((label, index) => {
        const number = index + 1;
        const state = number < current || current === 3 ? "done" : number === current ? "current" : "todo";
        return (
          <li key={label} className={`pd-steps__item is-${state}`} aria-current={number === current ? "step" : undefined}>
            <span className="pd-steps__dot" aria-hidden="true">
              {state === "done" ? <Check /> : number}
            </span>
            <span className="pd-steps__label">
              {label}
              <span className="sr-only">{state === "done" ? " (complete)" : state === "current" ? " (current step)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function formatBytes(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function DirectoryImportModal({
  facilities,
  onClose,
  onComplete,
}: {
  facilities: Facility[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const [kind, setKind] = useState<DirectoryImportKind>("institutions");
  const [facilityId, setFacilityId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DirectoryImportPreview | null>(null);
  const [confirmWarnings, setConfirmWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragging, setDragging] = useState(false);
  const commandKey = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function resetPreview() {
    setPreview(null);
    setConfirmWarnings(false);
    setError("");
    commandKey.current = null;
  }

  function chooseFile(selected: File | null) {
    setFile(selected);
    resetPreview();
    if (!selected) return;
    if (!/\.csv$/i.test(selected.name) && selected.type !== "text/csv") setError("Choose a CSV file (.csv).");
    else if (selected.size > IMPORT_MAX_BYTES) setError("Choose a CSV file that is 2 MB or smaller.");
  }

  function downloadTemplate() {
    const headers: Record<DirectoryImportKind, string> = {
      institutions: "name,type,county,contact_person,contact_email,contact_phone",
      facilities: "name,county,level,maternity_unit_name,contact_person,contact_email,contact_phone",
      wards: "name,shift_pattern,max_students",
    };
    saveBlob(csvBlob([headers[kind].split(",")]), datedFilename(`${kind}-template`, "csv"));
  }

  async function createPreview() {
    if (!file) {
      setError("Choose a CSV file to preview.");
      return;
    }
    if (kind === "wards" && !facilityId) {
      setError("Choose the facility that owns these wards.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await previewDirectoryImport(kind, file, kind === "wards" ? facilityId : undefined);
      setPreview(result);
      setConfirmWarnings(false);
      commandKey.current = null;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We could not read this CSV. Check the file and try again.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!file || !preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await commitDirectoryImport({
        kind,
        file,
        facilityId: kind === "wards" ? facilityId : undefined,
        previewToken: preview.preview_token,
        confirmWarnings,
        idempotencyKey: commandKey.current ?? (commandKey.current = crypto.randomUUID()),
      });
      await onComplete();
      setSuccess(result.replayed
        ? "This import was already completed. The directory has been refreshed."
        : `${result.created_count ?? 0} ${kind} ${result.created_count === 1 ? "record" : "records"} added successfully.`);
      pushToast({ kind: "success", title: "Directory import complete", message: result.replayed ? "The directory was refreshed with the completed import." : `${result.created_count ?? 0} ${kind} added.` });
      setPreview(null);
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : "The import could not be completed. Your file is still selected so you can retry.";
      setError(message);
      pushToast({ kind: "error", title: "Directory import failed", message });
    } finally {
      setBusy(false);
    }
  }

  const step: 1 | 2 | 3 = success ? 3 : preview ? 2 : 1;
  const fileTooBig = Boolean(file && file.size > IMPORT_MAX_BYTES);
  const canCommit = Boolean(preview && preview.rows.length && !preview.errors.length && (!preview.warning_count || confirmWarnings));
  const readyCount = preview ? preview.rows.filter((row) => row.status === "ready").length : 0;

  let footer: React.ReactNode;
  if (step === 3) {
    footer = <Button type="button" onClick={onClose}>Done</Button>;
  } else if (step === 2 && preview) {
    footer = (
      <>
        <Button type="button" variant="tertiary" disabled={busy} onClick={resetPreview}>
          <ArrowLeft size={15} aria-hidden="true" /> Choose another file
        </Button>
        <Button type="button" disabled={busy || !canCommit} aria-busy={busy} onClick={() => void commitImport()}>
          {busy ? "Importing…" : `Import ${preview.rows.length} ${kind}`}
        </Button>
      </>
    );
  } else {
    footer = (
      <>
        <Button type="button" variant="tertiary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          disabled={busy || !file || fileTooBig || (kind === "wards" && !facilityId)}
          aria-busy={busy}
          onClick={() => void createPreview()}
        >
          {busy ? "Checking file…" : "Preview records"}
        </Button>
      </>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      icon={<Upload />}
      title="Import directory records"
      description="Preview every row before adding anything. Each file is limited to 500 records and 2 MB, and commits as one all-or-nothing operation."
      closeLabel="Close import"
      footer={footer}
    >
      <ImportSteps current={step} />

      {step === 3 && (
        <div role="status" className="pd-done">
          <span aria-hidden="true"><CheckCircle2 /></span>
          <p className="pd-done__title">Import complete</p>
          <p className="pd-done__text">{success}</p>
        </div>
      )}

      {step === 1 && (
        <div className="pd-import-step">
          <FieldRow>
            <Field label="Record type">
              <SelectInput
                value={kind}
                disabled={busy}
                onChange={(event) => { setKind(event.target.value as DirectoryImportKind); resetPreview(); }}
              >
                <option value="institutions">Institutions</option>
                <option value="facilities">Facilities</option>
                <option value="wards">Wards</option>
              </SelectInput>
            </Field>
            {kind === "wards" ? (
              <Field
                label="Facility for these wards"
                error={!facilities.length ? "Add an active facility to the programme directory before importing wards." : undefined}
              >
                <SelectInput
                  value={facilityId}
                  disabled={busy || !facilities.length}
                  onChange={(event) => { setFacilityId(event.target.value); resetPreview(); }}
                >
                  <option value="">Choose a facility</option>
                  {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                </SelectInput>
              </Field>
            ) : (
              <p className="pd-fineprint pd-fineprint--end">Facilities are programme-wide. Wards are imported into one selected active facility.</p>
            )}
          </FieldRow>

          <div className="pd-template">
            <span aria-hidden="true"><FileText /></span>
            <p>
              <strong>Start with the matching template.</strong> Use the exact column names. Contact fields are available for institutions and facilities.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate}>
              <Download size={15} aria-hidden="true" /> Download CSV template
            </Button>
          </div>

          <div
            className={`pd-drop${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
            onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!busy) chooseFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              ref={fileInput}
              id="directory-import-file"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => { chooseFile(event.target.files?.[0] ?? null); event.target.value = ""; }}
            />
            {file ? (
              <div className="pd-drop__file">
                <span aria-hidden="true"><FileText /></span>
                <p>
                  <strong>{file.name}</strong>
                  <small>{formatBytes(file.size)}</small>
                </p>
                <Button type="button" variant="tertiary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
                  Replace file
                </Button>
                <button type="button" className="pd-icon-btn" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => chooseFile(null)}>
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <span className="pd-drop__icon" aria-hidden="true"><Upload /></span>
                <p className="pd-drop__title">Drag and drop your completed CSV here</p>
                <p className="pd-drop__hint">or</p>
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
                  Choose file
                </Button>
                <p className="pd-drop__hint">CSV only · up to 500 rows · 2 MB</p>
              </>
            )}
          </div>
          {error && (
            <p role="alert" className="pd-callout pd-callout--error">
              <AlertTriangle aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </div>
      )}

      {step === 2 && preview && (
        <div className="pd-import-step">
          <div className="pd-summary" role="group" aria-label="Review summary">
            <span className="pd-summary__item is-ok"><strong>{readyCount}</strong> ready</span>
            {preview.warning_count > 0 && <span className="pd-summary__item is-warn"><strong>{preview.warning_count}</strong> {preview.warning_count === 1 ? "duplicate warning" : "duplicate warnings"}</span>}
            {preview.error_count > 0 && <span className="pd-summary__item is-bad"><strong>{preview.error_count}</strong> {preview.error_count === 1 ? "row with errors" : "rows with errors"}</span>}
          </div>
          <p className="sr-only">{preview.rows.length} rows · {preview.error_count} with errors · {preview.warning_count} with duplicate warnings</p>
          {preview.errors.length > 0 && (
            <div className="pd-callout pd-callout--error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <div>
                <p className="pd-callout__title">Resolve these issues in the CSV, then preview it again.</p>
                <ul>
                  {preview.errors.slice(0, 12).map((issue, index) => (
                    <li key={`${issue.row}-${issue.field}-${index}`}>{issue.row ? `Row ${issue.row}: ` : "File: "}{issue.message}</li>
                  ))}
                </ul>
                {preview.errors.length > 12 && <p>And {preview.errors.length - 12} more.</p>}
              </div>
            </div>
          )}
          <div className="pd-review" tabIndex={0} role="region" aria-label="Row-by-row validation">
            <table>
              <thead>
                <tr><th scope="col">Row</th><th scope="col">Name</th><th scope="col">Review</th><th scope="col">Issue</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row} className={`is-${row.status}`}>
                    <td data-label="Row">{row.row}</td>
                    <td data-label="Name" className="pd-review__name">{row.name || "Unnamed record"}</td>
                    <td data-label="Review">
                      <StatusPill tone={row.status === "ready" ? "success" : row.status === "warning" ? "warning" : "danger"}>
                        {row.status === "ready" ? "Ready" : row.status === "warning" ? "Check" : "Fix"}
                      </StatusPill>
                    </td>
                    <td data-label="Issue" className="pd-review__issue">{row.issues.map((issue) => issue.message).join(" ") || "No issues"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.warning_count > 0 && (
            <label className="pd-confirm">
              <input type="checkbox" checked={confirmWarnings} onChange={(event) => setConfirmWarnings(event.target.checked)} />
              <span>I reviewed the duplicate-name warnings. These may be distinct campuses or branches, and I want to continue.</span>
            </label>
          )}
          <p className="pd-fineprint">Import is permanent as a batch. After import, records can be archived individually. Logos are not included.</p>
          {error && (
            <p role="alert" className="pd-callout pd-callout--error">
              <AlertTriangle aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
