import { useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import {
  ApiError,
  bulkInviteMentors,
  bulkInviteStudents,
  inviteTeamMember,
  logout,
  type BulkInvitationResult,
  type CurrentUser,
  type StudentInvitationRow,
} from "../../services/api";
import { CohortManagement } from "../coordinator/CohortManagement";
import { FacilityWorkspaceFrame } from "../nurse-manager/FacilityWorkspaceFrame";
import { Link, useNavigate } from "react-router-dom";

type Props = { user: CurrentUser; onError: (message: string) => void };
type ScopedProps = Props & { memberType: "student" | "mentor" };

export function ScopedBulkInviteDashboard({
  user,
  onError,
  memberType,
  extraContent,
}: ScopedProps & { extraContent?: React.ReactNode }) {
  const navigate = useNavigate();
  const isMentor = memberType === "mentor";
  const memberLabel = isMentor ? "mentor" : "student";
  const memberLabelPlural = isMentor ? "mentors" : "students";
  const scopeLabel = isMentor ? "facility" : "institution";
  const scopeTitle = isMentor
    ? "Facility workspace / Mentors"
    : "Institution workspace / Students";
  const inviteBatch = isMentor ? bulkInviteMentors : bulkInviteStudents;
  const [rows, setRows] = useState<StudentInvitationRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<BulkInvitationResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSearch, setReviewSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleBusy, setSingleBusy] = useState(false);
  const [singleSuccess, setSingleSuccess] = useState<string | null>(null);
  const [singleForm, setSingleForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    registration_number: "",
  });
  function reportError(message: string) {
    setParseError(message);
    onError(message);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseError(null);
    try {
      const parsed = await parseRosterFile(file, !isMentor);
      setRows(parsed);
    } catch (cause) {
      setRows([]);
      setParseError(
        cause instanceof Error
          ? cause.message
          : "We could not read that CSV file.",
      );
    }
  }

  async function preview() {
    setBusy(true);
    setParseError(null);
    try {
      setResult(await inviteBatch(rows, true));
      setReviewSearch("");
      setReviewOpen(true);
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : `We could not validate the ${memberLabel} list.`;
      reportError(message);
    } finally {
      setBusy(false);
    }
  }

  async function sendInvitations() {
    setBusy(true);
    try {
      setResult(await inviteBatch(rows, false));
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : `We could not send the ${memberLabel} invitations.`;
      reportError(message);
    } finally {
      setBusy(false);
    }
  }

  async function sendSingleInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSingleBusy(true);
    setSingleSuccess(null);
    try {
      await inviteTeamMember({
        ...singleForm,
        role: memberType,
        facility_id: isMentor
          ? String(user.scope?.facility_id ?? "")
          : undefined,
        institution_id: !isMentor
          ? String(user.scope?.institution_id ?? "")
          : undefined,
      });
      setSingleSuccess(`Invitation sent to ${singleForm.email}.`);
      setSingleForm({
        email: "",
        first_name: "",
        last_name: "",
        phone: "",
        registration_number: "",
      });
    } catch (cause) {
      reportError(
        cause instanceof ApiError
          ? cause.message
          : `We could not invite this ${memberLabel}.`,
      );
    } finally {
      setSingleBusy(false);
    }
  }

  function downloadTemplate() {
    const headers = isMentor
      ? "email,first_name,last_name,phone"
      : "email,first_name,last_name,registration_number,phone";
    const example = isMentor
      ? `${memberLabel}@example.com,Alex,Otieno,+254700000000`
      : `${memberLabel}@example.com,Alex,Otieno,STU-2026-001,+254700000000`;
    const blob = new Blob([`${headers}\n${example}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mentormama-${memberLabel}-invitations.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const readyCount =
    result?.results.filter((item) => item.status === "ready").length ?? 0;
  const reviewQuery = reviewSearch.trim().toLocaleLowerCase();
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      `${row.first_name} ${row.last_name} ${row.email} ${row.registration_number}`
        .toLocaleLowerCase()
        .includes(reviewQuery),
    );

  const content = (
    <section className="space-y-8">
      <div className="dashboard-hero grid gap-7 overflow-hidden rounded-[1.75rem] p-6 text-white sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-10">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal-bright">
            {scopeTitle}
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Bring your {memberLabel} group in.
          </h1>
          <p className="mt-4 max-w-2xl font-body text-base leading-7 text-slate-300">
            Upload a prepared CSV and we’ll check every row before sending
            secure account invitations to {memberLabelPlural} in your{" "}
            {scopeLabel}.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 font-body text-xs font-semibold text-white">
              <CheckCircle2 size={15} className="text-teal-bright" />
              Scoped access by default
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 font-body text-xs font-semibold text-white">
              <ShieldCheck size={15} className="text-teal-bright" />
              Secure invitations
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-end rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Workspace pulse
          </p>
          <p className="mt-3 font-display text-4xl font-bold text-white">
            {rows.length}
          </p>
          <p className="mt-1 font-body text-sm text-slate-300">
            rows currently prepared
          </p>
          <div className="mt-5 h-px bg-white/10" />
          <p className="mt-4 font-body text-xs leading-5 text-slate-400">
            Review the list before anything is sent.
          </p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card padding="lg" className="dashboard-card">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-light text-teal">
              <FileSpreadsheet size={21} />
            </span>
            <div>
              <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                Step 1 · Prepare
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-navy">
                Upload {memberLabel} list
              </h2>
              <p className="mt-1 font-body text-sm leading-6 text-navy-muted">
                CSV or Excel file. Required columns are email, first_name, and
                last_name.
              </p>
            </div>
          </div>
          <label className="mt-7 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-teal/40 bg-mist/60 px-6 py-10 text-center transition hover:border-teal hover:bg-teal-light/40">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(event) => void handleFile(event)}
            />
            <Users size={24} className="text-teal" />
            <span className="mt-3 font-body text-sm font-semibold text-navy">
              Choose a CSV or Excel file
            </span>
            <span className="mt-1 font-body text-xs text-navy-muted">
              Up to 500 {memberLabelPlural} · 5 MB maximum
            </span>
          </label>
          {fileName && (
            <p className="mt-4 rounded-xl bg-mist px-4 py-3 font-body text-sm text-navy">
              <span className="font-semibold">Selected:</span> {fileName} ·{" "}
              {rows.length} row{rows.length === 1 ? "" : "s"}
            </p>
          )}
          {parseError && (
            <p
              role="alert"
              className="mt-4 flex gap-2 rounded-xl bg-error/10 px-4 py-3 font-body text-sm leading-6 text-error"
            >
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              {parseError}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={downloadTemplate}
            >
              <Download size={15} className="mr-2" />
              Download CSV template
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void preview()}
              disabled={rows.length === 0 || busy}
            >
              {busy ? "Checking list…" : `Review ${memberLabel} list`}
            </Button>
          </div>
        </Card>
        <Card padding="lg" className="dashboard-card bg-[#edf8f7]">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-teal">
            <UserPlus size={21} />
          </span>
          <p className="mt-7 font-body text-xs font-bold uppercase tracking-[0.15em] text-teal">
            Quick invite
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold text-navy">
            Add one {memberLabel}.
          </h2>
          <p className="mt-3 font-body text-sm leading-6 text-navy-muted">
            For one-off onboarding, send a secure invitation directly. The
            account will be linked to your {scopeLabel} automatically.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setSingleOpen(true);
                setSingleSuccess(null);
              }}
            >
              <UserPlus size={15} className="mr-2" /> Invite one {memberLabel}
            </Button>
            <p className="font-body text-xs text-navy-muted">
              Signed in as{" "}
              <span className="font-semibold text-navy">{user.name}</span>
            </p>
          </div>
        </Card>
      </div>
      {singleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSingleOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="single-invite-title"
            className="w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                  Secure invitation
                </p>
                <h2
                  id="single-invite-title"
                  className="mt-2 font-display text-2xl font-bold text-navy"
                >
                  Invite one {memberLabel}
                </h2>
                <p className="mt-1 font-body text-sm leading-6 text-navy-muted">
                  This account will be scoped to your {scopeLabel}.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close invite dialog"
                onClick={() => setSingleOpen(false)}
                className="rounded-full p-2 text-navy-muted hover:bg-mist"
              >
                <X size={18} />
              </button>
            </div>
            <form
              className="mt-6 grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => void sendSingleInvitation(event)}
            >
              <label className="sm:col-span-2 block font-body text-sm font-semibold text-navy">
                Email
                <input
                  className="auth-control mt-2"
                  type="email"
                  required
                  value={singleForm.email}
                  onChange={(event) =>
                    setSingleForm({ ...singleForm, email: event.target.value })
                  }
                />
              </label>
              <label className="block font-body text-sm font-semibold text-navy">
                First name
                <input
                  className="auth-control mt-2"
                  required
                  value={singleForm.first_name}
                  onChange={(event) =>
                    setSingleForm({
                      ...singleForm,
                      first_name: event.target.value,
                    })
                  }
                />
              </label>
              <label className="block font-body text-sm font-semibold text-navy">
                Last name
                <input
                  className="auth-control mt-2"
                  required
                  value={singleForm.last_name}
                  onChange={(event) =>
                    setSingleForm({
                      ...singleForm,
                      last_name: event.target.value,
                    })
                  }
                />
              </label>
              <label className="block font-body text-sm font-semibold text-navy">
                Phone{" "}
                <span className="font-normal text-navy-muted">(optional)</span>
                <input
                  className="auth-control mt-2"
                  value={singleForm.phone}
                  onChange={(event) =>
                    setSingleForm({ ...singleForm, phone: event.target.value })
                  }
                />
              </label>
              {!isMentor && (
                <label className="block font-body text-sm font-semibold text-navy">
                  Registration number
                  <input
                    className="auth-control mt-2"
                    required
                    value={singleForm.registration_number}
                    onChange={(event) =>
                      setSingleForm({
                        ...singleForm,
                        registration_number: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              {singleSuccess && (
                <p
                  role="status"
                  className="sm:col-span-2 rounded-xl bg-teal-light px-4 py-3 font-body text-sm text-teal"
                >
                  {singleSuccess}
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="tertiary"
                  onClick={() => setSingleOpen(false)}
                  disabled={singleBusy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={singleBusy}>
                  {singleBusy ? "Sending…" : "Send invitation"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
      {result && reviewOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReviewOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-review-heading"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-2 border-teal/30 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-5 border-b border-border px-5 py-5 sm:px-7">
              <div>
                <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-teal">
                  Step 2 · Review
                </p>
                <h2
                  id="bulk-review-heading"
                  className="mt-1 font-display text-2xl font-bold text-navy"
                >
                  Confirm {memberLabel} invitations
                </h2>
                <p className="mt-1 font-body text-sm text-navy-muted">
                  {readyCount} ready · {result.rejected_count} need attention ·{" "}
                  {visibleRows.length} shown
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="flex size-10 items-center justify-center rounded-full text-navy-muted hover:bg-mist"
                aria-label="Close invitation review"
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
                  placeholder={`Search ${memberLabel} name or email`}
                  aria-label={`Search imported ${memberLabelPlural}`}
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
                        memberLabel,
                        "Email",
                        ...(isMentor ? [] : ["Registration"]),
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
                            {item?.row ?? index + 1}
                          </td>
                          <td className="px-5 py-3 font-body text-sm font-semibold text-navy">
                            {row.first_name} {row.last_name}
                          </td>
                          <td className="px-5 py-3 font-body text-sm text-navy-muted">
                            {row.email}
                          </td>
                          {!isMentor && (
                            <td className="px-5 py-3 font-body text-sm text-navy-muted">
                              {row.registration_number}
                            </td>
                          )}
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
                    No {memberLabelPlural} match this search
                  </p>
                </div>
              )}
            </div>
            <footer className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
              <Button
                type="button"
                variant="tertiary"
                onClick={() => setReviewOpen(false)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                disabled={busy || readyCount === 0 || !result.dry_run}
                onClick={() => void sendInvitations()}
              >
                <Send size={16} className="mr-2" />
                {busy
                  ? "Sending…"
                  : `Send ${readyCount} invitation${readyCount === 1 ? "" : "s"}`}
              </Button>
            </footer>
          </section>
        </div>
      )}
      {!isMentor && <CohortManagement onError={reportError} />}
      {extraContent}
    </section>
  );
  if (isMentor)
    return (
      <FacilityWorkspaceFrame
        user={user}
        active="mentors"
        title="Mentor onboarding"
        onAccount={() => navigate("/facility/account")}
        onError={onError}
      >
        {content}
      </FacilityWorkspaceFrame>
    );
  return (
    <PageFrame user={user} memberType={memberType}>
      {content}
    </PageFrame>
  );
}

function PageFrame({
  user,
  memberType,
  children,
}: {
  user: CurrentUser;
  memberType: "student" | "mentor";
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMentor = memberType === "mentor";
  const roleLabel = isMentor ? "Nurse Manager" : "University Coordinator";
  const scopeLabel = isMentor ? "Facility workspace" : "Institution workspace";
  async function signOut() {
    try {
      await logout();
      window.location.assign("/");
    } catch {
      /* The session may already be closed; returning to sign-in is still safe. */ window.location.assign(
        "/",
      );
    }
  }
  return (
    <div className="min-h-screen bg-[#edf4f5] text-navy">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col bg-navy px-5 py-6 text-white shadow-[12px_0_32px_rgba(8,25,53,0.08)] transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal/60 text-xl font-bold text-teal-bright">
              m
            </span>
            <span>
              <span className="block font-display text-xl font-bold tracking-tight">
                Mentor<span className="text-teal-bright">MAMA</span>
              </span>
              <span className="mt-1 block font-body text-[0.66rem] uppercase tracking-[0.16em] text-slate-300">
                Programme portal
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-12">
          <p className="px-3 font-body text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">
            Workspace
          </p>
          <nav className="mt-3 space-y-1" aria-label="Workspace navigation">
            <SideNavItem
              to="/"
              icon={<LayoutDashboard size={17} />}
              label="Overview"
              active
            />
            <SideNavItem
              to="/placements"
              icon={<ClipboardList size={17} />}
              label="Placements"
            />
          </nav>
        </div>
        <div className="mt-auto">
          <div className="border-t border-white/10 pt-5">
            <div className="mb-5 flex items-center gap-3 px-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal font-body text-sm font-bold text-white">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-body text-sm font-semibold text-white">
                  {user.name}
                </span>
                <span className="mt-0.5 block font-body text-[0.68rem] text-slate-400">
                  {roleLabel}
                </span>
              </span>
            </div>
            <div className="space-y-1">
              <SideNavItem
                to="/account"
                icon={<Settings2 size={17} />}
                label="Settings"
              />
              <a
                href="mailto:support@mentormama.org"
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-body text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <CircleHelp size={17} />
                <span>Support</span>
              </a>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 font-body text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut size={17} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-navy/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="min-h-screen min-w-0 lg:pl-[17rem]">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-[5.4rem] max-w-[90rem] items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-border p-2.5 text-navy lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <div>
                <p className="font-body text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal">
                  {scopeLabel}
                </p>
                <h1 className="mt-1 font-display text-xl font-bold text-navy sm:text-2xl">
                  Good morning, {user.name.split(" ")[0]}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                type="button"
                aria-label="Notifications"
                className="relative rounded-xl p-2.5 text-navy-muted transition hover:bg-mist hover:text-teal"
              >
                <Bell size={19} />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal" />
              </button>
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal font-body text-sm font-bold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:block">
                  <span className="block font-body text-sm font-semibold text-navy">
                    {user.name}
                  </span>
                  <span className="mt-0.5 block font-body text-xs text-navy-muted">
                    {roleLabel}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 sm:py-10 lg:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}

function SideNavItem({
  to,
  icon,
  label,
  active = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 font-body text-sm font-semibold transition ${active ? "bg-white text-navy shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
    >
      {icon}
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal" />}
    </Link>
  );
}

export async function parseRosterFile(
  file: File,
  requireRegistrationNumber: boolean,
): Promise<StudentInvitationRow[]> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a file smaller than 5 MB.");
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet)
      throw new Error("The Excel file does not contain a worksheet.");
    const worksheet = workbook.Sheets[firstSheet];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    return parseStudentRows(
      matrix.map((row) => row.map((cell) => String(cell ?? ""))),
      requireRegistrationNumber,
    );
  }
  return parseStudentRows(
    parseCsvMatrix((await file.text()).replace(/^\uFEFF/, "")),
    requireRegistrationNumber,
  );
}

function parseStudentRows(
  matrix: string[][],
  requireRegistrationNumber: boolean,
): StudentInvitationRow[] {
  if (matrix.length < 2)
    throw new Error("Add at least one member row to the CSV file.");
  const headers = matrix[0].map((header) => header.trim().toLowerCase());
  const required = [
    "email",
    "first_name",
    "last_name",
    ...(requireRegistrationNumber ? ["registration_number"] : []),
  ];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length)
    throw new Error(
      `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  const indexOf = (header: string) => headers.indexOf(header);
  const rows = matrix
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => ({
      email: row[indexOf("email")]?.trim() ?? "",
      first_name: row[indexOf("first_name")]?.trim() ?? "",
      last_name: row[indexOf("last_name")]?.trim() ?? "",
      phone: indexOf("phone") >= 0 ? (row[indexOf("phone")]?.trim() ?? "") : "",
      registration_number:
        indexOf("registration_number") >= 0
          ? (row[indexOf("registration_number")]?.trim() ?? "")
          : "",
    }));
  if (rows.length > 500)
    throw new Error("A single upload can contain at most 500 member rows.");
  return rows;
}

function parseCsvMatrix(input: string): string[][] {
  const output: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      output.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }
  if (cell || row.length) {
    row.push(cell);
    output.push(row);
  }
  return output;
}
