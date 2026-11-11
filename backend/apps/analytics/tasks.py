"""Scheduled maintenance for disposable analytics projections."""

import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def refresh_projections_task(self):
    """Refresh projections outside request transactions; retry transient DB failures."""
    try:
        call_command("refresh_analytics", verbosity=0)
    except Exception as exc:
        logger.exception("analytics_projection_refresh_failed")
        raise self.retry(exc=exc) from exc
    logger.info("analytics_projection_refresh_succeeded", extra={"projection": "interruption_causes"})


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def refresh_operational_projections_task(self):
    try:
        call_command("refresh_analytics", projection="operational", verbosity=0)
    except Exception as exc:
        logger.exception("analytics_operational_refresh_failed")
        raise self.retry(exc=exc) from exc
    logger.info("analytics_projection_refresh_succeeded", extra={"projection": "operational"})


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def refresh_feedback_projection_task(self):
    try:
        call_command("refresh_analytics", projection="feedback", verbosity=0)
    except Exception as exc:
        logger.exception("analytics_feedback_refresh_failed")
        raise self.retry(exc=exc) from exc
    logger.info("analytics_projection_refresh_succeeded", extra={"projection": "feedback"})


# Branded PDFs take ~25 ms a row; give exports their own budget instead of the 60 s global hard limit.
# The soft limit raises inside the render so generate_export can mark the record failed (never stuck "running").
@shared_task(bind=True, max_retries=3, default_retry_delay=60, soft_time_limit=150, time_limit=180)
def generate_export_task(self, record_id):
    from celery.exceptions import SoftTimeLimitExceeded

    from apps.analytics.export_service import ExportTooLarge, generate_export

    try:
        generate_export(record_id)
    except (ExportTooLarge, SoftTimeLimitExceeded):
        logger.warning("analytics_export_not_retried", extra={"export_id": str(record_id)})
        return
    except Exception as exc:
        logger.exception("analytics_export_generation_failed", extra={"export_id": str(record_id)})
        raise self.retry(exc=exc) from exc
