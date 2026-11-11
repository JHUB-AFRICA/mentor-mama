"""Translate committed identity outbox events into transactional emails."""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from apps.identity import api as identity
from django_otp.plugins.otp_email.models import EmailDevice


def _activation_link(user) -> str:
    uid = urlsafe_base64_encode(force_bytes(str(user.id)))
    return f"{settings.FRONTEND_BASE_URL}/activate?uid={uid}&token={identity.invitation_token(user)}"


def _reset_link(user) -> str:
    uid = urlsafe_base64_encode(force_bytes(str(user.id)))
    return f"{settings.FRONTEND_BASE_URL}/reset-password?uid={uid}&token={identity.password_reset_token(user)}"


def _email_content(*, eyebrow: str, title: str, intro: str, action_label: str,
                   action_url: str, detail: str, expiry: str,
                   accent: str = "#1d8c8c") -> str:
    """Build accessible plain-text mail while the visual email system is redesigned."""
    del eyebrow, accent
    sections = ["MentorMAMA", title, intro, detail]
    if action_url and action_url != "#":
        sections.append(f"{action_label}: {action_url}")
    elif action_label and action_label != "Verification code":
        sections.append(action_label)
    sections.extend([expiry, "Need help? Contact your programme support team."])
    return "\n\n".join(part.strip() for part in sections if part and part.strip())


# Safety, security and access messages are never switchable off.
MANDATORY_EVENTS = {
    "EscalationRaised", "EscalationStatusChanged", "SecurityNotificationRequested", "PasswordResetRequested",
    "IdentityInvitationRequested", "EmailVerificationRequested", "EmailMFAChallengeRequested", "PlacementInvitationIssued",
}


def _send(subject: str, text: str, sender: str, recipient, event) -> None:
    """Send one email, tagged with the recipient's in-app notification id so provider callbacks can be matched
    (plan §6B N9). The tag is an opaque UUID: it carries no personal or concern content."""
    from django.core.mail import EmailMultiAlternatives

    from apps.notifications.models import Notification

    message = EmailMultiAlternatives(subject, text, sender, [recipient.email])
    notification_id = Notification.objects.filter(event_id=event.id, user_id=recipient.id).values_list("id", flat=True).first()
    if notification_id:
        message.extra_headers["X-MentorMAMA-Notification"] = str(notification_id)
        message.metadata = {"notification_id": str(notification_id)}  # read by django-anymail (Resend, Mailtrap)
    message.send()
    if notification_id:
        # Remember the provider's id so a later delivered/bounced callback can find this notification.
        status = getattr(message, "anymail_status", None)
        provider_id = ""
        if status is not None and status.message_id:
            provider_id = status.message_id if isinstance(status.message_id, str) else next(iter(status.message_id), "")
        if provider_id:
            Notification.objects.filter(id=notification_id).update(provider_message_id=str(provider_id)[:120])


def _optional_email_enabled(*, user_id, event_type: str) -> bool:
    """Respect the user's email-only preferences for non-mandatory updates."""
    from apps.notifications.models import NotificationPreference

    preference = NotificationPreference.objects.filter(user_id=user_id).first()
    if preference is None:
        return True
    if event_type in MANDATORY_EVENTS:
        return True
    if event_type in {"PlacementAcknowledgementReminderRequested", "PlacementScheduled", "MentorAssigned", "MentorPlacementsAssigned", "PlacementsArranged", "PlacementsRequested", "PlacementsDeclined", "PlacementRequestsWithdrawn", "ArrangementOverridden", "MentorUnavailableForPlacements", "PlacementProvisionalNotice", "PlacementStartsSoon", "MentorReassigned", "OrientationAcknowledged", "InductionCompleted", "PlacementPaused", "PlacementResumed", "PlacementWithdrawn", "PlacementCompleted"}:
        return preference.placement_updates
    if event_type in {"SessionLogged"}:
        return preference.account_activity
    return preference.programme_updates


