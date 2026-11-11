from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    name = "apps.notifications"
    label = "notifications"

    def ready(self):
        from anymail.signals import tracking

        from apps.notifications import services

        def on_tracking(sender, event, esp_name, **kwargs):
            services.record_anymail_event(
                event_type=str(event.event_type), message_id=event.message_id or "",
                metadata=event.metadata or {}, event_id=event.event_id or "",
            )

        tracking.connect(on_tracking, dispatch_uid="mentormama-email-tracking")
