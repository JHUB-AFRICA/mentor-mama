import { COMPLETED_BY_OPTIONS, type TemplateItem } from "../../services/induction-templates";
import "./induction-editor.css";

const roleLabel = (value: string) => COMPLETED_BY_OPTIONS.find((option) => option.value === value)?.label ?? value;

/** Shows a checklist roughly as a mentor will see it. Nothing here can be answered. */
export function InductionPreview({ title, items }: { title?: string; items: TemplateItem[] }) {
  if (!items.length) {
    return <p className="pa-description">There are no items to preview yet. Add an item and it will appear here.</p>;
  }
  let lastSection: string | null = null;
  return (
    <div className="ice-preview" aria-label="Preview of the mentor checklist">
      <div>
        <p className="pa-eyebrow">Mentor induction</p>
        <h3 className="pa-card__title">{title?.trim() || "Welcome the student to the ward"}</h3>
        <p className="pa-description">Go through each point together. Choose the answer that matches what happened.</p>
      </div>
      {items.map((item, index) => {
        const heading = item.section !== lastSection && item.section ? item.section : null;
        lastSection = item.section;
        return (
          <div key={`${index}-${item.label}`} className="contents">
            {heading && <p className="ice-preview__section">{heading}</p>}
            <section className="ice-preview__item">
              <h4>
                {String(index + 1).padStart(2, "0")} · {item.label || <em>Item text not written yet</em>}
                {item.is_required && <sup aria-label="Required"> *</sup>}
              </h4>
              {item.guidance && <p className="ice-preview__guidance">Guidance: {item.guidance}</p>}
              <div className="ice-preview__answers" aria-hidden="true">
                <span>Done</span>
                <span>Not yet</span>
                <span>Does not apply</span>
              </div>
              {item.response_kind === "scheduled_date" && (
                <p className="ice-preview__meta">The mentor adds the agreed date and time before marking this as done.</p>
              )}
              <p className="ice-preview__meta">
                {item.is_required ? "Required before the placement can become active" : "Optional"} · {roleLabel(item.completed_by_role)}
              </p>
            </section>
          </div>
        );
      })}
    </div>
  );
}
