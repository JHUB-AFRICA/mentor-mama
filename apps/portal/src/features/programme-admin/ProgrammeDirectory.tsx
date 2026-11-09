import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileUp,
  Hospital,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { Button, Card, Skeleton } from "@mentormama/ui";
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
import { useAccessibleDialog } from "./useAccessibleDialog";
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
      <div className="programme-directory-heading">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
            Operating context
          </p>
          <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-navy">
            Directory
          </h3>
          <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-navy-muted">
            Set up the institutions, facilities, and wards that placements will
            use. Facilities are programme-wide and can serve more than one institution.
          </p>
        </div>
        <div className="programme-directory-callout">
          <span>
            <Building2 size={20} />
          </span>
          <div>
            <p className="font-body text-sm font-bold text-navy">
              Build your programme directory
            </p>
            <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
              Add the operating context used in placements.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuidance(true)}
            className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 font-body text-xs font-semibold text-navy"
          >
            View guidance <ArrowRight size={14} />
          </button>
        </div>
      </div>
      <div className="programme-directory-kpis">
        {[
          [
            "Institutions",
            counts.institutions,
            "Universities and training institutions",
            <Building2 size={22} />,
            "teal",
          ],
          [
            "Facilities",
            counts.facilities,
            "Hospitals, clinics and training sites",
            <Hospital size={22} />,
            "blue",
          ],
          [
            "Wards",
            counts.wards,
            "Placement wards and departments",
            <ShieldAlert size={22} />,
            "red",
          ],
        ].map(([label, count, detail, icon, tone]) => (
          <article
            key={String(label)}
            className={`programme-directory-kpi programme-directory-kpi--${tone}`}
          >
            <span>{icon}</span>
            <div>
              <p className="font-body text-sm font-semibold text-navy-muted">
                {label}
              </p>
              <strong>{loading ? "—" : count}</strong>
              <small>{detail}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="programme-directory-layout">
        <div className="min-w-0">
          <nav
            className="programme-directory-tabs"
            aria-label="Directory resources"
          >
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
                className={tab === id ? "is-active" : ""}
                onClick={() => selectDirectoryTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <Card padding="sm" className="programme-directory-table-card">
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
          </Card>
        </div>
        <aside className="programme-directory-sidebar">
          <Card padding="sm">
            <h3 className="font-display text-lg font-bold text-navy">
              Quick actions
            </h3>
            <QuickAction
              icon={<Building2 size={18} />}
              title="Add institution"
              detail="Include a new university or training institution"
              onClick={() => setKind("institution")}
            />
            <QuickAction
              icon={<Hospital size={18} />}
              title="Add facility"
              detail="Add a hospital, clinic or training site"
              onClick={() => setKind("facility")}
            />
            <QuickAction
              icon={<ShieldAlert size={18} />}
              title="Add ward"
              detail="Add a ward or department"
              onClick={() => {
                setPrefillFacilityId(null);
                setKind("ward");
              }}
            />
          </Card>
          <Card padding="sm">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal">
                <FileUp size={19} />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-navy">
                  Import from file
                </h3>
                <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                  Add up to 500 institutions, facilities, or wards from a reviewed CSV file.
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 font-body text-xs font-semibold text-navy"
                  onClick={() => setShowImport(true)}
                >
                  <Upload size={15} />
                  Import CSV
                </button>
              </div>
            </div>
          </Card>
          <Card padding="sm" className="bg-teal-light/35">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-teal">
                <CheckCircle2 size={19} />
              </span>
              <div>
                <h3 className="font-display text-lg font-bold text-navy">
                  Need help?
                </h3>
                <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                  Learn more about setting up your programme directory.
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 font-body text-sm font-bold text-teal"
                  onClick={() => setShowGuidance(true)}
                >
                  View documentation <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </Card>
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
      <div className="programme-directory-table-heading">
        <div>
          <h3 className="font-display text-lg font-bold text-navy">{title}</h3>
          <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
            {description}
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus size={15} className="mr-1" />
          Add {title.slice(0, -1).toLowerCase()}
        </Button>
      </div>
      <div className="programme-directory-filter">
        <label className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-3 text-navy-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-white pl-10 pr-3 font-body text-sm text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </label>
        <label className="sr-only" htmlFor={`${title.toLowerCase()}-status-filter`}>Filter {title.toLowerCase()} by status</label>
        <select
          id={`${title.toLowerCase()}-status-filter`}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="h-10 rounded-lg border border-border bg-white px-3 font-body text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
          <option value="all">All records</option>
        </select>
        <span className="font-body text-xs font-semibold text-navy-muted">
          {`${filtered.length} shown · ${items.length} total`}
        </span>
      </div>
      {loading ? (
        <div className="space-y-3 py-5">
          {[1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="border-l-2 border-error bg-error/5 px-4 py-5">
          <p className="font-body text-sm font-semibold text-error">
            We could not load {title.toLowerCase()}.
          </p>
          <button
            type="button"
            className="mt-2 font-body text-xs font-semibold text-teal underline"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : filtered.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-y border-border">
                <th className="px-3 py-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                  Name
                </th>
                {columns.map(([label]) => (
                  <th
                    key={label}
                    className="px-3 py-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted"
                  >
                    {label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-body text-[0.68rem] font-bold uppercase tracking-[0.1em] text-navy-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-0 hover:bg-mist/40"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {item.logo_url ? <img src={item.logo_url} alt="" className="size-8 shrink-0 rounded-md border border-border bg-white object-contain p-0.5" /> : <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-teal-light/60 text-teal"><Building2 size={15} /></span>}
                      <div className="min-w-0"><p className="font-body text-sm font-semibold text-navy">{item.name}</p>
                        <button type="button" onClick={() => onView(item)} className="mt-1 inline-flex min-h-8 items-center gap-1 font-body text-xs font-bold text-teal hover:underline">
                          View details <ArrowRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </td>
                  {columns.map(([label, value]) => (
                    <td
                      key={label}
                      className="px-3 py-3 font-body text-xs text-navy-muted"
                    >
                      {label === "Contact" && (item.contact_email || item.contact_phone) ? <span className="block max-w-44" title={[item.contact_email, item.contact_phone].filter(Boolean).join(" · ")}>{item.contact_email && <a className="block truncate text-teal hover:underline" href={`mailto:${item.contact_email}`}>{item.contact_email}</a>}{item.contact_phone && <a className="block truncate hover:text-teal" href={`tel:${item.contact_phone}`}>{item.contact_phone}</a>}</span> : value(item)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right">
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
        <div className="py-12 text-center">
          <p className="font-body text-sm font-semibold text-navy">
            No {title.toLowerCase()} found
          </p>
          <p className="mt-1 font-body text-xs text-navy-muted">
            Add the first record to make it available to placements.
          </p>
        </div>
      )}
    </>
  );
}

function QuickAction({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-border py-3 text-left last:border-0"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block font-body text-sm text-navy">{title}</strong>
        <small className="mt-1 block font-body text-xs leading-5 text-navy-muted">
          {detail}
        </small>
      </span>
      <ArrowRight size={15} className="text-navy-muted" />
    </button>
  );
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
    <span ref={menuRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Actions for ${item.name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-border p-2 text-navy-muted hover:border-teal hover:text-teal"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-border bg-white p-1 text-left shadow-lg">
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left font-body text-xs font-semibold text-navy hover:bg-mist"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit details
          </button>
          <button
            type="button"
            className={`block w-full rounded-lg px-3 py-2 text-left font-body text-xs font-semibold ${item.archived_at ? "text-teal" : "text-error"} hover:bg-mist`}
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
  const dialogRef = useAccessibleDialog<HTMLElement>(onClose);
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
      onError("Choose a logo that is 2 MB or smaller.");
      return;
    }
    if (logo instanceof File && logo.size) input.logo = logo;
    if (form.get("clear_logo") === "on") input.clear_logo = true;
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
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-directory-title"
        tabIndex={-1}
        className="max-h-[min(88vh,52rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Operating context
            </p>
            <h3
              id="edit-directory-title"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Edit {resource.kind}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-navy-muted hover:bg-mist"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={save} className="mt-5 grid gap-3">
          <label className="font-body text-sm font-semibold text-navy">
            Name
            <input
              name="name"
              className="auth-control mt-1"
              defaultValue={resource.item.name}
              required
              minLength={2}
            />
          </label>
          <label className="font-body text-sm font-semibold text-navy">
            {resource.kind === "institution" ? "Type" : "Level"}
            <input
              name={resource.kind === "institution" ? "type" : "level"}
              className="auth-control mt-1"
              defaultValue={
                resource.kind === "institution"
                  ? (resource.item as Institution).type
                  : (resource.item as Facility).level
              }
            />
          </label>
          <label className="font-body text-sm font-semibold text-navy">
            County / location
            <input
              name="county"
              className="auth-control mt-1"
              defaultValue={resource.item.county}
            />
          </label>
      {resource.kind === "facility" && (
            <label className="font-body text-sm font-semibold text-navy">
              Maternity unit name
              <input
                name="maternity_unit_name"
                className="auth-control mt-1"
                defaultValue={(resource.item as Facility).maternity_unit_name}
              />
            </label>
          )}
          <label className="font-body text-sm font-semibold text-navy">
            Contact person
            <input
              name="contact_person"
              className="auth-control mt-1"
              defaultValue={resource.item.contact_person}
            />
          </label>
          <label className="font-body text-sm font-semibold text-navy">
            Contact email <span className="font-normal text-navy-muted">(optional)</span>
            <input name="contact_email" type="email" className="auth-control mt-1" defaultValue={resource.item.contact_email} autoComplete="email" />
          </label>
          <label className="font-body text-sm font-semibold text-navy">
            Contact phone <span className="font-normal text-navy-muted">(optional)</span>
            <input name="contact_phone" type="tel" className="auth-control mt-1" defaultValue={resource.item.contact_phone} autoComplete="tel" />
          </label>
          <label className="font-body text-sm font-semibold text-navy">
            Logo <span className="font-normal text-navy-muted">(optional, PNG/JPEG/WebP, up to 2 MB)</span>
            {resource.item.logo_url && <img src={resource.item.logo_url} alt={`${resource.item.name} logo`} className="mt-2 size-14 rounded-lg border border-border object-contain p-1" />}
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm text-navy-muted file:mr-3 file:rounded-lg file:border-0 file:bg-teal-light file:px-3 file:py-2 file:font-semibold file:text-teal" />
            {resource.item.logo_url && <label className="mt-2 flex items-center gap-2 text-xs font-medium text-navy-muted"><input name="clear_logo" type="checkbox" /> Remove current logo</label>}
          </label>
          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>
    </div>
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
  const dialogRef = useAccessibleDialog<HTMLElement>(onClose);
  const restoring = Boolean(resource.item.archived_at);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-directory-title"
        tabIndex={-1}
        className="max-h-[min(88vh,52rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <p
          className={`font-body text-xs font-bold uppercase tracking-[0.14em] ${restoring ? "text-teal" : "text-error"}`}
        >
          {restoring ? "Restore directory record" : "Archive directory record"}
        </p>
        <h3
          id="archive-directory-title"
          className="mt-2 font-display text-2xl font-bold text-navy"
        >
          {restoring
            ? `Restore ${resource.item.name}?`
            : `Archive ${resource.item.name}?`}
        </h3>
        <p className="mt-3 font-body text-sm leading-6 text-navy-muted">
          {restoring
            ? "This will make the record available for new programme operations again."
            : "This will hide the record from active programme operations. Existing historical references are retained."}
        </p>
        {!restoring && resource.kind === "facility" && (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 font-body text-xs leading-5 text-amber-950">
            This facility currently has {activeWardCount} active {activeWardCount === 1 ? "ward" : "wards"} and {occupiedPlacementCount} occupying {occupiedPlacementCount === 1 ? "placement" : "placements"}. Archiving prevents new ward allocations; existing placement history remains available.
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className={!restoring ? "bg-error hover:bg-error/90" : ""}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy
              ? "Updating…"
              : restoring
                ? "Restore record"
                : "Archive record"}
          </Button>
        </div>
      </section>
    </div>
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
      <div className="programme-directory-table-heading">
        <div>
          <h3 className="font-display text-lg font-bold text-navy">Wards</h3>
          <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
            Placement wards and departments available for allocation.
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus size={15} className="mr-1" />
          Add ward
        </Button>
      </div>
      <div className="programme-directory-filter">
        <label className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-3 text-navy-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-white pl-10 pr-3 font-body text-sm text-navy outline-none focus:border-teal"
            placeholder="Search wards or facilities…"
            aria-label="Search wards or facilities"
          />
        </label>
        <label className="sr-only" htmlFor="ward-status-filter">Filter wards by status</label>
        <select id="ward-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-lg border border-border bg-white px-3 font-body text-sm text-navy focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All wards</option>
        </select>
        <span className="font-body text-xs font-semibold text-navy-muted">
          {filtered.length} of {wards.length}
        </span>
      </div>
      {loading ? (
        <div className="space-y-3 py-5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <div className="border-l-2 border-error bg-error/5 px-4 py-5">
          <p className="font-body text-sm text-error">
            We could not load wards.
          </p>
          <button
            type="button"
            className="mt-2 font-body text-xs text-teal underline"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((ward) => (
            <div
              key={ward.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm font-semibold text-navy">
                  {ward.name}
                </p>
                <p className="mt-1 font-body text-xs text-navy-muted">
                  {ward.facility_name} · {ward.allocated_students}/
                  {ward.max_students} occupying placements · {ward.available_slots}{" "}
                  capacity remaining
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 font-body text-[0.68rem] font-bold ${ward.available ? "bg-teal-light text-teal" : "bg-mist text-navy-muted"}`}>
                {facilities.find((facility) => facility.id === ward.facility_id)?.archived_at ? "Facility archived" : ward.archived_at ? "Archived" : "Active"}
              </span>
              <button type="button" onClick={() => onView(ward.id)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-body text-xs font-bold text-teal hover:bg-teal-light">
                View details <ArrowRight size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setEditing(ward)}
                aria-label={`Edit ${ward.name}`}
                className="rounded-lg border border-border p-2 text-navy-muted hover:border-teal hover:text-teal"
              >
                <Pencil size={15} />
              </button>
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => void toggle(ward)}
                disabled={busy || Boolean(facilities.find((facility) => facility.id === ward.facility_id)?.archived_at)}
              >
                {facilities.find((facility) => facility.id === ward.facility_id)?.archived_at ? "Facility archived" : ward.archived_at ? "Restore" : "Archive"}
              </Button>
            </div>
          ))}
        </div>
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
  const dialogRef = useAccessibleDialog<HTMLElement>(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/45 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-dialog-title"
        tabIndex={-1}
        className="max-h-[min(88vh,52rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Operating context
            </p>
            <h3
              id="directory-dialog-title"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Add {kind}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-navy-muted hover:bg-mist"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {kind === "ward" && (
            <label className="block font-body text-sm font-semibold text-navy">
              Facility
              <select
                name="facility_id"
                className="auth-control mt-2"
                required
                defaultValue={prefilledFacilityId ?? ""}
              >
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
              </select>
            </label>
          )}
          <label className="block font-body text-sm font-semibold text-navy">
            Name
            <input
              className="auth-control mt-2"
              value={name}
              name="name"
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              autoFocus
            />
          </label>
          {(kind === "institution" || kind === "facility") && existingNames.some((existing) => existing.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()) && (
            <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-body text-xs leading-5 text-amber-950">
              A {kind} with this name already exists. Check the directory before continuing; same-name campuses or sites may still be valid.
            </p>
          )}
          {(kind === "institution" || kind === "facility") && <>
            <label className="block font-body text-sm font-semibold text-navy">
              {kind === "institution" ? "Type" : "Level"} <span className="font-normal text-navy-muted">(optional)</span>
              <input name={kind === "institution" ? "type" : "level"} className="auth-control mt-2" />
            </label>
            <label className="block font-body text-sm font-semibold text-navy">
              County / location <span className="font-normal text-navy-muted">(optional)</span>
              <input name="county" className="auth-control mt-2" />
            </label>
            {kind === "facility" && <label className="block font-body text-sm font-semibold text-navy">Maternity unit name <span className="font-normal text-navy-muted">(optional)</span><input name="maternity_unit_name" className="auth-control mt-2" /></label>}
            <label className="block font-body text-sm font-semibold text-navy">Contact person <span className="font-normal text-navy-muted">(optional)</span><input name="contact_person" className="auth-control mt-2" /></label>
            <label className="block font-body text-sm font-semibold text-navy">Contact email <span className="font-normal text-navy-muted">(optional)</span><input name="contact_email" type="email" autoComplete="email" className="auth-control mt-2" /></label>
            <label className="block font-body text-sm font-semibold text-navy">Contact phone <span className="font-normal text-navy-muted">(optional)</span><input name="contact_phone" type="tel" autoComplete="tel" className="auth-control mt-2" placeholder="Include country code where possible" /></label>
            <label className="block font-body text-sm font-semibold text-navy">Logo <span className="font-normal text-navy-muted">(optional, PNG/JPEG/WebP, up to 2 MB)</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm text-navy-muted file:mr-3 file:rounded-lg file:border-0 file:bg-teal-light file:px-3 file:py-2 file:font-semibold file:text-teal" /></label>
            <p className="text-xs leading-5 text-navy-muted">Contact details and logos are stored for programme directory use. Public partner display is not enabled.</p>
          </>}
          {kind === "ward" && (
            <>
              <label className="block font-body text-sm font-semibold text-navy">
                Student capacity
                <input
                  name="max_students"
                  type="number"
                  min="1"
                  className="auth-control mt-2"
                  placeholder="Enter the maximum active placements"
                  required
                />
                <span className="mt-1 block text-xs font-normal leading-5 text-navy-muted">Counts Orientation, Induction, Active, and Paused placements. This is a hard limit; reductions below current occupancy are blocked.</span>
              </label>
              <label className="block font-body text-sm font-semibold text-navy">
                Shift pattern{" "}
                <span className="font-normal text-navy-muted">(optional)</span>
                <input
                  name="shift_pattern"
                  className="auth-control mt-2"
                  placeholder="e.g. Day and night"
                />
              </label>
            </>
          )}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : `Add ${kind}`}
            </Button>
          </div>
        </form>
      </section>
    </div>
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
  const dialogRef = useAccessibleDialog<HTMLElement>(onClose);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save this ward.",
      );
    }
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ward-dialog-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h3
          id="ward-dialog-title"
          className="font-display text-2xl font-bold text-navy"
        >
          Edit ward
        </h3>
        <form onSubmit={save} className="mt-6 space-y-4">
          <label className="block font-body text-sm font-semibold text-navy">
            Facility
            <input
              className="auth-control mt-2 bg-mist"
              value={
                facilities.find((item) => item.id === ward.facility_id)?.name ??
                ward.facility_name
              }
              readOnly
            />
          </label>
          <label className="block font-body text-sm font-semibold text-navy">
            Ward name
            <input
              name="name"
              className="auth-control mt-2"
              defaultValue={ward.name}
              required
            />
          </label>
          <label className="block font-body text-sm font-semibold text-navy">
            Student capacity
            <input
              name="max_students"
              type="number"
              min="1"
              className="auth-control mt-2"
              defaultValue={ward.max_students}
              required
            />
            <span className="mt-1 block text-xs font-normal leading-5 text-navy-muted">Current occupancy is {ward.allocated_students}. Counts Orientation, Induction, Active, and Paused placements; reductions below occupancy are blocked.</span>
          </label>
          <label className="block font-body text-sm font-semibold text-navy">
            Shift pattern
            <input
              name="shift_pattern"
              className="auth-control mt-2"
              defaultValue={ward.shift_pattern}
            />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save changes
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DirectoryGuidanceModal({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const dialogRef = useAccessibleDialog<HTMLElement>(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-guidance-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
              Programme directory
            </p>
            <h3
              id="directory-guidance-title"
              className="mt-2 font-display text-2xl font-bold text-navy"
            >
              Keep your operating context accurate
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-navy-muted hover:bg-mist"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-3 font-body text-sm leading-6 text-navy-muted">
          <p>
            Add institutions and facilities used by your programme, then add
            wards under each facility. Facilities are programme-wide; they are
            not owned by a single institution and can serve multiple institutions.
          </p>
          <p>
            Archive records when they are no longer available. Historical
            placements remain intact, and archived facilities cannot receive new
            wards.
          </p>
          <p>CSV imports use a type-specific template, a row-by-row preview, and an all-or-nothing commit. Institution and facility contacts can be imported; logos must be added to each record separately.</p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="tertiary"
            to="mailto:support@mentormama.org?subject=Programme directory guidance"
            onClick={onClose}
          >
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
        </div>
      </section>
    </div>
  );
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
  const commandKey = useRef<string | null>(null);
  const dialogRef = useAccessibleDialog<HTMLElement>(onClose);

  function resetPreview() {
    setPreview(null);
    setConfirmWarnings(false);
    setError("");
    commandKey.current = null;
  }

  function downloadTemplate() {
    const headers: Record<DirectoryImportKind, string> = {
      institutions: "name,type,county,contact_person,contact_email,contact_phone",
      facilities: "name,county,level,maternity_unit_name,contact_person,contact_email,contact_phone",
      wards: "name,shift_pattern,max_students",
    };
    const blob = new Blob([`${headers[kind]}\r\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mentormama-${kind}-template.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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

  const canCommit = Boolean(preview && preview.rows.length && !preview.errors.length && (!preview.warning_count || confirmWarnings));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-3 sm:p-5"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="directory-import-title" tabIndex={-1} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">Programme directory</p>
            <h3 id="directory-import-title" className="mt-2 font-display text-2xl font-bold text-navy">Import directory records</h3>
            <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-navy-muted">Preview every row before adding anything. Each file is limited to 500 records and 2 MB, and commits as one all-or-nothing operation.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close import" className="rounded-full p-2 text-navy-muted hover:bg-mist disabled:opacity-50"><X size={18} /></button>
        </div>

        {success ? (
          <div role="status" className="mt-6 rounded-xl border border-teal/20 bg-teal-light/35 p-5">
            <p className="font-body text-sm font-semibold text-navy">{success}</p>
            <Button type="button" className="mt-4" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="font-body text-sm font-semibold text-navy">Record type
                <select value={kind} disabled={busy} onChange={(event) => { setKind(event.target.value as DirectoryImportKind); resetPreview(); }} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 font-normal">
                  <option value="institutions">Institutions</option><option value="facilities">Facilities</option><option value="wards">Wards</option>
                </select>
              </label>
              {kind === "wards" ? (
                <div>
                  <label className="font-body text-sm font-semibold text-navy">Facility for these wards
                    <select value={facilityId} disabled={busy || !facilities.length} onChange={(event) => { setFacilityId(event.target.value); resetPreview(); }} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 font-normal">
                      <option value="">Choose a facility</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                    </select>
                  </label>
                  {!facilities.length && <p className="mt-2 font-body text-xs leading-5 text-amber-800">Add an active facility to the programme directory before importing wards.</p>}
                </div>
              ) : <div className="flex items-end"><p className="pb-2 font-body text-xs leading-5 text-navy-muted">Facilities are programme-wide. Wards are imported into one selected active facility.</p></div>}
            </div>

            <div className="mt-5 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-body text-sm font-semibold text-navy">1. Start with the matching template</p><p className="mt-1 font-body text-xs text-navy-muted">Use the exact column names. Contact fields are available for institutions and facilities.</p></div>
                <Button type="button" variant="secondary" onClick={downloadTemplate}><FileUp size={15} /> Download CSV template</Button>
              </div>
              <label className="mt-5 block font-body text-sm font-semibold text-navy">2. Choose your completed CSV
                <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); resetPreview(); if (selected && selected.size > 2 * 1024 * 1024) setError("Choose a CSV file that is 2 MB or smaller."); }} className="mt-2 block min-h-11 w-full rounded-xl border border-border p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-teal-light file:px-3 file:py-2 file:font-semibold file:text-teal" />
              </label>
              {file && <p className="mt-2 font-body text-xs text-navy-muted">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
              <Button type="button" disabled={busy || !file || file.size > 2 * 1024 * 1024 || (kind === "wards" && !facilityId)} onClick={() => void createPreview()} className="mt-4">{busy && !preview ? "Checking file…" : "Preview records"}</Button>
            </div>

            {preview && <div className="mt-5 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-body text-sm font-semibold text-navy">3. Review before import</p><p className="mt-1 font-body text-xs text-navy-muted">{preview.rows.length} rows · {preview.error_count} with errors · {preview.warning_count} with duplicate warnings</p></div>
              </div>
              {preview.errors.length > 0 && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Resolve these issues in the CSV, then preview it again.</p><ul className="mt-2 list-inside list-disc">{preview.errors.slice(0, 12).map((issue, index) => <li key={`${issue.row}-${issue.field}-${index}`}>{issue.row ? `Row ${issue.row}: ` : "File: "}{issue.message}</li>)}</ul>{preview.errors.length > 12 && <p className="mt-1">And {preview.errors.length - 12} more.</p>}</div>}
              <div className="mt-3 max-h-52 overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[34rem] text-left text-xs"><thead className="sticky top-0 bg-mist text-navy-muted"><tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Review</th><th className="p-2">Issue</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.row} className="border-t border-border"><td className="p-2">{row.row}</td><td className="p-2 font-medium text-navy">{row.name || "Unnamed record"}</td><td className="p-2 capitalize">{row.status === "ready" ? "Ready" : row.status === "warning" ? "Check" : "Fix"}</td><td className="p-2 text-navy-muted">{row.issues.map((issue) => issue.message).join(" ") || "No issues"}</td></tr>)}</tbody></table>
              </div>
              {preview.warning_count > 0 && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-amber-50 p-3 font-body text-sm leading-5 text-amber-950"><input type="checkbox" checked={confirmWarnings} onChange={(event) => setConfirmWarnings(event.target.checked)} className="mt-1 accent-teal" />I reviewed the duplicate-name warnings. These may be distinct campuses or branches, and I want to continue.</label>}
              <p className="mt-3 font-body text-xs leading-5 text-navy-muted">Import is permanent as a batch. After import, records can be archived individually. Logos are not included.</p>
            </div>}

            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 font-body text-sm text-red-800">{error}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3"><Button type="button" variant="tertiary" disabled={busy} onClick={onClose}>Cancel</Button>{preview && <Button type="button" disabled={busy || !canCommit} onClick={() => void commitImport()}>{busy ? "Importing…" : `Import ${preview.rows.length} ${kind}`}</Button>}</div>
          </>
        )}
      </section>
    </div>
  );
}
