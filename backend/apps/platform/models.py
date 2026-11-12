"""Website enquiries and support requests, handled by platform administrators.

A person who is not signed in can write to MentorMAMA from the public website (contact, pilot access, support).
The submission is stored first; every email around it (acknowledgement, replies, progress updates, the alert to the
team) is a queued row on the enquiry's timeline and is retried until it goes out, so nothing is lost if the email
provider is down.
"""

from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class Enquiry(BaseModel):
    class Kind(models.TextChoices):
        CONTACT = "contact", "Contact"
        PILOT = "pilot", "Pilot access"
        SUPPORT = "support", "Support"

    class Status(models.TextChoices):
        NEW = "new", "New"
        IN_PROGRESS = "in_progress", "In progress"
        WAITING = "waiting", "Waiting for the sender"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"
        SPAM = "spam", "Spam"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"

    OPEN_STATUSES = (Status.NEW, Status.IN_PROGRESS, Status.WAITING)

    reference = models.CharField(max_length=24, unique=True)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    topic = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)
    priority = models.CharField(max_length=8, choices=Priority.choices, default=Priority.NORMAL)

    name = models.CharField(max_length=120)
    email = models.EmailField(max_length=254)
    phone = models.CharField(max_length=32, blank=True)
    organisation = models.CharField(max_length=160, blank=True)
    subject = models.CharField(max_length=160, blank=True)
    message = models.TextField()
    # Pilot request answers (role, organisation type, county, mentors, students, start term, units).
    details = models.JSONField(default=dict, blank=True)

    consent_at = models.DateTimeField()
    source_page = models.CharField(max_length=120, blank=True)
    user_agent = models.CharField(max_length=200, blank=True)

    assigned_to = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    converted_programme = models.ForeignKey("identity.Program", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    seen_at = models.DateTimeField(null=True, blank=True)
    first_response_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "platform_enquiry"
        indexes = [
            models.Index(fields=["status", "-last_activity_at"]),
            models.Index(fields=["kind", "status"]),
            models.Index(fields=["email", "-created_at"]),
        ]

    def __str__(self) -> str:
        return self.reference


class EnquiryEvent(BaseModel):
    """One entry on an enquiry's timeline. Rows with `email_status` also carry an email to send."""

    class Type(models.TextChoices):
        RECEIVED = "received", "Received"
        NOTE = "note", "Internal note"
        REPLY = "reply", "Reply to the sender"
        STATUS = "status", "Status change"
        ASSIGNMENT = "assignment", "Assignment"
        PRIORITY = "priority", "Priority"
        CONVERTED = "converted", "Programme created"
        EMAIL = "email", "Automatic email"
        STAFF_ALERT = "staff_alert", "Alert to the team"  # not shown on the timeline

    class EmailStatus(models.TextChoices):
        NONE = "", "No email"
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    enquiry = models.ForeignKey(Enquiry, on_delete=models.CASCADE, related_name="events")
    type = models.CharField(max_length=16, choices=Type.choices)
    actor = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    body = models.TextField(blank=True)
    meta = models.JSONField(default=dict, blank=True)

    email_template = models.CharField(max_length=24, blank=True)  # acknowledgement | reply | progress | staff_alert
    email_status = models.CharField(max_length=8, choices=EmailStatus.choices, default=EmailStatus.NONE, blank=True)
    email_subject = models.CharField(max_length=200, blank=True)
    email_attempts = models.PositiveSmallIntegerField(default=0)
    email_error = models.CharField(max_length=300, blank=True)
    email_next_attempt_at = models.DateTimeField(null=True, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "platform_enquiry_event"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["email_status", "email_next_attempt_at"])]
