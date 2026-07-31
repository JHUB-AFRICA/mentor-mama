from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    name = "apps.assessments"
    label = "assessments"

    def ready(self):
        # Registered here, not imported by placements: the dependency points
        # downward (ADR 0003). Imports are function-local because the app
        # registry is not populated at module import time (§6 of the rules).
        from apps.assessments.blockers import MissingFinalAssessmentBlocker
        from apps.placements import api as placements

        placements.register_completion_blocker(MissingFinalAssessmentBlocker())
