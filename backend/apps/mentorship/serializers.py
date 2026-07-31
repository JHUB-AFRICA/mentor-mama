from rest_framework import serializers

from apps.mentorship.models import Session


class SessionSerializer(serializers.ModelSerializer):
    topics = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = ["id", "placement_id", "session_date", "session_type", "duration_minutes",
                  "what_was_covered", "feedback_given", "follow_up_action", "submitted_at", "topics"]

    def get_topics(self, obj):
        return [t.topic for t in obj.topics.all()]


class LogSessionSerializer(serializers.Serializer):
    session_date = serializers.DateField()
    session_type = serializers.CharField()
    topics = serializers.ListField(child=serializers.CharField(), allow_empty=True, default=list)
    duration_minutes = serializers.IntegerField(required=False, allow_null=True, default=None)
    what_was_covered = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    feedback_given = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    follow_up_action = serializers.CharField(required=False, allow_blank=True, default="")
