import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { CheckCircle2, LifeBuoy } from "lucide-react";
import { Field, Modal, SelectInput, TextArea } from "../../components/kit";
import { ApiError, sendHelpRequest } from "../../services/api";
import { AdminButton } from "../programme-admin/ui/AdminKit";

const TOPICS: Array<[string, string]> = [
  ["using_platform", "Using MentorMAMA"],
  ["account", "My account or access"],
  ["report_problem", "Something is not working"],
  ["other", "Something else"],
];

/** "Get help" for signed-in people. Name, email, role and programme are attached by the server. */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation();
  const [topic, setTopic] = useState("using_platform");
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => sendHelpRequest({ topic, message: message.trim(), page: pathname }),
    onSuccess: (result) => setReference(result.reference),
  });
  const close = () => {
    if (send.isPending) return;
    onClose();
    setTimeout(() => {
      setReference(null);
      setMessage("");
      send.reset();
    }, 200);
  };
  const tooShort = message.trim().length < 10;

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!send.isPending}
      size="sm"
      icon={reference ? <CheckCircle2 /> : <LifeBuoy />}
      title={reference ? "We have your request" : "Get help"}
      description={reference ? undefined : "Tell the MentorMAMA team what you need. We already know who you are and which page you are on."}
      footer={
        reference ? (
          <AdminButton size="sm" onClick={close}>Done</AdminButton>
        ) : (
          <>
            <AdminButton variant="secondary" size="sm" disabled={send.isPending} onClick={close}>Cancel</AdminButton>
            <AdminButton size="sm" disabled={send.isPending || tooShort} onClick={() => send.mutate()} aria-busy={send.isPending}>
              {send.isPending ? "Sending…" : "Send request"}
            </AdminButton>
          </>
        )
      }
    >
      {reference ? (
        <p role="status">
          Your reference is <strong>{reference}</strong>. We emailed you a confirmation and will reply to the same address, usually within 2 working days.
        </p>
      ) : (
        <div className="grid gap-3">
          {send.isError && (
            <p role="alert" className="pf-alert">
              {send.error instanceof ApiError ? send.error.message : "We could not send your request. What you wrote is still here."}
            </p>
          )}
          <Field label="What is it about?">
            <SelectInput value={topic} onChange={(event) => setTopic(event.target.value)}>
              {TOPICS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Message" required hint="Do not include your password or a sign-in code.">
            <TextArea rows={5} value={message} maxLength={5000} onChange={(event) => setMessage(event.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
