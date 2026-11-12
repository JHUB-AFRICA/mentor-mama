from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Exists, OuterRef, Prefetch, Q
from django.db.models import Count
from django.utils import timezone

from apps.core import audit
from apps.core.storage import delete_stored_files
from apps.core.errors import CohortOverlap, InvalidCohortDates, UnauthorizedFacilityAccess
from apps.identity import api as identity
from apps.institutions.models import Cohort, CohortMembership, Institution, StudentProfile


def _allowed(actor) -> bool:
    return actor.status == identity.STATUSES.ACTIVE and actor.role == identity.ROLES.PROGRAM_ADMIN


def _coordinator_allowed(actor) -> bool:
    return actor.status == identity.STATUSES.ACTIVE and actor.role == identity.ROLES.COORDINATOR and actor.institution_id is not None


def _require_coordinator(actor):
    if not _coordinator_allowed(actor):
        raise UnauthorizedFacilityAccess()


def list_institutions(*, actor):
    if not _allowed(actor):
        return None
    return Institution.objects.filter(program_id=actor.program_id).order_by("name")


@transaction.atomic
def update_institution(*, actor, institution_id, **data):
    if not _allowed(actor):
        return None
    institution = Institution.objects.select_for_update().filter(id=institution_id, program_id=actor.program_id).first()
    if institution is None:
        return None
    previous_logo = institution.logo
    archived = data.pop("archived", None)
    if data.pop("clear_logo", False) and "logo" not in data:
        data["logo"] = None
    changed_fields = list(data)
    for field, value in data.items():
        setattr(institution, field, value)
    if archived is not None:
        from django.utils import timezone
        institution.archived_at = timezone.now() if archived else None
    institution.save(update_fields=[*data.keys(), "archived_at", "updated_at"])
    if previous_logo and previous_logo.name != institution.logo.name:
        # Delete by name: FieldFile.delete() would also blank the logo on the in-memory row being returned.
        delete_stored_files([(previous_logo.storage, previous_logo.name)])
    audit.record(actor=actor, action="institution.updated", entity_table="institutions_institution", entity_id=institution.id, scope={"program_id": str(actor.program_id)}, changes={"fields": changed_fields, "logo_updated": "logo" in data, **({"archived": archived} if archived is not None else {})})
    identity.invalidate_directory_coverage(actor=actor, program_id=actor.program_id)
    return institution


@transaction.atomic
def create_institution(*, actor, **data):
    if not _allowed(actor):
        return None
    institution = Institution.objects.create(program_id=actor.program_id, **data)
    audit.record(actor=actor, action="institution.created", entity_table="institutions_institution", entity_id=institution.id, scope={"program_id": str(actor.program_id)}, changes={"name": institution.name})
    identity.invalidate_directory_coverage(actor=actor, program_id=actor.program_id)
    return institution


def list_cohorts(*, actor):
    _require_coordinator(actor)
    return Cohort.objects.filter(
        institution_id=actor.institution_id,
        archived_at=None,
    ).annotate(member_count=Count("memberships", filter=Q(memberships__removed_at__isnull=True))).order_by("-start_date", "name")


def get_cohort(*, actor, cohort_id):
    if actor.status == identity.STATUSES.ACTIVE and actor.role == identity.ROLES.PROGRAM_ADMIN:
        cohort = Cohort.objects.filter(id=cohort_id, institution__program_id=actor.program_id, archived_at=None).first()
    else:
        _require_coordinator(actor)
        cohort = Cohort.objects.filter(id=cohort_id, institution_id=actor.institution_id, archived_at=None).first()
    if cohort is None:
        raise UnauthorizedFacilityAccess()
    return cohort


def list_cohort_students(*, actor, cohort_id):
    cohort = get_cohort(actor=actor, cohort_id=cohort_id)
    return identity.users(cohort_memberships__cohort=cohort, cohort_memberships__removed_at__isnull=True, status__in=[identity.STATUSES.INVITED, identity.STATUSES.ACTIVE, identity.STATUSES.SUSPENDED]).order_by("first_name", "last_name", "email")


def list_institution_students(*, actor, include_deactivated=False):
    _require_coordinator(actor)
    statuses = [identity.STATUSES.INVITED, identity.STATUSES.ACTIVE, identity.STATUSES.SUSPENDED]
    if include_deactivated:
        statuses.append(identity.STATUSES.DEACTIVATED)
    return identity.users(
        program_id=actor.program_id,
        institution_id=actor.institution_id,
        role=identity.ROLES.STUDENT,
        status__in=statuses,
    ).order_by("first_name", "last_name", "email")


