from django.apps import AppConfig


class FacilitiesConfig(AppConfig):
    name = "apps.facilities"
    label = "facilities"

    def ready(self):
        from apps.facilities.api import facility_belongs_to_program
        from apps.identity import api as identity

        identity.register_scope_validator("facility", facility_belongs_to_program)
