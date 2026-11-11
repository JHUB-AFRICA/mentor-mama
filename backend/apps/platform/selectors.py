"""Read models for the platform dashboard. All bounded; nothing here returns clinical or safeguarding content."""

from __future__ import annotations

from datetime import timedelta

from django.core.paginator import Paginator
from django.db.models import Count, Q
from django.utils import timezone

from apps.core.models import AuditEntry
from apps.identity.authentication import INVITATION_MAX_AGE
from apps.identity.capabilities import ROLE_LABELS
from apps.identity.models import MFARecoveryRequest, Program, Role, Status, User


def _invitation_state(user) -> str | None:
    if user.status != Status.INVITED:
        return None
    if not user.invitation_sent_at:
        return "not_sent"
    return "expired" if timezone.now() - user.invitation_sent_at > INVITATION_MAX_AGE else "pending"


def account_row(user, programme_names: dict) -> dict:
    return {
        "id": str(user.id), "name": user.full_name, "email": user.email, "phone": user.phone,
        "role": user.role, "role_label": ROLE_LABELS.get(user.role, user.role), "status": user.status,
        "programme_id": str(user.program_id) if user.program_id else None,
        "programme": programme_names.get(user.program_id, "Platform") if user.program_id else "Platform",
        "invitation": _invitation_state(user), "invitation_sent_at": user.invitation_sent_at,
        "last_login": user.last_login, "created_at": user.created_at,
        "must_change_password": user.must_change_password,
    }


def _programme_names(ids) -> dict:
    return dict(Program.objects.filter(id__in={i for i in ids if i}).values_list("id", "name"))


def overview() -> dict:
    users = User.objects.all()
    by_role = dict(users.filter(status=Status.ACTIVE).values_list("role").annotate(n=Count("id")).values_list("role", "n"))
    invited = users.filter(status=Status.INVITED)
    expired_cutoff = timezone.now() - INVITATION_MAX_AGE
    return {
        "programmes": Program.objects.count(),
        "accounts": {
            "active": users.filter(status=Status.ACTIVE).count(),
            "invited": invited.count(),
            "invitations_expired": invited.filter(Q(invitation_sent_at__lt=expired_cutoff) | Q(invitation_sent_at=None)).count(),
            "suspended": users.filter(status=Status.SUSPENDED).count(),
            "deactivated": users.filter(status=Status.DEACTIVATED).count(),
            "by_role": [{"role": role, "label": ROLE_LABELS.get(role, role), "active": by_role.get(role, 0)} for role in Role],
        },
        "support_pending": MFARecoveryRequest.objects.filter(status=MFARecoveryRequest.Status.PENDING).count(),
        "programmes_without_admin": Program.objects.exclude(
            users__role=Role.PROGRAM_ADMIN, users__status__in=[Status.ACTIVE, Status.INVITED]).count(),
    }


def programmes() -> list[dict]:
    rows = Program.objects.annotate(
        people=Count("users", filter=Q(users__status=Status.ACTIVE), distinct=True),
        invited=Count("users", filter=Q(users__status=Status.INVITED), distinct=True),
        admins=Count("users", filter=Q(users__role=Role.PROGRAM_ADMIN, users__status=Status.ACTIVE), distinct=True),
        admins_invited=Count("users", filter=Q(users__role=Role.PROGRAM_ADMIN, users__status=Status.INVITED), distinct=True),
    ).order_by("name")
    return [{"id": str(p.id), "name": p.name, "short_name": p.short_name, "academic_year": p.academic_year,
             "description": p.description, "active_people": p.people, "invited_people": p.invited,
             "active_admins": p.admins, "invited_admins": p.admins_invited, "created_at": p.created_at} for p in rows]


