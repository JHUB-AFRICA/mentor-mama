from rest_framework import serializers


class ChecklistItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    label = serializers.CharField()
    required = serializers.BooleanField(source="is_required")
    response = serializers.CharField(allow_null=True)
    comment = serializers.CharField(allow_null=True)
    answered_at = serializers.DateTimeField(allow_null=True)


class ChecklistSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    placement_id = serializers.UUIDField()
    template_id = serializers.UUIDField()
    completed_at = serializers.DateTimeField(allow_null=True)
    opened_at = serializers.DateTimeField()
    template_version = serializers.IntegerField()
    signed_by = serializers.CharField(allow_null=True)
    items = ChecklistItemSerializer(many=True)


class AnswerItemSerializer(serializers.Serializer):
    response = serializers.ChoiceField(choices=["yes", "no", "not_applicable"])
    comment = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class OpenInductionBatchSerializer(serializers.Serializer):
    placement_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=100)

    def validate_placement_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Choose each student only once.")
        return value


class OrientationAcknowledgementSerializer(serializers.Serializer):
    understands_placement_details = serializers.BooleanField()
    understands_emergency_process = serializers.BooleanField()
    understands_safeguarding = serializers.BooleanField()
    questions = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        required = ("understands_placement_details", "understands_emergency_process", "understands_safeguarding")
        if not all(attrs.get(field) for field in required):
            raise serializers.ValidationError("Confirm each orientation statement before continuing.")
        return attrs
