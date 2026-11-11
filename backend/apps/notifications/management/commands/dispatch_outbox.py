"""Dispatch committed outbox email events.

Run this command from a worker/cron process. It is intentionally separate from
request handling so provider failures cannot roll back identity transactions.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.core import api as core
from apps.notifications import services
from apps.notifications.email import deliver_outbox_event

MAX_ATTEMPTS = 8


class Command(BaseCommand):
    help = "Deliver pending transactional email outbox events."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, **options):
        pending = core.pending_outbox_events(limit=options["limit"])
        delivered = failed = 0
        for candidate in pending:
            with transaction.atomic():
                event = core.lock_outbox_event(candidate.id)
                if event.dispatched_at:
                    continue
                try:
                    services.create_for_event(event)
                    deliver_outbox_event(event)
                except Exception as exc:  # provider failures must remain retryable
                    event.attempts += 1
                    event.last_error = str(exc)[:2000]
                    if event.attempts >= MAX_ATTEMPTS:
                        event.dead_at = timezone.now()  # stop retrying; visible for support, no longer blocks the queue
                    else:
                        event.next_attempt_at = timezone.now() + timedelta(seconds=min(60 * 2 ** event.attempts, 6 * 3600))
                    event.save(update_fields=["attempts", "last_error", "dead_at", "next_attempt_at"])
                    services.mark_delivered(event.id, error=str(exc))
                    failed += 1
                else:
                    event.dispatched_at = timezone.now()
                    event.attempts += 1
                    event.save(update_fields=["dispatched_at", "attempts"])
                    services.mark_delivered(event.id)
                    delivered += 1
        self.stdout.write(self.style.SUCCESS(f"Delivered {delivered}; failed {failed}."))
