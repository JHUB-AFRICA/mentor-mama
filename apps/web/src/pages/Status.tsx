import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Search } from "lucide-react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { EnquiryError, lookupEnquiry, type EnquiryProgress } from "../lib/enquiries";

const STEPS: Array<{ key: EnquiryProgress["status"][]; label: string }> = [
  { key: ["new", "in_progress", "waiting", "resolved", "closed"], label: "Received" },
  { key: ["in_progress", "waiting", "resolved", "closed"], label: "In progress" },
  { key: ["resolved", "closed"], label: "Resolved" },
];

const input =
  "w-full px-5 py-3 rounded-pill bg-cream/50 border border-cream-dark/50 text-navy placeholder:text-charcoal-muted/50 text-body-small focus:outline-none focus:ring-2 focus:ring-sage/30 transition-all";
const date = (value: string) => new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Senders check where their request is, with the reference and email from their confirmation. */
export default function Status() {
  const ref = useScrollReveal<HTMLDivElement>();
  const [reference, setReference] = useState(new URLSearchParams(window.location.search).get("ref") ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EnquiryProgress | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotFound(false);
    setResult(null);
    try {
      const found = await lookupEnquiry(reference, email);
      if (found) setResult(found);
      else setNotFound(true);
    } catch (cause) {
      setError(cause instanceof EnquiryError ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative min-h-[85vh] bg-cream/30 pt-32 pb-20">
      <div ref={ref} className="content-max-width container-padding">
        <div className="mx-auto max-w-xl" data-reveal>
          <span className="text-overline text-sage">Check progress</span>
          <h1 className="text-h2 text-navy mt-3">Where is my request?</h1>
          <p className="mt-4 text-body text-charcoal-muted">Enter the reference from your confirmation email and the email address you used.</p>

          <form onSubmit={submit} className="mt-8 space-y-5 rounded-refined border border-cream-dark/60 bg-white p-8 shadow-editorial">
            <div>
              <label htmlFor="status-ref" className="block text-[13px] font-semibold text-navy mb-2">Reference</label>
              <input id="status-ref" className={input} required placeholder="e.g. CON-2026-0042" value={reference} onChange={(event) => setReference(event.target.value)} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="status-email" className="block text-[13px] font-semibold text-navy mb-2">Email address</label>
              <input id="status-email" type="email" className={input} required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </div>
            <button type="submit" disabled={busy} aria-busy={busy} className="flex w-full items-center justify-center gap-2 rounded-pill bg-sage px-8 py-3.5 text-body-small font-semibold text-white transition-colors hover:bg-sage/90 disabled:opacity-60">
              <Search size={15} aria-hidden="true" /> {busy ? "Checking…" : "Check status"}
            </button>
          </form>

          <div aria-live="polite" className="mt-6">
            {error && <p role="alert" className="rounded-refined border border-red-200 bg-red-50 px-4 py-3 text-body-small text-red-800">{error}</p>}
            {notFound && (
              <p className="rounded-refined border border-cream-dark bg-white px-4 py-3 text-body-small text-charcoal-muted">
                We could not find a request with that reference and email address. Check both against your confirmation email, or <Link to="/contact" className="font-semibold text-sage underline">contact us</Link>.
              </p>
            )}
            {result && (
              <div className="rounded-refined border border-cream-dark/60 bg-white p-8 shadow-editorial">
                <p className="text-overline text-sage">{result.reference}</p>
                <h2 className="mt-2 text-h3 text-navy">{result.label}</h2>
                <p className="mt-2 text-body text-charcoal-muted">{result.text}</p>
                <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Progress">
                  {STEPS.map((step) => {
                    const done = step.key.includes(result.status);
                    return (
                      <li key={step.label} className={`flex flex-col items-center gap-2 rounded-refined py-3 text-center text-[12px] font-semibold ${done ? "bg-sage/10 text-sage" : "bg-cream/60 text-charcoal-muted"}`}>
                        {done ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                        {step.label}
                        <span className="sr-only">{done ? " (done)" : " (not yet)"}</span>
                      </li>
                    );
                  })}
                </ol>
                <dl className="mt-6 grid gap-2 text-body-small text-charcoal-muted">
                  <div className="flex justify-between gap-4"><dt>Received</dt><dd className="text-navy">{date(result.received_at)}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Last update</dt><dd className="text-navy">{date(result.last_update_at)}</dd></div>
                  {result.last_reply_at && <div className="flex justify-between gap-4"><dt>Our last reply</dt><dd className="text-navy">{date(result.last_reply_at)}</dd></div>}
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