def page_institution_students(*, actor, page=1, page_size=20, search="", status="", cohort_status=""):
    students = list_institution_students(
        actor=actor,
        include_deactivated=status == identity.STATUSES.DEACTIVATED,
    ).prefetch_related(
        Prefetch(
            "cohort_memberships",
            queryset=CohortMembership.objects.filter(removed_at__isnull=True, cohort__archived_at__isnull=True)
            .select_related("cohort")
            .order_by("cohort__start_date"),
        )
    )
    if search.strip():
        term = search.strip()
        students = students.filter(Q(first_name__icontains=term) | Q(last_name__icontains=term) | Q(email__icontains=term) | Q(registration_number__icontains=term))
    if status:
        students = students.filter(status=status)
    memberships = CohortMembership.objects.filter(
        student_id=OuterRef("pk"),
        removed_at__isnull=True,
        cohort__archived_at__isnull=True,
    )
    if cohort_status == "assigned":
        students = students.annotate(has_cohort=Exists(memberships)).filter(has_cohort=True)
    elif cohort_status == "unassigned":
        students = students.annotate(has_cohort=Exists(memberships)).filter(has_cohort=False)
    paginator = Paginator(students, min(max(page_size, 1), 50))
    current = paginator.get_page(page)
    return current, paginator


@transaction.atomic
def create_cohort(*, actor, **data):
    _require_coordinator(actor)
    cohort = Cohort.objects.create(institution_id=actor.institution_id, **data)
    audit.record(
        actor=actor,
        action="cohort.created",
        entity_table="institutions_cohort",
        entity_id=cohort.id,
        scope={"program_id": str(actor.program_id), "institution_id": str(actor.institution_id)},
        changes={"name": cohort.name, "start_date": str(cohort.start_date), "end_date": str(cohort.end_date)},
    )
    return cohort


@transaction.atomic
def update_cohort(*, actor, cohort_id, **data):
    _require_coordinator(actor)
    cohort = Cohort.objects.select_for_update().filter(id=cohort_id, institution_id=actor.institution_id, archived_at=None).first()
    if cohort is None:
        raise UnauthorizedFacilityAccess()
    start, end = data.get("start_date", cohort.start_date), data.get("end_date", cohort.end_date)
    if start >= end:
        raise InvalidCohortDates()
    # Only live clashes count: removed memberships and archived cohorts are ignored, and
    # a cohort that ends before the new window starts (or starts after it ends) is no clash.
    if CohortMembership.objects.filter(
        student_id__in=CohortMembership.objects.filter(cohort=cohort, removed_at=None).values("student_id"),
        removed_at__isnull=True,
        cohort__institution_id=actor.institution_id,
        cohort__archived_at__isnull=True,
        cohort__start_date__lt=end,
        cohort__end_date__gt=start,
    ).exclude(cohort_id=cohort.id).exists():
        raise CohortOverlap()
    changed = {}
    for key, value in data.items():
        before = getattr(cohort, key)
        if before != value:
            changed[key] = {"from": str(before), "to": str(value)}
            setattr(cohort, key, value)
    if changed:
        cohort.save(update_fields=[*data.keys(), "updated_at"])
        audit.record(actor=actor, action="cohort.updated", entity_table="institutions_cohort", entity_id=cohort.id,
                     scope={"program_id": str(actor.program_id), "institution_id": str(actor.institution_id)}, changes=changed)
    return cohort


@transaction.atomic
def archive_cohort(*, actor, cohort_id):
    _require_coordinator(actor)
    cohort = Cohort.objects.select_for_update().filter(id=cohort_id, institution_id=actor.institution_id, archived_at=None).first()
    if cohort is None:
        raise UnauthorizedFacilityAccess()
    cohort.archived_at = timezone.now()
    cohort.save(update_fields=["archived_at", "updated_at"])
    audit.record(actor=actor, action="cohort.archived", entity_table="institutions_cohort", entity_id=cohort.id,
                 scope={"program_id": str(actor.program_id), "institution_id": str(actor.institution_id)}, changes={"archived": True})
    return cohort


@transaction.atomic
def remove_cohort_membership(*, actor, cohort_id, student_id, reason):
    _require_coordinator(actor)
    row = CohortMembership.objects.select_for_update().filter(
        cohort_id=cohort_id, cohort__institution_id=actor.institution_id, cohort__archived_at=None,
        student_id=student_id, removed_at=None,
    ).first()
    if row is None:
        raise UnauthorizedFacilityAccess()
    row.removed_at = timezone.now()
    row.removed_by_id = actor.id
    row.removal_reason = reason.strip()
    row.save(update_fields=["removed_at", "removed_by_id", "removal_reason", "updated_at"])
    audit.record(actor=actor, action="cohort.student_membership_removed", entity_table="institutions_cohort_membership", entity_id=row.id,
                 scope={"program_id": str(actor.program_id), "institution_id": str(actor.institution_id)},
                 changes={"cohort_id": str(cohort_id), "student_id": str(student_id), "reason": reason.strip()})
    return row


