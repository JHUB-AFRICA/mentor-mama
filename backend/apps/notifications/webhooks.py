"""Resend delivery callbacks.

Mounted at ``/anymail/resend/tracking/``. django-anymail checks the Svix signature of every request against
``RESEND_SIGNING_SECRET``. When that secret is not configured the endpoint does not exist, instead of
accepting unsigned events (anymail alone only warns in that case).
"""

from anymail.webhooks.resend import ResendTrackingWebhookView
from django.conf import settings
from django.http import HttpResponseNotFound


class ResendTrackingWebhook(ResendTrackingWebhookView):
    def dispatch(self, request, *args, **kwargs):
        if not settings.RESEND_SIGNING_SECRET:
            return HttpResponseNotFound()
        return super().dispatch(request, *args, **kwargs)
