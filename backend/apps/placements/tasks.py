"""Asynchronous placement batch processing."""

from celery import shared_task


def run_placement_batch(batch):
    """Create the batch's placements and record the outcome on it (shared by the Celery task and the demo seed)."""
    from uuid import UUID

    from apps.identity.models import User
    from apps.placements.services import BulkCreatePlacements, bulk_create_placements

    batch.status = "processing"
    batch.save(update_fields=["status", "updated_at"])
    result = bulk_create_placements(BulkCreatePlacements(
        cohort_id=batch.cohort_id,
        student_ids=[UUID(value) for value in batch.student_ids],
        planned_start=batch.planned_start,
        planned_end=batch.planned_end,
        all_eligible=batch.all_eligible,
    ), actor=User.objects.get(id=batch.actor_id))
    batch.created_placement_ids = [str(item.id) for item in result["created"]]
    batch.skipped = result["skipped"]
    batch.status = "completed"
    batch.save(update_fields=["created_placement_ids", "skipped", "status", "updated_at"])
    return result


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_placement_batch_task(self, batch_id):
    from apps.placements.models import PlacementBatch

    batch = PlacementBatch.objects.filter(id=batch_id, status__in=["queued", "processing"]).first()
    if batch is None:
        return
    try:
        run_placement_batch(batch)
    except Exception as exc:
        if self.request.retries < self.max_retries:
            batch.status = "queued"
            batch.error_message = "A temporary issue occurred. Retrying the batch."
            batch.save(update_fields=["status", "error_message", "updated_at"])
        else:
            batch.status = "failed"
            batch.error_message = "The placement batch could not be completed."
            batch.save(update_fields=["status", "error_message", "updated_at"])
        raise self.retry(exc=exc) from exc


@shared_task
def send_placement_lead_reminders_task():
    """Daily: remind students and mentors before a placement starts."""
    from apps.placements import notices

    return notices.send_lead_reminders()
