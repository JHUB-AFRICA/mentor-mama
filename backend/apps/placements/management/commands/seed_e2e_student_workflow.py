"""Create a deterministic local placement awaiting student confirmation."""

import datetime as dt

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal.auth import TOTP

from apps.assessments.models import Assessment, FeedbackConfidential
from apps.assessments.models import FeedbackAnonymous
from apps.facilities.models import Facility, Ward
from apps.identity.models import Role, Status, User
from apps.induction.models import Checklist, ItemResponse, OrientationAcknowledgement
from apps.institutions.models import Cohort, CohortMembership, Institution
from apps.mentorship.models import Session
from apps.safeguarding.models import Escalation
from apps.placements import services
from apps.placements.models import MentorAssignment, Placement, StudentAssignment, State, WardAssignment


class Command(BaseCommand):
    help = "Create a development-only placement for the student confirmation journey."

    def add_arguments(self, parser):
        parser.add_argument("--password", required=True, help="Local student test-account password.")
        parser.add_argument("--reset", action="store_true", help="Reset the fixture placement first.")

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("This command is available only when DEBUG is enabled.")
        admin = User.objects.filter(email="e2e-admin@mentormama.test", role=Role.PROGRAM_ADMIN, status=Status.ACTIVE).first()
        if admin is None:
            raise CommandError("Create the local e2e programme-admin account first.")
        program = admin.program
        institution, _ = Institution.objects.get_or_create(program=program, name="E2E Student Workflow School")
        facility, _ = Facility.objects.get_or_create(program=program, name="E2E Student Workflow Hospital")
        ward, _ = Ward.objects.get_or_create(facility=facility, name="E2E Student Workflow Ward", defaults={"max_students": 4})
        cohort, _ = Cohort.objects.get_or_create(
            institution=institution,
            name="E2E Student Workflow Cohort",
            defaults={"start_date": dt.date.today(), "end_date": dt.date.today() + dt.timedelta(days=60), "planned_capacity": 4},
        )
        coordinator, _ = User.objects.get_or_create(
            email="e2e-student-workflow-coordinator@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Coordinator", "role": Role.COORDINATOR, "status": Status.ACTIVE, "program": program, "institution_id": institution.id},
        )
        mentor, _ = User.objects.get_or_create(
            email="e2e-student-workflow-mentor@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Mentor", "role": Role.MENTOR, "status": Status.ACTIVE, "program": program, "facility_id": facility.id},
        )
        manager, _ = User.objects.get_or_create(
            email="e2e-student-workflow-manager@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Manager", "role": Role.NURSE_MANAGER, "status": Status.ACTIVE, "program": program, "facility_id": facility.id},
        )
        student, _ = User.objects.get_or_create(
            email="e2e-student-workflow-student@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Confirmation Student", "role": Role.STUDENT, "status": Status.ACTIVE, "program": program, "institution_id": institution.id, "registration_number": "E2E-2026-003"},
        )
        for user, role, institution_id, facility_id in ((coordinator, Role.COORDINATOR, institution.id, None), (manager, Role.NURSE_MANAGER, None, facility.id), (mentor, Role.MENTOR, None, facility.id), (student, Role.STUDENT, institution.id, None)):
            user.role, user.status, user.program_id = role, Status.ACTIVE, program.id
            user.institution_id, user.facility_id = institution_id, facility_id
            if user is student:
                user.registration_number = "E2E-2026-003"
            # All four local workflow accounts share the explicitly supplied
            # test password; this command is DEBUG-only and never runs in prod.
            user.set_password(options["password"])
            user.save()
        CohortMembership.objects.get_or_create(cohort=cohort, student=student)
        if options["reset"]:
            Authenticator.objects.filter(user=manager).delete()
            TOTP.activate(manager, "JBSWY3DPEHPK3PXP")
            ItemResponse.objects.filter(checklist__placement__cohort=cohort).delete()
            Checklist.objects.filter(placement__cohort=cohort).delete()
            OrientationAcknowledgement.objects.filter(placement__cohort=cohort).delete()
            Session.objects.filter(placement__cohort=cohort).delete()
            Assessment.objects.filter(placement__cohort=cohort).delete()
            FeedbackConfidential.objects.filter(placement__cohort=cohort).delete()
            FeedbackAnonymous.objects.filter(cohort=cohort).delete()
            Escalation.objects.filter(placement__cohort=cohort).delete()
            MentorAssignment.objects.filter(placement__cohort=cohort).delete()
            StudentAssignment.objects.filter(placement__cohort=cohort).delete()
            WardAssignment.objects.filter(placement__cohort=cohort).delete()
            Placement.objects.filter(cohort=cohort).delete()
        placement = (
            Placement.objects.filter(cohort=cohort, state=State.AWAITING_STUDENT)
            .filter(student_assignments__student=student, student_assignments__ended_at=None)
            .order_by("-created_at")
            .first()
        )
        if placement is None:
            placement = services.create_placement(services.CreatePlacement(cohort_id=cohort.id, student_id=student.id, planned_start=dt.date.today(), planned_end=dt.date.today() + dt.timedelta(days=30)), actor=coordinator)
            services.allocate_ward(placement.id, ward.id, actor=manager)
            services.assign_mentor(placement.id, mentor.id, actor=manager)
            services.transition(placement.id, State.AWAITING_STUDENT, actor=coordinator)
        self.stdout.write(self.style.SUCCESS(f"Student E2E workflow ready: {placement.id}"))