def accounts(*, page: int = 1, page_size: int = 25, search: str = "", role: str = "", status: str = "",
             programme_id: str = "", invitation: str = "") -> dict:
    rows = User.objects.all().order_by("first_name", "last_name", "email")
    term = search.strip()
    if term:
        rows = rows.filter(Q(first_name__icontains=term) | Q(last_name__icontains=term) | Q(email__icontains=term))
    if role:
        rows = rows.filter(role=role)
    if status:
        rows = rows.filter(status=status)
    if programme_id == "platform":
        rows = rows.filter(program_id=None)
    elif programme_id:
        rows = rows.filter(program_id=programme_id)
    if invitation:
        cutoff = timezone.now() - INVITATION_MAX_AGE
        rows = rows.filter(status=Status.INVITED)
        if invitation == "expired":
            rows = rows.filter(Q(invitation_sent_at__lt=cutoff) | Q(invitation_sent_at=None))
        elif invitation == "pending":
            rows = rows.filter(invitation_sent_at__gte=cutoff)
    paginator = Paginator(rows, max(1, min(page_size, 100)))
    current = paginator.get_page(page)
    items = list(current.object_list)
    names = _programme_names(u.program_id for u in items)
    return {"results": [account_row(u, names) for u in items],
            "pagination": {"page": current.number, "pages": paginator.num_pages, "total": paginator.count}}


def support_requests() -> list[dict]:
    rows = MFARecoveryRequest.objects.select_related("user").order_by("status", "-created_at")[:200]
    names = _programme_names(r.user.program_id for r in rows)
    out = []
    for record in rows:
        user = record.user
        has_peer = bool(user.program_id) and user.role == Role.PROGRAM_ADMIN and User.objects.filter(
            program_id=user.program_id, role=Role.PROGRAM_ADMIN, status=Status.ACTIVE).exclude(id=user.id).exists()
        # Programme admins handle requests from people in their programme; the platform handles the rest.
        handled_by = "programme" if (user.role not in {Role.PROGRAM_ADMIN, Role.PLATFORM_ADMIN} or has_peer) else "platform"
        out.append({"id": str(record.id), "status": record.status, "reason": record.reason, "created_at": record.created_at,
                    "updated_at": record.updated_at, "handled_by": handled_by,
                    "account": account_row(user, names)})
    return out


ACTIVITY_TITLES = {
    "platform.programme_created": "Created a programme",
    "account.invited": "Sent an invitation",
    "account.invitation_resent": "Resent an invitation",
    "account.activated": "Activated their account",
    "account.status_changed": "Changed account status",
    "account.sessions_revoked": "Signed an account out of its devices",
    "account.access_changed": "Changed account access",
    "account.mfa_enabled": "Turned on authenticator sign-in",
    "account.mfa_recovery_requested": "Asked for sign-in help",
    "account.mfa_recovery_request_reviewed": "Reviewed a sign-in help request",
    "account.mfa_recovery_override": "Reset an authenticator",
    "account.password_changed": "Changed their password",
    "account.password_reset": "Reset their password",
}


def activity(limit: int = 50) -> list[dict]:
    rows = (AuditEntry.objects.filter(Q(action__startswith="platform.") | Q(action__in=list(ACTIVITY_TITLES)))
            .select_related("actor").order_by("-occurred_at")[:limit])
    targets = {r.entity_id for r in rows if r.entity_table == "identity_user"}
    people = {u.id: u for u in User.objects.filter(id__in=targets)}
    programmes = {p.id: p.name for p in Program.objects.filter(id__in={r.entity_id for r in rows if r.entity_table == "identity_program"})}
    out = []
    for row in rows:
        target = people.get(row.entity_id)
        subject = (target.full_name or target.email) if target else programmes.get(row.entity_id, "")
        out.append({"id": str(row.id), "title": ACTIVITY_TITLES.get(row.action, row.action.replace(".", " ").replace("_", " ").capitalize()),
                    "actor": row.actor.full_name or row.actor.email, "actor_role": ROLE_LABELS.get(row.actor_role, row.actor_role),
                    "subject": subject if (not target or target.id != row.actor_id) else "",
                    "reason": row.override_reason or "", "occurred_at": row.occurred_at})
    return out


def recent_signins(days: int = 7) -> int:
    return User.objects.filter(last_login__gte=timezone.now() - timedelta(days=days)).count()
