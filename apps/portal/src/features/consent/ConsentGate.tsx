import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Modal } from "../../components/kit";
import { acceptConsent, getConsent, getCurrentUser, type CurrentUser } from "../../services/api";
import { AdminButton } from "../programme-admin/ui/AdminKit";

/** Blocks students and mentors until they have read and accepted the programme's current consent wording. */
export function ConsentGate({ user, onUserUpdated }: { user: CurrentUser; onUserUpdated: (user: CurrentUser) => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wording = useQuery({ queryKey: ["consent-current"], queryFn: getConsent, enabled: Boolean(user.consent_required) });
  if (!user.consent_required || !wording.data || wording.data.accepted) return null;

  async function accept() {
    if (!wording.data) return;
    setBusy(true);
    setError("");
    try {
      await acceptConsent(wording.data.id);
      onUserUpdated(await getCurrentUser());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not save your choice. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => undefined}
      dismissible={false}
      icon={<ShieldCheck />}
      title={wording.data.title}
      description="Please read this before you continue."
      footer={
        <AdminButton size="sm" disabled={!agreed || busy} onClick={() => void accept()}>
          {busy ? "Saving…" : "Accept and continue"}
        </AdminButton>
      }
    >
      <div style={{ maxHeight: "50vh", overflowY: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6 }} tabIndex={0} aria-label="Consent wording">
        {wording.data.body}
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14 }}>
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} style={{ marginTop: 4 }} />
        <span>I have read this and understand how my information is used.</span>
      </label>
      {error && <p role="alert" style={{ color: "#b42f2f", marginTop: 8 }}>{error}</p>}
    </Modal>
  );
}
