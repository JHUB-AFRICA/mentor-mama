"""Platform administration API (`/api/v1/platform/...`).

Every endpoint requires an active platform administrator with a verified MFA session (the default
authentication class enforces MFA for this role). Until the initial password has been changed, only the
read-only overview answers, so a leaked deploy password cannot be used to act on other accounts.
"""

from __future__ import annotations

from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity import authentication
from apps.identity.models import MFARecoveryRequest, Program, Status, User
from apps.platform import selectors, services
from apps.platform.status import system_status


def _denied():
    return Response({"error": {"code": "PlatformAccessRequired", "message": "This page is for platform administrators."}}, status=403)


def _password_change_required():
    return Response({"error": {"code": "PasswordChangeRequired", "message": "Change your initial password before making changes."}}, status=403)


class PlatformView(APIView):
    allow_before_password_change = False

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self._blocked = None
        if not authentication.is_platform_admin(request.user):
            self._blocked = _denied()
        elif request.user.must_change_password and not self.allow_before_password_change:
            self._blocked = _password_change_required()


def guarded(method):
    def wrapper(self, request, *args, **kwargs):
        return self._blocked or method(self, request, *args, **kwargs)

    wrapper.__name__ = method.__name__
    return wrapper


def _error(message: str, status: int = 400, code: str = "InvalidRequest"):
    return Response({"error": {"code": code, "message": message}}, status=status)


class OverviewView(PlatformView):
    allow_before_password_change = True

    @guarded
    def get(self, request):
        data = selectors.overview()
        data["signins_last_7_days"] = selectors.recent_signins()
        data["system"] = system_status()
        return Response({"data": data})


class SystemStatusView(PlatformView):
    allow_before_password_change = True

    @guarded
    def get(self, request):
        return Response({"data": system_status()})


class PersonSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=120)
    last_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")


class ProgrammeSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    short_name = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    academic_year = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    admin = PersonSerializer(required=False, allow_null=True)


class ProgrammesView(PlatformView):
    @guarded
    def get(self, request):
        return Response({"data": selectors.programmes()})

    @guarded
    def post(self, request):
        payload = ProgrammeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        try:
            programme, invited = services.create_programme(actor=request.user, **data)
        except ValueError as error:
            return _error(str(error))
        return Response({"data": {"id": str(programme.id), "name": programme.name,
                                  "admin_invited": invited.email if invited else None}}, status=201)


class ProgrammeAdminInviteView(PlatformView):
    @guarded
    def post(self, request, programme_id):
        programme = Program.objects.filter(id=programme_id).first()
        if programme is None:
            return _error("Programme not found.", 404, "NotFound")
        payload = PersonSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            user = services.invite_programme_admin(actor=request.user, programme=programme, **payload.validated_data)
        except ValueError as error:
            return _error(str(error))
        return Response({"data": {"id": str(user.id), "email": user.email, "status": user.status}}, status=202)


class PlatformAdminInviteView(PlatformView):
    @guarded
    def post(self, request):
        payload = PersonSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = services.invite_platform_admin(actor=request.user, **payload.validated_data)
        return Response({"data": {"id": str(user.id), "email": user.email, "status": user.status}}, status=202)


class AccountsQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100, default=25)
    search = serializers.CharField(required=False, allow_blank=True, default="", max_length=120)
    role = serializers.CharField(required=False, allow_blank=True, default="", max_length=32)
    status = serializers.ChoiceField(choices=["", *Status.values], required=False, default="")
    programme_id = serializers.CharField(required=False, allow_blank=True, default="", max_length=40)
    invitation = serializers.ChoiceField(choices=["", "pending", "expired"], required=False, default="")

    def validate_programme_id(self, value):
        if value and value != "platform":
            import uuid

            try:
                uuid.UUID(value)
            except ValueError as error:
                raise serializers.ValidationError("Unknown programme.") from error
        return value


class AccountsView(PlatformView):
    @guarded
    def get(self, request):
        query = AccountsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response({"data": selectors.accounts(**query.validated_data)})


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, max_length=1000)


class StatusChangeSerializer(ReasonSerializer):
    status = serializers.ChoiceField(choices=[Status.ACTIVE, Status.SUSPENDED, Status.DEACTIVATED])


class AccountStatusView(PlatformView):
    @guarded
    def post(self, request, user_id):
        payload = StatusChangeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        target = User.objects.filter(id=user_id).first()
        changed = target and authentication.change_status(actor=request.user, target=target, **payload.validated_data)
        if not changed:
            return _error("This status change is not possible for this account.", 409, "StatusChangeUnavailable")
        return Response({"data": {"id": str(changed.id), "status": changed.status}})


class AccountSessionsView(PlatformView):
    @guarded
    def post(self, request, user_id):
        payload = ReasonSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        target = User.objects.filter(id=user_id).first()
        count = authentication.revoke_account_sessions(actor=request.user, target=target, **payload.validated_data) if target else None
        if count is None:
            return _error("These sessions cannot be signed out.", 409, "SessionRevocationUnavailable")
        return Response({"data": {"revoked_count": count}})


class AccountInvitationResendView(PlatformView):
    @guarded
    def post(self, request, user_id):
        target = User.objects.filter(id=user_id).first()
        if not target or not authentication.resend_invitation(actor=request.user, target=target):
            return _error("This invitation cannot be resent.", 409, "InvitationResendUnavailable")
        return Response({"data": {"id": str(target.id), "status": Status.INVITED}})


class SupportRequestsView(PlatformView):
    @guarded
    def get(self, request):
        return Response({"data": selectors.support_requests()})


class DecisionSerializer(ReasonSerializer):
    decision = serializers.ChoiceField(choices=["recover", "close"])


class SupportRequestResolveView(PlatformView):
    @guarded
    def post(self, request, request_id):
        payload = DecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        if not MFARecoveryRequest.objects.filter(id=request_id).exists():
            return _error("This request no longer exists.", 404, "NotFound")
        if not authentication.review_platform_mfa_recovery_request(actor=request.user, request_id=request_id, **payload.validated_data):
            return _error("This request cannot be reviewed (it may already be resolved, or it is your own).", 409, "RecoveryRequestUnavailable")
        return Response({"data": {"reviewed": True}})


class ActivityView(PlatformView):
    @guarded
    def get(self, request):
        return Response({"data": selectors.activity()})
