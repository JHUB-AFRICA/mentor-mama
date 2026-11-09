"""Create deterministic local data for the Placement Management browser journey."""

import datetime as dt

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.facilities.models import Facility, Ward
from apps.identity.models import Role, Status, User
from apps.institutions.models import Cohort, CohortMembership, Institution
from apps.placements.models import MentorAssignment, Placement, StudentAssignment, WardAssignment


class Command(BaseCommand):
    help = "Seed resettable development-only data for the placement browser journey."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Remove prior fixture placements first.")

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("This command is available only when DEBUG is enabled.")

        admin = User.objects.filter(
            email="e2e-admin@mentormama.test", role=Role.PROGRAM_ADMIN, status=Status.ACTIVE,
        ).select_related("program").first()
        if not admin:
            raise CommandError("The local e2e-admin@mentormama.test account must exist and be active.")

        program = admin.program
        institution, _ = Institution.objects.get_or_create(
            program=program, name="E2E School of Nursing",
            defaults={"county": "Nairobi", "is_active": True},
        )
        facility, _ = Facility.objects.get_or_create(
            program=program, name="E2E Teaching Hospital",
            defaults={"county": "Nairobi"},
        )
        ward, _ = Ward.objects.get_or_create(
            facility=facility, name="E2E Labour Ward",
            defaults={"max_students": 4},
        )
        cohort, _ = Cohort.objects.get_or_create(
            institution=institution, name="E2E 2026 Placement Cohort",
            defaults={
                "start_date": dt.date(2026, 9, 1),
                "end_date": dt.date(2026, 12, 1),
                "planned_capacity": 20,
            },
        )
        student, _ = User.objects.get_or_create(
            email="e2e-placement-student@mentormama.test",
            defaults={
                "first_name": "E2E Placement",
                "last_name": "Student",
                "role": Role.STUDENT,
                "status": Status.ACTIVE,
                "program": program,
                "institution_id": institution.id,
                "registration_number": "E2E-2026-001",
            },
        )
        student.role = Role.STUDENT
        student.status = Status.ACTIVE
        student.program = program
        student.institution_id = institution.id
        student.registration_number = "E2E-2026-001"
        student.save(update_fields=["role", "status", "program", "institution_id", "registration_number", "updated_at"])
        CohortMembership.objects.get_or_create(cohort=cohort, student=student)

        mentor, _ = User.objects.get_or_create(
            email="e2e-placement-mentor@mentormama.test",
            defaults={
                "first_name": "E2E Clinical",
                "last_name": "Mentor",
                "role": Role.MENTOR,
                "status": Status.ACTIVE,
                "program": program,
                "facility_id": facility.id,
            },
        )
        mentor.role = Role.MENTOR
        mentor.status = Status.ACTIVE
        mentor.program = program
        mentor.facility_id = facility.id
        mentor.save(update_fields=["role", "status", "program", "facility_id", "updated_at"])

        if options["reset"]:
            MentorAssignment.objects.filter(placement__cohort=cohort).delete()
            StudentAssignment.objects.filter(placement__cohort=cohort).delete()
            WardAssignment.objects.filter(placement__cohort=cohort).delete()
            Placement.objects.filter(cohort=cohort).delete()

        self.stdout.write(self.style.SUCCESS(
            "E2E placement fixture ready: E2E 2026 Placement Cohort / E2E Placement Student / E2E Labour Ward."
        ))
