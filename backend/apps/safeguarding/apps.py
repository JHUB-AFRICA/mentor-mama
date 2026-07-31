from django.apps import AppConfig


class SafeguardingConfig(AppConfig):
    name = "apps.safeguarding"
    label = "safeguarding"

    def ready(self):
        from apps.placements import api as placements
        from apps.safeguarding.blockers import OpenEscalationBlocker

        placements.register_completion_blocker(OpenEscalationBlocker())
