"""INV-08 as a completion blocker (ADR 0003)."""

from __future__ import annotations

from uuid import UUID

from apps.assessments.models import Assessment, AssessmentKind
from apps.placements.ports import BlockReason


class MissingFinalAssessmentBlocker:
    name = "missing_final_assessment"

    def blocks(self, placement_id: UUID) -> BlockReason | None:
        submitted = Assessment.objects.filter(
            placement_id=placement_id, kind=AssessmentKind.EXIT_SURVEY
        ).exists()
        return None if submitted else BlockReason(code="FinalAssessmentMissing")
