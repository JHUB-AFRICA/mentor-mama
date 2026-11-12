"""One-tap sign-in for the demo programme (presentations only).

Everything here is inert unless DEMO_MODE is on. It can only ever sign in the handful of accounts a demo programme
names in `demo_logins`: never a platform administrator, never anyone in a real programme.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import login
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.identity import authentication
from apps.identity.capabilities import ROLE_LABELS
from apps.identity.models import Program, Role, Status, User

DEMO_ROLE_ORDER = [Role.PROGRAM_ADMIN, Role.COORDINATOR, Role.NURSE_MANAGER, Role.MENTOR, Role.STUDENT]


def demo_accounts() -> list[User]:
    """The signable demo accounts, in presentation order. Empty when demo mode is off or nothing is seeded."""
    if not settings.DEMO_MODE:
        return []
    programme = Program.objects.filter(is_demo=True).order_by("-created_at").first()
    if programme is None:
        return []
    users = {str(u.id): u for u in User.objects.filter(id__in=list(programme.demo_logins.values()), program=programme, status=Status.ACTIVE)}
    ordered = []
    for role in DEMO_ROLE_ORDER:
        user = users.get(str(programme.demo_logins.get(role)))
        if user is not None and user.role == role:
            ordered.append(user)
    return ordered


def is_demo_account(user) -> bool:
    """Used by the MFA rule: true only in demo mode, for people who belong to a demo programme."""
    if not settings.DEMO_MODE or user.program_id is None:
        return False
    return Program.objects.filter(id=user.program_id, is_demo=True).exists()


def _closed():
    return Response({"error": {"code": "NotFound", "message": "Not found."}}, status=404)


class DemoAccountsView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        accounts = demo_accounts()
        if not accounts:
            return Response({"data": {"enabled": False, "accounts": []}})
        return Response({"data": {"enabled": True, "accounts": [
            {"role": u.role, "role_label": ROLE_LABELS.get(u.role, u.role), "name": u.full_name, "email": u.email}
            for u in accounts]}})


class DemoLoginSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[str(r) for r in DEMO_ROLE_ORDER])


class DemoLoginView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_demo"

    def post(self, request):
        from apps.identity.views import _user_payload

        payload = DemoLoginSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = next((u for u in demo_accounts() if u.role == payload.validated_data["role"]), None)
        if user is None:
            return _closed()
        login(request, user, backend=settings.AUTHENTICATION_BACKENDS[0])
        request.session.set_expiry(12 * 60 * 60)
        authentication.register_session(request=request, user=user)
        request.session[authentication.MFA_VERIFIED_SESSION_KEY] = True
        return Response({"data": _user_payload(user)})
