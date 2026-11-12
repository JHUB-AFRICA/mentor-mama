from rest_framework import serializers

from apps.mentorship import followups
from apps.mentorship.models import FollowUpOutcome, Session, SessionType


class SessionSerializer(serializers.ModelSerializer):
    topics = serializers.SerializerMethodField()
    follow_up_status = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = ["id", "batch", "placement_id", "session_date", "session_type", "duration_minutes",
                  "what_was_covered", "feedback_given", "follow_up_action", "follow_up_status",
                  "submitted_at", "topics"]

    def get_topics(self, obj):
        return [t.topic for t in obj.topics.all()]

    def get_follow_up_status(self, obj):
        """pending/done only; never the mentor's note or who resolved it."""
        return followups.status_of(obj)["state"]


class FollowUpResolveSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=280, trim_whitespace=True)
    outcome = serializers.ChoiceField(choices=FollowUpOutcome.values, required=False, default=FollowUpOutcome.DONE)


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


class FollowUpQuerySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=followups.STATUSES, required=False, default="pending")
    action = serializers.CharField(required=False, allow_blank=True, default="", max_length=120)
    placement_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    student_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    min_age_days = serializers.IntegerField(required=False, allow_null=True, default=None, min_value=0, max_value=3650)
    page = serializers.IntegerField(required=False, default=1, min_value=1)
    page_size = serializers.IntegerField(required=False, default=followups.PAGE_SIZE_DEFAULT, min_value=1)
