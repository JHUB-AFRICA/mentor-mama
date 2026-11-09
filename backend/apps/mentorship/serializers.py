from rest_framework import serializers

from apps.mentorship.models import Session, SessionType


class SessionSerializer(serializers.ModelSerializer):
    topics = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = ["id", "batch", "placement_id", "session_date", "session_type", "duration_minutes",
                  "what_was_covered", "feedback_given", "follow_up_action", "submitted_at", "topics"]

    def get_topics(self, obj):
        return [t.topic for t in obj.topics.all()]


class LogSessionSerializer(serializers.Serializer):
    session_date = serializers.DateField()
    session_type = serializers.ChoiceField(choices=SessionType.values)
    topics = serializers.ListField(child=serializers.CharField(max_length=60, trim_whitespace=True), allow_empty=False)
    duration_minutes = serializers.IntegerField(required=False, allow_null=True, default=None)
    what_was_covered = serializers.CharField(required=True, allow_blank=False, allow_null=False)
    feedback_given = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    follow_up_action = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_topics(self, value):
        normalized = list(dict.fromkeys(topic.strip() for topic in value if topic.strip()))
        if not normalized:
            raise serializers.ValidationError("At least one topic is required.")
        return normalized


class LogSessionBatchSerializer(LogSessionSerializer):
    placement_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1, max_length=100,
    )

    def validate_placement_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Choose each student only once.")
        return value
