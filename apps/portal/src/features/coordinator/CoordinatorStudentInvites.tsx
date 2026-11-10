import { useState, type ChangeEvent } from "react";
import { AdminPageHeader } from "../programme-admin/ui/AdminKit";
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Search,
  Send,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import { useToast } from "../../components/ToastProvider";
import {
  ApiError,
  bulkInviteStudents,
  type BulkInvitationResult,
  type CurrentUser,
  type StudentInvitationRow,
} from "../../services/api";
import { parseRosterFile } from "../onboarding/ScopedBulkInviteDashboard";

export function CoordinatorStudentInvites({
  user,
  onBack,
  onError,
}: {
  user: CurrentUser;
  onBack: () => void;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<StudentInvitationRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<BulkInvitationResult | null>(null);
  const [open, setOpen] = useState(false);
  const [reviewSearch, setReviewSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"batch" | "single">("batch");
  const [singleStudent, setSingleStudent] = useState<StudentInvitationRow>({
    email: "",
    first_name: "",
    last_name: "",
    registration_number: "",
    phone: "",
  });
  const { pushToast } = useToast();
  const ready =
    result?.results.filter((item) => item.status === "ready").length ?? 0;
  const searchQuery = reviewSearch.trim().toLocaleLowerCase();
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      `${row.first_name} ${row.last_name} ${row.email} ${row.registration_number}`
        .toLocaleLowerCase()
        .includes(searchQuery),
    );

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseRosterFile(file, true);
      setRows(parsed);
      setResult(null);
      setFileName(file.name);
      pushToast({
        kind: "success",
        title: "Student list loaded",
        message: `${parsed.length} row${parsed.length === 1 ? "" : "s"} ready for review.`,
      });
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "We could not read that student list.",
      );
    }
    event.target.value = "";
  }
  async function review() {
    setBusy(true);
    try {
      setResult(await bulkInviteStudents(rows, true));
      setReviewSearch("");
      setOpen(true);
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not validate this student list.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reviewSingle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRows = [{ ...singleStudent, email: singleStudent.email.trim() }];
    setRows(nextRows);
    setBusy(true);
    try {
      setResult(await bulkInviteStudents(nextRows, true));
      setReviewSearch("");
      setOpen(true);
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not validate this invitation.");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    try {
      const sent = await bulkInviteStudents(rows, false);
      setResult(sent);
      pushToast({
        kind: "success",
        title: "Invitations queued",
        message: `${sent.accepted_count} invitation${sent.accepted_count === 1 ? "" : "s"} queued for delivery.`,
      });
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not send these invitations.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mx-auto w-full max-w-[75rem] space-y-5"
      aria-labelledby="student-invites-heading"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 font-body text-sm font-semibold text-teal hover:text-navy"
      >
        <ArrowLeft size={16} />
        Students
      </button>
      <AdminPageHeader
        eyebrow={`Student access · ${user.scope?.institution_name ?? "Your institution"}`}
        title={mode === "batch" ? "Invite students in one reviewable batch" : "Invite one student securely"}
        description={mode === "batch" ? "Import your institution roster, review every student before sending, and keep invitations scoped to your institution." : "Enter one student’s details, review the server checks, and send an institution-scoped invitation."}
      />
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)] lg:gap-6">
        <Card padding="lg">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-teal-light text-teal">
              <FileSpreadsheet size={21} />
            </span>
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Step 1 · Import
              </p>
              <h3 className="mt-1 font-display text-2xl font-bold text-navy">
                Upload a student roster
              </h3>
              <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                Required: email, first name, last name, and registration number.
                Phone is optional.
              </p>
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 rounded-xl border border-border bg-mist/45 p-1" role="tablist" aria-label="Invitation method">
            <button type="button" role="tab" aria-selected={mode === "batch"} onClick={() => setMode("batch")} className={`rounded-lg px-3 py-2 font-body text-sm font-bold transition ${mode === "batch" ? "bg-white text-navy shadow-sm" : "text-navy-muted hover:text-navy"}`}>Batch upload</button>
            <button type="button" role="tab" aria-selected={mode === "single"} onClick={() => setMode("single")} className={`rounded-lg px-3 py-2 font-body text-sm font-bold transition ${mode === "single" ? "bg-white text-navy shadow-sm" : "text-navy-muted hover:text-navy"}`}>Single student</button>
          </div>
          {mode === "single" && <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void reviewSingle(event)}>
            <label className="font-body text-sm font-semibold text-navy sm:col-span-2">Email<input required type="email" value={singleStudent.email} onChange={(event) => setSingleStudent((current) => ({ ...current, email: event.target.value }))} className="auth-control mt-2 w-full" /></label>
            <label className="font-body text-sm font-semibold text-navy">First name<input required value={singleStudent.first_name} onChange={(event) => setSingleStudent((current) => ({ ...current, first_name: event.target.value }))} className="auth-control mt-2 w-full" /></label>
            <label className="font-body text-sm font-semibold text-navy">Last name<input required value={singleStudent.last_name} onChange={(event) => setSingleStudent((current) => ({ ...current, last_name: event.target.value }))} className="auth-control mt-2 w-full" /></label>
            <label className="font-body text-sm font-semibold text-navy">Registration number<input required value={singleStudent.registration_number} onChange={(event) => setSingleStudent((current) => ({ ...current, registration_number: event.target.value }))} className="auth-control mt-2 w-full" /></label>
            <label className="font-body text-sm font-semibold text-navy">Phone <span className="font-normal text-navy-muted">(optional)</span><input value={singleStudent.phone ?? ""} onChange={(event) => setSingleStudent((current) => ({ ...current, phone: event.target.value }))} className="auth-control mt-2 w-full" /></label>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Checking invitation…" : "Review invitation"}</Button></div>
          </form>}
          <label className={`mt-7 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-teal/45 bg-mist/50 px-6 py-10 text-center transition hover:border-teal hover:bg-teal-light/35 sm:min-h-56 sm:py-12 ${mode === "single" ? "hidden" : ""}`}>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="sr-only"
              onChange={(event) => void chooseFile(event)}
            />
            <Upload size={25} className="text-teal" />
            <span className="mt-3 font-body text-sm font-semibold text-navy">
              Choose CSV or Excel roster
            </span>
            <span className="mt-1 font-body text-xs text-navy-muted">
              Up to 500 students · 5 MB maximum
            </span>
          </label>
          {mode === "batch" && fileName && (
            <p className="mt-4 rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy">
              <strong>{fileName}</strong> · {rows.length} rows loaded
            </p>
          )}
          {mode === "batch" && <Button
            type="button"
            className="mt-6 w-full sm:w-auto"
            disabled={!rows.length || busy}
            onClick={() => void review()}
          >
            <Users size={16} className="mr-2" />
            {busy ? "Checking roster…" : "Review student list"}
          </Button>}
        </Card>
        <Card padding="lg" className="h-fit bg-teal-light/35">
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
            Before you send
          </p>
          <h3 className="mt-2 font-display text-xl font-bold text-navy">
            A safe, deliberate handoff
          </h3>
          <div className="mt-5 space-y-4 font-body text-sm leading-6 text-navy-muted">
            <p className="flex gap-3">
              <CheckCircle2 size={17} className="mt-1 shrink-0 text-teal" />
              Every row is checked for required details and duplicate accounts.
            </p>
            <p className="flex gap-3">
              <CheckCircle2 size={17} className="mt-1 shrink-0 text-teal" />
              No invitation is sent until you confirm the review.
            </p>
          </div>
        </Card>
      </div>
      {open && result && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-review-heading"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-2 border-teal/30 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-5 border-b border-border px-5 py-5 sm:px-7">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                  Step 2 · Review
                </p>
                <h3
                  id="student-review-heading"
                  className="mt-1 font-display text-2xl font-bold text-navy"
                >
                  Confirm student invitations
                </h3>
                <p className="mt-1 font-body text-sm text-navy-muted">
                  {ready} ready · {result.rejected_count} need attention ·{" "}
                  {visibleRows.length} shown
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-10 items-center justify-center rounded-full text-navy-muted hover:bg-mist"
                aria-label="Close student review"
              >
                <X size={19} />
              </button>
            </header>
            <div className="border-b border-border px-5 py-4 sm:px-7">
              <label className="relative block">
                <Search
                  size={17}
                  className="absolute left-4 top-3.5 text-navy-muted"
                  aria-hidden="true"
                />
                <input
                  value={reviewSearch}
                  onChange={(event) => setReviewSearch(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-mist/35 pl-11 pr-4 font-body text-sm text-navy outline-none transition placeholder:text-navy-muted focus:border-teal focus:ring-2 focus:ring-teal/20"
                  placeholder="Search name, email, or registration number"
                  aria-label="Search imported students"
                />
              </label>
            </div>
            <div className="min-h-0 overflow-auto">
              {visibleRows.length ? (
                <table className="w-full min-w-[48rem] text-left">
                  <thead className="sticky top-0 bg-mist">
                    <tr>
                      {[
                        "Row",
                        "Student",
                        "Email",
                        "Registration",
                        "Result",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-5 py-3 font-body text-xs font-bold uppercase tracking-[0.1em] text-navy-muted"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(({ row, index }) => {
                      const item = result.results[index];
                      return (
                        <tr
                          key={`${row.email}-${index}`}
                          className="border-t border-border"
                        >
                          <td className="px-5 py-3 font-body text-sm text-navy-muted">
                            {index + 1}
                          </td>
                          <td className="px-5 py-3 font-body text-sm font-semibold text-navy">
                            {row.first_name} {row.last_name}
                          </td>
                          <td className="px-5 py-3 font-body text-sm text-navy-muted">
                            {row.email}
                          </td>
                          <td className="px-5 py-3 font-body text-sm text-navy-muted">
                            {row.registration_number}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 font-body text-xs font-semibold ${item?.status === "rejected" ? "bg-error/10 text-error" : "bg-teal-light text-teal"}`}
                            >
                              {item?.status === "rejected"
                                ? item.message
                                : "Ready"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-5 py-14 text-center">
                  <Search
                    size={22}
                    className="mx-auto text-navy-muted"
                    aria-hidden="true"
                  />
                  <p className="mt-3 font-body text-sm font-semibold text-navy">
                    No students match this search
                  </p>
                  <p className="mt-1 font-body text-xs text-navy-muted">
                    Try another name, email, or registration number.
                  </p>
                </div>
              )}
            </div>
            <footer className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
              <Button
                type="button"
                variant="tertiary"
                onClick={() => setOpen(false)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                disabled={busy || ready === 0 || !result.dry_run}
                onClick={() => void send()}
              >
                <Send size={16} className="mr-2" />
                {busy
                  ? "Sending…"
                  : `Send ${ready} invitation${ready === 1 ? "" : "s"}`}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
