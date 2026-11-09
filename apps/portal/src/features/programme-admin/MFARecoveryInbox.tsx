import { useState, type ReactNode } from "react";
import { Clock3, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@mentormama/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMFARecoveryRequests, resolveMFARecoveryRequest } from "../../services/api";
import { useToast } from "../../components/ToastProvider";

export function MFARecoveryInbox() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const requests = useQuery({ queryKey: ["mfa-recovery-requests"], queryFn: getMFARecoveryRequests });
  const count = requests.data?.length ?? 0;
  return (
    <div className="content-library-page">
      <header className="content-library-heading">
        <div>
          <p className="content-library-eyebrow">People &amp; access</p>
          <h1>Authenticator recovery</h1>
          <p>Review requests from people in your programme who can’t use their sign-in code.</p>
        </div>
        <Button variant="tertiary" onClick={() => void requests.refetch()} disabled={requests.isFetching}>
          <RefreshCw size={16} className="mr-2" /> Refresh
        </Button>
      </header>

      <section className="content-library-stats mfa-recovery-summary" aria-label="Recovery request summary">
        <Summary icon={<Clock3 size={21} />} value={requests.isPending ? "—" : count} label="Waiting for review" />
        <Summary icon={<Users size={21} />} value="Current" label="Programme scope" />
        <Summary icon={<ShieldCheck size={21} />} value="Required" label="A reason is recorded for each decision" />
      </section>

      <aside className="mfa-recovery-admin-note">
        <ShieldCheck size={18} />
        <p><strong>Review requests for your programme.</strong> Programme Administrators can’t approve their own recovery requests. For your own account, <a href="mailto:support@mentormama.org">contact MentorMAMA support</a>; platform administrators handle those requests.</p>
      </aside>

      <section className="content-library-table-wrap" aria-label="Requests awaiting review">
        {requests.isPending ? <p className="content-library-empty">Loading recovery requests…</p> : requests.isError ? (
          <div className="content-library-empty"><p>Recovery requests could not be loaded.</p><Button variant="tertiary" onClick={() => void requests.refetch()}>Try again</Button></div>
        ) : count === 0 ? (
          <div className="content-library-empty"><p>No requests are waiting for review.</p></div>
        ) : (
          <div className="content-library-table-scroll">
            <table className="content-library-table mfa-recovery-table">
              <thead><tr><th>PERSON</th><th>ROLE</th><th>REQUEST</th><th>RECEIVED</th><th>ACTIONS</th></tr></thead>
          <tbody>{requests.data!.map((item) => <RecoveryRow key={item.id} item={item} onDone={(decision) => { void queryClient.invalidateQueries({ queryKey: ["mfa-recovery-requests"] }); pushToast({ kind: "success", title: decision === "recover" ? "Authenticator reset" : "Request closed", message: decision === "recover" ? "The person can set up a new authenticator after signing in." : "The recovery request was closed without changing access." }); }} />)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Summary({ icon, value, label }: { icon: ReactNode; value: string | number; label: string }) {
  return <article className="content-library-stat"><span className="content-library-stat-icon content-library-stat-icon--teal">{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function RecoveryRow({ item, onDone }: { item: { id: string; name: string; email: string; role: string; reason: string; created_at: string }; onDone: (decision: "recover" | "close") => void }) {
  const { pushToast } = useToast();
  const [decision, setDecision] = useState<"recover" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!decision || reason.trim().length < 5) return;
    setBusy(true); setError("");
    try { await resolveMFARecoveryRequest(item.id, decision, reason.trim()); onDone(decision); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Could not review this request."; setError(message); pushToast({ kind: "error", title: "Request not updated", message }); }
    finally { setBusy(false); }
  }
  return <>
    <tr>
      <td><strong>{item.name}</strong><small className="mfa-recovery-email">{item.email}</small></td>
      <td>{item.role.replaceAll("_", " ")}</td>
      <td className="mfa-recovery-reason">{item.reason}</td>
      <td>{new Date(item.created_at).toLocaleString()}</td>
      <td><div className="mfa-recovery-actions"><Button size="sm" onClick={() => setDecision("recover")}>Reset authenticator</Button><Button size="sm" variant="tertiary" onClick={() => setDecision("close")}>Close</Button></div></td>
    </tr>
    {decision && <tr><td colSpan={5}><div className="mfa-recovery-review">
      <p>{decision === "recover" ? "This removes their current authenticator and signs out their devices. They’ll set up a new authenticator after signing in." : "This closes the request without changing their sign-in access."}</p>
      <label>Reason for this decision<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} minLength={5} /></label>
      {error && <p role="alert" className="mfa-recovery-error">{error}</p>}
      <div><Button size="sm" variant="tertiary" onClick={() => setDecision(null)} disabled={busy}>Cancel</Button><Button size="sm" onClick={() => void submit()} disabled={busy || reason.trim().length < 5}>{busy ? "Saving…" : "Confirm"}</Button></div>
    </div></td></tr>}
  </>;
}
