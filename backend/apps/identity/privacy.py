"""Formal data requests: correct, show or delete what MentorMAMA holds about a person (concept note section 13).

A person submits; a human at their programme (or, for a programme administrator, the platform team) works the
request. Nothing here edits or deletes data: an administrator makes a correction through the normal tools (editing
the person, the placement, and so on) and then records what was done. Every step is audited and the person is told
in the app and by email. Audit entries and notification payloads carry identifiers and short codes only, never the
free text, which may describe a person.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Case, F, IntegerField, Q, Value, When
from django.core.paginator import Paginator
from django.utils import timezone

from apps.core import audit, errors, outbox
from apps.identity import capabilities, ports
from apps.identity.models import DataRequest, Role, Status, User

Type, Area, State, Route = DataRequest.Type, DataRequest.Area, DataRequest.Status, DataRequest.Route


def response_days() -> int:
    return int(getattr(settings, "DATA_REQUEST_RESPONSE_DAYS", 30))


class DataRequestAlreadyOpen(errors.DomainError):
    code, status = "DataRequestAlreadyOpen", 409
    message = "You already have an open request of this kind. Withdraw it or wait for the response before sending another."


class DataRequestNotFound(errors.DomainError):
    code, status = "DataRequestNotFound", 404
    message = "Not found."


class DataRequestInvalidTransition(errors.DomainError):
    code, status = "DataRequestInvalidTransition", 409
    message = "That is not possible for a request in its current state."


class DataRequestNoteRequired(errors.DomainError):
    code, status = "DataRequestNoteRequired", 422
    message = "Add a short note for the person who asked."


@dataclass(frozen=True)
class DataRequestSubmitted:
    """Tell a programme's administrators a request is waiting. Identifiers and a short code only."""

    recipient_user_ids: list
    request_id: uuid.UUID
    request_type: str


@dataclass(frozen=True)
class DataRequestStatusChanged:
    """Tell the requester their request moved on. The response note stays in the app."""

    user_id: uuid.UUID
    request_id: uuid.UUID
    request_type: str
    request_status: str


def _scope(request: DataRequest) -> dict:
    return {"program_id": str(request.program_id)}


def _log(actor, action: str, request: DataRequest, changes: dict | None = None) -> None:
    audit.record(actor=actor, action=action, entity_table="identity_data_request", entity_id=request.id,
                 scope=_scope(request), changes={"requester_id": str(request.requester_id), "type": request.request_type, **(changes or {})})


# --------------------------------------------------------------------------- the person's side

def _require_submitter(user: User) -> None:
    capabilities.require(user, "submit_data_request")
    if user.program_id is None:
        raise errors.UnauthorizedFacilityAccess()


def _program_admin_ids(program_id, *, excluding) -> list[str]:
    return [str(pk) for pk in User.objects.filter(program_id=program_id, role=Role.PROGRAM_ADMIN, status=Status.ACTIVE)
            .exclude(id=excluding).order_by("created_at").values_list("id", flat=True)]


@transaction.atomic
def create_request(*, user: User, request_type: str, subject_area: str, description: str, requested_change: str = "",
                   reason: str = "") -> DataRequest:
    _require_submitter(user)
    sync_platform_requests(user)
    if DataRequest.objects.filter(requester=user, request_type=request_type, status__in=DataRequest.OPEN_STATUSES).exists():
        raise DataRequestAlreadyOpen()
    admins = _program_admin_ids(user.program_id, excluding=user.id)
    route = Route.PLATFORM if user.role == Role.PROGRAM_ADMIN or not admins else Route.PROGRAMME
    try:
        with transaction.atomic():
            request = DataRequest.objects.create(
                requester=user, program_id=user.program_id, request_type=request_type, subject_area=subject_area,
                description=description.strip(), requested_change=requested_change.strip(), reason=reason.strip(),
                routed_to=route, due_at=timezone.now() + timedelta(days=response_days()),
            )
    except IntegrityError:  # two taps at once; the unique constraint caught the second
        raise DataRequestAlreadyOpen() from None
    _log(user, "privacy.data_request_created", request, {"area": subject_area, "routed_to": route})
    if route == Route.PLATFORM:
        reference = ports.escalate_data_request(requester=user, programme_name=user.program.name, request=request)
        if reference:
            request.enquiry_reference = reference
            request.save(update_fields=["enquiry_reference", "updated_at"])
    else:
        outbox.publish(DataRequestSubmitted(recipient_user_ids=admins, request_id=request.id, request_type=request_type))
    return request


