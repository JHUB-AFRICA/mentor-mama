import { useState } from "react";
import { CalendarClock, Clock3, Info, KeyRound, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMFARecoveryRequests, resolveMFARecoveryRequest } from "../../services/api";
import { useToast } from "../../components/ToastProvider";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  EmptyState,
  Notice,
  StatCard,
  StatGrid,
  StatusPill,
} from "./ui/AdminKit";
import "./people-pages.css";
import "./programme-overlays.css";
import { Field, Modal, TextArea } from "../../components/kit";

export function MFARecoveryInbox() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const requests = useQuery({ queryKey: ["mfa-recovery-requests"], queryFn: getMFARecoveryRequests });
  const count = requests.data?.length ?? 0;
  const oldestDays = requests.data?.length
    ? Math.max(0, Math.floor((Date.now() - Math.min(...requests.data.map((item) => new Date(item.created_at).getTime()))) / 86_400_000))
    : 0;
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="People & access"
        title="Authenticator recovery"
        description="Review requests from people in your programme who can’t use their sign-in code."
        actions={
          <AdminButton
            variant="secondary"
            icon={<RefreshCw />}
            onClick={() => void requests.refetch()}
            disabled={requests.isFetching}
          >
            Refresh
          </AdminButton>
        }
      />

      <StatGrid columns={2}>
        <StatCard
          icon={<Clock3 />}
          tone="amber"
          value={count}
          label="Waiting for review"
          hint="Requests from your programme"
          loading={requests.isPending || requests.isError}
        />
        <StatCard
          icon={<CalendarClock />}
          tone="blue"
          value={oldestDays}
          label={oldestDays === 1 ? "Day since oldest request" : "Days since oldest request"}
          hint={count === 0 ? "Nothing waiting" : "Oldest unresolved request"}
          loading={requests.isPending || requests.isError}
        />
      </StatGrid>

      <Notice icon={<ShieldCheck />}>
        <strong>Review requests for your programme.</strong> A reason is recorded for each decision. Programme Administrators can’t approve their own recovery requests. For your own account, <a href="mailto:support@mentormama.org" className="font-bold text-[var(--pa-teal-ink)] underline underline-offset-2">contact MentorMAMA support</a>; platform administrators handle those requests.
      </Notice>

      <section className="pa-table-wrap" aria-label="Requests awaiting review">
        {requests.isPending ? (
          <EmptyState icon={<Clock3 size={24} />} title="Loading recovery requests…" />
        ) : requests.isError ? (
          <EmptyState
            icon={<Info size={24} />}
            title="Recovery requests could not be loaded."
            action={<AdminButton variant="secondary" onClick={() => void requests.refetch()}>Try again</AdminButton>}
          />
        ) : count === 0 ? (
          <AdminCard flush>
            <EmptyState
              icon={<UserCheck size={24} />}
              title="No requests are waiting for review."
              text="When someone can’t use their sign-in code, their request will appear here."
            />
          </AdminCard>
        ) : (
          <div className="pa-table-scroll">
            <table className="pa-table min-w-[60rem]">
              <thead><tr><th>Person</th><th>Role</th><th>Request</th><th>Received</th><th>Actions</th></tr></thead>
              <tbody>
                {requests.data!.map((item) => (
                  <RecoveryRow
                    key={item.id}
                    item={item}
                    onDone={(decision) => {
                      void queryClient.invalidateQueries({ queryKey: ["mfa-recovery-requests"] });
                      pushToast({
                        kind: "success",
                        title: decision === "recover" ? "Authenticator reset" : "Request closed",
                        message: decision === "recover"
                          ? "The person can set up a new authenticator after signing in."
                          : "The recovery request was closed without changing access.",
                      });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPage>
  );
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
      <td><div className="pa-cell-title"><div><strong>{item.name}</strong><small>{item.email}</small></div></div></td>
      <td><StatusPill tone="neutral" dot={false}>{item.role.replaceAll("_", " ")}</StatusPill></td>
      <td className="pa-wrap-cell">{item.reason}</td>
      <td>{new Date(item.created_at).toLocaleString()}</td>
      <td><div className="pa-row-actions"><AdminButton size="sm" onClick={() => setDecision("recover")}>Reset authenticator</AdminButton><AdminButton size="sm" variant="secondary" onClick={() => setDecision("close")}>Close</AdminButton></div></td>
    </tr>
    {decision && (
      <Modal
        open
        onClose={() => setDecision(null)}
        dismissible={!busy}
        size="sm"
        closeLabel="Close dialog"
        icon={decision === "recover" ? <KeyRound /> : <UserCheck />}
        title={decision === "recover" ? `Reset authenticator for ${item.name}?` : `Close request from ${item.name}?`}
        description={
          decision === "recover"
            ? "This removes their current authenticator and signs out their devices. They’ll set up a new authenticator after signing in."
            : "This closes the request without changing their sign-in access."
        }
        footer={
          <>
            <AdminButton size="sm" variant="secondary" onClick={() => setDecision(null)} disabled={busy}>Cancel</AdminButton>
            <AdminButton
              size="sm"
              variant={decision === "recover" ? "secondary" : "primary"}
              className={decision === "recover" ? "po-danger" : undefined}
              onClick={() => void submit()}
              disabled={busy || reason.trim().length < 5}
            >
              {busy ? "Saving…" : decision === "recover" ? "Reset authenticator" : "Close request"}
            </AdminButton>
          </>
        }
      >
        <Field
          label="Reason for this decision"
          required
          hint="Saved to the audit record. At least 5 characters."
          error={error || undefined}
        >
          <TextArea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} minLength={5} />
        </Field>
      </Modal>
    )}
  </>;
}
