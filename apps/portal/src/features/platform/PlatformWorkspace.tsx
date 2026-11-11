import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Building2, KeyRound, LayoutDashboard, LifeBuoy, LockKeyhole, Settings2, Users } from "lucide-react";
import { useToast } from "../../components/ToastProvider";
import { Field, PasswordInput } from "../../components/kit";
import { ApiError, changePassword, getSessionState, logout, type CurrentUser } from "../../services/api";
import { AccountSettings } from "../auth/AccountSettings";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, Notice } from "../programme-admin/ui/AdminKit";
import { PortalHeader } from "../workspaces/PortalHeader";
import { PortalSidebar } from "../workspaces/PortalSidebar";
import { PlatformAccounts } from "./PlatformAccounts";
import { PlatformActivity } from "./PlatformActivity";
import { PlatformOverview } from "./PlatformOverview";
import { PlatformProgrammes } from "./PlatformProgrammes";
import { PlatformSupport } from "./PlatformSupport";
import "./platform.css";

type Nav = "overview" | "programmes" | "accounts" | "support" | "activity" | "account";

const ROLE_LABEL = "Platform Administrator";
const PAGES: Record<Exclude<Nav, "account">, { path: string; title: string }> = {
  overview: { path: "/platform", title: "Overview" },
  programmes: { path: "/platform/programmes", title: "Programmes" },
  accounts: { path: "/platform/accounts", title: "Accounts" },
  support: { path: "/platform/support", title: "Support requests" },
  activity: { path: "/platform/activity", title: "Activity" },
};

function navFor(pathname: string): Nav {
  const segment = pathname.replace(/\/+$/, "").split("/")[2] ?? "";
  return (["programmes", "accounts", "support", "activity", "account"] as const).find((item) => item === segment) ?? "overview";
}

/** The operator workspace at /platform: programmes, accounts, support and system health. */
export function PlatformWorkspace({
  user,
  onSignedOut,
  onError,
  onUserUpdated,
}: {
  user: CurrentUser;
  onSignedOut: () => void;
  onError: (message: string) => void;
  onUserUpdated: (user: CurrentUser) => void;
}) {
  const location = useLocation();
  const go = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = navFor(location.pathname);
  const title = active === "account" ? "Account & security" : PAGES[active].title;

  async function signOut() {
    try {
      await logout();
      onSignedOut();
    } catch {
      onError("We could not sign you out. Please try again.");
    }
  }
  const open = (nav: Nav) => {
    go(nav === "account" ? "/platform/account" : PAGES[nav].path);
    setMobileOpen(false);
  };

  let page: ReactNode;
  if (user.must_change_password) page = <InitialPasswordGate onChanged={onUserUpdated} onError={onError} />;
  else if (active === "programmes") page = <PlatformProgrammes onError={onError} />;
  else if (active === "accounts") page = <PlatformAccounts currentUserId={user.id} onError={onError} />;
  else if (active === "support") page = <PlatformSupport onError={onError} />;
  else if (active === "activity") page = <PlatformActivity />;
  else if (active === "account")
    page = <AccountSettings user={user} onSignedOut={onSignedOut} onError={onError} onUserUpdated={onUserUpdated} />;
  else page = <PlatformOverview onNavigate={(nav) => open(nav)} />;

  return (
    <div className="programme-admin-shell min-h-screen overflow-x-clip text-navy">
      <PortalSidebar
        brandHref="/platform"
        workspaceLabel="Platform administration"
        navLabel="Platform administration"
        activeId={active}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        user={{ name: user.name, roleLabel: ROLE_LABEL }}
        onSignOut={() => void signOut()}
        groups={[
          {
            label: "Monitor",
            items: [{ id: "overview", label: "Overview", icon: <LayoutDashboard />, onSelect: () => open("overview") }],
          },
          {
            label: "Manage",
            items: [
              { id: "programmes", label: "Programmes", icon: <Building2 />, onSelect: () => open("programmes") },
              { id: "accounts", label: "Accounts & invitations", icon: <Users />, onSelect: () => open("accounts") },
              { id: "support", label: "Support requests", icon: <LifeBuoy />, onSelect: () => open("support") },
            ],
          },
          {
            label: "Review",
            items: [{ id: "activity", label: "Activity", icon: <Activity />, onSelect: () => open("activity") }],
          },
        ]}
        footerItems={[{ id: "account", label: "Account & security", icon: <Settings2 />, onSelect: () => open("account") }]}
      />
      <div className="min-h-screen min-w-0 lg:pl-[17rem]">
        <PortalHeader
          onOpenNav={() => setMobileOpen(true)}
          crumbs={["Platform administration", title]}
          user={{ name: user.name, email: user.email, roleLabel: ROLE_LABEL }}
          accountItems={[{ label: "Account & security", icon: <KeyRound aria-hidden="true" />, onSelect: () => open("account") }]}
          onSignOut={() => void signOut()}
        />
        <main className="min-h-[calc(100vh-4.25rem)] bg-white">
          <div className="programme-admin-content w-full py-6 sm:py-7 lg:py-8">{page}</div>
        </main>
      </div>
    </div>
  );
}

/** First sign-in with the deploy-time password: choose a new one before anything else is possible. */
function InitialPasswordGate({ onChanged, onError }: { onChanged: (user: CurrentUser) => void; onError: (message: string) => void }) {
  const { pushToast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const problem =
    next.length < 12 ? "Use at least 12 characters." : next !== confirm ? "The new passwords do not match." : next === current ? "Choose a password different from the initial one." : null;

  async function submit() {
    setBusy(true);
    try {
      await changePassword(current, next);
      const session = await getSessionState();
      if (session.user) onChanged(session.user);
      pushToast({ kind: "success", title: "Password changed", message: "Your platform account now uses your own password." });
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not change your password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="First sign-in"
        title="Choose your own password"
        description="This account was created with an initial password during deployment. Replace it before managing programmes or accounts."
      />
      <AdminCard className="pf-narrow">
        <form
          className="pf-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem) void submit();
          }}
        >
          <Field label="Initial password" required>
            <PasswordInput leading={<LockKeyhole />} value={current} autoComplete="current-password" onChange={(event) => setCurrent(event.target.value)} />
          </Field>
          <Field label="New password" hint="At least 12 characters. Use a password manager." required>
            <PasswordInput leading={<KeyRound />} value={next} autoComplete="new-password" onChange={(event) => setNext(event.target.value)} />
          </Field>
          <Field label="Confirm new password" required error={confirm && next !== confirm ? "The new passwords do not match." : undefined}>
            <PasswordInput leading={<KeyRound />} value={confirm} autoComplete="new-password" onChange={(event) => setConfirm(event.target.value)} />
          </Field>
          <Notice icon={<LockKeyhole />}>Other devices signed in to this account are signed out when you change the password.</Notice>
          <div>
            <AdminButton type="submit" disabled={busy || !current || Boolean(problem)}>
              {busy ? "Saving…" : "Save new password"}
            </AdminButton>
          </div>
        </form>
      </AdminCard>
    </AdminPage>
  );
}
