"""Public surface of assessments (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.assessments.models import Assessment, AssessmentKind


def has_exit_survey(placement_id: UUID) -> bool:
    return Assessment.objects.filter(
        placement_id=placement_id, kind=AssessmentKind.EXIT_SURVEY
    ).exists()
