import { Download, Printer } from "lucide-react";
import { Button } from "@mentormama/ui";
import type { InductionChecklist, Placement } from "../../services/api";

export function InductionSummary({
  placement,
  checklist,
}: {
  placement: Placement;
  checklist: InductionChecklist;
}) {
  if (!checklist.completed_at) return null;

  function printSummary() {
    window.print();
  }

  return (
    <>
      <section className="mb-7 rounded-2xl border border-success/25 bg-success/5 p-5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-success">
              Signed induction record
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-navy">
              Ready to print or save as PDF
            </h2>
            <p className="mt-2 max-w-2xl font-body text-sm leading-5 text-navy-muted">
              Download a clean handoff summary for the student file. The digital record remains the authoritative version.
            </p>
          </div>
          <Button type="button" size="sm" onClick={printSummary}>
            <Download size={16} aria-hidden="true" />
            Print / save PDF
          </Button>
        </div>
      </section>

      <div className="induction-print-sheet" aria-hidden="true">
        <header className="induction-print-header">
          <div>
            <p className="induction-print-kicker">MentorMAMA · Clinical programme</p>
            <h1>Induction handoff record</h1>
            <p>Signed digital checklist summary</p>
          </div>
          <Printer size={28} aria-hidden="true" />
        </header>
        <div className="induction-print-meta">
          <div><strong>Student</strong><span>{placement.student?.name ?? "Not available"}</span></div>
          <div><strong>Institution</strong><span>{placement.institution_name ?? "Not available"}</span></div>
          <div><strong>Facility</strong><span>{placement.facility_name ?? "Not available"}</span></div>
          <div><strong>Ward</strong><span>{placement.ward?.name ?? "Not available"}</span></div>
          <div><strong>Placement period</strong><span>{placement.planned_start} — {placement.planned_end}</span></div>
          <div><strong>Template version</strong><span>{checklist.template_version}</span></div>
        </div>
        <h2>Checklist responses</h2>
        <ol className="induction-print-items">
          {checklist.items.map((item) => (
            <li key={item.id}>
              <div><strong>{item.label}</strong><span>{item.response?.replaceAll("_", " ") ?? "Not answered"}</span></div>
              {item.comment && <p>{item.comment}</p>}
            </li>
          ))}
        </ol>
        <footer className="induction-print-footer">
          <span>Signed by {checklist.signed_by ?? "assigned mentor"}</span>
          <span>{new Date(checklist.completed_at).toLocaleString("en-GB")}</span>
        </footer>
      </div>
    </>
  );
}
