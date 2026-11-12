"""Background delivery for website enquiry emails."""

from celery import shared_task


@shared_task
def send_enquiry_emails_task():
    """Send queued acknowledgements, replies, progress updates and team alerts. Also run by the scheduler sweep."""
    from apps.platform.enquiries import send_pending_emails

    return send_pending_emails()


@shared_task
def purge_old_enquiries_task():
    """Daily retention sweep: spam after 30 days, resolved/closed enquiries after 24 months."""
    from apps.platform.enquiries import purge_old

    return purge_old()
