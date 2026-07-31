"""Shape and field-level validation only. No cross-record rules (§2.1)."""

from rest_framework import serializers

from apps.placements.models import Placement


class PlacementSerializer(serializers.ModelSerializer):
    active_mentor_id = serializers.SerializerMethodField()

    class Meta:
        model = Placement
        fields = [
            "id", "cohort_id", "institution_id", "facility_id", "state",
            "planned_start", "planned_end", "actual_start", "actual_end",
            "withdrawal_reason", "completed_at", "version", "active_mentor_id",
        ]

    def get_active_mentor_id(self, obj):
        assignment = obj.mentor_assignments.filter(ended_at=None).values("mentor_id").first()
        return str(assignment["mentor_id"]) if assignment else None


class CreatePlacementSerializer(serializers.Serializer):
    cohort_id = serializers.UUIDField()
    student_id = serializers.UUIDField()
    planned_start = serializers.DateField()
    planned_end = serializers.DateField()


class MentorSerializer(serializers.Serializer):
    mentor_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class WardSerializer(serializers.Serializer):
    ward_id = serializers.UUIDField()


class PauseSerializer(serializers.Serializer):
    reason = serializers.CharField()
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class TransitionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
