"""Verify the configured AI provider end to end with a harmless fixed prompt."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core import ai


class Command(BaseCommand):
    help = "Send one fixed, non-sensitive prompt to the configured AI provider and report the outcome."

    def handle(self, *args, **options):
        if not ai.is_configured():
            raise CommandError("AI is not configured: set AI_ENABLED=true and AI_API_KEY.")
        try:
            reply = ai.chat_completion(
                feature="smoke_test",
                system="Reply with one short sentence.",
                user="Say that the MentorMAMA AI connection works.",
                max_output_tokens=60,
            )
        except ai.AIProviderError as exc:
            raise CommandError(
                f"Provider call failed for model {settings.AI_MODEL} at {settings.AI_API_BASE_URL}. "
                "Check the key, model name, billing, and network; see the ai_provider log line for the status."
            ) from exc
        self.stdout.write(self.style.SUCCESS(f"OK ({settings.AI_MODEL}): {reply}"))
