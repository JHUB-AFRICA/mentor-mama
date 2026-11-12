"""Transport validation for identity API requests."""

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.identity.models import Role, Status


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)
    # Which sign-in page was used. Platform administrators sign in only at /platform, everyone else only at the
    # workspace sign-in, so a stolen workspace password page can never be used against the operator account.
    portal = serializers.ChoiceField(choices=["workspace", "platform"], default="workspace", required=False)


class InviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=120)
    last_name = serializers.CharField(max_length=120)
    role = serializers.ChoiceField(choices=Role.choices)
    institution_id = serializers.UUIDField(required=False, allow_null=True)
    facility_id = serializers.UUIDField(required=False, allow_null=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    registration_number = serializers.CharField(max_length=64, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs.get("role") == Role.STUDENT and not attrs.get("registration_number", "").strip():
            raise serializers.ValidationError({"registration_number": "A student registration number is required."})
        if attrs.get("registration_number"):
            attrs["registration_number"] = attrs["registration_number"].strip().upper()
        return attrs


class BulkInviteRowSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=120)
    last_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    registration_number = serializers.CharField(max_length=64, required=False, allow_blank=True)


class BulkStudentInviteRowSerializer(BulkInviteRowSerializer):
    registration_number = serializers.CharField(max_length=64)


class BulkStudentInviteSerializer(serializers.Serializer):
    rows = BulkStudentInviteRowSerializer(many=True, allow_empty=False, max_length=500)
    dry_run = serializers.BooleanField(default=True)


class BulkInviteSerializer(serializers.Serializer):
    rows = BulkInviteRowSerializer(many=True, allow_empty=False, max_length=500)
    dry_run = serializers.BooleanField(default=True)


class PeopleQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=50, default=20)
    search = serializers.CharField(max_length=120, required=False, allow_blank=True)
    role = serializers.CharField(max_length=32, required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=Status.choices, required=False)

    def validate_role(self, value):
        allowed = {choice[0] for choice in Role.choices} | {"staff"}
        if value and value not in allowed:
            raise serializers.ValidationError("Unsupported people role filter.")
        return value


class FacilityMentorQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=50, default=20)
    search = serializers.CharField(max_length=120, required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=Status.choices, required=False)


class FacilityMentorUpdateSerializer(serializers.Serializer):
    accepting_students = serializers.BooleanField(required=False)
    max_active_placements = serializers.IntegerField(min_value=1, max_value=50, required=False)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide at least one mentor operation setting.")
        if set(attrs) == {"reason"}:
            raise serializers.ValidationError("Provide an availability or capacity change.")
        return attrs


class ActivityQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=50, default=20)
    actor_id = serializers.UUIDField(required=False)
    student_id = serializers.UUIDField(required=False)
    cohort_id = serializers.UUIDField(required=False)
    placement_id = serializers.UUIDField(required=False)
    action = serializers.CharField(max_length=64, required=False, allow_blank=True)
    category = serializers.CharField(max_length=32, required=False, allow_blank=True)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        if attrs.get("date_from") and attrs.get("date_to") and attrs["date_to"] < attrs["date_from"]:
            raise serializers.ValidationError("Activity end date must be on or after the start date.")
        return attrs


class ProgrammeSettingsSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, min_length=2)
    short_name = serializers.CharField(max_length=40, required=False, allow_blank=True)
    description = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    academic_year = serializers.CharField(max_length=20, required=False, allow_blank=True)
    owner_id = serializers.UUIDField(required=True, allow_null=False)
    require_mentor_training_before_placement = serializers.BooleanField(required=False)


class PasswordSerializer(serializers.Serializer):
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value


class ActivateSerializer(PasswordSerializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class EmailVerificationSerializer(serializers.Serializer):
    code = serializers.RegexField(regex=r"^\d{6}$")


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(PasswordSerializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_new_password(self, value):
        # The account's own name and email count, so "Mentormama2026" is refused for admin@mentormama...
        validate_password(value, user=self.context.get("user"))
        return value

    def validate(self, attrs):
        if attrs["new_password"] == attrs["current_password"]:
            raise serializers.ValidationError({"new_password": "Choose a password different from your current one."})
        return attrs


class ProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=120)
    last_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)


class MFARecoveryRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, min_length=5, trim_whitespace=True)


class MFACodeSerializer(serializers.Serializer):
    # Authenticator codes have six digits; generated backup codes have eight.
    code = serializers.RegexField(regex=r"^(?:\d{6}|\d{8})$")


class SessionRevokeSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()


class AccountStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["active", "suspended", "deactivated"])
    reason = serializers.CharField(max_length=500, min_length=5, trim_whitespace=True)


class AccountAccessSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices)
    institution_id = serializers.UUIDField(required=False, allow_null=True)
    facility_id = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(max_length=500, min_length=5, trim_whitespace=True)


class MFARecoverySerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, min_length=5, trim_whitespace=True)


class MFARecoveryDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["recover", "close"])
    reason = serializers.CharField(max_length=500, min_length=5, trim_whitespace=True)


class MentorProfileSerializer(serializers.Serializer):
    cadre = serializers.CharField(max_length=120, required=False, allow_blank=True)
    department = serializers.CharField(max_length=120, required=False, allow_blank=True)
    years_of_practice = serializers.IntegerField(min_value=0, max_value=70, required=False, allow_null=True)
    mentorship_experience_years = serializers.IntegerField(min_value=0, max_value=70, required=False, allow_null=True)
    cpd_identifier = serializers.CharField(max_length=64, required=False, allow_blank=True)
    digital_literacy = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
