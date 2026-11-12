"""Commands for website enquiries and support requests.

Visitors create them (`submit`); platform administrators work them (everything else). Every email is written as a
queued timeline row in the same transaction as the change that causes it, then sent by `send_pending_emails`
(immediately after commit, and again by the scheduler until it succeeds).
"""

from __future__ import annotations

from datetime import timedelta

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.core import audit
from apps.platform import enquiry_email
from apps.platform.models import Enquiry, EnquiryEvent
from apps.platform.services import create_programme, require_platform_admin

MAX_EMAIL_ATTEMPTS = 6
REFERENCE_PREFIX = {Enquiry.Kind.CONTACT: "CON", Enquiry.Kind.PILOT: "PIL", Enquiry.Kind.SUPPORT: "SUP"}
CLOSED_STATUSES = (Enquiry.Status.RESOLVED, Enquiry.Status.CLOSED, Enquiry.Status.SPAM)
# Status changes that tell the sender. Waiting is told by the reply itself; spam is never told.
PROGRESS_STATUSES = {Enquiry.Status.IN_PROGRESS, Enquiry.Status.RESOLVED, Enquiry.Status.CLOSED}
SERVICE_LEVEL = timedelta(hours=48)


class EnquiryError(ValueError):
    """A rule the caller can show to the person who triggered it."""


# --------------------------------------------------------------------------- emails

def _queue_email(enquiry: Enquiry, template: str, *, type=EnquiryEvent.Type.EMAIL, actor=None, body: str = "",
                 meta: dict | None = None) -> EnquiryEvent:
    event = EnquiryEvent.objects.create(
        enquiry=enquiry, type=type, actor=actor, body=body, meta=meta or {}, email_template=template,
        email_status=EnquiryEvent.EmailStatus.QUEUED,
    )
    transaction.on_commit(_kick_delivery)
    return event


def _attach_email(event: EnquiryEvent, template: str, **meta) -> None:
    """Make an existing timeline entry (a status change, a conversion) also carry an email to the sender."""
    event.email_template = template
    event.email_status = EnquiryEvent.EmailStatus.QUEUED
    event.meta = {**event.meta, **meta}
    event.save(update_fields=["email_template", "email_status", "meta", "updated_at"])
    transaction.on_commit(_kick_delivery)


def _kick_delivery() -> None:
    """Ask a worker to send now. If the queue is unreachable the scheduler's sweep still sends within seconds."""
    try:
        from apps.platform.tasks import send_enquiry_emails_task

        send_enquiry_emails_task.delay()
    except Exception:  # noqa: BLE001 - the sweep is the safety net
        pass


def send_pending_emails(limit: int = 25) -> tuple[int, int]:
    """Send queued enquiry emails. Failures are kept for another try with a growing delay; after the last try they
    are marked failed so a person can resend them from the enquiry. Returns (sent, failed)."""
    sent = failed = 0
    now = timezone.now()
    ids = list(
        EnquiryEvent.objects.filter(email_status=EnquiryEvent.EmailStatus.QUEUED)
        .filter(Q(email_next_attempt_at=None) | Q(email_next_attempt_at__lte=now)).order_by("created_at").values_list("id", flat=True)[:limit]
    )
    for event_id in ids:
        with transaction.atomic():
            event = (EnquiryEvent.objects.select_for_update(skip_locked=True, of=("self",)).select_related("enquiry", "actor")
                     .filter(id=event_id, email_status=EnquiryEvent.EmailStatus.QUEUED).first())
            if event is None:
                continue
            try:
                enquiry_email.send(event)
            except Exception as error:  # noqa: BLE001 - any provider failure is retryable
                event.email_attempts += 1
                event.email_error = f"{type(error).__name__}: {error}"[:300]
                if event.email_attempts >= MAX_EMAIL_ATTEMPTS:
                    event.email_status = EnquiryEvent.EmailStatus.FAILED
                else:
                    event.email_next_attempt_at = timezone.now() + timedelta(seconds=min(30 * 2 ** event.email_attempts, 3600))
                failed += 1
            else:
                event.email_status = EnquiryEvent.EmailStatus.SENT
                event.email_sent_at = timezone.now()
                event.email_error = ""
                event.email_attempts += 1
                sent += 1
            event.save(update_fields=["email_status", "email_sent_at", "email_error", "email_attempts",
                                      "email_next_attempt_at", "email_subject", "meta", "updated_at"])
    return sent, failed


def resend_email(*, actor, enquiry: Enquiry, event_id) -> EnquiryEvent:
    """Put a failed email back in the queue."""
    require_platform_admin(actor)
    event = enquiry.events.filter(id=event_id, email_status=EnquiryEvent.EmailStatus.FAILED).first()
    if event is None:
        raise EnquiryError("Only an email that failed to send can be sent again.")
    event.email_status = EnquiryEvent.EmailStatus.QUEUED
    event.email_attempts = 0
    event.email_next_attempt_at = None
    event.save(update_fields=["email_status", "email_attempts", "email_next_attempt_at", "updated_at"])
    _log(actor, "platform.enquiry_email_resent", enquiry)
    transaction.on_commit(_kick_delivery)
    return event


