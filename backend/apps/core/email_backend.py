"""Email safety wrapper.

All mail goes through here before it reaches the real provider (Resend, Mailtrap or the console):

* addresses on the demo subdomain (DEMO_EMAIL_DOMAIN, no mailbox exists) and reserved ``.test`` names are dropped, so
  seeded demo accounts never cause bounces;
* people who belong to a demo programme only receive mail if their address is on DEMO_EMAIL_ALLOWLIST, whether or not
  demo mode is on, so a demo visitor can never make MentorMAMA email a stranger.

Everyone else is unaffected. A message whose recipients are all dropped is skipped and counts as not sent.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)


def parseaddr_email(address: str) -> str:
    from email.utils import parseaddr

    return parseaddr(address)[1]


def _base_address(address: str) -> str:
    """'Name <a+tag@x.com>' -> 'a@x.com' (plus-addressing delivers to the same inbox)."""
    local, _, domain = parseaddr_email(address).lower().rpartition("@")
    return f"{local.split('+', 1)[0]}@{domain}"


def _is_demo_person(address: str) -> bool:
    from apps.identity.models import User

    return User.objects.filter(email__iexact=parseaddr_email(address), program__is_demo=True).exists()


def deliverable(address: str) -> bool:
    plain = parseaddr_email(address).lower()
    if plain.endswith(".test") or plain.endswith("@" + settings.DEMO_EMAIL_DOMAIN):
        return False
    if _is_demo_person(address):
        return _base_address(address) in {_base_address(a) for a in settings.DEMO_EMAIL_ALLOWLIST}
    return True


class SafeEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.inner = get_connection(settings.EMAIL_DELEGATE_BACKEND, fail_silently=fail_silently, **kwargs)

    def open(self):
        return self.inner.open()

    def close(self):
        return self.inner.close()

    def send_messages(self, email_messages):
        allowed = []
        for message in email_messages:
            to, cc, bcc = ([a for a in field if deliverable(a)] for field in (message.to, message.cc, message.bcc))
            if not (to or cc or bcc):
                logger.info("email_dropped", extra={"subject": message.subject[:80]})
                continue
            message.to, message.cc, message.bcc = to, cc, bcc
            allowed.append(message)
        return self.inner.send_messages(allowed) if allowed else 0
