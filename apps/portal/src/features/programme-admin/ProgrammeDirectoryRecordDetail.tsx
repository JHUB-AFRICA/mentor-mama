import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Building2,
  CheckCircle2,
  Hospital,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, Card, Skeleton } from "@mentormama/ui";
import type { Facility, Institution, Ward } from "../../services/api";

export type DirectoryRecordSelection =
  | { kind: "institution"; record: Institution }
  | { kind: "facility"; record: Facility }
  | { kind: "ward"; record: Ward };

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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const selectedKind = selection?.kind ?? null;
  const selectedId = selection?.record.id ?? null;
  useEffect(() => { titleRef.current?.focus(); }, [selectedKind, selectedId]);

  if (loading) return <DetailLoading onBack={onBack} />;
  if (error) {
    return (
      <div className="programme-directory-detail-state" role="alert">
        <Building2 size={24} aria-hidden="true" />
        <h2>We couldn’t load this directory record</h2>
        <p>Try again. If it is still unavailable, return to the directory and choose the record again.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button type="button" variant="secondary" onClick={onRetry}>Try again</Button>
          <Button type="button" variant="tertiary" onClick={onBack}>Back to directory</Button>
        </div>
      </div>
    );
  }
  if (!selection) {
    return (
      <div className="programme-directory-detail-state">
        <Building2 size={24} aria-hidden="true" />
        <h2>This record is no longer available</h2>
        <p>It may have been archived or removed. Return to the directory to choose an available record.</p>
        <Button type="button" onClick={onBack}>Back to directory</Button>
      </div>
    );
  }

  const { kind, record } = selection;
  const title = record.name;
  const isArchived = Boolean(record.archived_at);
  const isInactive = kind === "institution" && record.is_active === false;
  const status = isArchived ? "Archived" : isInactive ? "Inactive" : "Active";
  const facility = kind === "ward" ? facilities.find((item) => item.id === record.facility_id) : undefined;
  const facilityWards = kind === "facility" ? wards.filter((ward) => ward.facility_id === record.id) : [];
  return (
    <div className="programme-directory-detail-page">
      <button type="button" onClick={onBack} className="programme-directory-detail-back">
        <ArrowLeft size={16} aria-hidden="true" /> Back to directory
      </button>
      <header className="programme-directory-detail-header">
        <div className="programme-directory-detail-identity">
          <span className="programme-directory-detail-mark">
            {kind === "facility" ? <Hospital size={23} /> : kind === "ward" ? <ShieldAlert size={23} /> : <Building2 size={23} />}
          </span>
          <div className="min-w-0">
            <p className="programme-directory-detail-eyebrow">Programme directory · {kind}</p>
            <h2 ref={titleRef} tabIndex={-1} className="programme-directory-detail-title">{title}</h2>
            <div className="programme-directory-detail-meta">
              <span className={`programme-directory-status ${status === "Active" ? "is-active" : status === "Archived" ? "is-archived" : "is-inactive"}`}>
                <span aria-hidden="true" />{status}
              </span>
              {kind === "institution" && record.type && <span>{record.type}</span>}
              {kind === "facility" && record.level && <span>{record.level}</span>}
              {kind === "ward" && <span>{record.facility_name}</span>}
            </div>
          </div>
        </div>
        <div className="programme-directory-detail-actions">
          <Button type="button" variant="secondary" onClick={onEdit} disabled={busy}>
            <Pencil size={15} aria-hidden="true" /> Edit details
          </Button>
          {kind !== "ward" ? (
            <Button type="button" variant="tertiary" onClick={onArchive} disabled={busy}>
              <Archive size={15} aria-hidden="true" /> {isArchived ? "Restore record" : "Archive record"}
            </Button>
          ) : (
            <Button type="button" variant="tertiary" onClick={onToggleWard} disabled={busy || Boolean(facility?.archived_at)}>
              {busy ? "Updating…" : isArchived ? "Restore ward" : "Archive ward"}
            </Button>
          )}
        </div>
      </header>

      <div className="programme-directory-detail-grid">
        <div className="programme-directory-detail-main">
          {kind === "ward" ? (
            <WardOperations
              ward={record}
              facility={facility}
            />
          ) : (
            <Card padding="lg" className="programme-directory-detail-card">
              <div className="programme-directory-detail-section-heading">
                <div>
                  <p className="programme-directory-detail-eyebrow">Record information</p>
                  <h3>At a glance</h3>
                </div>
                {kind === "facility" && record.logo_url && <img src={record.logo_url} alt={`${record.name} logo`} className="programme-directory-detail-logo" />}
                {kind === "institution" && record.logo_url && <img src={record.logo_url} alt={`${record.name} logo`} className="programme-directory-detail-logo" />}
              </div>
              <dl className="programme-directory-detail-fields">
                {kind === "institution" ? (
                  <>
                    <DetailField label="Institution type" value={record.type} />
                    <DetailField label="County or location" value={record.county} />
                    <DetailField label="Directory status" value={status} />
                    <DetailField label="Institution ID" value={record.id} monospace />
                  </>
                ) : (
                  <>
                    <DetailField label="Facility level" value={record.level} />
                    <DetailField label="County or location" value={record.county} />
                    <DetailField label="Maternity unit" value={record.maternity_unit_name} />
                    <DetailField label="Directory status" value={status} />
                    <DetailField label="Facility ID" value={record.id} monospace />
                  </>
                )}
              </dl>
              {kind === "institution" && !record.type && !record.county && <p className="programme-directory-detail-inline-note">No optional location or institution type has been added.</p>}
              {kind === "facility" && !record.level && !record.county && !record.maternity_unit_name && <p className="programme-directory-detail-inline-note">No optional location or service details have been added.</p>}
              {kind === "facility" && (
                <div className="programme-directory-detail-note">
                  <Hospital size={17} aria-hidden="true" />
                  <p>This facility belongs to the programme directory and may serve multiple institutions.</p>
                </div>
              )}
            </Card>
          )}

          {kind !== "ward" && (
            <ContactSection record={record} onEdit={onEdit} />
          )}
        </div>

        {kind === "facility" ? (
          <Card padding="lg" className="programme-directory-detail-card">
            <div className="programme-directory-detail-section-heading">
              <div>
                <p className="programme-directory-detail-eyebrow">Placement operations</p>
                <h3>Wards at this facility</h3>
              </div>
              <Button type="button" size="sm" onClick={() => onAddWard(record.id)} disabled={isArchived}>
                <Plus size={14} aria-hidden="true" /> Add ward
              </Button>
            </div>
            {isArchived && <p className="programme-directory-detail-inline-note">Restore this facility before adding or restoring wards for new placements.</p>}
            {facilityWards.length ? (
              <ul className="programme-directory-detail-related-list">
                {facilityWards.map((ward) => (
                  <li key={ward.id}>
                    <span className="programme-directory-related-icon"><ShieldAlert size={17} aria-hidden="true" /></span>
                    <span className="programme-directory-related-copy">
                      <strong>{ward.name}</strong>
                      <small>{ward.allocated_students} occupying placements · {ward.max_students} capacity · {ward.archived_at ? "Archived" : ward.available ? "Active" : "Unavailable"}</small>
                    </span>
                    <button type="button" aria-label={`View ${ward.name} details`} onClick={() => onSelectWard(ward.id)}><ArrowRight size={16} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="programme-directory-detail-empty">
                <ShieldAlert size={19} aria-hidden="true" />
                <p>No wards are registered at this facility.</p>
                {!isArchived && <button type="button" onClick={() => onAddWard(record.id)}>Add a ward <ArrowRight size={14} /></button>}
              </div>
            )}
          </Card>
        ) : kind === "ward" ? (
          <Card padding="lg" className="programme-directory-detail-card">
            <p className="programme-directory-detail-eyebrow">Related record</p>
            <h3 className="programme-directory-detail-related-title">Facility</h3>
            {facility ? (
              <button type="button" className="programme-directory-facility-link" onClick={() => onSelectFacility(facility.id)}>
                <span className="programme-directory-related-icon"><Hospital size={17} aria-hidden="true" /></span>
                <span><strong>{facility.name}</strong><small>{facility.county || "Location not added"}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <p className="programme-directory-detail-inline-note">The parent facility could not be found in this programme directory.</p>
            )}
            {facility?.archived_at && <p className="programme-directory-detail-warning">This facility is archived, so this ward cannot be used for new placements.</p>}
          </Card>
        ) : (
          <Card padding="lg" className="programme-directory-detail-card programme-directory-detail-help">
            <span><CheckCircle2 size={19} aria-hidden="true" /></span>
            <div><p className="programme-directory-detail-eyebrow">Directory record</p><h3>Keep details current</h3><p>Accurate institution and contact details help programme teams find the right operating context.</p><button type="button" onClick={onEdit}>Edit institution <ArrowRight size={14} /></button></div>
          </Card>
        )}
      </div>
    </div>
  );
}

function ContactSection({ record, onEdit }: { record: Institution | Facility; onEdit: () => void }) {
  const contacts = [
    { label: "Contact person", value: record.contact_person, icon: <UserRound size={17} aria-hidden="true" /> },
    { label: "Email address", value: record.contact_email, icon: <Mail size={17} aria-hidden="true" />, href: record.contact_email ? `mailto:${record.contact_email}` : undefined },
    { label: "Phone number", value: record.contact_phone, icon: <Phone size={17} aria-hidden="true" />, href: record.contact_phone ? `tel:${record.contact_phone}` : undefined },
  ];
  const anyContact = contacts.some((item) => Boolean(item.value));
  return (
    <Card padding="lg" className="programme-directory-detail-card">
      <div className="programme-directory-detail-section-heading">
        <div><p className="programme-directory-detail-eyebrow">Contact</p><h3>People and ways to reach them</h3></div>
        {anyContact && <button type="button" onClick={onEdit} className="programme-directory-detail-text-action"><Pencil size={14} aria-hidden="true" /> Edit</button>}
      </div>
      {anyContact ? (
        <dl className="programme-directory-contact-list">
          {contacts.filter((item) => item.value).map((item) => (
            <div key={item.label}>
              <span aria-hidden="true">{item.icon}</span>
              <dt>{item.label}</dt>
              <dd>{item.href ? <a href={item.href}>{item.value}</a> : item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="programme-directory-detail-empty programme-directory-detail-empty--contact">
          <p>No contact details have been added for this record.</p>
          <button type="button" onClick={onEdit}>Add contact details <ArrowRight size={14} /></button>
        </div>
      )}
      <p className="programme-directory-detail-private-note"><ShieldCheck size={14} aria-hidden="true" /> Contact and logo details are for programme operations; public partner display is not enabled.</p>
    </Card>
  );
}

function WardOperations({ ward, facility }: { ward: Ward; facility?: Facility }) {
  const capacity = Math.max(ward.max_students, 1);
  const occupancyPercent = Math.min(Math.round((ward.allocated_students / capacity) * 100), 100);
  const ownStatus = ward.archived_at ? "Archived" : facility?.archived_at ? "Facility archived" : "Active";
  return (
    <Card padding="lg" className="programme-directory-detail-card">
      <div className="programme-directory-detail-section-heading">
        <div><p className="programme-directory-detail-eyebrow">Placement operations</p><h3>Capacity and availability</h3></div>
        <span className={`programme-directory-status ${ownStatus === "Active" ? "is-active" : "is-inactive"}`}><span aria-hidden="true" />{ownStatus}</span>
      </div>
      <div className="programme-directory-capacity">
        <div><strong>{ward.allocated_students}</strong><span> / {ward.max_students} places in use</span></div>
        <div className="programme-directory-capacity-track" role="progressbar" aria-label="Ward placement capacity" aria-valuemin={0} aria-valuemax={ward.max_students} aria-valuenow={Math.min(ward.allocated_students, ward.max_students)}>
          <span style={{ width: `${occupancyPercent}%` }} />
        </div>
        <div className="programme-directory-capacity-meta"><span>Occupying placements</span><strong>{ward.allocated_students}</strong><span>Capacity remaining</span><strong>{ward.available_slots}</strong></div>
      </div>
      <dl className="programme-directory-detail-fields programme-directory-detail-fields--ward">
        <DetailField label="Shift pattern" value={ward.shift_pattern} />
        <DetailField label="Maximum placements" value={String(ward.max_students)} />
        <DetailField label="Ward ID" value={ward.id} monospace />
      </dl>
      <p className="programme-directory-detail-note"><ShieldAlert size={16} aria-hidden="true" /> Capacity is a hard limit. Occupancy follows placement states and cannot be reduced below placements currently using the ward.</p>
    </Card>
  );
}

function DetailField({ label, value, monospace = false }: { label: string; value: string | null | undefined; monospace?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd className={monospace ? "break-all font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}

function DetailLoading({ onBack }: { onBack: () => void }) {
  return (
    <div className="programme-directory-detail-page" aria-busy="true" aria-label="Loading directory details">
      <button type="button" onClick={onBack} className="programme-directory-detail-back"><ArrowLeft size={16} /> Back to directory</button>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
    </div>
  );
}