@transaction.atomic
def withdraw_request(*, user: User, request_id) -> DataRequest:
    request = DataRequest.objects.select_for_update().filter(id=request_id, requester=user).first()
    if request is None:
        raise DataRequestNotFound()
    if request.routed_to == Route.PLATFORM:
        raise DataRequestInvalidTransition(
            "This request is with the platform team. Reply to the email we sent you to cancel it.")
    if request.status not in DataRequest.OPEN_STATUSES:
        raise DataRequestInvalidTransition()
    previous, request.status = request.status, State.WITHDRAWN
    request.closed_at = timezone.now()
    request.save(update_fields=["status", "closed_at", "updated_at"])
    _log(user, "privacy.data_request_withdrawn", request, {"from": previous, "to": request.status})
    return request


def own_requests(user: User) -> list[DataRequest]:
    sync_platform_requests(user)
    return list(DataRequest.objects.filter(requester=user).select_related("reviewed_by").order_by("-created_at")[:100])


def sync_platform_requests(user: User) -> None:
    """Mirror the progress of requests that went to the platform inbox onto the person's own list."""
    for request in DataRequest.objects.filter(requester=user, routed_to=Route.PLATFORM, status__in=DataRequest.OPEN_STATUSES).exclude(enquiry_reference=""):
        found = ports.platform_data_request_status(request.enquiry_reference)
        if not found or found[0] == request.status:
            continue
        with transaction.atomic():
            previous = request.status
            request.status, request.response_note = found[0], (found[1] or request.response_note)
            if request.status not in DataRequest.OPEN_STATUSES:
                request.closed_at = timezone.now()
            request.save(update_fields=["status", "response_note", "closed_at", "updated_at"])
            _log(user, "privacy.data_request_synced", request, {"from": previous, "to": request.status, "source": "platform_inbox"})


# --------------------------------------------------------------------------- the administrator's side

def _require_manager(actor: User) -> None:
    capabilities.require(actor, "manage_data_requests")
    if actor.program_id is None:
        raise errors.UnauthorizedFacilityAccess()


def _programme_requests(actor: User):
    """Only this programme's requests that are handled by its administrators, and never the administrator's own."""
    _require_manager(actor)
    return DataRequest.objects.filter(program_id=actor.program_id, routed_to=Route.PROGRAMME).exclude(requester=actor)


def get_for_admin(*, actor: User, request_id) -> DataRequest:
    request = _programme_requests(actor).select_related("requester", "reviewed_by").filter(id=request_id).first()
    if request is None:
        raise DataRequestNotFound()
    return request


def admin_queue(*, actor: User, status: str = "open", request_type: str = "", search: str = "", overdue: bool = False,
                page: int = 1, page_size: int = 20) -> dict:
    base = _programme_requests(actor)
    now = timezone.now()
    open_q = Q(status__in=DataRequest.OPEN_STATUSES)
    counts = {
        "open": base.filter(open_q).count(),
        "in_review": base.filter(status=State.IN_REVIEW).count(),
        "overdue": base.filter(open_q, due_at__lt=now).count(),
    }
    rows = base.select_related("requester", "reviewed_by")
    if status == "open":
        rows = rows.filter(open_q)
    elif status in State.values:
        rows = rows.filter(status=status)
    if request_type in Type.values:
        rows = rows.filter(request_type=request_type)
    if overdue:
        rows = rows.filter(open_q, due_at__lt=now)
    term = search.strip()
    if term:
        rows = rows.filter(Q(requester__first_name__icontains=term) | Q(requester__last_name__icontains=term)
                           | Q(requester__email__icontains=term) | Q(description__icontains=term))
    rows = rows.annotate(
        open_rank=Case(When(open_q, then=Value(0)), default=Value(1), output_field=IntegerField()),
        open_due=Case(When(open_q, then=F("due_at")), default=Value(None)),
    ).order_by("open_rank", F("open_due").asc(nulls_last=True), "-updated_at")
    paginator = Paginator(rows, page_size)
    current = paginator.get_page(page)
    return {
        "results": [admin_payload(row, now=now) for row in current.object_list],
        "counts": counts,
        "pagination": {"page": current.number, "page_size": page_size, "total_count": paginator.count,
                       "total_pages": paginator.num_pages, "has_next": current.has_next(), "has_previous": current.has_previous()},
    }


