from rest_framework import serializers
from apps.core.validators import validate_partner_logo


class InstitutionSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, min_length=2)
    type = serializers.CharField(max_length=60, required=False, allow_blank=True)
    county = serializers.CharField(max_length=60, required=False, allow_blank=True)
    contact_person = serializers.CharField(max_length=120, required=False, allow_blank=True)
    contact_email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    contact_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    logo = serializers.ImageField(required=False, allow_null=True, validators=[validate_partner_logo])


class InstitutionUpdateSerializer(InstitutionSerializer):
    name = serializers.CharField(max_length=200, min_length=2, required=False)
    archived = serializers.BooleanField(required=False)
    clear_logo = serializers.BooleanField(required=False, write_only=True)


class CohortSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, min_length=2)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    planned_capacity = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["start_date"] >= attrs["end_date"]:
            raise serializers.ValidationError({"end_date": "The end date must be after the start date."})
        return attrs


class CohortUpdateSerializer(CohortSerializer):
    name = serializers.CharField(max_length=200, min_length=2, required=False)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        start = attrs.get("start_date")
        end = attrs.get("end_date")
        if start and end and start >= end:
            raise serializers.ValidationError({"end_date": "The end date must be after the start date."})
        return attrs


class CohortEnrolmentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()


class CohortBulkEnrolmentSerializer(serializers.Serializer):
    student_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=100)

    def validate_student_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Choose each student once.")
        return value


class CohortMembershipRemovalSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    reason = serializers.CharField(max_length=300, min_length=5, trim_whitespace=True)


class InstitutionStudentQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=50, default=20)
    search = serializers.CharField(max_length=120, required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=["invited", "active", "suspended", "deactivated"], required=False, allow_blank=True)
    cohort_status = serializers.ChoiceField(choices=["assigned", "unassigned"], required=False, allow_blank=True)


class StudentProfileSerializer(serializers.Serializer):
    course_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    year_of_study = serializers.IntegerField(min_value=1, max_value=20, required=False, allow_null=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    emergency_contact_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    emergency_contact_relationship = serializers.CharField(max_length=80, required=False, allow_blank=True)
