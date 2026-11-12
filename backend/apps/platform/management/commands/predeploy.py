"""Everything that must run before a new release takes traffic: migrations, the platform admin bootstrap, and (only
when asked) the presentation demo programme."""

import os

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Apply migrations, ensure the initial platform administrator exists, and optionally seed the demo programme."

    def handle(self, *args, **options):
        call_command("migrate", interactive=False, verbosity=1)
        call_command("check")  # prints configuration warnings (for example emailed links that would point at localhost)
        call_command("ensure_platform_admin")
        self._seed_demo_if_requested()

    def _seed_demo_if_requested(self):
        """DEMO_SEED=true seeds the isolated demo programme once (DEMO_ADMIN_EMAIL / DEMO_STUDENT_EMAIL choose the two real
        inboxes). It never repeats, and a problem here never blocks a release: real programmes do not depend on it."""
        if os.environ.get("DEMO_SEED", "").strip().lower() not in {"1", "true", "yes"}:
            return
        from apps.identity.models import Program

        if Program.objects.filter(is_demo=True).exists():
            self.stdout.write("Demo programme already present; not seeding again.")
            return
        try:
            call_command(
                "seed_demo",
                admin_email=os.environ.get("DEMO_ADMIN_EMAIL", ""),
                student_email=os.environ.get("DEMO_STUDENT_EMAIL", ""),
            )
        except Exception as error:  # noqa: BLE001 - never block a deploy on demo data
            self.stderr.write(f"Demo seeding failed and was skipped: {type(error).__name__}: {error}")
