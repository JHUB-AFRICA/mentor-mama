"""Shape and field-level validation only. No cross-record rules (§2.1)."""

from rest_framework import serializers

from apps.placements.models import (
    PauseReason, Placement, PlacementAcknowledgement, PlacementNote, WithdrawalReason,
)


class PlacementAcknowledgementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlacementAcknowledgement
        fields = ["signed_name", "signed_at"]
        read_only_fields = fields


class ConfirmPlacementSerializer(serializers.Serializer):
    signed_name = serializers.CharField(min_length=2, max_length=240, trim_whitespace=True)


class PlacementNoteSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source="author.full_name", read_only=True)

    class Meta:
        model = PlacementNote
        fields = ["id", "body", "author", "created_at"]


class CreatePlacementNoteSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1, max_length=2000, trim_whitespace=True)


class CreateProgrammeWardSerializer(serializers.Serializer):
    facility_id = serializers.UUIDField()
    name = serializers.CharField(max_length=200, min_length=2, trim_whitespace=True)
    shift_pattern = serializers.CharField(max_length=120, required=False, allow_blank=True)
    max_students = serializers.IntegerField(min_value=1)


class UpdateProgrammeWardSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, min_length=2, required=False, trim_whitespace=True)
    shift_pattern = serializers.CharField(max_length=120, required=False, allow_blank=True)
    max_students = serializers.IntegerField(min_value=1, required=False)
    archived = serializers.BooleanField(required=False)


class PlacementSerializer(serializers.ModelSerializer):
    active_mentor_id = serializers.SerializerMethodField()
    cohort_name = serializers.CharField(source="cohort.name", read_only=True)
    institution_name = serializers.CharField(source="cohort.institution.name", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True, allow_null=True)
    requested_facility_name = serializers.CharField(source="requested_facility.name", read_only=True, allow_null=True)
    student = serializers.SerializerMethodField()
    mentor = serializers.SerializerMethodField()
    ward = serializers.SerializerMethodField()

    class Meta:
        model = Placement
        fields = [
            "id", "cohort_id", "cohort_name", "institution_id", "institution_name", "facility_id", "facility_name",
            "requested_facility_id", "requested_facility_name", "state",
            "planned_start", "planned_end", "actual_start", "actual_end",
            "withdrawal_reason", "completed_at", "archived_at", "version", "active_mentor_id", "student", "mentor", "ward",
        ]

    def get_active_mentor_id(self, obj):
        assignment = obj.mentor_assignments.filter(ended_at=None).values("mentor_id").first()
        return str(assignment["mentor_id"]) if assignment else None

    def get_student(self, obj):
        assignment = obj.student_assignments.filter(ended_at=None).select_related("student").first()
        return {"id": str(assignment.student_id), "name": assignment.student.full_name, "email": assignment.student.email, "registration_number": assignment.student.registration_number} if assignment else None

    def get_mentor(self, obj):
        assignment = obj.mentor_assignments.filter(ended_at=None).select_related("mentor").first()
        return {"id": str(assignment.mentor_id), "name": assignment.mentor.full_name, "email": assignment.mentor.email} if assignment else None

    def get_ward(self, obj):
        assignment = obj.ward_assignments.filter(ended_at=None).select_related("ward").first()
        if not assignment:
            return None
        occupied = assignment.ward.ward_assignments.filter(ended_at=None, placement__state__in=["orientation", "induction", "active", "paused"]).count()
        return {"id": str(assignment.ward_id), "name": assignment.ward.name, "capacity": assignment.ward.max_students, "occupied": occupied}


class CreatePlacementSerializer(serializers.Serializer):
    cohort_id = serializers.UUIDField()
    student_id = serializers.UUIDField()
    planned_start = serializers.DateField()
    planned_end = serializers.DateField()

    def validate(self, attrs):
        if attrs["planned_end"] <= attrs["planned_start"]:
            raise serializers.ValidationError("Planned end must be after planned start.")
        return attrs


class BulkCreatePlacementsSerializer(serializers.Serializer):
    cohort_id = serializers.UUIDField()
    student_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=[], max_length=500)
    all_eligible = serializers.BooleanField(required=False, default=False)
    planned_start = serializers.DateField()
    planned_end = serializers.DateField()

    def validate(self, attrs):
        student_ids = attrs["student_ids"]
        if not student_ids and not attrs["all_eligible"]:
            raise serializers.ValidationError("Select at least one student.")
        if student_ids and attrs["all_eligible"]:
            raise serializers.ValidationError("Choose specific students or all eligible students, not both.")
        if len(set(student_ids)) != len(student_ids):
            raise serializers.ValidationError("Each student can only be selected once.")
        if attrs["planned_end"] <= attrs["planned_start"]:
            raise serializers.ValidationError("Planned end must be after planned start.")
        return attrs


class PlacementEligibilityQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100, default=25)
    search = serializers.CharField(max_length=120, required=False, allow_blank=True)
    planned_start = serializers.DateField(required=False)
    planned_end = serializers.DateField(required=False)

    def validate(self, attrs):
        if bool(attrs.get("planned_start")) != bool(attrs.get("planned_end")):
            raise serializers.ValidationError("Provide both planned dates to check date-aware eligibility.")
        if attrs.get("planned_start") and attrs["planned_end"] <= attrs["planned_start"]:
            raise serializers.ValidationError("Planned end must be after planned start.")
        return attrs


class MentorSerializer(serializers.Serializer):
    mentor_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class WardSerializer(serializers.Serializer):
    ward_id = serializers.UUIDField()


class PauseSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=PauseReason.choices)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class TransitionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class WithdrawalSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=WithdrawalReason.choices)


class OverrideArrangementSerializer(serializers.Serializer):
    ward_id = serializers.UUIDField(required=False)
    mentor_id = serializers.UUIDField(required=False)
    reason = serializers.CharField(min_length=5, max_length=500)

    def validate(self, attrs):
        if not attrs.get("ward_id") and not attrs.get("mentor_id"):
            raise serializers.ValidationError("Choose a ward, a mentor, or both.")
        return attrs


class AutoArrangeSerializer(serializers.Serializer):
    facility_id = serializers.UUIDField(required=False)
    placement_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=False, max_length=500)
    strategy = serializers.ChoiceField(choices=["balanced", "fill"], default="balanced")
    seed = serializers.RegexField(r"^[a-zA-Z0-9]{4,40}$", required=False, allow_blank=True)
    assign_mentors = serializers.BooleanField(required=False, default=True)
    expected_plan_hash = serializers.RegexField(r"^[a-f0-9]{64}$", required=False, allow_blank=True)
    preview = serializers.BooleanField(required=False, default=False)


class FacilityRequestSerializer(serializers.Serializer):
    placement_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=500)
    facility_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=20)
    mode = serializers.ChoiceField(choices=["capacity", "even"], default="capacity")
    seed = serializers.RegexField(r"^[a-zA-Z0-9]{4,40}$", required=False, allow_blank=True)
    preview = serializers.BooleanField(required=False, default=False)
