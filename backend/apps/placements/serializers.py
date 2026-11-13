"""Shape and field-level validation only. No cross-record rules (§2.1)."""

from django.db.models import Count, prefetch_related_objects
from rest_framework import serializers

from apps.placements.models import (
    MentorAssignment, PauseReason, Placement, PlacementAcknowledgement, PlacementNote, StudentAssignment, WardAssignment, WithdrawalReason,
)

_OCCUPYING_STATES = ["orientation", "induction", "active", "paused"]


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


class PlacementListSerializer(serializers.ListSerializer):
    """Serialise many placements with a fixed number of queries (the single-row form issues several per placement).

    The output is identical to serialising each placement alone; only the way related rows are fetched changes.
    """

    def to_representation(self, data):
        items = list(data.all() if hasattr(data, "all") else data)
        ids = [item.id for item in items]
        prefetch_related_objects(items, "cohort__institution", "facility", "requested_facility", "declined_facility")
        wards = {row.placement_id: row for row in WardAssignment.objects.filter(placement_id__in=ids, ended_at=None).select_related("ward")}
        occupied = {
            row["ward_id"]: row["n"] for row in WardAssignment.objects.filter(
                ward_id__in={row.ward_id for row in wards.values()}, ended_at=None, placement__state__in=_OCCUPYING_STATES,
            ).values("ward_id").annotate(n=Count("id"))
        }
        self.child._bulk = {
            "students": {row.placement_id: row for row in StudentAssignment.objects.filter(placement_id__in=ids, ended_at=None).select_related("student")},
            "mentors": {row.placement_id: row for row in MentorAssignment.objects.filter(placement_id__in=ids, ended_at=None).select_related("mentor")},
            "wards": wards, "occupied": occupied,
        }
        try:
            return [self.child.to_representation(item) for item in items]
        finally:
            self.child._bulk = None


class PlacementSerializer(serializers.ModelSerializer):
    _bulk = None
    active_mentor_id = serializers.SerializerMethodField()
    cohort_name = serializers.CharField(source="cohort.name", read_only=True)
    institution_name = serializers.CharField(source="cohort.institution.name", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True, allow_null=True)
    requested_facility_name = serializers.CharField(source="requested_facility.name", read_only=True, allow_null=True)
    declined_facility_name = serializers.CharField(source="declined_facility.name", read_only=True, allow_null=True)
    student = serializers.SerializerMethodField()
    mentor = serializers.SerializerMethodField()
    ward = serializers.SerializerMethodField()

    class Meta:
        model = Placement
        fields = [
            "id", "cohort_id", "cohort_name", "institution_id", "institution_name", "facility_id", "facility_name",
            "requested_facility_id", "requested_facility_name", "declined_facility_name", "decline_reason", "state",
            "planned_start", "planned_end", "actual_start", "actual_end",
            "withdrawal_reason", "completed_at", "archived_at", "version", "active_mentor_id", "student", "mentor", "ward",
        ]
        list_serializer_class = PlacementListSerializer

    def get_active_mentor_id(self, obj):
        if self._bulk is not None:
            assignment = self._bulk["mentors"].get(obj.id)
            return str(assignment.mentor_id) if assignment else None
        assignment = obj.mentor_assignments.filter(ended_at=None).values("mentor_id").first()
        return str(assignment["mentor_id"]) if assignment else None

    def get_student(self, obj):
        assignment = self._bulk["students"].get(obj.id) if self._bulk is not None else obj.student_assignments.filter(ended_at=None).select_related("student").first()
        return {"id": str(assignment.student_id), "name": assignment.student.full_name, "email": assignment.student.email, "registration_number": assignment.student.registration_number} if assignment else None

    def get_mentor(self, obj):
        assignment = self._bulk["mentors"].get(obj.id) if self._bulk is not None else obj.mentor_assignments.filter(ended_at=None).select_related("mentor").first()
        return {"id": str(assignment.mentor_id), "name": assignment.mentor.full_name, "email": assignment.mentor.email} if assignment else None

    def get_ward(self, obj):
        assignment = self._bulk["wards"].get(obj.id) if self._bulk is not None else obj.ward_assignments.filter(ended_at=None).select_related("ward").first()
        if not assignment:
            return None
        if self._bulk is not None:
            occupied = self._bulk["occupied"].get(assignment.ward_id, 0)
        else:
            occupied = assignment.ward.ward_assignments.filter(ended_at=None, placement__state__in=_OCCUPYING_STATES).count()
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


class DeclineRequestSerializer(serializers.Serializer):
    placement_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=500)
    reason = serializers.CharField(min_length=5, max_length=300)


class WithdrawRequestSerializer(serializers.Serializer):
    placement_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=500)


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
    # What "room" means when sharing students: ward places only, or ward places capped by the mentor places left.
    basis = serializers.ChoiceField(choices=["wards", "wards_and_mentors"], default="wards")
    # Also subtract students already requested (by anyone) and not yet arranged.
    net_of_pending = serializers.BooleanField(required=False, default=False)
    seed = serializers.RegexField(r"^[a-zA-Z0-9]{4,40}$", required=False, allow_blank=True)
    expected_plan_hash = serializers.RegexField(r"^[a-f0-9]{64}$", required=False, allow_blank=True)
    preview = serializers.BooleanField(required=False, default=False)


class ReleasePlacementsSerializer(serializers.Serializer):
    placement_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=False, max_length=500)
    cohort_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        if not attrs.get("placement_ids") and not attrs.get("cohort_id"):
            raise serializers.ValidationError("Choose the students to release, or a cohort.")
        return attrs


class PlanningStudentsQuerySerializer(serializers.Serializer):
    status = serializers.CharField(required=False, allow_blank=True, max_length=300)
    search = serializers.CharField(required=False, allow_blank=True, max_length=120)
    facility_id = serializers.UUIDField(required=False)
    ward_id = serializers.UUIDField(required=False)
    ready = serializers.BooleanField(required=False, allow_null=True, default=None)
    needs_attention = serializers.BooleanField(required=False, allow_null=True, default=None)
    sort = serializers.ChoiceField(choices=["name", "registration_number", "status", "start", "facility", "ward", "mentor"], default="status")
    order = serializers.ChoiceField(choices=["asc", "desc"], default="asc")
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100, default=50)
    ids_only = serializers.BooleanField(required=False, default=False)
    institution_id = serializers.UUIDField(required=False)


class RunDetailQuerySerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=["placed", "unplaced", "requested"], required=False)
    search = serializers.CharField(required=False, allow_blank=True, max_length=120)
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=200, default=100)
