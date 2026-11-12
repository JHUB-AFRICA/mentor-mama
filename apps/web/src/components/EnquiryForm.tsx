import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { EnquiryError, sendEnquiry, type EnquiryKind } from "../lib/enquiries";

const input =
  "w-full px-5 py-3 rounded-pill bg-cream/50 border border-cream-dark/50 text-navy placeholder:text-charcoal-muted/50 text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30 transition-all";
const area =
  "w-full px-5 py-4 rounded-refined bg-cream/50 border border-cream-dark/50 text-navy placeholder:text-charcoal-muted/50 text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30 transition-all resize-y";

const TOPICS: Record<EnquiryKind, Array<[string, string]>> = {
  contact: [
    ["general", "A general question"],
    ["partnership", "Partnership or collaboration"],
    ["press", "Press or media"],
    ["other", "Something else"],
  ],
  pilot: [["pilot", "Pilot access"]],
  support: [
    ["sign_in", "I can’t sign in"],
    ["account", "My account or invitation"],
    ["using_platform", "Using MentorMAMA"],
    ["report_problem", "Something is not working"],
    ["other", "Something else"],
  ],
};

const ORGANISATION_TYPES: Array<[string, string]> = [
  ["training_institution", "Training institution"],
  ["health_facility", "Health facility"],
  ["county_or_ministry", "County or ministry"],
  ["ngo", "NGO or partner"],
  ["other", "Other"],
];

const COPY: Record<EnquiryKind, { submit: string; placeholder: string; done: string; next: string[] }> = {
  contact: {
    submit: "Send message",
    placeholder: "How can we help you?",
    done: "Your message is with the MentorMAMA team.",
    next: ["We have emailed you a confirmation with your reference.", "A member of our team replies within 2 working days."],
  },
  pilot: {
    submit: "Request pilot access",
    placeholder: "Tell us about your maternity unit, how mentorship works today and what you hope to change.",
    done: "Your pilot access request is with the MentorMAMA team.",
    next: [
      "We have emailed you a confirmation with your reference.",
      "We read your request and may ask a few questions about your unit.",
      "If it is a good fit, we set up your programme and invite your programme administrator.",
    ],
  },
  support: {
    submit: "Send to support",
    placeholder: "Describe what happened and what you expected. Never include your password or a sign-in code.",
    done: "Your support request is with the MentorMAMA team.",
    next: ["We have emailed you a confirmation with your reference.", "We reply to this email address, usually within 2 working days."],
  },
};

function Label({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-navy mb-2">
      {children} {optional && <span className="text-charcoal-muted/60 font-normal">(optional)</span>}
    </label>
  );
}

