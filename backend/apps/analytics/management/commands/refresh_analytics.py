from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Refresh disposable analytics materialized views."

    def add_arguments(self, parser):
        parser.add_argument("--projection", choices=("all", "operational", "interruptions", "feedback"), default="all")

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            projection = options["projection"]
            if projection in {"all", "operational"}:
                cursor.execute("REFRESH MATERIALIZED VIEW analytics_facility_indicators")
                cursor.execute("REFRESH MATERIALIZED VIEW analytics_cohort_indicators")
            if projection in {"all", "interruptions"}:
                cursor.execute("REFRESH MATERIALIZED VIEW analytics_interruption_causes")
            if projection in {"all", "feedback"}:
                cursor.execute("REFRESH MATERIALIZED VIEW analytics_feedback_aggregate")
                cursor.execute("REFRESH MATERIALIZED VIEW analytics_anonymous_feedback_aggregate")
        self.stdout.write(self.style.SUCCESS("Analytics projections refreshed."))
