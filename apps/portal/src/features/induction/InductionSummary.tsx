import { Download } from "lucide-react";
import { Button } from "@mentormama/ui";
import { PrintFrame } from "../../components/PrintFrame";
import type { InductionChecklist, Placement } from "../../services/api";

const RESPONSE_LABEL: Record<string, string> = { yes: "Done", no: "Not yet", not_applicable: "Does not apply" };

/** "29 Aug 2026" for the printed record; ISO dates are for machines. */
function printDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

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

      <PrintFrame
        title="Induction handoff record"
        scope={`${placement.student?.name ?? "Student"} · ${placement.facility_name ?? "Facility"}`}
        orientation="portrait"
        className="doc-print-root--exclusive"
      >
        <div className="induction-print-sheet">
          <p className="induction-print-eyebrow">Placement induction</p>
          <h1>Induction handoff record</h1>
          <p className="induction-print-lede">Signed digital checklist summary for the student file.</p>
          <dl className="induction-print-meta">
            <div><dt>Student</dt><dd>{placement.student?.name ?? "Not available"}</dd></div>
            <div><dt>Institution</dt><dd>{placement.institution_name ?? "Not available"}</dd></div>
            <div><dt>Facility</dt><dd>{placement.facility_name ?? "Not available"}</dd></div>
            <div><dt>Ward</dt><dd>{placement.ward?.name ?? "Not available"}</dd></div>
            <div><dt>Placement period</dt><dd>{printDate(placement.planned_start)} – {printDate(placement.planned_end)}</dd></div>
            <div><dt>Template version</dt><dd>{checklist.template_version}</dd></div>
          </dl>
          <h2>Checklist responses</h2>
          <table className="induction-print-table">
            <thead>
              <tr><th scope="col">No.</th><th scope="col">Checklist item</th><th scope="col">Response</th></tr>
            </thead>
            <tbody>
              {checklist.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="induction-print-num">{index + 1}</td>
                  <td>
                    <span className="induction-print-item-label">{item.label}</span>
                    {item.comment && <p className="induction-print-comment">{item.comment}</p>}
                  </td>
                  <td className="induction-print-status">
                    <span className={`induction-print-pill induction-print-pill--${item.response === "yes" ? "yes" : item.response === "no" ? "no" : "neutral"}`}>
                      {RESPONSE_LABEL[item.response ?? ""] ?? "Not answered"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="induction-print-signature">
            <div><dt>Signed by</dt><dd>{checklist.signed_by ?? "Assigned mentor"}</dd></div>
            <div><dt>Signed on</dt><dd>{new Date(checklist.completed_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" })}</dd></div>
          </dl>
          <p className="induction-print-note">The digital record remains the authoritative version.</p>
        </div>
      </PrintFrame>
    </>
  );
}
