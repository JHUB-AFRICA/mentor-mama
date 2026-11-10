# Accounts and security

## How do I get an account?

There is no public sign-up. An account is created when the programme invites you: the Programme Administrator invites all roles, a coordinator invites students at their institution, and a nurse manager can invite mentors at their facility. You receive an email with a link. Your role and scope come from the invitation and cannot be changed by you.
<!-- source: docs/architecture/authentication-and-account-lifecycle.md -->

## How do I activate my account from an invitation?

Open the link in your invitation email and choose a password. Your password needs at least 12 characters, must not be a very common password, must not be only numbers, and must not be too similar to your details. Once activated you are signed in. Staff roles are then asked to set up multi-factor authentication.
<!-- source: backend/config/settings/base.py, backend/apps/identity/views.py, apps/portal/src/features/auth/InvitationFlow.tsx -->

## How long does my invitation link last?

48 hours. If it is expired, replaced by a newer invitation or already used you see "This invitation is invalid or expired." Ask your programme team to send a new one. Only a Programme Administrator can resend an invitation, up to three times in 24 hours for one account.
<!-- source: backend/apps/identity/authentication.py, backend/apps/core/errors.py -->

## How do I sign in?

Go to the portal sign-in page, enter your email and password, and follow any prompts. The email address is your only sign-in name; a phone number is never used to sign in. A wrong email or password shows "Invalid email or password." without saying which was wrong. Your session lasts about 12 hours from sign-in.
<!-- source: backend/apps/identity/views.py, docs/architecture/authentication-and-account-lifecycle.md -->

## How do I verify my email address?

You receive a six-digit code by email. Enter it when asked. The code lasts 15 minutes. If it expired or is wrong you see "That code is invalid or expired." and you can ask for a new code, up to three requests an hour.
<!-- source: backend/apps/identity/authentication.py, backend/apps/identity/views.py, backend/config/settings/base.py -->

## Who must use multi-factor authentication?

Programme Administrators, University Coordinators and Nurse Managers must complete it before using the portal. Students and Clinical Mentors are not required to. It uses an authenticator app (a six-digit code that changes every 30 seconds) plus one-time recovery codes.
<!-- source: backend/apps/identity/authentication.py, backend/config/settings/base.py -->

## How do I set up an authenticator app and save my recovery codes?

Follow the setup screen: scan the QR code (or enter the key) in an authenticator app, then type the six-digit code. You are then shown recovery codes once. Save them somewhere safe; they cannot be shown again. If the code does not match you see "That code did not match. Check your authenticator app and try again." and should check your phone's clock.
<!-- source: backend/apps/identity/views.py, docs/architecture/authentication-and-account-lifecycle.md -->

## What if I lose my authenticator app or recovery codes?

Use a recovery code at the sign-in code prompt. If you have none, request MFA recovery from the sign-in help screen with a short reason. Your Programme Administrator reviews it. A Programme Administrator cannot approve their own request, so if there is no other administrator contact platform support. Recovery removes your old authenticator and signs out your sessions, and you then set up MFA again.
<!-- source: docs/ux/screens/14-mfa-recovery.md, backend/apps/identity/views.py -->

## Can I get a sign-in code by email instead?

The system can send an email sign-in code (valid for 5 minutes, with a short wait between requests) for accounts that have turned this option on. If you see "Email verification is not available for this account", your account has not enabled it, so use your authenticator app.
<!-- source: backend/apps/identity/authentication.py, backend/config/settings/base.py, backend/apps/core/errors.py -->

## How do I reset a forgotten password?

On the sign-in page choose the forgotten-password link and enter your email. You always see the same confirmation, whether or not the email is registered. The reset link lasts one hour and works once. Choose a new password of at least 12 characters. All your other sessions are signed out afterwards.
<!-- source: backend/apps/identity/views.py, backend/config/settings/base.py, backend/apps/identity/authentication.py -->

## What if my reset link says it is invalid or expired?

Request a new one. Links expire after one hour, can only be used once, and an older link stops working when a newer one is requested. Reset only works for active accounts.
<!-- source: backend/apps/identity/views.py, backend/apps/identity/authentication.py -->

## How do I change my password?

Open Settings (Account & security for staff roles), go to the security section, and enter your current password and a new one. A wrong current password shows "The current password is incorrect." Your current session stays signed in.
<!-- source: backend/apps/identity/views.py, apps/portal/src/features/auth/AccountSettings.tsx -->

## How do I see and sign out my devices?

In Settings there is a section for sessions and devices showing the browser, time and place of each sign-in. You can sign out one other session, all other sessions, or sign out of this one.
<!-- source: docs/ux/screens/13-sessions-and-devices.md, docs/ux/screens/28-account-enhancements.md -->

## What does "Your account is paused" or "no longer active" mean?

Paused means your account is suspended; no longer active means it has been deactivated. You cannot sign in, and resetting your password does not help. Contact your Programme Administrator.
<!-- source: backend/apps/identity/views.py, apps/portal/src/features/auth/AccountStatusScreen.tsx -->

## What does "Finish setting up your account from the invitation email" mean?

Your account was invited but not activated yet. Open your invitation email and use the link. If it expired, ask for a new invitation.
<!-- source: backend/apps/identity/views.py -->

## Who do I contact for account help?

Your Programme Administrator is the first contact for paused or deactivated accounts, expired invitations and MFA recovery. The sign-in page also has a "Need access?" link to the programme support email.
<!-- source: backend/apps/identity/views.py, apps/portal/src/features/auth/SignInFlow.tsx -->

## What can I change in my profile and settings?

You can edit your name and an optional phone number. Your email, role and programme are shown but cannot be edited. Students also manage course, year of study and emergency contact under Profile. Settings has security, profile, notifications, devices and recovery sections.
<!-- source: docs/ux/screens/16-profile-settings.md, apps/portal/src/features/auth/AccountSettings.tsx, apps/portal/src/features/student/StudentWorkspace.tsx -->

## How do I control notification emails?

In Settings open notifications. You can turn on or off account activity, programme updates and placement updates emails, and a weekly digest (off by default). Account, sign-in and security emails always stay on. The bell icon inbox always works.
<!-- source: backend/apps/notifications/models.py, docs/ux/screens/28-account-enhancements.md -->

## Why am I limited when I try many times?

Sign-in, activation, codes and resets have hourly or per-minute limits to protect accounts, for example 20 sign-in attempts an hour and 5 password-reset requests an hour. Wait and try again later.
<!-- source: backend/config/settings/base.py -->
