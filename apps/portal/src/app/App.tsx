import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@mentormama/ui";
import {
  ApiError,
  getAllPlacements,
  getPlacements,
  getSessionState,
  type CurrentUser,
  type Placement,
} from "../services/api";
import { AccountStatusScreen } from "../features/auth/AccountStatusScreen";
import { InvitationFlow } from "../features/auth/InvitationFlow";
import { MfaFlow } from "../features/auth/MfaFlow";
import { PasswordResetFlow } from "../features/auth/PasswordResetFlow";
import { SignInFlow } from "../features/auth/SignInFlow";
import { AuthenticatedRouter } from "./AuthenticatedRouter";
import { useToast } from "../components/ToastProvider";
import { useLocation } from "react-router-dom";

type AuthChallenge = { setupRequired: boolean; emailMfaAvailable: boolean; recoveryContact?: "programme_admin" | "another_program_admin" | "support" };

export function App() {
  const { pushToast } = useToast();
  const { pathname: path, search } = useLocation();
  const activationRoute = path === "/activate";
  const resetRoute = path === "/reset-password";
  const statusRoute = path === "/account-status";
  const params = new URLSearchParams(search);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authChallenge, setAuthChallenge] = useState<AuthChallenge | null>(
    null,
  );

  async function handleAuthenticated(currentUser: CurrentUser) {
    setError(null);
    if (!["mentor", "student"].includes(currentUser.role)) {
      setUser(currentUser);
      return;
    }
    setLoading(true);
    try {
      setPlacements(currentUser.role === "mentor"
        ? await getAllPlacements()
        : (await getPlacements()).results);
    } catch (cause) {
      reportError(
          cause instanceof ApiError
            ? cause.message
            : "We couldn’t load your placements. Please refresh and try again.",
      );
    } finally {
      setUser(currentUser);
      setLoading(false);
    }
  }

  const reportError = useCallback((message: string) => {
    setError(message);
    pushToast({ kind: "error", title: "Something went wrong", message });
  }, [pushToast]);

  useEffect(() => {
    if (activationRoute || resetRoute || statusRoute) {
      setLoading(false);
      return;
    }
    async function loadSession() {
      try {
        const session = await getSessionState();
        if (session.authenticated && session.user) {
          if (["mentor", "student"].includes(session.user.role)) {
            try {
              setPlacements(session.user.role === "mentor"
                ? await getAllPlacements()
                : (await getPlacements()).results);
            } catch (cause) {
              reportError(
                cause instanceof ApiError
                  ? cause.message
                  : "We couldn’t load your placements. Please refresh and try again.",
              );
            }
          }
          setUser(session.user);
        }
      } catch (cause) {
        // This check runs before sign-in; an inline message on the sign-in
        // page is enough and avoids duplicating it in a toast.
        setError(
          cause instanceof ApiError && cause.status === 403
            ? "Your secure session has ended. Sign in again to continue."
            : cause instanceof ApiError
              ? cause.message
              : "We couldn’t connect to MentorMAMA. Check your connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    }
    void loadSession();
  }, [activationRoute, resetRoute, statusRoute, reportError]);

  if (loading) return <LoadingScreen />;
  if (activationRoute && !user && !authChallenge)
    return (
      <InvitationFlow
        uid={params.get("uid") ?? ""}
        token={params.get("token") ?? ""}
        onAuthenticated={(activatedUser) => {
          handleAuthenticated(activatedUser);
        }}
        onChallenge={setAuthChallenge}
      />
    );
  if (resetRoute)
    return (
      <PasswordResetFlow
        uid={params.get("uid") ?? ""}
        token={params.get("token") ?? ""}
      />
    );
  if (statusRoute) {
    const status = params.get("status");
    return (
      <AccountStatusScreen
        status={
          status === "invited" ||
          status === "suspended" ||
          status === "deactivated" ||
          status === "revoked"
            ? status
            : "revoked"
        }
      />
    );
  }
  if (error && !user && !authChallenge)
    return (
      <SignInFlow
        message={error}
        onAuthenticated={handleAuthenticated}
        onChallenge={setAuthChallenge}
      />
    );
  if (authChallenge)
    return (
      <MfaFlow
        setupRequired={authChallenge.setupRequired}
        emailMfaAvailable={authChallenge.emailMfaAvailable}
        recoveryContact={authChallenge.recoveryContact}
        onComplete={(currentUser) => {
          setAuthChallenge(null);
          handleAuthenticated(currentUser);
        }}
        onError={reportError}
      />
    );
  if (!user)
    return (
      <SignInFlow
        onAuthenticated={handleAuthenticated}
        onChallenge={setAuthChallenge}
      />
    );

  return (
    <AuthenticatedRouter
      user={user}
      placements={placements}
      onPlacementsUpdated={(updated) =>
        setPlacements((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
      }
      onSignedOut={() => setUser(null)}
      onUserUpdated={setUser}
      error={error}
      onError={reportError}
      onClearError={() => setError(null)}
    />
  );
}

function LoadingScreen() {
  return (
    <PageShell>
      <main
        className="flex min-h-screen items-center justify-center bg-white"
        aria-busy="true"
        aria-label="Loading workspace"
      >
        <span className="size-2 animate-pulse rounded-full bg-teal" />
      </main>
    </PageShell>
  );
}
