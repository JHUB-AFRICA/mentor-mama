"""Provision the first in-product Programme Administrator."""

import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core import outbox
from apps.identity.authentication import IdentityInvitationRequested
from apps.identity.models import BootstrapEvent, Program, Role, Status, User


class Command(BaseCommand):
    help = "Create the one-time invitation for the first Programme Administrator."

    def add_arguments(self, parser):
        parser.add_argument("--program-id", type=uuid.UUID)
        parser.add_argument("--program-name")
        parser.add_argument("--email", required=True)
        parser.add_argument("--first-name", required=True)
        parser.add_argument("--last-name", required=True)
        parser.add_argument("--phone", default="")

    @transaction.atomic
    def handle(self, *args, **options):
        if not options.get("program_id") and not options.get("program_name"):
            raise CommandError("Provide either --program-id or --program-name.")
        program = Program.objects.filter(id=options.get("program_id")).first() if options.get("program_id") else None
        if options.get("program_id") and not program:
            raise CommandError("The programme does not exist.")
        if not program:
            program, _ = Program.objects.get_or_create(name=options["program_name"])
        # A new programme must be able to start inductions on day one.
        from apps.induction.services import ensure_default_template

        ensure_default_template(program)
        email = User.objects.normalize_email(options["email"])
        existing = User.objects.filter(program=program, role=Role.PROGRAM_ADMIN).first()
        if existing:
            if existing.email.lower() == email.lower() and existing.status == Status.INVITED:
                self.stdout.write("The initial Programme Admin invitation already exists.")
                return
            raise CommandError("This programme already has a Programme Admin account.")

        user = User.objects.create_user(
            email=email,
            first_name=options["first_name"],
            last_name=options["last_name"],
            role=Role.PROGRAM_ADMIN,
            status=Status.INVITED,
            program=program,
            phone=options["phone"],
        )
        user.set_unusable_password()
        user.invitation_nonce = uuid.uuid4()
        user.invitation_sent_at = timezone.now()
        user.save(update_fields=["password", "invitation_nonce", "invitation_sent_at", "updated_at"])
        BootstrapEvent.objects.create(
            program=program,
            email=user.email,
            action="initial_program_admin_invited",
            details={"user_id": str(user.id)},
        )
        outbox.publish(IdentityInvitationRequested(user_id=user.id))
        self.stdout.write(self.style.SUCCESS(
            f"Initial Programme Admin invitation queued for {user.email}."
        ))