@transaction.atomic
def enrol_student(*, actor, cohort_id, student_id):
    _require_coordinator(actor)
    cohort = Cohort.objects.select_for_update().filter(
        id=cohort_id,
        institution_id=actor.institution_id,
        archived_at=None,
    ).first()
    if cohort is None:
        raise UnauthorizedFacilityAccess()
    student = identity.users(
        id=student_id,
        program_id=actor.program_id,
        institution_id=actor.institution_id,
        role=identity.ROLES.STUDENT,
        status__in=[identity.STATUSES.INVITED, identity.STATUSES.ACTIVE, identity.STATUSES.SUSPENDED],
    ).select_for_update().first()
    if student is None:
        raise UnauthorizedFacilityAccess()
    has_overlapping_cohort = CohortMembership.objects.filter(
        student=student,
        removed_at__isnull=True,
        cohort__institution_id=actor.institution_id,
        cohort__archived_at__isnull=True,
        cohort__start_date__lt=cohort.end_date,
        cohort__end_date__gt=cohort.start_date,
    ).exclude(cohort_id=cohort.id).exists()
    if has_overlapping_cohort:
        raise CohortOverlap()
    membership, created = CohortMembership.objects.get_or_create(cohort=cohort, student=student, removed_at=None)
    if created:
        audit.record(
            actor=actor,
            action="cohort.student_enrolled",
            entity_table="institutions_cohort_membership",
            entity_id=membership.id,
            scope={"program_id": str(actor.program_id), "institution_id": str(actor.institution_id)},
            changes={"cohort_id": str(cohort.id), "student_id": str(student.id)},
        )
    return membership, created


def preview_bulk_enrolment(*, actor, cohort_id, student_ids):
    _require_coordinator(actor)
    cohort = Cohort.objects.filter(id=cohort_id, institution_id=actor.institution_id, archived_at=None).first()
    if cohort is None:
        raise UnauthorizedFacilityAccess()
    rows = []
    for student_id in student_ids:
        student = identity.users(id=student_id, program_id=actor.program_id, institution_id=actor.institution_id,
                                 role=identity.ROLES.STUDENT, status__in=[identity.STATUSES.INVITED, identity.STATUSES.ACTIVE, identity.STATUSES.SUSPENDED]).first()
        if student is None:
            rows.append({"student_id": str(student_id), "status": "unavailable"})
            continue
        if CohortMembership.objects.filter(cohort=cohort, student=student, removed_at=None).exists():
            state = "already_enrolled"
        elif CohortMembership.objects.filter(student=student, removed_at=None, cohort__archived_at=None,
                cohort__institution_id=actor.institution_id, cohort__start_date__lt=cohort.end_date,
                cohort__end_date__gt=cohort.start_date).exists():
            state = "overlap"
        else:
            state = "ready"
        rows.append({"student_id": str(student.id), "name": student.full_name, "registration_number": student.registration_number, "status": state})
    return {"cohort_id": str(cohort.id), "results": rows,
            "counts": {key: sum(row["status"] == key for row in rows) for key in ("ready", "already_enrolled", "overlap", "unavailable")}}


@transaction.atomic
def bulk_enrol(*, actor, cohort_id, student_ids):
    preview = preview_bulk_enrolment(actor=actor, cohort_id=cohort_id, student_ids=student_ids)
    if preview["counts"]["overlap"] or preview["counts"]["unavailable"]:
        raise CohortOverlap("Some selected students are no longer eligible. Review the updated preview and try again.")
    enrolled = []
    for row in preview["results"]:
        if row["status"] == "already_enrolled":
            continue
        membership, created = enrol_student(actor=actor, cohort_id=cohort_id, student_id=row["student_id"])
        if created:
            enrolled.append(str(membership.student_id))
    return {"enrolled_student_ids": enrolled, "already_enrolled": preview["counts"]["already_enrolled"]}


def get_student_profile(*, actor):
    if actor.status != identity.STATUSES.ACTIVE or actor.role != identity.ROLES.STUDENT:
        raise UnauthorizedFacilityAccess()
    profile, _ = StudentProfile.objects.get_or_create(student=actor)
    return profile


@transaction.atomic
def update_student_profile(*, actor, **data):
    profile = get_student_profile(actor=actor)
    for field, value in data.items():
        setattr(profile, field, value.strip() if isinstance(value, str) else value)
    profile.save()
    audit.record(
        actor=actor,
        action="student.profile_updated",
        entity_table="institutions_student_profile",
        entity_id=profile.id,
        scope={"program_id": str(actor.program_id), "institution_id": str(actor.institution_id)},
        changes={"fields": sorted(data)},
    )
    return profile
