"""Create a deterministic local mentor induction checklist workflow."""

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from apps.identity.models import User
from apps.induction import services as induction_services
from apps.induction.models import ChecklistTemplate, TemplateItem
from apps.placements import services as placement_services
from apps.placements.models import Placement, State


class Command(BaseCommand):
    help = "Create a development-only induction fixture for browser verification."

    def add_arguments(self, parser):
        parser.add_argument("--password", required=True, help="Local mentor test-account password.")

    def handle(self, *args, **options):
        call_command("seed_e2e_student_workflow", password=options["password"], reset=True)
        student = User.objects.get(email="e2e-student-workflow-student@mentormama.test")
        mentor = User.objects.get(email="e2e-student-workflow-mentor@mentormama.test")
        mentor.set_password(options["password"])
        mentor.save(update_fields=["password", "updated_at"])
        placement = (
            Placement.objects.filter(
                cohort__name="E2E Student Workflow Cohort", state=State.AWAITING_STUDENT,
                student_assignments__student=student, student_assignments__ended_at=None,
            )
            .order_by("-created_at")
            .first()
        )
        if placement is None:
            raise CommandError("No assignment-backed awaiting placement was created.")
        placement = placement_services.transition(
            placement.id, State.ORIENTATION, actor=student,
            asserted_by="student.confirm_placement",
        )
        induction_services.acknowledge_orientation(
            placement.id, actor=student,
            understands_placement_details=True,
            understands_emergency_process=True,
            understands_safeguarding=True,
        )
        template, _ = ChecklistTemplate.objects.get_or_create(
            program=mentor.program, version=100,
            defaults={"published_at": placement.created_at},
        )
        for position, label in enumerate((
            "Show the student the key ward areas, who to report to, and where to get help.",
            "Show the student the emergency exits and the PPE used on this ward.",
            "Explain how to raise a safety or safeguarding concern and who to contact.",
        ), start=1):
            TemplateItem.objects.get_or_create(template=template, position=position, defaults={"label": label, "is_required": True})
        induction_services.open_induction(placement.id, actor=mentor)
        self.stdout.write(self.style.SUCCESS("Mentor induction E2E workflow ready."))
