"""Public surface of mentorship (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.mentorship.models import Session


def session_count(placement_id: UUID) -> int:
    return Session.objects.filter(placement_id=placement_id).count()
