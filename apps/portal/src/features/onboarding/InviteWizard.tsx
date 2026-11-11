import { useState, type ChangeEvent } from "react";
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Send, ShieldCheck, Upload, UserPlus } from "lucide-react";
import { Field, FieldRow, Modal, TextInput } from "../../components/kit";
import { useToast } from "../../components/ToastProvider";
import { ApiError, bulkInviteMentors, bulkInviteStudents, type BulkInvitationResult, type StudentInvitationRow } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, AdminTabs, Notice, SearchField, StatusPill } from "../programme-admin/ui/AdminKit";
import { parseRosterFile } from "./rosterParser";

const EMPTY: StudentInvitationRow = { email: "", first_name: "", last_name: "", registration_number: "", phone: "" };

/** Invite students (coordinator) or mentors (nurse manager): upload a list or add one, review every row, then send. */
export function InviteWizard({ memberType, scopeName, onBack, onError }: { memberType: "student" | "mentor"; scopeName: string; onBack: () => void; onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const isMentor = memberType === "mentor";
  const noun = isMentor ? "mentor" : "student";
  const invite = isMentor ? bulkInviteMentors : bulkInviteStudents;
  const [mode, setMode] = useState<"batch" | "single">("batch");
  const [rows, setRows] = useState<StudentInvitationRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [single, setSingle] = useState<StudentInvitationRow>(EMPTY);
  const [result, setResult] = useState<BulkInvitationResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseRosterFile(file, !isMentor);
      setRows(parsed);
      setFileName(file.name);
      setResult(null);
      pushToast({ kind: "success", title: "List loaded", message: `${parsed.length} row${parsed.length === 1 ? "" : "s"} ready to review.` });
    } catch (cause) {
      setRows([]);
      setFileName("");
      onError(cause instanceof Error ? cause.message : `We could not read that ${noun} list.`);
    }
    event.target.value = "";
  }

  async function review(list: StudentInvitationRow[]) {
    setBusy(true);
    try {
      setRows(list);
      setResult(await invite(list, true));
      setSearch("");
      setReviewOpen(true);
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : `We could not check this ${noun} list.`);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    try {
      const sent = await invite(rows, false);
      setResult(sent);
      pushToast({ kind: "success", title: "Invitations queued", message: `${sent.accepted_count} invitation${sent.accepted_count === 1 ? "" : "s"} on the way.` });
      if (sent.rejected_count === 0) {
        setRows([]);
        setFileName("");
        setSingle(EMPTY);
      }
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not send these invitations.");
    } finally {
      setBusy(false);
    }
  }
  function downloadTemplate() {
    const head = isMentor ? "email,first_name,last_name,phone" : "email,first_name,last_name,registration_number,phone";
    const example = isMentor ? "mentor@example.com,Alex,Otieno,+254700000000" : "student@example.com,Alex,Otieno,STU-2026-001,+254700000000";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`${head}\n${example}\n`], { type: "text/csv;charset=utf-8" }));
    link.download = `mentormama-${noun}-invitations.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const ready = result?.results.filter((item) => item.status === "ready").length ?? 0;
  const sent = result && !result.dry_run;
  const query = search.trim().toLocaleLowerCase();
  const visible = (result?.results ?? []).filter((item) => {
    const row = rows[item.row - 1];
    return `${row?.first_name ?? ""} ${row?.last_name ?? ""} ${item.email}`.toLocaleLowerCase().includes(query);
  });
  const singleValid = Boolean(single.email.trim() && single.first_name.trim() && single.last_name.trim() && (isMentor || single.registration_number?.trim()));

  return (
    <AdminPage>
      <div>
        <AdminButton variant="ghost" size="sm" icon={<ArrowLeft />} className="po-back" onClick={onBack}>
          {isMentor ? "All mentors" : "All students"}
        </AdminButton>
      </div>
      <AdminPageHeader
        eyebrow={scopeName}
        title={`Invite ${noun}s`}
        description={`Every row is checked before anything is sent. ${isMentor ? "Mentors" : "Students"} get a secure link to set up their account, linked to your ${isMentor ? "facility" : "institution"} automatically.`}
      />
      <AdminTabs
        label="How to invite"
        value={mode}
        onChange={(value) => { setMode(value as "batch" | "single"); setResult(null); }}
        tabs={[{ value: "batch", label: "Upload a list" }, { value: "single", label: `Add one ${noun}` }]}
      />

      {sent && (
        <Notice icon={<CheckCircle2 />}>
          <strong>{result.accepted_count} invited.</strong>
          {result.rejected_count > 0 ? ` ${result.rejected_count} could not be invited. Fix them and try again.` : " They will each get an email shortly."}
        </Notice>
      )}

      {mode === "batch" ? (
        <AdminCard title="Upload your list" description={`CSV or Excel. Required columns: email, first_name, last_name${isMentor ? "" : ", registration_number"}. Up to 500 rows, 5 MB.`}>
          <label className="invite-drop">
            <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" onChange={(event) => void chooseFile(event)} />
            <span className="invite-drop__icon">{fileName ? <FileSpreadsheet /> : <Upload />}</span>
            <strong>{fileName ? fileName : "Choose a CSV or Excel file"}</strong>
            <small>{fileName ? `${rows.length} row${rows.length === 1 ? "" : "s"} loaded. Choose another file to replace it.` : "Drag a file here or click to browse"}</small>
          </label>
          <div className="pa-row-actions" style={{ marginTop: 16 }}>
            <AdminButton variant="secondary" size="sm" icon={<Download />} onClick={downloadTemplate}>Download template</AdminButton>
            <AdminButton size="sm" icon={<ShieldCheck />} disabled={rows.length === 0 || busy} onClick={() => void review(rows)}>
              {busy ? "Checking…" : `Review ${rows.length || ""} ${noun}${rows.length === 1 ? "" : "s"}`.replace("  ", " ")}
            </AdminButton>
          </div>
        </AdminCard>
      ) : (
        <AdminCard title={`Add one ${noun}`} description="They are checked the same way as a list before the invitation is sent.">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (singleValid && !busy) void review([{ ...single, email: single.email.trim() }]);
            }}
          >
            <Field label="Email" required>
              <TextInput type="email" autoComplete="off" value={single.email} onChange={(event) => setSingle({ ...single, email: event.target.value })} />
            </Field>
            <FieldRow>
              <Field label="First name" required>
                <TextInput value={single.first_name} onChange={(event) => setSingle({ ...single, first_name: event.target.value })} />
              </Field>
              <Field label="Last name" required>
                <TextInput value={single.last_name} onChange={(event) => setSingle({ ...single, last_name: event.target.value })} />
              </Field>
            </FieldRow>
            <FieldRow>
              {!isMentor && (
                <Field label="Registration number" required>
                  <TextInput value={single.registration_number ?? ""} onChange={(event) => setSingle({ ...single, registration_number: event.target.value })} />
                </Field>
              )}
              <Field label="Phone" optional>
                <TextInput value={single.phone ?? ""} onChange={(event) => setSingle({ ...single, phone: event.target.value })} />
              </Field>
            </FieldRow>
            <AdminButton type="submit" size="sm" icon={<UserPlus />} disabled={!singleValid || busy}>
              {busy ? "Checking…" : "Review invitation"}
            </AdminButton>
          </form>
        </AdminCard>
      )}

      <Modal
        open={reviewOpen}
        onClose={() => !busy && setReviewOpen(false)}
        dismissible={!busy}
        icon={<ShieldCheck />}
        title={sent ? "Invitations sent" : "Review before sending"}
        description={sent ? `${result?.accepted_count ?? 0} invited, ${result?.rejected_count ?? 0} not invited.` : `${ready} of ${result?.results.length ?? 0} are ready to send. Nothing is sent until you confirm.`}
        footer={
          sent ? (
            <AdminButton size="sm" onClick={() => setReviewOpen(false)}>Done</AdminButton>
          ) : (
            <>
              <AdminButton variant="secondary" size="sm" onClick={() => setReviewOpen(false)} disabled={busy}>Back</AdminButton>
              <AdminButton size="sm" icon={<Send />} disabled={ready === 0 || busy} onClick={() => void send()}>
                {busy ? "Sending…" : `Send ${ready} invitation${ready === 1 ? "" : "s"}`}
              </AdminButton>
            </>
          )
        }
      >
        {(result?.results.length ?? 0) > 6 && <SearchField label="Search the list" placeholder="Search name or email" value={search} onChange={setSearch} />}
        <div className="pa-table-scroll" style={{ maxHeight: 340, overflow: "auto" }}>
          <table className="pa-table">
            <caption className="sr-only">Invitation review</caption>
            <thead>
              <tr><th scope="col">Person</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const row = rows[item.row - 1];
                return (
                  <tr key={`${item.row}-${item.email}`}>
                    <td>
                      <strong>{row ? `${row.first_name} ${row.last_name}` : item.email}</strong>
                      <small className="pa-sub">{item.email}</small>
                    </td>
                    <td>
                      <StatusPill tone={item.status === "rejected" ? "danger" : "success"}>
                        {item.status === "ready" ? "Ready" : item.status === "invited" ? "Invited" : "Not invited"}
                      </StatusPill>
                      {item.status === "rejected" && <small className="pa-sub">{item.message}</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Modal>
    </AdminPage>
  );
}
