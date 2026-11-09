import { ArrowRight, CircleDashed } from "lucide-react";
import { Button } from "@mentormama/ui";
import { useNavigate } from "react-router-dom";

export function FacilityPlaceholderPage({
  title,
  description,
  next,
}: {
  title: string;
  description: string;
  next: string;
}) {
  const navigate = useNavigate();
  return (
    <section
      className="mx-auto max-w-3xl rounded-3xl border border-border bg-white p-7 shadow-sm sm:p-10"
      aria-labelledby="facility-page-heading"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-teal-light text-teal">
        <CircleDashed size={22} aria-hidden="true" />
      </span>
      <p className="mt-7 font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
        Facility operations
      </p>
      <h2
        id="facility-page-heading"
        className="mt-2 font-display text-3xl font-bold tracking-tight text-navy"
      >
        {title}
      </h2>
      <p className="mt-4 max-w-2xl font-body text-base leading-7 text-navy-muted">
        {description}
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-3 rounded-2xl bg-mist/60 px-4 py-4">
        <span className="font-body text-sm font-semibold text-navy">
          Next operational focus: {next}
        </span>
        <ArrowRight size={16} className="text-teal" aria-hidden="true" />
      </div>
      <Button
        type="button"
        className="mt-7"
        size="sm"
        onClick={() => navigate("/facility")}
      >
        Return to overview
      </Button>
    </section>
  );
}
