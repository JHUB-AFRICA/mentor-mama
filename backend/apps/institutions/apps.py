from django.apps import AppConfig


class InstitutionsConfig(AppConfig):
    name = "apps.institutions"
    label = "institutions"

    def ready(self):
        from apps.identity import api as identity
        from apps.institutions.api import institution_belongs_to_program

        identity.register_scope_validator("institution", institution_belongs_to_program)