/** One accessible form behind the Contact, Pilot access and Support pages. Keeps what was typed when sending fails. */
export default function EnquiryForm({ kind, sourcePage }: { kind: EnquiryKind; sourcePage: string }) {
  const id = useId();
  const opened = useRef(Date.now());
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [topic, setTopic] = useState(TOPICS[kind][0][0]);
  const [values, setValues] = useState({
    name: "", email: "", phone: "", organisation: "", message: "", website: "",
    role_title: "", organisation_type: "health_facility", county: "", mentors: "", students: "", start_term: "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const copy = COPY[kind];
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues({ ...values, [key]: event.target.value });

  useEffect(() => {
    setTopic(TOPICS[kind][0][0]);
    setError(null);
    opened.current = Date.now();
  }, [kind]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const number = (value: string) => (value.trim() === "" ? null : Math.max(0, Math.round(Number(value))));
      const ref = await sendEnquiry({
        kind, topic, name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim(),
        organisation: values.organisation.trim(), message: values.message.trim(), consent,
        details:
          kind === "pilot"
            ? {
                role_title: values.role_title.trim(), organisation_type: values.organisation_type, county: values.county.trim(),
                mentors: number(values.mentors), students: number(values.students), start_term: values.start_term.trim(),
              }
            : undefined,
        source_page: sourcePage, website: values.website, started_at: opened.current,
      });
      setReference(ref);
    } catch (cause) {
      setError(cause instanceof EnquiryError ? { message: cause.message, field: cause.field } : { message: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (reference !== null) {
    return (
      <div className="text-center py-10 space-y-4" role="status">
        <div className="w-14 h-14 rounded-full bg-sage/15 flex items-center justify-center text-sage mx-auto">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="text-h3 text-navy">Thank you, we have it</h2>
        <p className="text-body text-charcoal-muted max-w-md mx-auto">{copy.done}</p>
        {reference && (
          <p className="text-body-small text-navy">
            Your reference: <strong className="font-semibold tracking-wide">{reference}</strong>
          </p>
        )}
        <ol className="text-left text-body-small text-charcoal-muted max-w-md mx-auto list-decimal pl-5 space-y-1.5">
          {copy.next.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-body-small text-charcoal-muted">Can’t find the email? Check your spam folder.</p>
      </div>
    );
  }

  const invalid = (field: string) => (error?.field === field ? true : undefined);
  return (
    <form onSubmit={submit} className="space-y-6" noValidate={false}>
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-refined border border-red-200 bg-red-50 px-4 py-3 text-body-small text-red-800">
          {error.message}
        </p>
      )}
      {TOPICS[kind].length > 1 && (
        <div>
          <Label htmlFor={`${id}-topic`}>What is this about?</Label>
          <select id={`${id}-topic`} className={input} value={topic} onChange={(event) => setTopic(event.target.value)} aria-invalid={invalid("topic")}>
            {TOPICS[kind].map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <Label htmlFor={`${id}-name`}>{kind === "pilot" ? "Contact person" : "Name"}</Label>
          <input id={`${id}-name`} className={input} required minLength={2} maxLength={120} autoComplete="name" value={values.name} onChange={set("name")} aria-invalid={invalid("name")} />
        </div>
        <div>
          <Label htmlFor={`${id}-email`}>Email address</Label>
          <input id={`${id}-email`} type="email" className={input} required maxLength={254} autoComplete="email" placeholder="name@institution.org" value={values.email} onChange={set("email")} aria-invalid={invalid("email")} />
        </div>
      </div>
      {kind === "pilot" ? (
        <>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <Label htmlFor={`${id}-org`}>Organisation</Label>
              <input id={`${id}-org`} className={input} required maxLength={160} autoComplete="organization" placeholder="e.g. Nakuru Level 5 Hospital" value={values.organisation} onChange={set("organisation")} />
            </div>
            <div>
              <Label htmlFor={`${id}-orgtype`}>Type of organisation</Label>
              <select id={`${id}-orgtype`} className={input} value={values.organisation_type} onChange={set("organisation_type")}>
                {ORGANISATION_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`${id}-phone`} optional>Phone</Label>
              <input id={`${id}-phone`} type="tel" className={input} maxLength={32} autoComplete="tel" value={values.phone} onChange={set("phone")} />
            </div>
            <div>
              <Label htmlFor={`${id}-role`} optional>Your role</Label>
              <input id={`${id}-role`} className={input} maxLength={120} autoComplete="organization-title" value={values.role_title} onChange={set("role_title")} />
            </div>
            <div>
              <Label htmlFor={`${id}-county`} optional>County</Label>
              <input id={`${id}-county`} className={input} maxLength={80} value={values.county} onChange={set("county")} />
            </div>
            <div>
              <Label htmlFor={`${id}-mentors`} optional>Mentors who could take part</Label>
              <input id={`${id}-mentors`} type="number" inputMode="numeric" min={0} max={100000} className={input} value={values.mentors} onChange={set("mentors")} />
            </div>
            <div>
              <Label htmlFor={`${id}-students`} optional>Students per cohort</Label>
              <input id={`${id}-students`} type="number" inputMode="numeric" min={0} max={100000} className={input} value={values.students} onChange={set("students")} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`${id}-start`} optional>Preferred start</Label>
              <input id={`${id}-start`} className={input} maxLength={60} placeholder="e.g. January 2027 intake" value={values.start_term} onChange={set("start_term")} />
            </div>
          </div>
        </>
      ) : (
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <Label htmlFor={`${id}-org`} optional>{kind === "support" ? "Programme or institution" : "Institution"}</Label>
            <input id={`${id}-org`} className={input} maxLength={160} autoComplete="organization" placeholder="e.g. JKUAT, Kenyatta National Hospital" value={values.organisation} onChange={set("organisation")} />
          </div>
          <div>
            <Label htmlFor={`${id}-phone`} optional>Phone</Label>
            <input id={`${id}-phone`} type="tel" className={input} maxLength={32} autoComplete="tel" value={values.phone} onChange={set("phone")} />
          </div>
        </div>
      )}
      <div>
        <Label htmlFor={`${id}-message`}>{kind === "support" ? "What happened?" : "Message"}</Label>
        <textarea id={`${id}-message`} className={area} required minLength={10} maxLength={5000} rows={6} placeholder={copy.placeholder} value={values.message} onChange={set("message")} aria-invalid={invalid("message")} />
      </div>
      {/* Honeypot: hidden from people and assistive technology; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this field empty
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
        </label>
      </div>
      <label className="flex items-start gap-3 text-body-small text-charcoal-muted cursor-pointer">
        <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-sage" aria-invalid={invalid("consent")} />
        <span>I agree that MentorMAMA may use these details to contact me about this {kind === "support" ? "request" : "enquiry"}.</span>
      </label>
      <button type="submit" disabled={busy} aria-busy={busy} className="w-full px-8 py-3.5 rounded-pill bg-sage text-white font-semibold text-body-small hover:bg-sage/90 transition-colors flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed">
        {busy ? "Sending…" : copy.submit}
        {!busy && <Send size={14} className="group-hover:translate-x-0.5 transition-transform" />}
      </button>
    </form>
  );
}
