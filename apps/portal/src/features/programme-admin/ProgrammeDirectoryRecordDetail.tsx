import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  Hash,
  Hospital,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Skeleton } from "@mentormama/ui";
import { DetailList } from "../../components/kit";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  ListRow,
  StatusPill,
} from "./ui/AdminKit";
import type { Facility, Institution, Ward } from "../../services/api";
import "./directory-kit.css";

export type DirectoryRecordSelection =
  | { kind: "institution"; record: Institution }
  | { kind: "facility"; record: Facility }
  | { kind: "ward"; record: Ward };

const NOT_ADDED = "Not added";

export function ProgrammeDirectoryRecordDetail({
  selection,
  wards,
  facilities,
  loading,
  error,
  onRetry,
  onBack,
  onEdit,
  onArchive,
  onAddWard,
  onSelectWard,
  onSelectFacility,
  onToggleWard,
  busy,
}: {
  selection: DirectoryRecordSelection | null;
  wards: Ward[];
  facilities: Facility[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onBack: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onAddWard: (facilityId: string) => void;
  onSelectWard: (wardId: string) => void;
  onSelectFacility: (facilityId: string) => void;
  onToggleWard: () => void;
  busy: boolean;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const selectedKind = selection?.kind ?? null;
  const selectedId = selection?.record.id ?? null;
  useEffect(() => {
    const title = pageRef.current?.querySelector<HTMLElement>(".pa-title");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }, [selectedKind, selectedId, loading, error]);

  if (loading) return <DetailLoading onBack={onBack} />;
  if (error) {
    return (
      <AdminPage>
        <div role="alert">
          <EmptyState
            icon={<Building2 size={22} />}
            title="We couldn’t load this directory record"
            text="Try again. If it is still unavailable, return to the directory and choose the record again."
            action={
              <div className="pd-state-actions">
                <AdminButton variant="secondary" onClick={onRetry}>Try again</AdminButton>
                <AdminButton variant="ghost" onClick={onBack}>Back to directory</AdminButton>
              </div>
            }
          />
        </div>
      </AdminPage>
    );
  }
  if (!selection) {
    return (
      <AdminPage>
        <EmptyState
          icon={<Building2 size={22} />}
          title="This record is no longer available"
          text="It may have been archived or removed. Return to the directory to choose an available record."
          action={<AdminButton onClick={onBack}>Back to directory</AdminButton>}
        />
      </AdminPage>
    );
  }

  const { kind, record } = selection;
  const isArchived = Boolean(record.archived_at);
  const isInactive = kind === "institution" && record.is_active === false;
  const status = isArchived ? "Archived" : isInactive ? "Inactive" : "Active";
  const statusTone = status === "Active" ? "success" : status === "Archived" ? "neutral" : "warning";
  const facility = kind === "ward" ? facilities.find((item) => item.id === record.facility_id) : undefined;
  const facilityWards = kind === "facility" ? wards.filter((ward) => ward.facility_id === record.id) : [];
  const classification = kind === "institution" ? record.type : kind === "facility" ? record.level : "";

  return (
    <AdminPage className="pd-detail">
      <div className="pd-sticky" ref={pageRef}>
        <button type="button" onClick={onBack} className="pd-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to directory
        </button>
        <AdminPageHeader
          eyebrow={`Programme directory · ${kind}`}
          title={record.name}
          meta={
            <>
              <StatusPill tone={statusTone}>{status}</StatusPill>
              {classification && <span>{classification}</span>}
              {kind === "ward" && <span>{record.facility_name}</span>}
            </>
          }
          actions={
            <>
              <AdminButton variant="secondary" onClick={onEdit} disabled={busy} icon={<Pencil />}>
                Edit details
              </AdminButton>
              {kind !== "ward" ? (
                <AdminButton
                  variant="secondary"
                  className={isArchived ? undefined : "pd-btn-danger"}
                  onClick={onArchive}
                  disabled={busy}
                  icon={isArchived ? <ArchiveRestore /> : <Archive />}
                >
                  {isArchived ? "Restore record" : "Archive record"}
                </AdminButton>
              ) : (
                <AdminButton
                  variant="secondary"
                  className={isArchived ? undefined : "pd-btn-danger"}
                  onClick={onToggleWard}
                  disabled={busy || Boolean(facility?.archived_at)}
                  icon={isArchived ? <ArchiveRestore /> : <Archive />}
                >
                  {busy ? "Updating…" : isArchived ? "Restore ward" : "Archive ward"}
                </AdminButton>
              )}
            </>
          }
        />
      </div>

      <div className="pd-detail__grid">
        <div className="pd-detail__main">
          {kind === "ward" ? (
            <WardOperations ward={record} facility={facility} />
          ) : (
            <AdminCard
              title="Details"
              description="Record information used across programme setup."
              action={record.logo_url ? <img src={record.logo_url} alt={`${record.name} logo`} className="pd-detail__logo" /> : undefined}
            >
              <DetailList
                items={
                  kind === "institution"
                    ? [
                        { label: "Institution type", value: record.type || NOT_ADDED, icon: <Building2 /> },
                        { label: "County or location", value: record.county || NOT_ADDED, icon: <MapPin /> },
                        { label: "Directory status", value: status, icon: <CheckCircle2 /> },
                        { label: "Institution ID", value: <code className="pd-code">{record.id}</code>, icon: <Hash /> },
                      ]
                    : [
                        { label: "Facility level", value: record.level || NOT_ADDED, icon: <Hospital /> },
                        { label: "County or location", value: record.county || NOT_ADDED, icon: <MapPin /> },
                        { label: "Maternity unit", value: record.maternity_unit_name || NOT_ADDED, icon: <Stethoscope /> },
                        { label: "Directory status", value: status, icon: <CheckCircle2 /> },
                        { label: "Facility ID", value: <code className="pd-code">{record.id}</code>, icon: <Hash /> },
                      ]
                }
              />
              {kind === "facility" && (
                <p className="pd-detail__note">
                  <Hospital aria-hidden="true" /> This facility belongs to the programme directory and may serve multiple institutions.
                </p>
              )}
            </AdminCard>
          )}
          {kind !== "ward" && <ContactSection record={record} onEdit={onEdit} />}
        </div>

        <div className="pd-detail__side">
          {kind === "facility" ? (
            <AdminCard
              title="Wards at this facility"
              description="Placement wards linked to this facility."
              flush={facilityWards.length > 0}
              action={
                <AdminButton size="sm" onClick={() => onAddWard(record.id)} disabled={isArchived} icon={<Plus />}>
                  Add ward
                </AdminButton>
              }
            >
              {isArchived && <p className="pd-detail__note">Restore this facility before adding or restoring wards for new placements.</p>}
              {facilityWards.length ? (
                <div className="pa-list">
                  {facilityWards.map((ward) => (
                    <ListRow
                      key={ward.id}
                      icon={<BedDouble />}
                      tone="violet"
                      title={ward.name}
                      meta={`${ward.allocated_students} occupying placements · ${ward.max_students} capacity`}
                      trailing={
                        <StatusPill tone={ward.archived_at ? "neutral" : ward.available ? "success" : "warning"}>
                          {ward.archived_at ? "Archived" : ward.available ? "Active" : "Unavailable"}
                        </StatusPill>
                      }
                      onClick={() => onSelectWard(ward.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<BedDouble size={22} />}
                  title="No wards are registered at this facility."
                  action={!isArchived ? <AdminButton size="sm" variant="secondary" onClick={() => onAddWard(record.id)}>Add a ward</AdminButton> : undefined}
                />
              )}
            </AdminCard>
          ) : kind === "ward" ? (
            <AdminCard title="Facility" description="The site this ward belongs to." flush={Boolean(facility)}>
              {facility ? (
                <div className="pa-list">
                  <ListRow
                    icon={<Hospital />}
                    tone="blue"
                    title={facility.name}
                    meta={facility.county || "Location not added"}
                    onClick={() => onSelectFacility(facility.id)}
                  />
                </div>
              ) : (
                <p className="pd-detail__note">The parent facility could not be found in this programme directory.</p>
              )}
              {facility?.archived_at && (
                <p className="pd-callout pd-callout--warn">This facility is archived, so this ward cannot be used for new placements.</p>
              )}
            </AdminCard>
          ) : (
            <AdminCard title="Keep details current">
              <p className="pd-detail__text">Accurate institution and contact details help programme teams find the right operating context.</p>
              <div className="pd-detail__cta">
                <AdminButton size="sm" variant="secondary" onClick={onEdit} icon={<Pencil />}>
                  Edit institution
                </AdminButton>
              </div>
            </AdminCard>
          )}
        </div>
      </div>
    </AdminPage>
  );
}

function ContactSection({ record, onEdit }: { record: Institution | Facility; onEdit: () => void }) {
  const items = [
    { label: "Contact person", value: record.contact_person, icon: <UserRound /> },
    {
      label: "Email address",
      value: record.contact_email ? <a href={`mailto:${record.contact_email}`}>{record.contact_email}</a> : "",
      icon: <Mail />,
    },
    {
      label: "Phone number",
      value: record.contact_phone ? <a href={`tel:${record.contact_phone}`}>{record.contact_phone}</a> : "",
      icon: <Phone />,
    },
  ];
  const anyContact = Boolean(record.contact_person || record.contact_email || record.contact_phone);
  return (
    <AdminCard
      title="Contact"
      description="People and ways to reach them."
      action={
        anyContact ? (
          <AdminButton size="sm" variant="ghost" onClick={onEdit} icon={<Pencil />}>
            Edit
          </AdminButton>
        ) : undefined
      }
      footer={
        <p className="pd-detail__private">
          <ShieldCheck aria-hidden="true" /> Contact and logo details are for programme operations; public partner display is not enabled.
        </p>
      }
    >
      {anyContact ? (
        <DetailList items={items.filter((item) => item.value).map((item) => ({ ...item, value: item.value }))} />
      ) : (
        <EmptyState
          icon={<Users size={22} />}
          title="No contact details have been added for this record."
          action={<AdminButton size="sm" variant="secondary" onClick={onEdit}>Add contact details</AdminButton>}
        />
      )}
    </AdminCard>
  );
}

function WardOperations({ ward, facility }: { ward: Ward; facility?: Facility }) {
  const capacity = Math.max(ward.max_students, 1);
  const occupancyPercent = Math.min(Math.round((ward.allocated_students / capacity) * 100), 100);
  const ownStatus = ward.archived_at ? "Archived" : facility?.archived_at ? "Facility archived" : "Active";
  return (
    <AdminCard
      title="Capacity and availability"
      description="Placement operations for this ward."
      action={<StatusPill tone={ownStatus === "Active" ? "success" : "neutral"}>{ownStatus}</StatusPill>}
    >
      <div className="programme-directory-capacity">
        <div><strong>{ward.allocated_students}</strong><span> / {ward.max_students} places in use</span></div>
        <div className="programme-directory-capacity-track" role="progressbar" aria-label="Ward placement capacity" aria-valuemin={0} aria-valuemax={ward.max_students} aria-valuenow={Math.min(ward.allocated_students, ward.max_students)}>
          <span style={{ width: `${occupancyPercent}%` }} />
        </div>
        <div className="programme-directory-capacity-meta"><span>Occupying placements</span><strong>{ward.allocated_students}</strong><span>Capacity remaining</span><strong>{ward.available_slots}</strong></div>
      </div>
      <DetailList
        items={[
          { label: "Shift pattern", value: ward.shift_pattern || NOT_ADDED, icon: <Clock /> },
          { label: "Maximum placements", value: String(ward.max_students), icon: <Users /> },
          { label: "Ward ID", value: <code className="pd-code">{ward.id}</code>, icon: <Hash /> },
        ]}
      />
      <p className="pd-detail__note">
        <ShieldCheck aria-hidden="true" /> Capacity is a hard limit. Occupancy follows placement states and cannot be reduced below placements currently using the ward.
      </p>
    </AdminCard>
  );
}

function DetailLoading({ onBack }: { onBack: () => void }) {
  return (
    <AdminPage>
      <div aria-busy="true" aria-label="Loading directory details" className="pd-loading">
        <button type="button" onClick={onBack} className="pd-back"><ArrowLeft size={16} aria-hidden="true" /> Back to directory</button>
        <Skeleton className="h-28 w-full" />
        <div className="pd-detail__grid"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </div>
    </AdminPage>
  );
}
