import { useState } from "react";
import type { FormEvent } from "react";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { Button, Card } from "@mentormama/ui";
import { activateAccount, ApiError } from "../../services/api";
import type { CurrentUser } from "../../services/api";
import { AuthLayout, BackLink } from "./AuthLayout";
import { Link } from "react-router-dom";

interface InvitationFlowProps {
  uid: string;
  token: string;
  onAuthenticated: (user: CurrentUser) => void;
  onChallenge: (challenge: { setupRequired: boolean; emailMfaAvailable: boolean; recoveryContact?: "programme_admin" | "another_program_admin" | "support" }) => void;
}

export function InvitationFlow({
  uid,
  token,
  onAuthenticated,
  onChallenge,
}: InvitationFlowProps) {
  const [started, setStarted] = useState(false);

  if (!uid || !token) {
    return (
      <AuthLayout>
        <InvitationUnavailable />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {!started ? (
        <InvitationLanding onStart={() => setStarted(true)} />
      ) : (
        <ActivationForm
          uid={uid}
          token={token}
          onAuthenticated={onAuthenticated}
          onChallenge={onChallenge}
        />
      )}
    </AuthLayout>
  );
}

function InvitationLanding({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[34rem] text-center">
      {/* Success mark */}
      <div
        className="
          mx-auto flex h-[4.75rem] w-[4.75rem]
          items-center justify-center
          rounded-full
          border border-teal/10
          bg-white
          text-teal
          shadow-[0_14px_40px_rgba(29,140,140,0.12)]
        "
      >
        <CheckCircle2
          size={37}
          strokeWidth={1.55}
          aria-hidden="true"
        />
      </div>

      {/* Eyebrow */}
      <p
        className="
          mt-7
          font-body
          text-[0.72rem]
          font-bold
          uppercase
          tracking-[0.18em]
          text-teal
        "
      >
        Your invitation is ready
      </p>

      {/* Heading */}
      <h1
        className="
          mt-4
          font-display
          text-[2.5rem]
          font-bold
          leading-[1.05]
          tracking-[-0.035em]
          text-navy
          sm:text-[3rem]
        "
      >
        You’re invited to
        <br className="hidden sm:block" /> MentorMAMA
        <span className="text-teal">.</span>
      </h1>

      {/* Description */}
      <p
        className="
          mx-auto
          mt-5
          max-w-[34rem]
          font-body
          text-[0.98rem]
          leading-7
          text-navy-muted
        "
      >
        Create your secure account to enter your programme workspace.
        Your access and role have already been assigned by your programme
        team.
      </p>

      {/* Invitation information */}
      <Card
        className="
          mx-auto mt-8
          max-w-[34rem]
          border-border/80
          bg-white
          text-left
          shadow-[0_18px_45px_rgba(13,27,51,0.055)]
        "
        padding="sm"
      >
        <div className="flex items-start gap-4">
          <span
            className="
              flex h-12 w-12 shrink-0
              items-center justify-center
              rounded-full
              bg-teal-light
              text-teal
            "
          >
            <Mail size={20} strokeWidth={1.7} aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <p className="font-body text-[0.95rem] font-semibold text-navy">
              Your programme invitation
            </p>

            <p className="mt-1.5 font-body text-sm leading-6 text-navy-muted">
              Choose a password, then follow the security steps for your
              programme account.
            </p>
          </div>
        </div>
      </Card>

      {/* CTA */}
      <Button
        className="
          mt-7
          h-12
          w-full
          justify-between
          rounded-full
          px-7
          text-base
          shadow-[0_12px_28px_rgba(43,166,166,0.16)]
          sm:mx-auto
          sm:max-w-[23rem]
        "
        size="lg"
        onClick={onStart}
      >
        <span>Create your account</span>

        <span
          className="text-[1.4rem] font-normal leading-none"
          aria-hidden="true"
        >
          →
        </span>
      </Button>

      {/* Sign in */}
      <p className="mt-5 font-body text-sm text-navy-muted">
        Already completed setup?{" "}
        <Link
          className="
            font-semibold
            text-teal
            underline-offset-4
            transition
            hover:underline
          "
          to="/"
        >
          Sign in
        </Link>
      </p>

      {/* Security reassurance */}
      <div
        className="
          mx-auto
          mt-8
          flex
          max-w-[25rem]
          items-center
          justify-center
          gap-2
          font-body
          text-xs
          text-navy-muted/75
        "
      >
        <ShieldCheck
          size={15}
          className="text-teal"
          strokeWidth={1.8}
          aria-hidden="true"
        />

        <span>Your account and programme data are protected.</span>
      </div>
    </div>
  );
}

function ActivationForm({
  uid,
  token,
  onAuthenticated,
  onChallenge,
}: InvitationFlowProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationUnavailable, setInvitationUnavailable] = useState(false);

  const requirements = [
    {
      label: "At least 12 characters",
      valid: password.length >= 12,
    },
  ];

  const passwordReady = requirements.every(
    (requirement) => requirement.valid,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const result = await activateAccount(uid, token, password);

      if (result.mfaRequired) {
        onChallenge({
          setupRequired: result.mfaSetupRequired,
          emailMfaAvailable: false,
        });
      } else if (result.user) {
        onAuthenticated(result.user);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "InvalidInvitation") {
        setInvitationUnavailable(true);
        return;
      }
      setError(
        cause instanceof ApiError
          ? cause.message
          : "We could not activate this invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (invitationUnavailable) {
    return <InvitationUnavailable />;
  }

  return (
    <div className="w-full">
      <BackLink>Back to invitation</BackLink>

      {/* Progress indicator */}
      <div
        className="
          mt-7
          flex
          flex-wrap
          items-center
          gap-3
          font-body
          text-[0.7rem]
          font-bold
          uppercase
          tracking-[0.13em]
          text-teal
          sm:mt-8
        "
      >
        <span
          className="
            flex h-8 w-8
            items-center justify-center
            rounded-full
            bg-teal
            text-white
            shadow-[0_7px_18px_rgba(43,166,166,0.2)]
          "
        >
          <Check
            size={15}
            strokeWidth={2.7}
            aria-hidden="true"
          />
        </span>

        <span>Step 2 of 3</span>

        <span
          className="h-4 w-px bg-border"
          aria-hidden="true"
        />

        <span>Create account</span>
      </div>

      {/* Heading */}
      <h1
        className="
          mt-5
          max-w-3xl
          font-display
          text-[2.4rem]
          font-bold
          leading-[1.06]
          tracking-[-0.035em]
          text-navy
          sm:text-[3rem]
        "
      >
        Make your account yours.
      </h1>

      <p
        className="
          mt-3
          max-w-[36rem]
          font-body
          text-[0.98rem]
          leading-7
          text-navy-muted
        "
      >
        Choose a strong password. We’ll then help you secure the account
        and enter your programme workspace.
      </p>

      {/* Error */}
      {error && (
        <div
          className="
            mt-6
            max-w-[34rem]
            rounded-2xl
            border border-error/25
            bg-error/5
            px-4 py-3
            font-body
            text-sm
            text-error
          "
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Form */}
      <form
        className="mt-6 max-w-[34rem] space-y-4"
        onSubmit={submit}
      >
        {/* Password */}
        <label className="block font-body text-sm font-semibold text-navy">
          Password

          <span className="relative mt-2 block">
            <input
              className="
                h-12
                w-full
                rounded-full
                border border-border
                bg-white
                px-6 pr-14
                font-normal
                text-navy
                outline-none
                transition
                placeholder:text-navy-muted/50
                hover:border-navy/20
                focus:border-teal
                focus:ring-4
                focus:ring-teal/10
              "
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter a strong password"
              required
              autoComplete="new-password"
              aria-describedby="password-requirements"
            />

            <button
              type="button"
              className="
                absolute
                right-1.5
                top-1/2
                flex h-11 w-11
                -translate-y-1/2
                items-center justify-center
                rounded-full
                text-navy-muted
                transition
                hover:bg-teal-light/60
                hover:text-teal
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-teal/30
              "
              onClick={() =>
                setShowPassword((value) => !value)
              }
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </span>
        </label>

        {/* Requirements */}
        <div
          id="password-requirements"
          className="
            rounded-2xl
            border border-white
            bg-white
            px-5 py-3.5
            shadow-[0_12px_32px_rgba(13,27,51,0.045)]
          "
          aria-live="polite"
        >
          <p
            className="
              font-body
              text-[0.69rem]
              font-bold
              uppercase
              tracking-[0.13em]
              text-navy-muted
            "
          >
            Password checklist
          </p>

          <div
            className="
              mt-3
              grid
              gap-3
              sm:grid-cols-3
              sm:gap-0
            "
          >
            {requirements.map((item, index) => (
              <span
                key={item.label}
                className={`
                  flex
                  min-w-0
                  items-center
                  gap-2.5
                  font-body
                  text-xs
                  transition-colors
                  ${
                    item.valid
                      ? "text-navy"
                      : "text-navy-muted"
                  }
                  ${
                    index > 0
                      ? "sm:border-l sm:border-border sm:pl-4"
                      : ""
                  }
                `}
              >
                <span
                  className={`
                    flex h-5 w-5
                    shrink-0
                    items-center justify-center
                    rounded-full
                    transition-all
                    ${
                      item.valid
                        ? "bg-teal text-white"
                        : "border border-border bg-mist text-transparent"
                    }
                  `}
                >
                  <Check
                    size={11}
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                </span>

                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* Confirm */}
        <label className="block font-body text-sm font-semibold text-navy">
          Confirm password

          <span className="relative mt-2 block">
            <input
              className="
                h-12
                w-full
                rounded-full
                border border-border
                bg-white
                px-6 pr-14
                font-normal
                text-navy
                outline-none
                transition
                placeholder:text-navy-muted/50
                hover:border-navy/20
                focus:border-teal
                focus:ring-4
                focus:ring-teal/10
              "
              type={showConfirmation ? "text" : "password"}
              value={confirmation}
              onChange={(event) =>
                setConfirmation(event.target.value)
              }
              placeholder="Re-enter your password"
              required
              autoComplete="new-password"
            />

            <button
              type="button"
              className="
                absolute
                right-1.5
                top-1/2
                flex h-11 w-11
                -translate-y-1/2
                items-center justify-center
                rounded-full
                text-navy-muted
                transition
                hover:bg-teal-light/60
                hover:text-teal
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-teal/30
              "
              onClick={() =>
                setShowConfirmation((value) => !value)
              }
              aria-label={
                showConfirmation
                  ? "Hide confirmation password"
                  : "Show confirmation password"
              }
            >
              {showConfirmation ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </span>
        </label>

        {/* CTA */}
        <Button
          type="submit"
          size="lg"
          className="
            h-12
            w-full
            justify-between
            rounded-full
            px-7
            text-base
            shadow-[0_12px_28px_rgba(43,166,166,0.15)]
            transition
            disabled:cursor-not-allowed
            disabled:opacity-45
            disabled:shadow-none
          "
          disabled={busy || !passwordReady}
        >
          <span>
            {busy ? "Creating account…" : "Create account"}
          </span>

          {!busy && (
            <span
              className="text-[1.4rem] font-normal leading-none"
              aria-hidden="true"
            >
              →
            </span>
          )}
        </Button>
      </form>

      {/* Security */}
      <div
        className="
          mt-5
          flex
          max-w-[34rem]
          items-center
          gap-3
          rounded-2xl
          bg-teal-light/40
          px-4 py-3
        "
      >
        <span
          className="
            flex h-9 w-9
            shrink-0
            items-center justify-center
            rounded-full
            bg-white
            text-teal
          "
        >
          <ShieldCheck
            size={17}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </span>

        <div>
          <p className="font-body text-xs font-semibold text-navy">
            Your security matters
          </p>

          <p className="mt-0.5 font-body text-xs leading-5 text-navy-muted">
            We use industry-standard encryption to protect your data.
          </p>
        </div>
      </div>
    </div>
  );
}

function InvitationUnavailable() {
  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-warning">Invitation unavailable</p>
      <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy sm:text-[2.65rem]">This link can’t be used.</h1>
      <p className="mt-3 font-body text-base leading-7 text-navy-muted">The invitation may be incomplete, expired, or already replaced. Ask your programme team to send you a new invitation.</p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button to="/" size="lg" className="auth-action">Back to sign in</Button>
        <a className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 font-body text-sm font-semibold text-navy hover:border-teal hover:text-teal" href="mailto:support@mentormama.org">Contact support</a>
      </div>
    </div>
  );
}
