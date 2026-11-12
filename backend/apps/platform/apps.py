from django.apps import AppConfig


class PlatformConfig(AppConfig):
    name = "apps.platform"
    label = "platform_admin"
    verbose_name = "Platform administration"

    def ready(self):
        # A programme administrator's own data request is filed in the platform Messages inbox (identity port).
        from apps.identity import ports
        from apps.platform import data_requests

        ports.register_data_request_escalation(data_requests.send, data_requests.status)
