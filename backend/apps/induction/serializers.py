from rest_framework import serializers


class ChecklistItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    label = serializers.CharField()
    required = serializers.BooleanField(source="is_required")
    response = serializers.CharField(allow_null=True)
    comment = serializers.CharField(allow_null=True)
    answered_at = serializers.DateTimeField(allow_null=True)
    # Added with the template editor; old templates simply return empty values.
    section = serializers.CharField(allow_blank=True, default="")
    guidance = serializers.CharField(allow_blank=True, default="")
    completed_by_role = serializers.CharField(default="mentor")
    response_kind = serializers.CharField(default="standard")


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


class TemplateItemInputSerializer(serializers.Serializer):
    """Shape only. Content rules (length, duplicates, identifiers) are judged by validate_content."""
    section = serializers.CharField(required=False, allow_blank=True, default="", max_length=400)
    label = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    guidance = serializers.CharField(required=False, allow_blank=True, default="", max_length=4000)
    is_required = serializers.BooleanField(required=False, default=True)
    completed_by_role = serializers.CharField(required=False, default="mentor", max_length=40)
    response_kind = serializers.CharField(required=False, default="standard", max_length=40)


class TemplateDraftSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=True, default="", max_length=500)
    notes = serializers.CharField(required=False, allow_blank=True, default="", max_length=5000)
    items = TemplateItemInputSerializer(many=True, max_length=200)


class CreateTemplateDraftSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["blank", "clone", "enhanced"])
    from_version_id = serializers.UUIDField(required=False, allow_null=True, default=None)
