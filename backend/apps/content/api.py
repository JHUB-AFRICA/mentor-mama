"""Public content queries used by other modules."""

from django.db.models import Q

from apps.content.models import ContentItem


def _readable(user):
    """Published items for the user's role and, when limited to facilities, the user's facility."""
    scope = Q(facility_ids=[])
    if user.facility_id:
        scope |= Q(facility_ids__contains=[str(user.facility_id)])
    return ContentItem.objects.filter(
        program_id=user.program_id, is_published=True, archived_at=None, visible_roles__contains=[user.role]
    ).filter(scope)


def knowledge_documents(user) -> list[dict]:
    """Published library items this user may read, as plain dicts for grounded assistants."""
    return [
        {"kind": "Library", "title": item.title, "text": "\n".join(part for part in (item.summary, item.search_text) if part)}
        for item in _readable(user)
        if item.summary or item.search_text
    ]


def catalogue(user, limit: int = 25) -> list[dict]:
    """Titles of published library items this user may open (no bodies)."""
    items = _readable(user).order_by("title")[:limit]
    return [
        {"title": item.title, "kind": item.get_content_type_display(),
         "category": item.get_category_display(), "summary": (item.summary or "")[:140]}
        for item in items
    ]


def programme_catalogue(user, limit: int = 40) -> list[dict]:
    """Every library item in the programme with audience and status (for content managers)."""
    items = ContentItem.objects.filter(program_id=user.program_id).order_by("title")[:limit]
    return [
        {"title": item.title, "kind": item.get_content_type_display(), "category": item.get_category_display(),
         "audience": list(item.visible_roles),
         "status": "archived" if item.archived_at else ("published" if item.is_published else "draft"),
         "summary": (item.summary or "")[:140]}
        for item in items
    ]


def programme_knowledge_documents(user) -> list[dict]:
    """Every published, unarchived library item in the programme (content managers may read all of them)."""
    items = ContentItem.objects.filter(program_id=user.program_id, is_published=True, archived_at=None)
    return [
        {"kind": "Library", "title": item.title, "text": "\n".join(part for part in (item.summary, item.search_text) if part)}
        for item in items
        if item.summary or item.search_text
    ]

