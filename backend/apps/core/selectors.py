"""Read-only platform queries shared by authenticated workspace views."""

from django.core.paginator import Paginator
from django.db.models import Q

from apps.core.errors import UnauthorizedFacilityAccess
from apps.core.models import AuditEntry


def program_activity(*, actor, page: int, page_size: int, actor_id=None, student_id=None, cohort_id=None,
                     placement_id=None, action="", date_from=None, date_to=None) -> dict:
    if actor.status != "active" or actor.role not in {"program_admin", "coordinator", "nurse_manager"}:
        raise UnauthorizedFacilityAccess()

    entries = AuditEntry.objects.filter(scope__program_id=str(actor.program_id))
    if actor.role == "coordinator":
        entries = entries.filter(scope__institution_id=str(actor.institution_id))
    elif actor.role == "nurse_manager":
        entries = entries.filter(scope__facility_id=str(actor.facility_id))
    if actor_id:
        entries = entries.filter(actor_id=actor_id)
    if student_id:
        entries = entries.filter(Q(entity_id=student_id) | Q(changes__student_id=str(student_id)))
    if cohort_id:
        entries = entries.filter(Q(entity_id=cohort_id) | Q(changes__cohort_id=str(cohort_id)))
    if placement_id:
        entries = entries.filter(Q(entity_id=placement_id) | Q(changes__placement_id=str(placement_id)))
    if action:
        entries = entries.filter(action__icontains=action.strip())
    if date_from:
        entries = entries.filter(occurred_at__date__gte=date_from)
    if date_to:
        entries = entries.filter(occurred_at__date__lte=date_to)
    entries = entries.select_related("actor").order_by("-occurred_at")
    paginator = Paginator(entries, page_size)
    current = paginator.get_page(page)
    return {
        "results": [{
            "id": str(entry.id),
            "action": entry.action,
            "actor": entry.actor.full_name,
            "actor_role": entry.actor_role,
            "occurred_at": entry.occurred_at,
            "changes": entry.changes or {},
            "entity_id": str(entry.entity_id),
        } for entry in current.object_list],
        "pagination": {
            "page": current.number,
            "page_size": page_size,
            "total_count": paginator.count,
            "total_pages": paginator.num_pages,
            "has_next": current.has_next(),
            "has_previous": current.has_previous(),
        },
    }
