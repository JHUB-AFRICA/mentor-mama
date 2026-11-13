import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Ban, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Inbox, RefreshCw, School, Shuffle, Wand2 } from "lucide-react";
import { Skeleton } from "@mentormama/ui";

import { Field, Modal, TextArea } from "../../components/kit";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import {
  ApiError,
  applyAutoArrange,
  declineFacilityRequests,
  previewAutoArrange,
  type ArrangeInput,
  type ArrangeResult,
  type CurrentUser,
} from "../../services/api";
import { groupKey, useIncomingSummary, waitingLabel, type IncomingGroup } from "../../services/incoming-requests";
import { AdminButton, AdminPage, AdminPageHeader, EmptyState, Notice, StatCard, StatGrid, StatusPill } from "../programme-admin/ui/AdminKit";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";
import { RecentArrangements } from "./RecentArrangements";
import "./incoming-requests.css";

const longDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const requestedOn = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const newSeed = () => Math.random().toString(36).slice(2, 10);
const messageOf = (cause: unknown, fallback: string) => (cause instanceof ApiError || cause instanceof Error ? cause.message || fallback : fallback);

type Target = { label: string; ids: string[]; nonce: number };

/** Every school's request for this facility, with room for those dates, and the two decisions: arrange or decline. */
export function IncomingRequests({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const summary = useIncomingSummary();
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [arrange, setArrange] = useState<Target | null>(null);
  const [decline, setDecline] = useState<Target | null>(null);
  const [opened, setOpened] = useState(0);

  const data = summary.data;
  const groups = data?.groups ?? [];
  const schools = new Set(groups.map((group) => group.institution.id)).size;
  const earliest = groups.reduce<string | null>((first, group) => (first === null || group.planned_start < first ? group.planned_start : first), null);

  // Forget selections for students who are no longer waiting (arranged, declined or withdrawn elsewhere).
  useEffect(() => {
    if (!data) return;
    setPicked((current) => {
      const next: Record<string, string[]> = {};
      for (const group of data.groups) {
        const kept = (current[groupKey(group)] ?? []).filter((id) => group.placement_ids.includes(id));
        if (kept.length) next[groupKey(group)] = kept;
      }
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [data]);

  const targetFor = (group: IncomingGroup): Target => {
    const chosen = picked[groupKey(group)] ?? [];
    const nonce = opened + 1;
    setOpened(nonce);
    return chosen.length ? { label: `${plural(chosen.length, "selected student", "selected students")} from ${group.institution.name}`, ids: chosen, nonce } : { label: `${plural(group.count, "student", "students")} from ${group.institution.name} (${group.cohort.name})`, ids: group.placement_ids, nonce };
  };

  return (
    <FacilityWorkspaceFrame user={user} active="requests" title="Incoming requests" onError={onError}>
      <AdminPage className="ir">
        <AdminPageHeader
          eyebrow="Facility operations"
          title="Incoming requests"
          description="Schools have asked your facility to host these students. Check the room for each group, then have the system arrange them in your wards with mentors, or decline with a reason."
          actions={
            <>
              <AdminButton variant="ghost" size="sm" icon={<RefreshCw />} disabled={summary.isFetching} onClick={() => void summary.refetch()}>
                Refresh
              </AdminButton>
              <Link className="pa-btn pa-btn--secondary pa-btn--sm" to="/placements">
                <ClipboardList aria-hidden="true" />
                Placements register
              </Link>
            </>
          }
        />

        {summary.isPending ? (
          <div role="status" aria-label="Loading incoming requests" className="grid gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : summary.isError ? (
          <PortalErrorState title="We could not load the incoming requests" message={messageOf(summary.error, "Please try again.")} onRetry={() => void summary.refetch()} />
        ) : (
          <>
            <StatGrid columns={3}>
              <StatCard icon={<Inbox />} tone={data!.total_requested ? "amber" : "green"} value={data!.total_requested} label="Students waiting" hint={data!.total_requested ? "Not yet in a ward" : "No requests waiting"} />
              <StatCard icon={<School />} tone="blue" value={schools} label={schools === 1 ? "School" : "Schools"} hint={plural(groups.length, "request group", "request groups")} />
              <StatCard icon={<CalendarDays />} tone="violet" value={earliest ? longDate(earliest) : "—"} label="Earliest start" hint={earliest ? "Of everything waiting" : "Nothing to plan"} />
            </StatGrid>

            {data!.total_requested > 0 && data!.over_capacity && data!.capacity && (
              <Notice icon={<AlertTriangle />}>
                {plural(data!.total_requested, "student is", "students are")} waiting but your wards have {plural(data!.capacity.free, "free place", "free places")} between {longDate(data!.capacity.window.start)} and {longDate(data!.capacity.window.end)}. Some students would stay unplaced.
              </Notice>
            )}

            {groups.length === 0 ? (
              <EmptyState icon={<Inbox />} title="No requests waiting" text="When a school asks your facility to host students, the request appears here with the room you have for those dates." />
            ) : (
              <ul className="ir-groups" aria-label="Incoming request groups">
                {groups.map((group) => (
                  <GroupCard
                    key={groupKey(group)}
                    group={group}
                    picked={picked[groupKey(group)] ?? []}
                    onPick={(ids) => setPicked((current) => ({ ...current, [groupKey(group)]: ids }))}
                    onArrange={() => setArrange(targetFor(group))}
                    onDecline={() => setDecline(targetFor(group))}
                  />
                ))}
              </ul>
            )}
          </>
        )}

        <RecentArrangements onError={onError} />

        <ArrangeDialog
          key={arrange?.nonce ?? 0}
          target={arrange}
          onClose={() => setArrange(null)}
          onApplied={() => setPicked({})}
        />
        <DeclineDialog target={decline} onClose={() => setDecline(null)} onDone={() => setPicked({})} />
      </AdminPage>
    </FacilityWorkspaceFrame>
  );
}

function GroupCard({ group, picked, onPick, onArrange, onDecline }: { group: IncomingGroup; picked: string[]; onPick: (ids: string[]) => void; onArrange: () => void; onDecline: () => void }) {
  const [open, setOpen] = useState(false);
  const idBase = useMemo(() => `ir-${groupKey(group).replace(/[^a-z0-9]/gi, "")}`, [group]);
  const room = group.capacity;
  const fullWards = room.wards.filter((ward) => ward.free === 0).map((ward) => ward.name);
  const noWards = room.wards.length === 0;
  const mentorShort = room.mentor_places_left < group.count;
  const short = group.over_capacity || noWards;
  const allPicked = picked.length === group.students.length && group.students.length > 0;
  const toggle = (id: string) => onPick(picked.includes(id) ? picked.filter((value) => value !== id) : [...picked, id]);

  return (
    <li>
      <article className={`ir-group${short ? " is-short" : ""}`} aria-labelledby={`${idBase}-title`}>
        <header className="ir-group__head">
          <div style={{ minWidth: 0 }}>
            <h3 id={`${idBase}-title`} className="ir-group__title">{group.institution.name}</h3>
            <p className="ir-group__cohort">{group.cohort.name}</p>
          </div>
          <span className="ir-group__count" aria-label={plural(group.count, "student", "students")}>
            {group.count}
            <small>{group.count === 1 ? "student" : "students"}</small>
          </span>
        </header>

        <dl className="ir-facts">
          <div><dt>Placement dates</dt><dd>{shortDate(group.planned_start)} – {longDate(group.planned_end)}</dd></div>
          <div><dt>Requested on</dt><dd>{requestedOn(group.requested_since)}</dd></div>
          <div><dt>Time waiting</dt><dd>{waitingLabel(group.requested_since)}</dd></div>
        </dl>

        <section className={`ir-capacity${short ? " is-short" : ""}`} aria-label={`Room for ${group.institution.name} ${group.cohort.name}`}>
          <div className="ir-capacity__head">
            <h4>Room for these dates</h4>
            {noWards ? (
              <StatusPill tone="danger">No active wards</StatusPill>
            ) : group.over_capacity ? (
              <StatusPill tone="danger">Short by {plural(group.shortfall, "place", "places")}</StatusPill>
            ) : (
              <StatusPill tone="success">Room for everyone</StatusPill>
            )}
          </div>
          <p className="ir-capacity__line">
            {room.free} of {room.capacity} ward places free · {plural(room.mentor_places_left, "mentor place", "mentor places")} left
          </p>
          {group.warnings.length > 0 && (
            <ul className="ir-warnings">
              {group.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          {(group.over_capacity || mentorShort) && (
            <p className="ir-capacity__line">
              {group.over_capacity && (fullWards.length > 0 ? `Limit: ${fullWards.join(", ")} ${fullWards.length === 1 ? "is" : "are"} full. ` : "Limit: ward places. ")}
              {mentorShort && `Mentors: only ${plural(room.mentor_places_left, "place", "places")} left for ${group.count} students.`}
            </p>
          )}
          {!noWards && (
            <ul className="ir-wards" aria-label="Free places per ward">
              {room.wards.map((ward) => (
                <li key={ward.ward_id} className="ir-ward">
                  <strong>{ward.name}</strong>
                  <span>{ward.free === 0 ? "Full" : `${ward.free} free`} of {ward.capacity}</span>
                  <span className="pa-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, ward.capacity ? (ward.occupied / ward.capacity) * 100 : 0)}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="ir-actions">
          <AdminButton size="sm" icon={<Wand2 />} onClick={onArrange}>
            {picked.length ? `Arrange ${picked.length} selected automatically` : "Arrange automatically"}
          </AdminButton>
          <AdminButton variant="secondary" size="sm" icon={<Ban />} onClick={onDecline}>
            {picked.length ? `Decline ${picked.length} selected` : "Decline"}
          </AdminButton>
        </div>

        <button type="button" className="ir-expand" aria-expanded={open} aria-controls={`${idBase}-students`} onClick={() => setOpen(!open)}>
          <span>{open ? "Hide students" : `Show ${plural(group.count, "student", "students")}`}</span>
          {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {open && (
          <div id={`${idBase}-students`}>
            <div className="ir-students__bar">
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input type="checkbox" checked={allPicked} onChange={() => onPick(allPicked ? [] : group.students.map((student) => student.placement_id))} />
                Select all {group.count}
              </label>
              <span>{picked.length ? `${picked.length} selected` : "Choose students to act on only some of them"}</span>
            </div>
            <ul className="ir-students" aria-label={`Students from ${group.institution.name}`}>
              {group.students.map((student) => (
                <li key={student.placement_id} className="ir-student">
                  <label>
                    <input type="checkbox" checked={picked.includes(student.placement_id)} onChange={() => toggle(student.placement_id)} aria-label={`Select ${student.name}`} />
                    <span>
                      <span className="ir-student__name">{student.name}</span>
                      <span className="ir-student__meta">
                        {student.registration_number ? `Reg. ${student.registration_number} · ` : ""}
                        {shortDate(group.planned_start)} – {shortDate(group.planned_end)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </li>
  );
}

function ArrangeDialog({ target, onClose, onApplied }: { target: Target | null; onClose: () => void; onApplied: () => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [strategy, setStrategy] = useState<ArrangeInput["strategy"]>("balanced");
  const [assignMentors, setAssignMentors] = useState(true);
  const [seed, setSeed] = useState(newSeed);
  const [result, setResult] = useState<ArrangeResult | null>(null);
  const open = target !== null;
  const ids = target?.ids ?? [];

  const input: ArrangeInput = { strategy, assign_mentors: assignMentors, seed, placement_ids: ids };
  const preview = useQuery({
    queryKey: ["incoming-arrange-preview", ids.join(","), strategy, assignMentors, seed],
    queryFn: () => previewAutoArrange(input),
    enabled: open && !result && ids.length > 0,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const plan = preview.data;
  const apply = useMutation({
    mutationFn: () => applyAutoArrange({ ...input, expected_plan_hash: plan?.plan_hash }),
    onSuccess: (data) => {
      setResult(data);
      onApplied();
      pushToast({ kind: "success", title: "Students arranged", message: `${data.summary.arranged} placed${data.summary.unplaced ? `, ${data.summary.unplaced} could not be placed` : ""}. Mentors and the school have been notified.` });
      // Refresh everything except the preview itself, which would be rebuilt for students who are no longer waiting.
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "incoming-arrange-preview" });
    },
  });

  const placedRows = result ? result.arranged : plan?.assignments ?? [];
  const unplaced = result ? result.unplaced : plan?.unplaced ?? [];
  const perWard = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of placedRows) if (row.ward) counts.set(row.ward.name, (counts.get(row.ward.name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [placedRows]);
  const perMentor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of placedRows) if (row.mentor) counts.set(row.mentor.name, (counts.get(row.mentor.name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [placedRows]);
  const withoutMentor = placedRows.filter((row) => !row.mentor).length;
  const busy = apply.isPending;
  const canConfirm = Boolean(plan) && plan!.assignments.length > 0 && !busy && !preview.isFetching;

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      icon={<Wand2 />}
      title={result ? "Arrangement complete" : "Arrange automatically"}
      description={result ? "Wards and mentors are set. Release the placements from the Placements register when you are ready." : `Preview first: nothing is saved until you confirm. ${target?.label ?? ""}.`}
      footer={
        result ? (
          <>
            <Link className="pa-btn pa-btn--secondary pa-btn--sm" to="/placements" onClick={onClose}>Open Placements register</Link>
            <AdminButton size="sm" onClick={onClose}>Done</AdminButton>
          </>
        ) : (
          <>
            <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</AdminButton>
            <AdminButton variant="secondary" size="sm" icon={<Shuffle />} onClick={() => setSeed(newSeed())} disabled={busy || preview.isFetching}>Shuffle again</AdminButton>
            <AdminButton size="sm" icon={<CheckCircle2 />} onClick={() => { apply.reset(); apply.mutate(); }} disabled={!canConfirm}>
              {busy ? "Arranging…" : plan ? `Confirm ${plural(plan.assignments.length, "placement", "placements")}` : "Confirm"}
            </AdminButton>
          </>
        )
      }
    >
      {!result && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <label>
            <span className="pa-muted">Spread </span>
            <select value={strategy} onChange={(event) => setStrategy(event.target.value as ArrangeInput["strategy"])}>
              <option value="balanced">Balanced: keep wards evenly loaded</option>
              <option value="fill">Fill: fill one ward before the next</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={assignMentors} onChange={(event) => setAssignMentors(event.target.checked)} />
            Also assign mentors
          </label>
        </div>
      )}

      {!result && preview.isPending ? (
        <div role="status" aria-label="Building the preview"><Skeleton className="h-40" /></div>
      ) : !result && preview.isError ? (
        <div role="alert" className="ir-plan__error">
          {messageOf(preview.error, "We could not build a preview.")}{" "}
          <AdminButton variant="secondary" size="sm" onClick={() => void preview.refetch()}>Try again</AdminButton>
        </div>
      ) : (
        <div className="ir-plan">
          {result ? (
            <Notice icon={<CheckCircle2 />}>
              <span role="status">{result.summary.arranged} arranged · {result.summary.unplaced} not placed · {plural(result.summary.mentors_notified, "mentor", "mentors")} emailed.</span>
            </Notice>
          ) : (
            plan && (
              <Notice icon={<Wand2 />}>
                {plan.summary.arranged} of {plan.summary.incoming} {plan.summary.incoming === 1 ? "student" : "students"} can be placed
                {plan.summary.unplaced > 0 ? `; ${plan.summary.unplaced} cannot` : ""}.
              </Notice>
            )
          )}
          <div>
            <h4>Placed by ward</h4>
            {perWard.length ? <ul aria-label="Placed by ward">{perWard.map(([name, count]) => <li key={name}><span>{name}</span><span>{plural(count, "student", "students")}</span></li>)}</ul> : <p className="pa-muted">No ward places.</p>}
          </div>
          <div>
            <h4>Mentors</h4>
            {perMentor.length ? <ul aria-label="Placed by mentor">{perMentor.map(([name, count]) => <li key={name}><span>{name}</span><span>{plural(count, "student", "students")}</span></li>)}</ul> : <p className="pa-muted">{assignMentors || result ? "No mentors assigned." : "Mentors will be assigned later."}</p>}
            {withoutMentor > 0 && <p className="ir-hint">{plural(withoutMentor, "student has", "students have")} no mentor yet. Assign one from the placement.</p>}
          </div>
          {unplaced.length > 0 && (
            <div>
              <h4><StatusPill tone="warning">{unplaced.length} cannot be placed</StatusPill></h4>
              <ul aria-label="Students who cannot be placed">
                {unplaced.map((row) => <li key={row.placement_id}><span>{row.student}</span><span>{row.reason ?? "No room"}</span></li>)}
              </ul>
            </div>
          )}
          <details>
            <summary className="pa-muted" style={{ cursor: "pointer" }}>Every student</summary>
            <div className="ir-plan__scroll">
              <ul aria-label="Proposed arrangement">
                {placedRows.map((row) => <li key={row.placement_id}><span>{row.student}</span><span>{row.ward?.name ?? "—"}{row.mentor ? ` · ${row.mentor.name}` : ""}</span></li>)}
              </ul>
            </div>
          </details>
        </div>
      )}
      {apply.isError && <p role="alert" className="ir-plan__error" style={{ marginTop: 12 }}>{messageOf(apply.error, "We could not arrange these students. Nothing was changed.")}</p>}
    </Modal>
  );
}

function DeclineDialog({ target, onClose, onDone }: { target: Target | null; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [reason, setReason] = useState("");
  const open = target !== null;
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const decline = useMutation({
    mutationFn: () => declineFacilityRequests(target?.ids ?? [], reason.trim()),
    onSuccess: (result) => {
      pushToast({ kind: "success", title: "Sent back to the school", message: `${plural(result.declined, "student", "students")} declined. The coordinator can ask another facility.` });
      void queryClient.invalidateQueries();
      onDone();
      onClose();
    },
  });
  const valid = reason.trim().length >= 5;

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!decline.isPending}
      icon={<Ban />}
      title="Decline these students"
      description={`${target?.label ?? ""}. They go back to the coordinator, who sees your reason and can ask another facility.`}
      footer={
        <>
          <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={decline.isPending}>Cancel</AdminButton>
          <AdminButton size="sm" icon={<Ban />} disabled={!valid || decline.isPending} onClick={() => { decline.reset(); decline.mutate(); }}>
            {decline.isPending ? "Declining…" : `Decline ${plural(target?.ids.length ?? 0, "student", "students")}`}
          </AdminButton>
        </>
      }
    >
      <Field label="Reason" required hint="At least 5 characters. The coordinator sees this.">
        <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. No ward capacity for these dates" />
      </Field>
      {decline.isError && <p role="alert" className="ir-plan__error">{messageOf(decline.error, "We could not decline those students.")}</p>}
    </Modal>
  );
}
