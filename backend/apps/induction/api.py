"""Public surface of induction (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.induction.models import Checklist


def is_complete(placement_id: UUID) -> bool:
    return Checklist.objects.filter(placement_id=placement_id, completed_at__isnull=False).exists()