def open_count(actor: User) -> int:
    return _programme_requests(actor).filter(status__in=DataRequest.OPEN_STATUSES).count()


def _transition(*, actor: User, request_id, to: str, allowed_from: tuple, note: str = "", note_required: bool = False) -> DataRequest:
    _require_manager(actor)
    note = note.strip()
    if note_required and not note:
        raise DataRequestNoteRequired()
    request = _programme_requests(actor).select_for_update(of=("self",)).filter(id=request_id).first()
    if request is None:
        raise DataRequestNotFound()
    if request.status not in allowed_from:
        raise DataRequestInvalidTransition()
    previous, request.status = request.status, to
    fields = ["status", "reviewed_by", "reviewed_at", "updated_at"]
    request.reviewed_by = actor
    request.reviewed_at = request.reviewed_at or timezone.now()
    if note:
        request.response_note = note
        fields.append("response_note")
    if to not in DataRequest.OPEN_STATUSES:
        request.closed_at = timezone.now()
        fields.append("closed_at")
    request.save(update_fields=fields)
    _log(actor, f"privacy.data_request_{to}", request, {"from": previous, "to": to, "note_given": bool(note)})
    outbox.publish(DataRequestStatusChanged(user_id=request.requester_id, request_id=request.id,
                                            request_type=request.request_type, request_status=to))
    return request


@transaction.atomic
def start_review(*, actor: User, request_id) -> DataRequest:
    return _transition(actor=actor, request_id=request_id, to=State.IN_REVIEW, allowed_from=(State.RECEIVED,))


@transaction.atomic
def complete(*, actor: User, request_id, note: str) -> DataRequest:
    return _transition(actor=actor, request_id=request_id, to=State.COMPLETED, allowed_from=DataRequest.OPEN_STATUSES,
                       note=note, note_required=True)


@transaction.atomic
def decline(*, actor: User, request_id, note: str) -> DataRequest:
    return _transition(actor=actor, request_id=request_id, to=State.DECLINED, allowed_from=DataRequest.OPEN_STATUSES,
                       note=note, note_required=True)


# --------------------------------------------------------------------------- shapes

def _timing(request: DataRequest, now) -> dict:
    is_open = request.status in DataRequest.OPEN_STATUSES
    seconds = (request.due_at - now).total_seconds()
    return {
        "is_open": is_open,
        "age_days": max((now - request.created_at).days, 0),
        "days_left": int(seconds // 86400) if is_open and seconds >= 0 else (0 if is_open else None),
        "overdue": is_open and seconds < 0,
        "days_overdue": int(-seconds // 86400) + 1 if is_open and seconds < 0 else 0,
    }


def own_payload(request: DataRequest, *, now=None) -> dict:
    now = now or timezone.now()
    return {
        "id": str(request.id), "request_type": request.request_type, "request_type_label": request.get_request_type_display(),
        "subject_area": request.subject_area, "subject_area_label": request.get_subject_area_display(),
        "description": request.description, "requested_change": request.requested_change, "reason": request.reason,
        "status": request.status, "status_label": request.get_status_display(), "response_note": request.response_note,
        "routed_to": request.routed_to, "enquiry_reference": request.enquiry_reference,
        "reviewed_by": request.reviewed_by.full_name if request.reviewed_by_id and request.routed_to == Route.PROGRAMME else None,
        "created_at": request.created_at, "updated_at": request.updated_at, "reviewed_at": request.reviewed_at,
        "closed_at": request.closed_at, "due_at": request.due_at, **_timing(request, now),
    }


def admin_payload(request: DataRequest, *, now=None) -> dict:
    now = now or timezone.now()
    person = request.requester
    return {
        **own_payload(request, now=now),
        "reviewed_by": request.reviewed_by.full_name if request.reviewed_by_id else None,
        "requester": {"id": str(person.id), "name": person.full_name, "email": person.email, "role": person.role,
                      "role_label": capabilities.ROLE_LABELS.get(person.role, person.role), "status": person.status,
                      "institution_id": str(person.institution_id) if person.institution_id else None,
                      "facility_id": str(person.facility_id) if person.facility_id else None},
    }
