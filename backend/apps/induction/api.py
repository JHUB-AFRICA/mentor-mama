"""Public surface of induction (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.induction.models import Checklist, ItemResponse, OrientationAcknowledgement, TemplateItem


def is_complete(placement_id: UUID) -> bool:
    return Checklist.objects.filter(placement_id=placement_id, completed_at__isnull=False).exists()


def orientation_acknowledged(placement_id: UUID) -> bool:
    return OrientationAcknowledgement.objects.filter(placement_id=placement_id).exists()


def progress(placement_id: UUID) -> dict:
    """Return safe induction progress; checklist comments never cross this API."""
    checklist = Checklist.objects.filter(placement_id=placement_id).first()
    if checklist is None:
        return {"available": False, "completed": 0, "total": 0, "percentage": None}

    required = TemplateItem.objects.filter(template_id=checklist.template_id, is_required=True)
    total = required.count()
    completed = ItemResponse.objects.filter(
        checklist_id=checklist.id,
        template_item__is_required=True,
    ).count()
    return {
        "available": True,
        "completed": completed,
        "total": total,
        "percentage": round(completed * 100 / total) if total else 100,
    }
