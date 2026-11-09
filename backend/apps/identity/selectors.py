"""Read-only identity queries used by API views."""

from django.core.paginator import Paginator
from django.db.models import Exists, OuterRef, Q
from django.db.models import Count

from apps.core import api as core
from apps.core.errors import UnauthorizedFacilityAccess
from apps.identity.models import Role, Status, User


def program_people(*, actor: User, page: int, page_size: int, search: str = "", role: str = "", status: str = "") -> dict:
    """Return a bounded, program-scoped people page for Programme Admins."""
    if actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN:
        raise UnauthorizedFacilityAccess()

    people = User.objects.filter(program_id=actor.program_id).exclude(id=actor.id).order_by("first_name", "last_name", "email")
    if search.strip():
        term = search.strip()
        people = people.filter(Q(first_name__icontains=term) | Q(last_name__icontains=term) | Q(email__icontains=term))
    if role == "staff":
        people = people.filter(role__in=[Role.PROGRAM_ADMIN, Role.COORDINATOR, Role.NURSE_MANAGER])
    elif role:
        people = people.filter(role=role)
    if status:
        people = people.filter(status=status)

    paginator = Paginator(people, page_size)
    current = paginator.get_page(page)
    from apps.analytics.scope_directory import people_scope_directory
    scopes = people_scope_directory(people=list(current.object_list), program_id=actor.program_id)
    return {
        "results": [{
            "id": str(person.id),
            "name": person.full_name,
            "email": person.email,
            "role": person.role,
            "status": person.status,
            "phone": person.phone,
            "registration_number": person.registration_number,
            "created_at": person.created_at,
            "last_active": person.last_login,
            "scope": scopes[str(person.id)]["scope_name"],
            "scope_type": scopes[str(person.id)]["scope_type"],
            "institution_id": str(person.institution_id) if person.institution_id else None,
            "facility_id": str(person.facility_id) if person.facility_id else None,
            "can_reissue_invitation": person.status == Status.INVITED or (
                person.status == Status.DEACTIVATED and not person.has_usable_password()
            ),
        } for person in current.object_list],
        "pagination": {
            "page": current.number,
            "page_size": page_size,
            "total_count": paginator.count,
            "total_pages": paginator.num_pages,
            "has_next": current.has_next(),
            "has_previous": current.has_previous(),
        },
    }


def facility_mentors(*, actor: User, page: int, page_size: int, search: str = "", status: str = "") -> dict:
    """Return the operational mentor register for the acting Nurse Manager."""
    if actor.status != Status.ACTIVE or actor.role != Role.NURSE_MANAGER or not actor.facility_id:
        raise UnauthorizedFacilityAccess()
    mentors = User.objects.filter(
        program_id=actor.program_id, facility_id=actor.facility_id, role=Role.MENTOR,
    ).annotate(active_placements=Count("mentor_assignments__placement", filter=Q(mentor_assignments__ended_at=None)))
    if search.strip():
        term = search.strip()
        mentors = mentors.filter(Q(first_name__icontains=term) | Q(last_name__icontains=term) | Q(email__icontains=term))
    if status:
        mentors = mentors.filter(status=status)
    paginator = Paginator(mentors.order_by("first_name", "last_name", "email"), page_size)
    current = paginator.get_page(page)
    return {"results": [{
        "id": str(person.id), "name": person.full_name, "email": person.email,
        "phone": person.phone, "status": person.status, "created_at": person.created_at,
        "active_placements": person.active_placements,
        "accepting_students": person.accepting_students,
        "max_active_placements": person.max_active_placements,
    } for person in current.object_list], "pagination": {
        "page": current.number, "page_size": page_size, "total_count": paginator.count,
        "total_pages": paginator.num_pages, "has_next": current.has_next(), "has_previous": current.has_previous(),
    }}


def program_summary(*, actor: User) -> dict:
    """Return lightweight counts for the Programme Admin overview."""
    if actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN:
        raise UnauthorizedFacilityAccess()
    people = User.objects.filter(program_id=actor.program_id).exclude(id=actor.id)
    from apps.facilities.models import Facility, Ward
    from apps.placements.models import Placement, WardAssignment
    institutions_count = actor.program.institutions.filter(archived_at=None).count()
    facilities_count = Facility.objects.filter(program_id=actor.program_id, archived_at=None).count()
    wards_count = Ward.objects.filter(facility__program_id=actor.program_id, archived_at=None).count()
    placements = Placement.objects.filter(
        institution__program_id=actor.program_id,
        state__in=[
            "draft", "scheduled", "awaiting_student", "orientation",
            "induction", "active", "paused",
        ],
    )
    active_ward = WardAssignment.objects.filter(placement_id=OuterRef("pk"), ended_at=None)
    placements = placements.annotate(has_active_ward=Exists(active_ward))
    missing_setup = placements.filter(Q(facility=None) | Q(has_active_ward=False)).count()
    unassigned = placements.filter(state__in=["draft", "scheduled", "awaiting_student"], has_active_ward=False).count()
    counts = people.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(status=Status.ACTIVE)),
        invited=Count("id", filter=Q(status=Status.INVITED)),
        suspended=Count("id", filter=Q(status=Status.SUSPENDED)),
        students=Count("id", filter=Q(role=Role.STUDENT, status=Status.ACTIVE)),
        mentors=Count("id", filter=Q(role=Role.MENTOR, status=Status.ACTIVE)),
        staff=Count("id", filter=Q(role__in=[Role.PROGRAM_ADMIN, Role.COORDINATOR, Role.NURSE_MANAGER], status=Status.ACTIVE)),
        active_coordinators=Count("id", filter=Q(role=Role.COORDINATOR, status=Status.ACTIVE)),
        active_nurse_managers=Count("id", filter=Q(role=Role.NURSE_MANAGER, status=Status.ACTIVE)),
        invited_coordinators=Count("id", filter=Q(role=Role.COORDINATOR, status=Status.INVITED)),
        invited_nurse_managers=Count("id", filter=Q(role=Role.NURSE_MANAGER, status=Status.INVITED)),
    )
    return {
        "people_total": counts["total"],
        "active_people": counts["active"],
        "invited_people": counts["invited"],
        "suspended_people": counts["suspended"],
        "students": counts["students"],
        "mentors": counts["mentors"],
        "programme_staff": counts["staff"],
        "activity_events": core.audit_count(scope={"program_id": actor.program_id}),
        "readiness": {
            "institutions": institutions_count,
            "facilities": facilities_count,
            "wards": wards_count,
            "active_coordinators": counts["active_coordinators"],
            "active_nurse_managers": counts["active_nurse_managers"],
            "invited_coordinators": counts["invited_coordinators"],
            "invited_nurse_managers": counts["invited_nurse_managers"],
            "unassigned_placements": unassigned,
            "placements_missing_setup": missing_setup,
        },
    }
