import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, Check, FileText, MapPin, ShieldCheck, UserRound, X } from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import { acknowledgeOrientation, getOrientationAcknowledgement, type Placement } from "../../services/api";

type ConfirmedItems = {
  details: boolean;
  emergency: boolean;
  safeguarding: boolean;
};

export function OrientationPanel({ placement, onComplete, onError }: { placement: Placement; onComplete: () => void; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedItems>({ details: false, emergency: false, safeguarding: false });
  const [questions, setQuestions] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const { pushToast } = useToast();
  const ready = Object.values(confirmed).every(Boolean);

  useEffect(() => {
    let active = true;
    setStatusLoading(true);
    setStatusError(false);
    setAcknowledged(false);
    void getOrientationAcknowledgement(placement.id)
      .then((status) => {
        if (active) setAcknowledged(status.acknowledged);
      })
      .catch(() => {
        if (active) setStatusError(true);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => { active = false; };
  }, [placement.id, statusAttempt]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  function close() {
    if (!busy) setOpen(false);
  }

  async function submit() {
    setBusy(true);
    try {
      await acknowledgeOrientation(placement.id, {
        understands_placement_details: confirmed.details,
        understands_emergency_process: confirmed.emergency,
        understands_safeguarding: confirmed.safeguarding,
        questions,
      });
      setAcknowledged(true);
      setOpen(false);
      pushToast({ kind: "success", title: "Orientation recorded", message: "Your acknowledgement is saved. You can return to this placement at any time." });
      onComplete();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "We could not save your orientation acknowledgement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card padding="lg" className="orientation-handoff-card">
        <div className="orientation-handoff-card__icon"><FileText size={20} /></div>
        <div className="orientation-handoff-card__content">
          <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-teal">Orientation handoff</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-navy">{acknowledged ? "Orientation complete" : "Review what you need to know"}</h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-6 text-navy-muted">{acknowledged ? "Your acknowledgement is saved. Your mentor will continue with the next placement step." : "Open the placement guide for your facility, emergency process, safeguarding expectations and the acknowledgement checklist."}</p>
          {statusError && <div className="mt-3" role="alert"><p className="font-body text-sm text-error">We couldn’t check whether you have completed orientation.</p><Button size="sm" variant="tertiary" className="mt-2" onClick={() => setStatusAttempt((attempt) => attempt + 1)}>Try again</Button></div>}
        </div>
        {!acknowledged && <Button size="sm" disabled={statusLoading || statusError} onClick={() => setOpen(true)}>{statusLoading ? "Checking status…" : "Open orientation guide"} <FileText size={15} /></Button>}
      </Card>

      {open && (
        <div className="orientation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="orientation-modal" role="dialog" aria-modal="true" aria-labelledby="orientation-modal-title">
            <header className="orientation-modal__header">
              <div>
                <p className="orientation-modal__eyebrow">MentorMAMA · Student orientation</p>
                <h2 id="orientation-modal-title">Placement orientation guide</h2>
                <p>Read this guide before confirming that you understand your placement.</p>
              </div>
              <button type="button" className="orientation-modal__close" onClick={close} disabled={busy} aria-label="Close orientation guide"><X size={19} /></button>
            </header>

            <div className="orientation-modal__body">
              <article className="orientation-document">
                <header className="orientation-document__masthead">
                  <div className="orientation-document__brand"><span>M</span><div><strong>MentorMAMA</strong><small>Clinical programme</small></div></div>
                  <span className="orientation-document__label">ORIENTATION RECORD</span>
                </header>
                <div className="orientation-document__title">
                  <span>PLACEMENT ORIENTATION</span>
                  <h1>{placement.facility_name ?? "Student placement"}</h1>
                  <p>Important information for your placement journey</p>
                </div>

                <OrientationDocumentSection number="01" title="Your placement details">
                  <div className="orientation-document__grid">
                    <DocumentValue icon={<MapPin size={16} />} label="Facility" value={placement.facility_name ?? "Details pending"} />
                    <DocumentValue icon={<MapPin size={16} />} label="Ward" value={placement.ward?.name ?? "Details pending"} />
                    <DocumentValue icon={<CalendarDays size={16} />} label="Placement dates" value={`${placement.planned_start} → ${placement.planned_end}`} />
                    <DocumentValue icon={<UserRound size={16} />} label="Assigned mentor" value={placement.mentor?.name ?? "Assignment pending"} />
                  </div>
                  <p className="orientation-document__copy">Check the facility, ward, mentor and placement dates carefully. If any detail is incorrect or unclear, pause your acknowledgement and contact the programme team.</p>
                </OrientationDocumentSection>

                <OrientationDocumentSection number="02" title="Emergency process and support">
                  <p className="orientation-document__copy">For an immediate clinical or personal emergency, follow the facility’s emergency procedure and alert the responsible ward or clinical team. Then notify your assigned mentor or programme contact as soon as it is safe to do so.</p>
                  <ul className="orientation-document__list"><li>Ask the ward team where emergency equipment, exits and escalation points are located.</li><li>Contact your mentor for placement support and the programme team when an incident affects your attendance or safety.</li><li>Do not delay urgent care while waiting for a programme response.</li></ul>
                </OrientationDocumentSection>

                <OrientationDocumentSection number="03" title="Safeguarding and professional conduct">
                  <p className="orientation-document__copy">You are expected to protect patients, colleagues and yourself. Raise safeguarding, harassment, discrimination, boundary or wellbeing concerns through the available support channels. Concerns are confidential and should be raised as soon as possible.</p>
                  <ul className="orientation-document__list"><li>Maintain patient privacy and never include patient identifiers in portal messages.</li><li>Follow facility policies, professional boundaries and your mentor’s lawful guidance.</li><li>Escalate concerns if they are not resolved or if someone may be at risk.</li></ul>
                </OrientationDocumentSection>

                <div className="orientation-document__notice"><ShieldCheck size={18} /><p>This guide is part of your private learning record. Your acknowledgement records that you have reviewed the information; it does not prevent you from raising a concern later.</p></div>
              </article>

              <div className="orientation-confirmation">
                <p className="orientation-modal__eyebrow">Acknowledgement checklist</p>
                <h3>Confirm each item before continuing</h3>
                <OrientationCheck checked={confirmed.details} onChange={(value) => setConfirmed((current) => ({ ...current, details: value }))}>I understand my placement details, ward, mentor and dates.</OrientationCheck>
                <OrientationCheck checked={confirmed.emergency} onChange={(value) => setConfirmed((current) => ({ ...current, emergency: value }))}>I understand the emergency process and who to contact for help.</OrientationCheck>
                <OrientationCheck checked={confirmed.safeguarding} onChange={(value) => setConfirmed((current) => ({ ...current, safeguarding: value }))}>I understand safeguarding, professional conduct and escalation expectations.</OrientationCheck>
                <label className="orientation-question">Questions or support needs <span>(optional)</span><textarea value={questions} onChange={(event) => setQuestions(event.target.value)} placeholder="Tell us what you would like clarified before induction." /></label>
              </div>
            </div>

            <footer className="orientation-modal__footer"><Button variant="tertiary" onClick={close} disabled={busy}>Not now</Button><Button size="sm" disabled={!ready || busy} onClick={() => void submit()}>{busy ? "Saving…" : "Acknowledge orientation"} {!busy && <Check size={15} />}</Button></footer>
          </section>
        </div>
      )}
    </>
  );
}

function OrientationDocumentSection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <section className="orientation-document__section"><div className="orientation-document__section-heading"><span>{number}</span><h3>{title}</h3></div>{children}</section>;
}

function DocumentValue({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="orientation-document__value"><span>{icon}<small>{label}</small></span><strong>{value}</strong></div>;
}

function OrientationCheck({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return <label className={`orientation-check ${checked ? "orientation-check--checked" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{checked && <Check size={13} />}</span><strong>{children}</strong></label>;
}
