"""Seed one active, local-only mentor placement for the offline E2E journey."""

from __future__ import annotations

import datetime as dt

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.facilities.models import Facility, Ward
from apps.identity.models import Role, Status, User
from apps.induction import services as induction_services
from apps.induction.models import ChecklistTemplate, TemplateItem
from apps.institutions.models import Cohort, CohortMembership, Institution
from apps.placements import services as placement_services
from apps.placements.models import Placement, State


class Command(BaseCommand):
    help = "Create a deterministic active mentor placement for local E2E only."

    def add_arguments(self, parser):
        parser.add_argument("--password", required=True, help="Local mentor test-account password.")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("This command is available only when DEBUG is enabled.")

        password = options["password"]
        program_admin = User.objects.filter(
            email="e2e-admin@mentormama.test", role=Role.PROGRAM_ADMIN, status=Status.ACTIVE,
        ).select_related("program").first()
        if program_admin is None:
            raise CommandError("Create the local e2e programme-admin account before seeding this workflow.")

        program = program_admin.program
        institution, _ = Institution.objects.get_or_create(
            program=program, name="E2E Mentor Workflow School", defaults={"county": "Nairobi"},
        )
        facility, _ = Facility.objects.get_or_create(
            program=program, name="E2E Mentor Workflow Hospital", defaults={"county": "Nairobi"},
        )
        ward, _ = Ward.objects.get_or_create(
            facility=facility, name="E2E Mentor Workflow Ward", defaults={"max_students": 4},
        )
        cohort, _ = Cohort.objects.get_or_create(
            institution=institution,
            name="E2E Mentor Workflow Cohort",
            defaults={
                "start_date": dt.date.today() - dt.timedelta(days=7),
                "end_date": dt.date.today() + dt.timedelta(days=60),
                "planned_capacity": 4,
            },
        )
        coordinator, _ = User.objects.get_or_create(
            email="e2e-workflow-coordinator@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Coordinator", "role": Role.COORDINATOR,
                      "status": Status.ACTIVE, "program": program, "institution_id": institution.id},
        )
        nurse_manager, _ = User.objects.get_or_create(
            email="e2e-workflow-manager@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Manager", "role": Role.NURSE_MANAGER,
                      "status": Status.ACTIVE, "program": program, "facility_id": facility.id},
        )
        student, _ = User.objects.get_or_create(
            email="e2e-workflow-student@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Mentor Student", "role": Role.STUDENT,
                      "status": Status.ACTIVE, "program": program, "institution_id": institution.id,
                      "registration_number": "E2E-2026-002"},
        )
        mentor, _ = User.objects.get_or_create(
            email="e2e-workflow-mentor@mentormama.test",
            defaults={"first_name": "E2E", "last_name": "Workflow Mentor", "role": Role.MENTOR,
                      "status": Status.ACTIVE, "program": program, "facility_id": facility.id},
        )
        for user, role, scope in (
            (coordinator, Role.COORDINATOR, {"institution": institution}),
            (nurse_manager, Role.NURSE_MANAGER, {"facility": facility}),
            (student, Role.STUDENT, {"institution": institution}),
            (mentor, Role.MENTOR, {"facility": facility}),
        ):
            user.role = role
            user.status = Status.ACTIVE
            user.program = program
            user.institution_id = getattr(scope.get("institution"), "id", None)
            user.facility_id = getattr(scope.get("facility"), "id", None)
            if user is mentor:
                user.set_password(password)
            user.save()
        student.registration_number = "E2E-2026-002"
        student.save(update_fields=["registration_number", "updated_at"])
        CohortMembership.objects.get_or_create(cohort=cohort, student=student)

        template, _ = ChecklistTemplate.objects.get_or_create(
            program=program, version=99,
            defaults={"published_at": dt.datetime.now(dt.timezone.utc)},
        )
        TemplateItem.objects.get_or_create(
            template=template, position=1,
            defaults={"label": "E2E mentor workflow induction", "is_required": True},
        )

        placement = Placement.objects.filter(
            cohort=cohort,
            state=State.ACTIVE,
            mentor_assignments__mentor=mentor,
            mentor_assignments__ended_at=None,
        ).first()
        if placement is None:
            placement = placement_services.create_placement(
                placement_services.CreatePlacement(
                    cohort_id=cohort.id,
                    student_id=student.id,
                    planned_start=dt.date.today() - dt.timedelta(days=1),
                    planned_end=dt.date.today() + dt.timedelta(days=30),
                ),
                actor=coordinator,
            )
            placement_services.allocate_ward(placement.id, ward.id, actor=nurse_manager)
            placement_services.assign_mentor(placement.id, mentor.id, actor=nurse_manager)
            placement_services.transition(placement.id, State.AWAITING_STUDENT, actor=coordinator)
            placement_services.transition(
                placement.id, State.ORIENTATION, actor=student,
                asserted_by="student.confirm_placement",
            )
            induction_services.acknowledge_orientation(
                placement.id, actor=student,
                understands_placement_details=True, understands_emergency_process=True,
                understands_safeguarding=True,
            )
            checklist = induction_services.open_induction(placement.id, actor=mentor)
            item = TemplateItem.objects.get(template=checklist.template, position=1)
            induction_services.answer_item(checklist.id, item.id, "yes", actor=mentor)
            induction_services.sign_induction(checklist.id, actor=mentor)
            placement.refresh_from_db()

        self.stdout.write(self.style.SUCCESS(f"Mentor E2E workflow ready: {placement.id}"))
