"""Create the first platform administrator at deploy time, without email.

Reads PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_INITIAL_PASSWORD (plus optional PLATFORM_ADMIN_FIRST_NAME /
PLATFORM_ADMIN_LAST_NAME). Safe to run on every deploy:

* the account is created once, active, as a Django superuser, and must change its password on first sign-in;
* an existing account is never modified, so redeploying never resets a changed password;
* nothing is configured -> nothing happens; a problem is reported but never fails the deploy.

Sign-in still requires an authenticator app (set up on first sign-in), so the initial password alone cannot
open the platform.
"""

import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import BootstrapEvent, Role, Status, User


class Command(BaseCommand):
    help = "Create the initial platform administrator from environment variables (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=os.environ.get("PLATFORM_ADMIN_EMAIL", ""))
        parser.add_argument("--first-name", default=os.environ.get("PLATFORM_ADMIN_FIRST_NAME", "Platform"))
        parser.add_argument("--last-name", default=os.environ.get("PLATFORM_ADMIN_LAST_NAME", "Administrator"))

    def handle(self, *args, **options):
        email = User.objects.normalize_email((options["email"] or "").strip()).lower()
        password = os.environ.get("PLATFORM_ADMIN_INITIAL_PASSWORD", "")
        if not email:
            self.stdout.write("Platform admin: PLATFORM_ADMIN_EMAIL is not set; nothing to do.")
            return
        existing = User.objects.filter(email__iexact=email).first()
        if existing:
            if existing.role == Role.PLATFORM_ADMIN:
                self.stdout.write(f"Platform admin: {email} already exists; left unchanged.")
            else:
                self.stderr.write(f"Platform admin: {email} belongs to a {existing.role} account; not converted. Use another email.")
            return
        if not password:
            self.stderr.write("Platform admin: PLATFORM_ADMIN_INITIAL_PASSWORD is not set; account not created.")
            return
        candidate = User(email=email, first_name=options["first_name"], last_name=options["last_name"])
        try:
            validate_password(password, user=candidate)
        except ValidationError as error:
            self.stderr.write("Platform admin: the initial password is too weak; account not created. " + " ".join(error.messages))
            return
        with transaction.atomic():
            user = User.objects.create_superuser(
                email, password, first_name=options["first_name"], last_name=options["last_name"],
                role=Role.PLATFORM_ADMIN, status=Status.ACTIVE, program=None, must_change_password=True,
            )
            BootstrapEvent.objects.create(program=None, email=email, action="initial_platform_admin_created",
                                          details={"user_id": str(user.id)})
        self.stdout.write(self.style.SUCCESS(
            f"Platform admin: created {email}. Sign in at /platform, set up an authenticator, then change the password."))
