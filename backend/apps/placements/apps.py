from django.apps import AppConfig


class PlacementsConfig(AppConfig):
    name = "apps.placements"
    label = "placements"

    def ready(self):
        from apps.identity import ports
        from apps.placements import orphans

        ports.on_status_changed(orphans._on_status_changed)
