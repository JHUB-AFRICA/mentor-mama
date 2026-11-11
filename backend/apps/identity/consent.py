"""Programme consent: versioned wording, acceptance records, and the gate for students and mentors.

Nothing is enforced until a programme admin publishes a version. The wording itself is the
programme's to approve; the starter text is clearly marked as a draft.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.core import audit, errors
from apps.identity.models import ConsentRecord, ConsentVersion, Role, Status

CONSENT_ROLES = {Role.STUDENT, Role.MENTOR}

STARTER_TITLE = "How MentorMAMA uses your information"
STARTER_BODY = """DRAFT: pending approval by the programme and its ethics and data-governance owners.

MentorMAMA helps your university, your hospital and your mentor support you during clinical placement. To do that we keep a record of your placement, your learning progress and your mentorship sessions.

What we collect: your account details, your placement (hospital, ward, mentor, dates), your learning and induction progress, mentorship session records, confidence ratings and the feedback you give.

Please never type patient names, hospital numbers or other details that could identify a patient into any free-text box.

Who sees what: confidential feedback is seen only by the people the programme has authorised; your mentor does not see individual answers. Anonymous feedback is not linked to you, and group results are hidden until at least 3 people have answered. A safeguarding concern is not anonymous so that it can be investigated; it is seen only by its assigned reviewer, and every time it is opened is recorded.

By continuing you confirm that you have read this and understand how your information is used."""


def published(program_id):
    return ConsentVersion.objects.filter(program_id=program_id, published_at__isnull=False).order_by("-version").first()


def is_required(user) -> bool:
    """True when this person must accept the current wording before they can act."""
    if user.status != Status.ACTIVE or user.role not in CONSENT_ROLES or not user.program_id:
        return False
    current = published(user.program_id)
    return bool(current) and not ConsentRecord.objects.filter(user=user, consent_version=current).exists()


def current_for(user):
    current = published(user.program_id) if user.program_id else None
    if not current or user.role not in CONSENT_ROLES:
        return None
    return {
        "id": str(current.id), "version": current.version, "title": current.title, "body": current.body,
        "accepted": ConsentRecord.objects.filter(user=user, consent_version=current).exists(),
    }


@transaction.atomic
def accept(user, version_id) -> None:
    version = ConsentVersion.objects.filter(id=version_id, program_id=user.program_id, published_at__isnull=False).first()
    if version is None or user.role not in CONSENT_ROLES:
        raise errors.UnauthorizedFacilityAccess()
    record, created = ConsentRecord.objects.get_or_create(user=user, consent_version=version)
    if created:
        audit.record(actor=user, action="consent.accepted", entity_table="identity_consent_record", entity_id=record.id,
                     scope={"program_id": str(user.program_id)}, changes={"version": version.version})


def _admin_only(actor) -> None:
    if actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN:
        raise errors.UnauthorizedFacilityAccess()


def list_versions(actor) -> list[dict]:
    _admin_only(actor)
    versions = ConsentVersion.objects.filter(program_id=actor.program_id)
    return [
        {"id": str(v.id), "version": v.version, "title": v.title, "body": v.body, "published_at": v.published_at,
         "accepted_count": v.records.count()}
        for v in versions
    ]


@transaction.atomic
def create_draft(actor, *, title: str, body: str) -> ConsentVersion:
    _admin_only(actor)
    number = (ConsentVersion.objects.filter(program_id=actor.program_id).aggregate(m=Max("version"))["m"] or 0) + 1
    version = ConsentVersion.objects.create(program_id=actor.program_id, version=number, title=title.strip(), body=body.strip())
    audit.record(actor=actor, action="consent.draft_created", entity_table="identity_consent_version", entity_id=version.id,
                 scope={"program_id": str(actor.program_id)}, changes={"version": number})
    return version


@transaction.atomic
def publish(actor, version_id) -> ConsentVersion:
    _admin_only(actor)
    version = ConsentVersion.objects.select_for_update().filter(id=version_id, program_id=actor.program_id).first()
    if version is None:
        raise errors.UnauthorizedFacilityAccess()
    if version.published_at is None:
        version.published_at = timezone.now()
        version.published_by = actor
        version.save(update_fields=["published_at", "published_by", "updated_at"])
        audit.record(actor=actor, action="consent.published", entity_table="identity_consent_version", entity_id=version.id,
                     scope={"program_id": str(actor.program_id)}, changes={"version": version.version})
    return version