# --------------------------------------------------------------------------- submission

def _next_reference(kind: str) -> str:
    year = timezone.now().year
    prefix = f"{REFERENCE_PREFIX[kind]}-{year}-"
    latest = Enquiry.objects.filter(reference__startswith=prefix).order_by("-reference").values_list("reference", flat=True).first()
    number = int(latest.rsplit("-", 1)[1]) + 1 if latest else 1
    return f"{prefix}{number:04d}"


def submit(*, kind: str, name: str, email: str, message: str, topic: str = "", phone: str = "", organisation: str = "",
           subject: str = "", details: dict | None = None, source_page: str = "", user_agent: str = "") -> tuple[Enquiry, bool]:
    """Store a public submission and queue its emails. Returns (enquiry, created); sending the same message twice
    within ten minutes (a double click, a retry after a slow network) returns the first one."""
    email = email.strip().lower()
    recent = Enquiry.objects.filter(email=email, kind=kind, message=message.strip(),
                                    created_at__gte=timezone.now() - timedelta(minutes=10)).first()
    if recent:
        return recent, False
    for _ in range(5):
        try:
            with transaction.atomic():
                enquiry = Enquiry.objects.create(
                    reference=_next_reference(kind), kind=kind, topic=topic, name=" ".join(name.split()), email=email,
                    phone=phone.strip(), organisation=" ".join(organisation.split()), subject=" ".join(subject.split()),
                    message=message.strip(), details=details or {}, consent_at=timezone.now(), source_page=source_page[:120],
                    user_agent=user_agent[:200],
                    priority=Enquiry.Priority.HIGH if kind == Enquiry.Kind.SUPPORT and topic == "sign_in" else Enquiry.Priority.NORMAL,
                )
                EnquiryEvent.objects.create(enquiry=enquiry, type=EnquiryEvent.Type.RECEIVED)
                _queue_email(enquiry, "acknowledgement")
                _queue_email(enquiry, "staff_alert", type=EnquiryEvent.Type.STAFF_ALERT)
            return enquiry, True
        except IntegrityError:
            continue  # two visitors got the same reference at once; take the next number
    raise EnquiryError("We could not save your message just now. Please try again in a moment.")


def email_allowance(email: str, *, limit: int = 5, window: int = 3600) -> bool:
    """At most `limit` submissions per email address per window, whatever address they come from."""
    key = f"platform:enquiry:email:{email.strip().lower()}"
    cache.add(key, 0, window)
    try:
        return cache.incr(key) <= limit
    except ValueError:
        cache.set(key, 1, window)
        return True


# --------------------------------------------------------------------------- working an enquiry

def _log(actor, action: str, enquiry: Enquiry, changes: dict | None = None) -> None:
    audit.record(actor=actor, action=action, entity_table="platform_enquiry", entity_id=enquiry.id,
                 scope={"platform": True}, changes={"reference": enquiry.reference, **(changes or {})})


def _touch(enquiry: Enquiry, *fields: str) -> None:
    enquiry.last_activity_at = timezone.now()
    enquiry.save(update_fields=[*fields, "last_activity_at", "updated_at"])


def _claim(actor, enquiry: Enquiry) -> list[str]:
    """Whoever first acts on an enquiry becomes its owner."""
    if enquiry.assigned_to_id is None:
        enquiry.assigned_to = actor
        return ["assigned_to"]
    return []


def mark_seen(*, actor, enquiry: Enquiry) -> None:
    if enquiry.seen_at is None:
        Enquiry.objects.filter(id=enquiry.id, seen_at=None).update(seen_at=timezone.now())
        enquiry.seen_at = timezone.now()


@transaction.atomic
def assign(*, actor, enquiry: Enquiry, assignee) -> Enquiry:
    from apps.identity.authentication import is_platform_admin

    require_platform_admin(actor)
    if assignee is not None and not is_platform_admin(assignee):
        raise EnquiryError("Only platform administrators can own an enquiry.")
    if enquiry.assigned_to_id == (assignee.id if assignee else None):
        return enquiry
    enquiry.assigned_to = assignee
    EnquiryEvent.objects.create(
        enquiry=enquiry, type=EnquiryEvent.Type.ASSIGNMENT, actor=actor,
        body=f"Assigned to {assignee.full_name or assignee.email}" if assignee else "Unassigned",
    )
    _log(actor, "platform.enquiry_assigned", enquiry, {"assigned_to": assignee.email if assignee else None})
    _touch(enquiry, "assigned_to")
    return enquiry


@transaction.atomic
def set_priority(*, actor, enquiry: Enquiry, priority: str) -> Enquiry:
    require_platform_admin(actor)
    if enquiry.priority == priority:
        return enquiry
    previous, enquiry.priority = enquiry.priority, priority
    EnquiryEvent.objects.create(enquiry=enquiry, type=EnquiryEvent.Type.PRIORITY, actor=actor,
                                body=f"Priority changed from {previous} to {priority}")
    _log(actor, "platform.enquiry_priority", enquiry, {"from": previous, "to": priority})
    _touch(enquiry, "priority")
    return enquiry


