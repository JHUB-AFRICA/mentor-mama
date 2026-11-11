"""Everything that must run before a new release takes traffic: migrations, then the platform admin bootstrap."""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Apply migrations and ensure the initial platform administrator exists."

    def handle(self, *args, **options):
        call_command("migrate", interactive=False, verbosity=1)
        call_command("ensure_platform_admin")
