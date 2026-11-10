"""Publish the default labour-ward induction checklist for programmes that have none."""

from django.core.management.base import BaseCommand

from apps.identity.models import Program
from apps.induction.services import ensure_default_template


class Command(BaseCommand):
    help = "Publish the concept-note induction checklist for every programme without a published one (idempotent)."

    def handle(self, *args, **options):
        for program in Program.objects.all():
            template, created = ensure_default_template(program)
            verb = "Published" if created else "Kept existing"
            self.stdout.write(f"{verb} checklist v{template.version} for {program.name}.")
