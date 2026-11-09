from rest_framework import serializers

from apps.notifications.models import Notification, NotificationPreference


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    security_alerts = serializers.SerializerMethodField()

    class Meta:
        model = NotificationPreference
        fields = (
            "account_activity",
            "programme_updates",
            "placement_updates",
            "weekly_digest",
            "security_alerts",
        )
        read_only_fields = ("security_alerts",)

    def get_security_alerts(self, _instance):
        return True


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "event_type", "template_key", "payload", "status", "provider_status", "read_at", "created_at")
        read_only_fields = fields
