"""Read-only platform queries shared by authenticated workspace views."""

from django.core.paginator import Paginator

from apps.core.errors import UnauthorizedFacilityAccess


def program_activity(*, actor, page: int, page_size: int, actor_id=None, student_id=None, cohort_id=None,
                     placement_id=None, action="", date_from=None, date_to=None, category="") -> dict:
    """The signed-in person's own activity: what they did and what happened to their records.

    Deliberately not a programme-wide audit view. Every role, including staff, sees only activity
    linked to themselves, written in plain language with no codes or identifiers.
    """
    from apps.core import activity_feed

    if actor.status != "active":
        raise UnauthorizedFacilityAccess()
    entries = activity_feed.related_to(actor)
    if date_from:
        entries = entries.filter(occurred_at__date__gte=date_from)
    if date_to:
        entries = entries.filter(occurred_at__date__lte=date_to)
    entries = entries.select_related("actor").order_by("-occurred_at")
    paginator = Paginator(entries, page_size)
    current = paginator.get_page(page)
    results = activity_feed.describe_many(current.object_list, actor)
    if category:
        results = [row for row in results if row["category"] == category]
    return {
        "results": results,
        "pagination": {
            "page": current.number,
            "page_size": page_size,
            "total_count": paginator.count,
            "total_pages": paginator.num_pages,
            "has_next": current.has_next(),
            "has_previous": current.has_previous(),
        },
    }
