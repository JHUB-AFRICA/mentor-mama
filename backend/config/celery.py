"""Celery application for automatic outbox processing."""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("mentormama")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks(["apps.notifications", "apps.analytics", "apps.placements", "apps.platform"], force=True)
app.conf.beat_schedule = {
    "dispatch-outbox-every-ten-seconds": {
        "task": "apps.notifications.tasks.dispatch_outbox_task",
        "schedule": 10.0,
    },
    "send-enquiry-emails-every-thirty-seconds": {
        "task": "apps.platform.tasks.send_enquiry_emails_task",
        "schedule": 30.0,
    },
    "purge-old-enquiries-daily": {
        "task": "apps.platform.tasks.purge_old_enquiries_task",
        "schedule": 86400.0,
    },
    "refresh-analytics-hourly": {
        "task": "apps.analytics.tasks.refresh_projections_task",
        "schedule": 3600.0,
    },
    "refresh-operational-analytics-every-five-minutes": {
        "task": "apps.analytics.tasks.refresh_operational_projections_task",
        "schedule": 300.0,
    },
    "refresh-feedback-analytics-every-fifteen-minutes": {
        "task": "apps.analytics.tasks.refresh_feedback_projection_task",
        "schedule": 900.0,
    },
    "placement-lead-time-reminders-daily": {
        "task": "apps.placements.tasks.send_placement_lead_reminders_task",
        "schedule": 86400.0,
    },
    "send-weekly-notification-digests": {
        "task": "apps.notifications.tasks.send_weekly_digest_task",
        "schedule": 604800.0,
    },
}
