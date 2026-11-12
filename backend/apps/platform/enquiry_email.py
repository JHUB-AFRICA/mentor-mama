"""Emails around website enquiries: what the sender receives, and the alert the team receives.

Plain text on purpose (same as every other MentorMAMA email today). Nothing here includes a password, a sign-in code
or a link that signs anyone in.
"""

from __future__ import annotations

from textwrap import shorten

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from apps.identity.models import Role, Status, User
from apps.platform.models import Enquiry, EnquiryEvent

KIND_NOUN = {
    Enquiry.Kind.CONTACT: "message",
    Enquiry.Kind.PILOT: "pilot access request",
    Enquiry.Kind.SUPPORT: "support request",
}
SIGN_OFF = "The MentorMAMA team"


def _quote(text: str) -> str:
    return "\n".join(f"> {line}" if line.strip() else ">" for line in text.strip().splitlines())


def _footer(enquiry: Enquiry) -> str:
    return (
        f"Your reference: {enquiry.reference}\n"
        "To add something, reply to this email and keep the reference in the subject line.\n"
        "MentorMAMA will never ask for your password or a sign-in code by email."
    )


def _subject(enquiry: Enquiry, lead: str) -> str:
    return f"{lead} [{enquiry.reference}]"


def acknowledgement(enquiry: Enquiry) -> tuple[str, str]:
    noun = KIND_NOUN[enquiry.kind]
    next_steps = {
        Enquiry.Kind.PILOT: (
            "What happens next\n"
            "1. A member of our team reads your request and may ask a few questions about your maternity unit and cohort.\n"
            "2. If the pilot is a good fit, we set up your programme workspace and invite your programme administrator.\n"
            "3. We will email you at each step, so you always know where things stand."
        ),
        Enquiry.Kind.SUPPORT: (
            "What happens next\n"
            "1. A member of our team looks into the problem.\n"
            "2. We reply to this email address with the answer or a question if we need more detail.\n"
            "3. We tell you when it is resolved."
        ),
    }.get(
        enquiry.kind,
        "What happens next\nA member of our team will read your message and reply to this email address.",
    )
    body = "\n\n".join([
        f"Hello {enquiry.name.split()[0] if enquiry.name.split() else 'there'},",
        f"Thank you for getting in touch. We have received your {noun} and it is now with the MentorMAMA team.",
        f"Reference: {enquiry.reference}\nReceived: {enquiry.created_at:%d %b %Y, %H:%M} UTC",
        next_steps,
        "We aim to reply within 2 working days.",
        "What you sent us\n" + _quote(enquiry.message),
        _footer(enquiry),
        SIGN_OFF,
    ])
    return _subject(enquiry, f"We received your {noun}"), body


def reply(enquiry: Enquiry, event: EnquiryEvent) -> tuple[str, str]:
    author = event.actor.first_name if event.actor and event.actor.first_name else ""
    body = "\n\n".join([
        f"Hello {enquiry.name.split()[0] if enquiry.name.split() else 'there'},",
        event.body.strip(),
        f"{author}\n{SIGN_OFF}" if author else SIGN_OFF,
        "In reply to\n" + _quote(shorten(enquiry.message, width=600, placeholder=" …")),
        _footer(enquiry),
    ])
    return _subject(enquiry, f"Re: {enquiry.subject or KIND_NOUN[enquiry.kind].capitalize()}"), body


PROGRESS_COPY = {
    "in_progress": (
        "We are looking into your {noun}",
        "A member of our team has started working on your {noun}. You do not need to do anything; we will write again when we have an answer.",
    ),
    "waiting": (
        "We need a little more from you",
        "We replied to your {noun} and are waiting to hear back from you. Reply to this email when you can.",
    ),
    "resolved": (
        "Your {noun} is resolved",
        "We have marked your {noun} as resolved. If something is still not right, reply to this email and we will reopen it.",
    ),
    "closed": (
        "Your {noun} is closed",
        "We have closed your {noun}. If you still need help, reply to this email or send a new message from our website.",
    ),
    "converted": (
        "Your pilot is being set up",
        "Good news: we are setting up your MentorMAMA programme workspace. The programme administrator you named will receive an invitation by email with a link to create their account. Please ask them to check their inbox and spam folder.",
    ),
}


def progress(enquiry: Enquiry, event: EnquiryEvent) -> tuple[str, str]:
    key = event.meta.get("progress", enquiry.status)
    title, text = PROGRESS_COPY[key]
    noun = KIND_NOUN[enquiry.kind]
    parts = [
        f"Hello {enquiry.name.split()[0] if enquiry.name.split() else 'there'},",
        text.format(noun=noun),
    ]
    if event.body.strip():
        parts.append("A note from the team\n" + _quote(event.body))
    parts += [_footer(enquiry), SIGN_OFF]
    return _subject(enquiry, title.format(noun=noun).capitalize()), "\n\n".join(parts)


def staff_alert(enquiry: Enquiry) -> tuple[str, str]:
    link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/platform/messages/{enquiry.id}"
    label = {Enquiry.Kind.PILOT: "Pilot request", Enquiry.Kind.SUPPORT: "Support request", Enquiry.Kind.CONTACT: "Contact message"}[enquiry.kind]
    who = enquiry.name + (f" ({enquiry.organisation})" if enquiry.organisation else "")
    body = "\n\n".join([
        f"{label} {enquiry.reference} from {who}.",
        f"Email: {enquiry.email}\nTopic: {enquiry.topic or '—'}",
        shorten(enquiry.message.replace("\n", " "), width=300, placeholder=" …"),
        f"Open it, reply and update its status: {link}",
        "The sender has been sent an acknowledgement with the reference. We promise a reply within 2 working days.",
    ])
    return f"New {label.lower()}: {enquiry.subject or enquiry.name} [{enquiry.reference}]", body


def staff_recipients() -> list[str]:
    configured = [address.strip() for address in settings.PLATFORM_NOTIFY_EMAILS if address.strip()]
    if configured:
        return configured
    return list(User.objects.filter(role=Role.PLATFORM_ADMIN, status=Status.ACTIVE).exclude(email="").values_list("email", flat=True))


def send(event: EnquiryEvent) -> None:
    """Send the email an event carries. Raises on failure so the caller can retry later."""
    enquiry = event.enquiry
    template = event.email_template
    if template == "staff_alert":
        subject, text = staff_alert(enquiry)
        recipients = staff_recipients()
        sent_to = set(event.meta.get("sent_to", []))
        for address in recipients:
            if address in sent_to:
                continue  # already delivered on an earlier attempt
            message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [address])
            message.send()
            sent_to.add(address)
            event.meta = {**event.meta, "sent_to": sorted(sent_to)}
            event.save(update_fields=["meta", "updated_at"])
        return
    subject, text = {"acknowledgement": lambda: acknowledgement(enquiry), "reply": lambda: reply(enquiry, event),
                     "progress": lambda: progress(enquiry, event)}[template]()
    message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [enquiry.email])
    if settings.SUPPORT_REPLY_TO:
        message.reply_to = [settings.SUPPORT_REPLY_TO]
    message.extra_headers["X-MentorMAMA-Reference"] = enquiry.reference
    message.metadata = {"enquiry_reference": enquiry.reference}  # read by django-anymail
    message.send()
    if event.email_subject != subject:
        event.email_subject = subject[:200]
