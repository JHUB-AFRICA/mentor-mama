import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ClipboardCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, Container } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import {
  answerInductionBatchItem,
  getInductionReadiness,
  getPlacement,
  openInductionBatch,
  remindOrientationBatch,
  signInductionBatch,
  type CurrentUser,
  type InductionBatch,
  type InductionReadiness,
  type Placement,
} from "../../services/api";
import { agreedDateText, itemExtras } from "../../services/induction-templates";
import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";
import "./MentorInductionBatch.css";

const limit = 100;

export function MentorInductionBatch({
  user,
  placements,
  onError,
  onPlacementUpdated,
}: {
  user: CurrentUser;
  placements: Placement[];
  onError: (message: string) => void;
  onPlacementUpdated: (placement: Placement) => void;
}) {
  const { pushToast } = useToast();
  const [readiness, setReadiness] = useState<InductionReadiness[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [batch, setBatch] = useState<InductionBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [comments, setComments] = useState<Record<string, string>>({});
  const openCommand = useRef<string | null>(null);
  const answerCommands = useRef(new Map<string, string>());
  const signCommand = useRef<string | null>(null);
  const reminderCommand = useRef<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [remindedIds, setRemindedIds] = useState<string[]>([]);

  const candidates = placements.filter((placement) =>
    placement.state === "orientation" || placement.state === "induction",
  );
  const candidateKey = candidates.map((placement) => placement.id).join(",");
  const placementById = useMemo(
    () => new Map(placements.map((placement) => [placement.id, placement])),
    [placements],
  );

  useEffect(() => {
    let active = true;
    if (!candidateKey) {
      setReadiness([]);
      setSelectedIds([]);
      setActiveTemplateId(null);
      setLoading(false);
      setFailed(false);
      return () => { active = false; };
    }
    setLoading(true);
    setFailed(false);
    const chunks = candidates.map((placement) => placement.id).reduce<string[][]>((all, id) => {
      if (!all.length || all[all.length - 1].length === limit) all.push([]);
      all[all.length - 1].push(id);
      return all;
    }, []);
    void Promise.all(chunks.map((ids) => getInductionReadiness(ids))).then((pages) => pages.flat())
      .then((result) => {
        if (!active) return;
        setReadiness(result);
        const groups = new Map<string, InductionReadiness[]>();
        result.filter(isBatchReady).forEach((row) => {
          if (!row.template_id) return;
          groups.set(row.template_id, [...(groups.get(row.template_id) ?? []), row]);
        });
        const firstGroup = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
        setActiveTemplateId(firstGroup[0]?.template_id ?? null);
        setSelectedIds(firstGroup.map((row) => row.placement_id));
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryKey, candidateKey]);

  const templateId = selectedIds.length
    ? readiness.find((row) => row.placement_id === selectedIds[0])?.template_id
    : activeTemplateId;
  const selectable = readiness.filter((row) => isBatchReady(row) && row.template_id === templateId);
  const blockedOrientation = readiness.filter((row) => row.state === "orientation" && !row.orientation_acknowledged);
  const templateGroups = [...new Map(readiness.filter(isBatchReady).map((row) => [row.template_id, row.template_version])).entries()];
  const allSelected = selectable.length > 0 && selectedIds.length === Math.min(selectable.length, limit) && selectedIds.every((id) => selectable.some((row) => row.placement_id === id));

  function toggleStudent(placementId: string) {
    setSelectedIds((current) => current.includes(placementId)
      ? current.filter((id) => id !== placementId)
      : current.length >= limit ? current : [...current, placementId]);
    setBatch(null);
    openCommand.current = null;
  }

  async function startGroup() {
    if (!selectedIds.length) return;
    setSaving(true);
    openCommand.current ??= crypto.randomUUID();
    try {
      const result = await openInductionBatch(selectedIds, openCommand.current);
      setBatch(result);
      setSelectedIds(result.students.map((item) => item.placement_id));
      openCommand.current = null;
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not open induction for this group.");
    } finally {
      setSaving(false);
    }
  }

  async function remindPendingStudents() {
    const pendingIds = blockedOrientation.map((row) => row.placement_id).filter((id) => !remindedIds.includes(id));
    if (!pendingIds.length) return;
    setReminding(true);
    try {
      let count = 0;
      for (let offset = 0; offset < pendingIds.length; offset += limit) {
        const chunk = pendingIds.slice(offset, offset + limit);
        reminderCommand.current ??= crypto.randomUUID();
        count += await remindOrientationBatch(chunk, reminderCommand.current);
        setRemindedIds((current) => [...new Set([...current, ...chunk])]);
        reminderCommand.current = null;
      }
      pushToast({ kind: "success", title: "Reminders requested", message: `A personal orientation reminder was requested for ${count} student${count === 1 ? "" : "s"}. Students must complete their own acknowledgement.` });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not request the orientation reminders.");
    } finally {
      setReminding(false);
    }
  }

  async function applyAnswer(itemId: string, response: "yes" | "no" | "not_applicable") {
    if (!batch) return;
    const comment = comments[itemId] ?? "";
    const operationKey = `${itemId}:${response}:${comment}`;
    const commandId = answerCommands.current.get(operationKey) ?? crypto.randomUUID();
    answerCommands.current.set(operationKey, commandId);
    setSaving(true);
    try {
      setBatch(await answerInductionBatchItem(batch.id, itemId, response, comment, commandId));
      answerCommands.current.delete(operationKey);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not save this answer for the group.");
    } finally {
      setSaving(false);
    }
  }

  async function signGroup() {
    if (!batch) return;
    setSaving(true);
    signCommand.current ??= crypto.randomUUID();
    try {
      const result = await signInductionBatch(batch.id, signCommand.current);
      setBatch(result);
      signCommand.current = null;
      void Promise.all(result.students.map((student) => getPlacement(student.placement_id)))
        .then((updated) => updated.forEach(onPlacementUpdated))
        .catch(() => undefined);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not sign the induction records.");
    } finally {
      setSaving(false);
    }
  }

  const students = batch?.students ?? [];
  const everyRequiredAnswered = Boolean(batch) && students.length > 0 && students.every(({ checklist }) =>
    checklist.items.filter((item) => item.required).every((item) => item.response !== null),
  );
  const completedCount = students.filter(({ checklist }) => Boolean(checklist.completed_at)).length;

  return (
    <MentorWorkspaceFrame user={user} title="Group induction" active="students">
      <Container size="wide" className="mentor-induction-batch">
        <Link to="/mentor" className="mentor-induction-batch__back"><ArrowLeft size={16} /> Today’s work</Link>
        <header className="mentor-induction-batch__hero">
          <div className="mentor-induction-batch__icon"><ClipboardCheck size={24} /></div>
          <div>
            <p className="mentor-induction-batch__eyebrow">Mentor induction</p>
            <h1>Welcome students to the ward.</h1>
            <p>Open and work through the same induction checklist for the students who attended together. Each student still gets a separate signed record.</p>
          </div>
        </header>

        {!batch ? (
          <Card padding="lg" className="mentor-induction-batch__panel">
            <div className="mentor-induction-batch__section-heading">
              <div><span>Step 1</span><h2>Choose students for this induction</h2></div>
              <strong>{selectedIds.length} selected</strong>
            </div>
            <p className="mentor-induction-batch__help">Choose students who attended the same handoff. Students must acknowledge their own orientation before you can start induction.</p>
            {failed && <div role="alert" className="mentor-induction-batch__error">We couldn’t check induction readiness. <button type="button" onClick={() => setRetryKey((key) => key + 1)}>Try again</button></div>}
            {loading ? <p className="mentor-induction-batch__muted">Checking student readiness…</p> : (
              <>
                {blockedOrientation.length > 0 && <div className="mentor-induction-batch__notice"><strong>{blockedOrientation.length} student{blockedOrientation.length === 1 ? "" : "s"} still need to acknowledge orientation.</strong><span>Each student completes this personal step. You can request a reminder for the whole group.</span><button type="button" disabled={reminding || remindedIds.length >= blockedOrientation.length} onClick={() => void remindPendingStudents()}>{reminding ? "Requesting reminders…" : remindedIds.length ? `${blockedOrientation.length - remindedIds.length} reminders remaining` : `Remind all ${blockedOrientation.length}`}</button></div>}
                <div className="mentor-induction-batch__roster-head">
                  <span>{selectable.length} students ready in this checklist version{selectable.length > limit ? ` · select up to ${limit} for each group` : ""}</span>
                  {templateGroups.length > 1 && <label>Checklist version <select value={templateId ?? ""} onChange={(event) => { setActiveTemplateId(event.target.value); setSelectedIds([]); }}>
                    {templateGroups.map(([id, version]) => <option key={id ?? "none"} value={id ?? ""}>Version {version}</option>)}
                  </select></label>}
                  <button type="button" onClick={() => setSelectedIds(allSelected ? [] : selectable.slice(0, limit).map((row) => row.placement_id))} disabled={!selectable.length}>
                    {allSelected ? "Clear selection" : "Select all ready students"}
                  </button>
                </div>
                <div className="mentor-induction-batch__roster">
                  {readiness.map((row) => {
                    const placement = placementById.get(row.placement_id);
                    if (!placement) return null;
                    const ready = isBatchReady(row) && row.template_id === templateId;
                    const selected = selectedIds.includes(row.placement_id);
                    const description = row.state === "orientation"
                      ? row.orientation_acknowledged ? "Orientation acknowledged · ready to start" : "Waiting for student orientation acknowledgement"
                      : row.checklist?.completed_at ? "Induction signed" : row.checklist ? `Induction in progress · version ${row.template_version}` : "Checklist unavailable";
                    return <label key={row.placement_id} className={`mentor-induction-batch__roster-row ${selected ? "is-selected" : ""} ${!ready ? "is-disabled" : ""}`}>
                      <input type="checkbox" checked={selected} disabled={!ready || saving || (!selected && selectedIds.length >= limit)} onChange={() => toggleStudent(row.placement_id)} />
                      <span className="mentor-induction-batch__student"><strong>{placement.student?.name ?? "Assigned student"}</strong><small>{placement.ward?.name ?? "Ward not listed"}</small></span>
                      <span className="mentor-induction-batch__student-status">{description}</span>
                    </label>;
                  })}
                  {!readiness.length && !failed && <p className="mentor-induction-batch__muted">No students are waiting for induction.</p>}
                </div>
                <div className="mentor-induction-batch__actions">
                  <span>Up to 100 students can be processed together. If more are ready, select the next group separately. A different checklist version must also be handled separately.</span>
                  <Button onClick={() => void startGroup()} disabled={!selectedIds.length || saving}>{saving ? "Opening checklists…" : `Open checklist for ${selectedIds.length} student${selectedIds.length === 1 ? "" : "s"}`}</Button>
                </div>
              </>
            )}
          </Card>
        ) : (
          <Card padding="lg" className="mentor-induction-batch__panel">
            <div className="mentor-induction-batch__section-heading">
              <div><span>Step 2 · Checklist v{batch.template_version}</span><h2>Complete the shared handoff</h2></div>
              <strong><Users size={16} /> {students.length} students</strong>
            </div>
            <button type="button" className="mentor-induction-batch__change-group" onClick={() => { setBatch(null); setSelectedIds([]); signCommand.current = null; answerCommands.current.clear(); }}>Choose a different group</button>
            <div className="mentor-induction-batch__notice"><strong>Use a group answer only when it is true for everyone.</strong><span>These answers and the optional note are saved to each selected student’s record. Handle any student-specific difference in that student’s record.</span></div>
            <div className="mentor-induction-batch__students">
              {students.map(({ placement_id, checklist }) => <span key={placement_id} className={checklist.completed_at ? "is-complete" : ""}>
                {checklist.completed_at && <Check size={13} />}{placementById.get(placement_id)?.student?.name ?? "Assigned student"}
              </span>)}
            </div>
            <div className="mentor-induction-batch__items">
              {batch.items.map((item, index) => {
                const responses = students.map(({ checklist }) => checklist.items.find((candidate) => candidate.id === item.id)?.response ?? null);
                const count = responses.filter(Boolean).length;
                const unique = [...new Set(responses)];
                const current = unique.length === 1 ? unique[0] : null;
                const extras = itemExtras(item);
                const scheduled = extras.response_kind === "scheduled_date";
                const previousSection = index > 0 ? itemExtras(batch.items[index - 1]).section ?? "" : "";
                const heading = extras.section && extras.section !== previousSection ? extras.section : null;
                return <Fragment key={item.id}>
                  {heading && <h3 className="mentor-induction-batch__group-heading">{heading}</h3>}
                  <section className="mentor-induction-batch__item">
                  <div className="mentor-induction-batch__item-heading"><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.label}{item.required && <sup>*</sup>}</h3>{extras.guidance && <p className="mentor-induction-batch__guidance">Guidance: {extras.guidance}</p>}<p>{count} of {students.length} students answered{unique.length > 1 ? " · responses differ" : ""}</p></div></div>
                  {scheduled
                    ? <label className="mentor-induction-batch__comment">Agreed date and time <span>(required)</span><input type="datetime-local" value={(comments[item.id] ?? "").replace(" ", "T")} onChange={(event) => setComments((value) => ({ ...value, [item.id]: agreedDateText(event.target.value) }))} /></label>
                    : <label className="mentor-induction-batch__comment">Shared note <span>(optional)</span><textarea value={comments[item.id] ?? ""} onChange={(event) => setComments((value) => ({ ...value, [item.id]: event.target.value }))} placeholder="Add the same practical detail for everyone in this group" /></label>}
                  <div className="mentor-induction-batch__answers" role="group" aria-label={`Answer for ${item.label}`}>
                    {([ ["yes", "Done"], ["no", "Not yet"], ["not_applicable", "Does not apply"] ] as const).map(([value, label]) => <button key={value} type="button" className={current === value ? "is-active" : ""} disabled={saving || Boolean(completedCount) || (scheduled && value === "yes" && !comments[item.id]?.trim())} onClick={() => void applyAnswer(item.id, value)} aria-pressed={current === value}>{label}</button>)}
                  </div>
                </section>
                </Fragment>;
              })}
            </div>
            <div className="mentor-induction-batch__actions mentor-induction-batch__sign">
              <div><strong>{completedCount === students.length ? "All induction records are signed." : everyRequiredAnswered ? "The selected records are ready to sign." : "Answer each required item before signing."}</strong><span>Signing records your mentor confirmation and activates each placement.</span></div>
              <Button onClick={() => void signGroup()} disabled={!everyRequiredAnswered || saving || completedCount === students.length}>{saving ? "Saving…" : completedCount === students.length ? "Induction complete" : `Sign for all ${students.length} students`}</Button>
            </div>
            {completedCount === students.length && <div className="mentor-induction-batch__success" role="status"><CheckCircle2 size={18} /> Induction is complete. These placements are now active and ready for mentorship sessions. <Link to="/mentor?view=log">Log the next shared session</Link></div>}
          </Card>
        )}
      </Container>
    </MentorWorkspaceFrame>
  );
}

function isBatchReady(row: InductionReadiness) {
  return Boolean(row.template_id) && (
    (row.state === "orientation" && row.orientation_acknowledged) ||
    (row.state === "induction" && Boolean(row.checklist) && !row.checklist?.completed_at)
  );
}
