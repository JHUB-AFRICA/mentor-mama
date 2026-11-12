"""A programme administrator's own data request goes to the platform team's Messages inbox.

Their programme's other administrators are not the right people to handle it, so instead of a second inbox it is
filed as a support enquiry (topic "account") whose details mark it as a data request. Identity registers these two
functions through its port; the platform team works it with the usual reply and status tools.
"""

from __future__ import annotations

from apps.platform import enquiries
from apps.platform.models import Enquiry, EnquiryEvent

# How the platform team's enquiry status reads to the person who asked.
STATUS_FOR_ENQUIRY = {
    Enquiry.Status.NEW: "received",
    Enquiry.Status.IN_PROGRESS: "in_review",
    Enquiry.Status.WAITING: "in_review",
    Enquiry.Status.RESOLVED: "completed",
    Enquiry.Status.CLOSED: "completed",
    Enquiry.Status.SPAM: "declined",
}


def send(*, requester, programme_name: str, request) -> str:
    lines = [
        f"Data request: {request.get_request_type_display()}",
        f"About: {request.get_subject_area_display()}",
        "",
        request.description,
    ]
    if request.requested_change:
        lines += ["", f"What it should say: {request.requested_change}"]
    if request.reason:
        lines += ["", f"Reason: {request.reason}"]
    enquiry, _ = enquiries.submit(
        kind=Enquiry.Kind.SUPPORT, topic="account", name=requester.full_name or requester.email, email=requester.email,
        organisation=programme_name, subject=f"Data request: {request.get_request_type_display()}"[:160],
        message="\n".join(lines),
        details={"data_request": True, "request_type": request.request_type, "subject_area": request.subject_area,
                 "data_request_id": str(request.id), "requester_id": str(requester.id), "respond_within_days": 30},
        source_page="account-settings/privacy",
    )
    return enquiry.reference


def status(reference: str):
    """(status, last reply to the person) for the enquiry behind a request, or None if it is gone."""
    enquiry = Enquiry.objects.filter(reference=reference).first()
    if enquiry is None:
        return None
    reply = enquiry.events.filter(type=EnquiryEvent.Type.REPLY).order_by("-created_at").values_list("body", flat=True).first()
    return STATUS_FOR_ENQUIRY.get(enquiry.status, "received"), (reply or "")[:2000]