def deliver_outbox_event(event) -> None:
    """Deliver one supported event; callers mark it dispatched only on success."""
    user_id = event.payload.get("user_id") or event.payload.get("student_id")
    user = identity.user_of(user_id) if user_id else None
    if event.event_type == "EmailMFAChallengeRequested" and user and user.status == identity.STATUSES.ACTIVE:
        device = EmailDevice.objects.filter(
            id=event.payload.get("device_id"), user_id=user.id, confirmed=True,
        ).first()
        if device is None or not device.token:
            return
        text = _email_content(
            eyebrow="Account security", title="Your MentorMAMA verification code",
            intro=f"Hello {user.first_name}, use this code to finish signing in.",
            action_label="Verification code", action_url="#",
            detail=f"Your code is {device.token}.",
            expiry="This code expires in five minutes and can be used once.", accent="#2a6fa8",
        )
        _send("Your MentorMAMA verification code", text, settings.OTP_EMAIL_SENDER, user, event)
    elif event.event_type == "PlacementInvitationIssued" and user and user.status == identity.STATUSES.ACTIVE:
        text = _email_content(
            eyebrow="Placement invitation", title="Your placement is ready to review",
            intro=f"Hello {user.first_name}, your programme team has assigned a clinical placement for you to review.",
            action_label="Review placement", action_url=f"{settings.FRONTEND_BASE_URL}/placements",
            detail="Sign in to confirm that you recognise the placement and continue to orientation.",
            expiry="Please review this placement as soon as you can.",
        )
        _send("Your MentorMAMA placement is ready", text, settings.DEFAULT_FROM_EMAIL, user, event)
    elif event.event_type == "PlacementAcknowledgementReminderRequested" and user and user.status == identity.STATUSES.ACTIVE:
        if not _optional_email_enabled(user_id=user.id, event_type=event.event_type):
            return
        text = _email_content(
            eyebrow="Placement reminder", title="Your placement acknowledgement is waiting",
            intro=f"Hello {user.first_name}, your programme team is waiting for you to acknowledge your placement orientation.",
            action_label="Review placement", action_url=f"{settings.FRONTEND_BASE_URL}/placements",
            detail="Please sign in to review the placement details and acknowledge the orientation step so induction can continue.",
            expiry="Please review this reminder when you are able.",
        )
        _send("Reminder: acknowledge your MentorMAMA placement", text, settings.DEFAULT_FROM_EMAIL, user, event)
    elif event.event_type == "EmailVerificationRequested" and user and user.status == identity.STATUSES.ACTIVE:
        code = cache.get(f"identity:email-verification:{user.email_verification_nonce}")
        if not code:
            return
        text = _email_content(
            eyebrow="Email verification", title="Confirm your email address",
            intro="Use the verification code below to confirm the email address on your MentorMAMA account.",
            action_label="Verification code", action_url="#",
            detail=f"Your code is {code}.", expiry="This code expires in 15 minutes.",
        )
        _send("Confirm your MentorMAMA email", text, settings.DEFAULT_FROM_EMAIL, user, event)
    elif event.event_type == "IdentityInvitationRequested" and user and user.status == identity.STATUSES.INVITED:
        link = _activation_link(user)
        role_copy = {
            "platform_admin": (
                "Platform administration", "You have been invited to help operate the MentorMAMA platform.",
                "Set up your account, enable the required authenticator protection, then sign in at the platform administration page.",
            ),
            "program_admin": (
                "Programme administrator workspace", "You have been invited to help oversee this programme.",
                "Set up your account, enable the required authenticator protection, and review your programme workspace.",
            ),
            "coordinator": (
                "University coordinator workspace", "You have been invited to coordinate students and placements.",
                "Set up your account, enable authenticator protection, and prepare to manage institution-scoped work.",
            ),
            "nurse_manager": (
                "Clinical operations workspace", "You have been invited to coordinate ward capacity and clinical mentors.",
                "Set up your account, enable authenticator protection, and prepare to manage your facility workspace.",
            ),
            "mentor": (
                "Clinical mentor workspace", "You have been invited to support students through their clinical learning.",
                "Set up your account and review your mentor workspace when you are ready.",
            ),
            "student": (
                "Student placement workspace", "You have been invited to continue your clinical learning with MentorMAMA.",
                "Set up your account, then review and confirm placements assigned to you.",
            ),
        }
        role_label, role_intro, role_detail = role_copy.get(
            user.role, ("MentorMAMA workspace", "Your programme team has invited you to join MentorMAMA.", "Set up your secure account to continue."),
        )
        text = _email_content(
            eyebrow=role_label, title="Your MentorMAMA workspace is ready",
            intro=f"Hello {user.first_name}, {role_intro}",
            action_label="Create your account", action_url=link,
            detail=role_detail,
            expiry="This invitation link expires in 48 hours.",
        )
        _send("You’re invited to MentorMAMA", text, settings.DEFAULT_FROM_EMAIL, user, event)
    elif event.event_type == "PasswordResetRequested" and user and user.status == identity.STATUSES.ACTIVE:
        link = _reset_link(user)
        text = _email_content(
            eyebrow="Account recovery", title="Reset your MentorMAMA password",
            intro="We received a request to choose a new password for your MentorMAMA account.",
            action_label="Reset your password", action_url=link,
            detail="If you made this request, use the button below to continue. If not, your account remains safe and you can ignore this email.",
            expiry="This reset link expires automatically and can be used only once.",
        )
        _send("Reset your MentorMAMA password", text, settings.DEFAULT_FROM_EMAIL, user, event)
    elif event.event_type == "SecurityNotificationRequested" and user:
        # Suspension/deactivation changes the account status before the
        # committed outbox event is dispatched. Those security emails must
        # still be delivered to the affected account, while other security
        # notices remain limited to active accounts.
        action = event.payload.get("action")
        if action not in {"account_suspended", "account_deactivated"} and user.status != identity.STATUSES.ACTIVE:
            return
        security_copy = {
            "password_changed": ("Password changed", "Your MentorMAMA password was changed successfully.", "If you did not make this change, contact your programme support team immediately."),
            "password_reset": ("Password reset completed", "Your MentorMAMA password was reset successfully.", "If you did not request this change, contact your programme support team immediately."),
            "mfa_enabled": ("Authenticator protection enabled", "An authenticator app is now connected to your MentorMAMA account.", "Keep your backup codes somewhere private and accessible."),
            "mfa_recovery": ("Authenticator access reset", "Your MentorMAMA authenticator access was reset by an authorised administrator.", "Sign in and set up a new authenticator before continuing."),
            "backup_codes_regenerated": ("Backup codes replaced", "New backup codes were created for your MentorMAMA account.", "Your previous backup codes no longer work. If you did not make this change, contact programme support."),
            "account_access_changed": ("Account access updated", "Your MentorMAMA programme access was updated by an authorised administrator.", "For your protection, your devices were signed out. Sign in again to continue, and contact programme support if this change was unexpected."),
            "account_sessions_revoked": ("Devices signed out", "A programme administrator signed your MentorMAMA account out of its other devices.", "Sign in again on any device you still use. Contact programme support if this was unexpected."),
            "mfa_recovery_request_reviewed": ("Authenticator help request reviewed", "Your Programme Admin reviewed your request for help with your authenticator app.", "If you still cannot sign in, contact your programme support team."),
            "account_suspended": ("Account access paused", "Your MentorMAMA account has been suspended.", "Contact your programme support team if you believe this is unexpected."),
            "account_deactivated": ("Account access ended", "Your MentorMAMA account has been deactivated.", "Contact your programme support team if you need help."),
            "account_active": ("Account access restored", "Your MentorMAMA account has been reactivated.", "You can sign in and continue using your workspace."),
        }
        title, intro, detail = security_copy.get(
            action, ("Security update", "There has been a security update to your MentorMAMA account.", "If you did not expect this, contact your programme support team."),
        )
        text = _email_content(
            eyebrow="Account security", title=title, intro=f"Hello {user.first_name}, {intro}",
            action_label="Open account", action_url=f"{settings.FRONTEND_BASE_URL}/settings",
            detail=detail, expiry="This message is for your security and cannot be disabled.", accent="#2a6fa8",
        )
        _send(f"MentorMAMA security: {title.lower()}", text, settings.DEFAULT_FROM_EMAIL, user, event)
    elif event.event_type in {"PlacementProvisionalNotice", "PlacementStartsSoon"}:
        from apps.placements import api as placements_api

        details = placements_api.notice_details(event.payload.get("placement_id"))
        if not details:
            return
        where = " · ".join(part for part in (details["facility"], details["ward"]) if part)
        when = f"{details['start']:%d %b %Y} to {details['end']:%d %b %Y}"
        for recipient_id in event.payload.get("recipient_user_ids", []):
            if str(recipient_id) in (event.delivered_to or []):
                continue
            recipient = identity.user_of(recipient_id)
            if not recipient or recipient.status != identity.STATUSES.ACTIVE:
                continue
            if not _optional_email_enabled(user_id=recipient.id, event_type=event.event_type):
                continue
            if event.event_type == "PlacementProvisionalNotice":
                updated = bool(event.payload.get("update"))
                subject = "Your placement details have been updated" if updated else "Your clinical placement: details so far"
                title = "Your placement details were updated" if updated else "Here is where you are placed"
                intro = f"Hello {recipient.first_name}, your programme team has shared your placement so you can prepare. This is provisional until it is released to you."
                detail = f"Where: {where or 'to be confirmed'}\nWhen: {when}" + (f"\nMentor: {details['mentor']}" if details["mentor"] else "") + "\n\nYou do not need to do anything yet. You will get another email when your placement is released and ready to confirm."
            else:
                days = int(event.payload.get("days", 0))
                subject = f"Your placement starts in {days} days"
                title = f"Your placement starts in {days} days"
                intro = f"Hello {recipient.first_name}, a reminder to get ready."
                detail = f"Where: {where or 'to be confirmed'}\nWhen: {when}" + (f"\nMentor: {details['mentor']}" if details["mentor"] else "") + "\n\nCheck your MentorMAMA account for anything you still need to complete."
            text = _email_content(
                eyebrow="Placement update", title=title, intro=intro, action_label="Open MentorMAMA",
                action_url=f"{settings.FRONTEND_BASE_URL}/", detail=detail, expiry="",
            )
            _send(subject, text, settings.DEFAULT_FROM_EMAIL, recipient, event)
            event.delivered_to = [*(event.delivered_to or []), str(recipient.id)]
            event.save(update_fields=["delivered_to"])
    elif event.event_type in {
        "MentorAssigned", "MentorReassigned", "EscalationRaised", "MentorPlacementsAssigned", "PlacementsArranged", "PlacementsRequested", "PlacementsDeclined", "PlacementRequestsWithdrawn", "ArrangementOverridden", "MentorUnavailableForPlacements",
        "FeedbackSubmitted", "SessionLogged", "FinalAssessmentSubmitted",
        "PlacementPaused", "PlacementResumed", "PlacementWithdrawn", "PlacementCompleted",
        "PlacementScheduled", "OrientationAcknowledged", "InductionCompleted", "EscalationStatusChanged",
    }:
        subject, eyebrow, title, intro, detail = {
            "MentorAssigned": (
                "You have a new MentorMAMA placement assignment", "Placement update",
                "A placement needs your attention", "You have been assigned to support a clinical placement.",
                "Sign in to review the placement and complete any required setup.",
            ),
            "MentorPlacementsAssigned": (
                "You have new students to mentor", "Placement update",
                "New students have been assigned to you", "Your facility has arranged new students under your mentorship.",
                "Sign in to see who is assigned to you and what each student needs next.",
            ),
            "PlacementsArranged": (
                "Students have been arranged into wards", "Placement update",
                "A facility has arranged your students", "A partner facility has placed students from your institution into wards and mentors.",
                "Sign in to review the placements and release them to the students.",
            ),
            "PlacementsRequested": (
                "Students are waiting to be placed at your facility", "Placement update",
                "New students are waiting for your facility", "A university coordinator has asked your facility to host students.",
                "Sign in and use Arrange students to place them into your wards in one step.",
            ),
            "MentorUnavailableForPlacements": (
                "Some placements need a new mentor", "Placement update",
                "A mentor is no longer available", "A mentor at your facility can no longer take students, so their placements need reassigning.",
                "Sign in and use Change mentor on each affected placement. Sessions cannot be logged until a new mentor is assigned.",
            ),
            "PlacementsDeclined": (
                "A facility could not host some of your students", "Placement update",
                "Some students need another facility", "A partner facility has declined to host some of the students you requested.",
                "Sign in to see the reason and ask another facility.",
            ),
            "PlacementRequestsWithdrawn": (
                "A request for your facility was withdrawn", "Placement update",
                "A request was withdrawn", "The university coordinator has withdrawn a request for students to be placed at your facility.",
                "Nothing is needed from you. The incoming list has been updated.",
            ),
            "ArrangementOverridden": (
                "A coordinator changed a placement arrangement", "Placement update",
                "A placement arrangement was changed", "The university coordinator changed the ward or mentor for a student at your facility.",
                "Sign in to see what changed and the reason given.",
            ),
            "MentorReassigned": (
                "Your MentorMAMA placement assignment changed", "Placement update",
                "Your placement assignment changed", "A placement assignment connected to your account has changed.",
                "Sign in to review the latest placement details.",
            ),
            "EscalationRaised": (
                "A safeguarding concern needs review", "Safeguarding notice",
                "A concern needs your review", "A safeguarding concern has been raised in a scope you support.",
                "Sign in to review it through the restricted safeguarding workspace. No concern details are included in this email.",
            ),
            "FeedbackSubmitted": (
                "New confidential feedback is ready", "Feedback update",
                "Confidential feedback was submitted", "A student has submitted confidential feedback connected to a placement in your institution.",
                "Sign in to review it through the authorised feedback workspace.",
            ),
            "SessionLogged": (
                "A mentor follow-up needs review", "Mentorship follow-up",
                "A session was flagged for supervisor review", "A mentor has requested supervisor follow-up on a logged mentorship session.",
                "Sign in to review the placement context and follow-up task.",
            ),
            "FinalAssessmentSubmitted": (
                "A placement is ready for close-out", "Assessment update",
                "Final assessment submitted", "A student has submitted the final assessment for a placement in your facility.",
                "Sign in to review the assessment and continue the close-out process.",
            ),
            "PlacementPaused": (
                "Your placement has been paused", "Placement update",
                "A placement connected to your account has been paused", "The placement team has temporarily paused this placement.",
                "Sign in to review the latest placement status and planned next steps.",
            ),
            "PlacementResumed": (
                "Your placement has resumed", "Placement update",
                "A placement connected to your account has resumed", "The placement team has resumed this placement.",
                "Sign in to review the updated placement window and status.",
            ),
            "PlacementWithdrawn": (
                "Your placement has been withdrawn", "Placement update",
                "A placement connected to your account has been withdrawn", "The placement team has withdrawn this placement.",
                "Sign in to review the placement record or contact your programme support team.",
            ),
            "PlacementCompleted": (
                "Your placement is complete", "Placement update",
                "A placement connected to your account has been completed", "The placement team has marked this placement complete.",
                "Sign in to review the placement record and any remaining close-out information.",
            ),
            "PlacementScheduled": (
                "A MentorMAMA placement is scheduled", "Placement update",
                "A placement is ready for student review", "A placement in your institution has completed its assignments and is ready for student acknowledgement.",
                "Sign in to review the placement status.",
            ),
            "OrientationAcknowledged": (
                "A student acknowledged placement orientation", "Induction update",
                "A student is ready for induction", "A student has acknowledged placement orientation.",
                "Sign in to open the induction checklist.",
            ),
            "InductionCompleted": (
                "Your placement induction is complete", "Placement update",
                "You are ready to begin mentorship", "Your mentor completed the placement induction checklist.",
                "Sign in to review your active placement.",
            ),
            "EscalationStatusChanged": (
                "A safeguarding report has an update", "Safeguarding update",
                "The status of your report changed", "There is an update to a safeguarding report you submitted.",
                "Sign in to review it through the restricted safeguarding workspace. No report details are included in this email.",
            ),
        }[event.event_type]
        payload = event.payload
        plural = lambda n, word: f"{n} {word}{'' if n == 1 else 's'}"  # noqa: E731
        if event.event_type == "MentorPlacementsAssigned" and payload.get("count"):
            intro = f"Your facility has arranged {plural(int(payload['count']), 'new student')} under your mentorship."
        elif event.event_type == "PlacementsArranged" and "arranged" in payload:
            left = int(payload.get("unplaced", 0))
            intro = f"A partner facility has placed {plural(int(payload['arranged']), 'student')} from your institution into wards and mentors." + (
                f" {plural(left, 'student')} could not be placed and still need attention." if left else ""
            )
        elif event.event_type == "MentorUnavailableForPlacements" and payload.get("count"):
            active = int(payload.get("active_count", 0))
            intro = f"A mentor at your facility can no longer take students. {plural(int(payload['count']), 'placement')} need a new mentor" + (
                f", {active} of them active and unable to log sessions until reassigned." if active else "."
            )
        elif event.event_type == "PlacementsRequested" and payload.get("count"):
            intro = f"A university coordinator has asked your facility to host {plural(int(payload['count']), 'student')}."
        for recipient_id in event.payload.get("recipient_user_ids", []):
            if str(recipient_id) in (event.delivered_to or []):
                continue  # already emailed on an earlier attempt
            recipient = identity.user_of(recipient_id)
            if not recipient or recipient.status != identity.STATUSES.ACTIVE:
                continue
            if not _optional_email_enabled(user_id=recipient.id, event_type=event.event_type):
                continue
            text = _email_content(
                eyebrow=eyebrow, title=title, intro=f"Hello {recipient.first_name}, {intro.lower()}",
                action_label="Open MentorMAMA", action_url=f"{settings.FRONTEND_BASE_URL}/placements",
                detail=detail, expiry="Please review this notification when you are able.",
            )
            _send(subject, text, settings.DEFAULT_FROM_EMAIL, recipient, event)
            event.delivered_to = [*(event.delivered_to or []), str(recipient.id)]
            event.save(update_fields=["delivered_to"])


def send_digest_email(*, user, unread_count: int) -> None:
    text = _email_content(
        eyebrow="Weekly programme digest", title="A clear view of your week",
        intro=f"Hello {user.first_name}, here is a short summary of the updates waiting in your MentorMAMA inbox.",
        action_label="Review notifications", action_url=f"{settings.FRONTEND_BASE_URL}/",
        detail=f"You have {unread_count} unread programme notification{'s' if unread_count != 1 else ''}. Open MentorMAMA to review the safe summaries and any actions waiting for you.",
        expiry="You are receiving this because weekly digest notifications are enabled in your settings.",
    )
    send_mail("Your MentorMAMA weekly digest", text, settings.DEFAULT_FROM_EMAIL, [user.email])
