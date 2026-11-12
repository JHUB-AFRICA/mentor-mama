"""Background delivery for website enquiry emails."""

from celery import shared_task


@shared_task
def send_enquiry_emails_task():
    """Send queued acknowledgements, replies, progress updates and team alerts. Also run by the scheduler sweep."""
    from apps.platform.enquiries import send_pending_emails

    return send_pending_emails()
