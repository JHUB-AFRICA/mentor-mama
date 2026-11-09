"""Seed the six pilot learning modules described by the architecture."""

from django.core.management.base import BaseCommand, CommandError

from apps.identity.models import Program, Role
from apps.learning.models import Lesson, Quiz, QuizQuestion, TrainingModule


MODULES = [
    ("Respectful maternity care", "respectful-maternity-care", "Practices that keep dignity, consent, and communication at the centre of care.", "Start with the person", "Ask permission, explain the next step, and protect privacy.", "SBAR"),
    ("Safeguarding and professional boundaries", "safeguarding-boundaries", "Recognise concerns early and use the protected escalation pathway.", "Raise concerns safely", "Record only what the workflow asks for and never add patient-identifiable details.", "Escalate through the protected pathway"),
    ("Emergency recognition and escalation", "emergency-escalation", "Build a shared response when a student or patient-facing situation needs urgent attention.", "Make the next action clear", "Use the local emergency process and confirm who owns the next action.", "Confirm the next responsible person"),
    ("Infection prevention and control", "infection-prevention-control", "Reinforce practical habits that reduce avoidable clinical risk.", "Protect every interaction", "Follow hand hygiene, PPE, and local infection-control guidance consistently.", "Follow local infection-control guidance"),
    ("Mentorship conversations and feedback", "mentorship-feedback", "Prepare for short, useful conversations that help students move forward.", "Make feedback actionable", "Name the observed behaviour, its impact, and the next practice step.", "Observed behaviour, impact, next step"),
    ("Safe documentation for mentorship", "safe-mentorship-documentation", "Keep mentorship records useful, concise, and free of patient identifiers.", "Record the learning focus", "Document the learning topic and follow-up action rather than a patient story.", "Learning topic and follow-up action"),
]


class Command(BaseCommand):
    help = "Create or update the six published pilot mentor learning modules."

    def add_arguments(self, parser):
        parser.add_argument("--program", type=str, required=True, help="Programme UUID")

    def handle(self, *args, **options):
        try:
            program = Program.objects.get(id=options["program"])
        except Program.DoesNotExist as exc:
            raise CommandError("Programme not found.") from exc
        for index, (title, slug, description, lesson_title, lesson_body, answer) in enumerate(MODULES):
            module, _ = TrainingModule.objects.update_or_create(
                program=program, slug=slug,
                defaults={"title": title, "description": description, "pass_mark": 70,
                          "is_required": index < 4, "is_published": True, "visible_roles": [Role.MENTOR]},
            )
            Lesson.objects.update_or_create(module=module, position=1, defaults={"title": lesson_title, "body": lesson_body})
            quiz, _ = Quiz.objects.get_or_create(module=module)
            QuizQuestion.objects.update_or_create(
                quiz=quiz, position=1,
                defaults={"prompt": "Which approach best reflects this module?", "options": [answer, "Skip the agreed process"], "correct_option": answer},
            )
            self.stdout.write(self.style.SUCCESS(f"Seeded {title}"))
