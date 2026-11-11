import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@mentormama/ui";
import { ArrowRight, Plus, ShieldAlert } from "lucide-react";
import { Modal } from "../../components/kit";
import { getEscalations } from "../../services/api";
import { AdminButton, StatusPill } from "../programme-admin/ui/AdminKit";
import { StudentFeedbackForm } from "./StudentFeedbackForm";
import { RaiseConcernForm } from "./RaiseConcernForm";
import { stateLabel } from "./MyConcerns";
import "./concerns.css";

export function FeedbackAndSafeguardingPanel({ placementId, role, onError, surface = "card" }: { placementId: string; role: string; onError: (message: string) => void; surface?: "card" | "plain" }) {
  if (role !== "student") {
    return (
      <Card padding="lg" className={`w-full border-warning/25 bg-warning/5 ${surface === "plain" ? "rounded-2xl" : ""}`}>
        {surface !== "plain" && (
          <>
            <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-warning">Safeguarding</p>
            <h2 className="mb-4 mt-1 font-display text-h3 text-navy">Raise a private concern</h2>
          </>
        )}
        <RaiseConcernForm placementId={placementId} onError={onError} />
      </Card>
    );
  }
  return (
    <div className="sp-support">
      <StudentFeedbackForm placementId={placementId} onError={onError} />
      <ConcernAside placementId={placementId} onError={onError} />
    </div>
  );
}

/** Compact concern entry point beside the feedback form: sized to its content, never stretched. */
function ConcernAside({ placementId, onError }: { placementId: string; onError: (message: string) => void }) {
  const [raising, setRaising] = useState(false);
  const list = useQuery({ queryKey: ["escalations"], queryFn: getEscalations });
  const mine = (list.data ?? []).filter((row) => row.placement_id === placementId);
  return (
    <aside className="sp-support__aside">
      <section className="sp-concern-cta">
        <span className="sp-concern-cta__icon" aria-hidden="true"><ShieldAlert /></span>
        <h3>Something worrying you?</h3>
        <p>Raise a private concern. You choose who looks into it: the nurse manager, your university coordinator, or both.</p>
        <AdminButton icon={<Plus />} onClick={() => setRaising(true)}>Raise a private concern</AdminButton>
      </section>
      <section className="sp-concern-recent" aria-labelledby={`recent-concerns-${placementId}`}>
        <header>
          <h3 id={`recent-concerns-${placementId}`}>Your concerns here</h3>
          <Link to="/student?view=concerns">View all <ArrowRight aria-hidden="true" /></Link>
        </header>
        {list.isPending ? (
          <p className="sp-concern-recent__empty">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="sp-concern-recent__empty">None raised for this placement.</p>
        ) : (
          <ul>
            {mine.slice(0, 3).map((row) => {
              const state = stateLabel(row);
              return (
                <li key={row.id}>
                  <Link to={`/student/concerns/${row.id}`}>
                    <span>{row.category}<small>{new Date(row.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></span>
                    <StatusPill tone={state.tone}>{state.text}</StatusPill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Modal open={raising} onClose={() => setRaising(false)} icon={<ShieldAlert />} title="Raise a private concern" description="Choose who may look into it. Nobody else will see it." size="lg">
        <RaiseConcernForm placementId={placementId} onError={onError} onCancel={() => setRaising(false)} onSubmitted={() => setRaising(false)} />
      </Modal>
    </aside>
  );
}