@transaction.atomic
def add_note(*, actor, enquiry: Enquiry, body: str) -> EnquiryEvent:
    require_platform_admin(actor)
    event = EnquiryEvent.objects.create(enquiry=enquiry, type=EnquiryEvent.Type.NOTE, actor=actor, body=body.strip())
    _log(actor, "platform.enquiry_note", enquiry)
    _touch(enquiry)
    return event


@transaction.atomic
def reply(*, actor, enquiry: Enquiry, body: str) -> EnquiryEvent:
    """Email the sender. The reply is on the timeline at once; the email follows (and is retried if it fails)."""
    require_platform_admin(actor)
    if enquiry.status == Enquiry.Status.SPAM:
        raise EnquiryError("Replies are not sent for spam. Restore the enquiry first.")
    event = _queue_email(enquiry, "reply", type=EnquiryEvent.Type.REPLY, actor=actor, body=body.strip())
    fields = _claim(actor, enquiry)
    if enquiry.first_response_at is None:
        enquiry.first_response_at = timezone.now()
        fields.append("first_response_at")
    if enquiry.status != Enquiry.Status.WAITING:
        enquiry.status, enquiry.closed_at = Enquiry.Status.WAITING, None
        fields += ["status", "closed_at"]
    _log(actor, "platform.enquiry_replied", enquiry)
    _touch(enquiry, *fields)
    return event


@transaction.atomic
def set_status(*, actor, enquiry: Enquiry, status: str, note: str = "", notify: bool = True) -> Enquiry:
    require_platform_admin(actor)
    if status not in Enquiry.Status.values:
        raise EnquiryError("Unknown status.")
    if status == enquiry.status:
        return enquiry
    previous, enquiry.status = enquiry.status, status
    fields = ["status", *_claim(actor, enquiry)]
    enquiry.closed_at = timezone.now() if status in CLOSED_STATUSES else None
    fields.append("closed_at")
    if status == Enquiry.Status.IN_PROGRESS and enquiry.first_response_at is None:
        enquiry.first_response_at = timezone.now()
        fields.append("first_response_at")
    label = dict(Enquiry.Status.choices)
    event = EnquiryEvent.objects.create(
        enquiry=enquiry, type=EnquiryEvent.Type.STATUS, actor=actor, body=note.strip(),
        meta={"from": previous, "to": status, "text": f"Status changed from {label[previous]} to {label[status]}"},
    )
    emailed = notify and status in PROGRESS_STATUSES
    if emailed:
        _attach_email(event, "progress", progress=status, sender_notified=True)
    _log(actor, "platform.enquiry_status", enquiry, {"from": previous, "to": status, "sender_notified": emailed, "note": note.strip()[:300]})
    _touch(enquiry, *fields)
    return enquiry


@transaction.atomic
def convert_to_programme(*, actor, enquiry: Enquiry, name: str, short_name: str = "", academic_year: str = "",
                         admin: dict, note: str = "") -> Enquiry:
    """Pilot request -> programme with its first administrator invited. The sender is told it is being set up."""
    require_platform_admin(actor)
    if enquiry.kind != Enquiry.Kind.PILOT:
        raise EnquiryError("Only pilot access requests can become a programme.")
    if enquiry.converted_programme_id:
        raise EnquiryError("A programme was already created from this request.")
    try:
        programme, _ = create_programme(actor=actor, name=name, short_name=short_name, academic_year=academic_year,
                                        description=f"Created from pilot request {enquiry.reference}.", admin=admin)
    except ValueError as error:
        raise EnquiryError(str(error)) from error
    enquiry.converted_programme = programme
    previous, enquiry.status = enquiry.status, Enquiry.Status.RESOLVED
    enquiry.closed_at = timezone.now()
    fields = ["converted_programme", "status", "closed_at", *_claim(actor, enquiry)]
    if enquiry.first_response_at is None:
        enquiry.first_response_at = timezone.now()
        fields.append("first_response_at")
    event = EnquiryEvent.objects.create(enquiry=enquiry, type=EnquiryEvent.Type.CONVERTED, actor=actor, body=note.strip(),
                                        meta={"programme_id": str(programme.id), "programme": programme.name, "from": previous,
                                              "admin_email": admin["email"]})
    _attach_email(event, "progress", progress="converted", sender_notified=True)
    _log(actor, "platform.enquiry_converted", enquiry, {"programme": programme.name})
    _touch(enquiry, *fields)
    return enquiry


def is_overdue(enquiry: Enquiry, now=None) -> bool:
    """No first response within the promised two working days (counted as 48 hours)."""
    return (enquiry.first_response_at is None and enquiry.status in Enquiry.OPEN_STATUSES
            and (now or timezone.now()) - enquiry.created_at > SERVICE_LEVEL)
