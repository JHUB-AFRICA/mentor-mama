import logging

from django.contrib.auth import login, logout, update_session_auth_hash
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.db import transaction
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.identity import api as identity
from apps.identity import authentication
from apps.identity import capabilities
from apps.identity import selectors
from apps.core import selectors as core_selectors
from apps.core import audit
from apps.core.http import IdempotentCommand
from apps.identity.serializers import (
    ActivateSerializer,
    InviteSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    MFACodeSerializer,
    AccountStatusSerializer,
    AccountAccessSerializer,
    MFARecoverySerializer,
    EmailVerificationSerializer,
    ProfileUpdateSerializer,
    MFARecoveryRequestSerializer,
    MFARecoveryDecisionSerializer,
    PeopleQuerySerializer,
    ActivityQuerySerializer,
    ProgrammeSettingsSerializer,
    BulkInviteSerializer,
    BulkStudentInviteSerializer,
    FacilityMentorQuerySerializer,
    FacilityMentorUpdateSerializer,
)
from apps.identity.models import Role, Status, User

logger = logging.getLogger(__name__)


def _user_payload(user):
    scope = identity.resolve_scope(user)
    return {"id": str(user.id), "email": user.email, "name": user.full_name, "phone": user.phone,
            "registration_number": user.registration_number,
            "role": user.role, "email_verified": bool(user.email_verified_at), "scope": scope.as_dict(),
            "capabilities": identity.capabilities_for(user)}


class LoginView(APIView):
    # Public means no existing product session is consulted. CSRF still applies
    # to this state-changing browser request.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authentication.authenticate_user(
            **serializer.validated_data,
        )
        if not user:
            return Response({"error": {"code": "InvalidCredentials", "message": "Invalid email or password."}}, status=401)
        if user.status != Status.ACTIVE:
            if user.status == Status.SUSPENDED:
                code = "AccountSuspended"
                message = "Your account is paused. A password reset will not restore access. Contact your Programme Administrator for help."
            elif user.status == Status.DEACTIVATED:
                code = "AccountDeactivated"
                message = "This account is no longer active. A password reset will not restore access. Contact your Programme Administrator for help."
            else:
                code = "InvitationPending"
                message = "Finish setting up your account from the invitation email before signing in."
            return Response({"error": {"code": code, "message": message}}, status=403)
        login(request, user)
        request.session.set_expiry(12 * 60 * 60)
        authentication.register_session(request=request, user=user)
        if authentication.mfa_required(user):
            request.session[authentication.MFA_VERIFIED_SESSION_KEY] = False
            recovery_contact = "programme_admin"
            if user.role == Role.PROGRAM_ADMIN:
                has_peer_admin = User.objects.filter(
                    program_id=user.program_id, role=Role.PROGRAM_ADMIN, status=Status.ACTIVE,
                ).exclude(pk=user.pk).exists()
                recovery_contact = "another_program_admin" if has_peer_admin else "support"
            return Response({"data": {"mfa_required": True,
                                       "mfa_setup_required": not authentication.mfa_is_enabled(user),
                                       "email_mfa_available": authentication.email_mfa_enabled(user),
                                       "recovery_contact": recovery_contact}}
                            , status=202)
        return Response({"data": _user_payload(user)})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CSRFCookieView(APIView):
    # CSRF bootstrap is public and must never be blocked by a pending MFA
    # session; its only job is to issue the browser cookie.
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"data": {"ready": True}})


class SessionView(APIView):
    """Return session state without turning an expected signed-out check into a 403."""

    # This probe must be able to inspect a password-authenticated, MFA-pending
    # session and report authenticated=false. The protected API boundary still
    # uses MFAEnforcedSessionAuthentication everywhere else.
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        authenticated = bool(
            user.is_authenticated
            and authentication.session_is_valid(request=request, user=user)
            and (
                not authentication.mfa_required(user)
                or request.session.get(authentication.MFA_VERIFIED_SESSION_KEY) is True
            )
        )
        return Response({
            "data": {
                "authenticated": authenticated,
                "user": _user_payload(user) if authenticated else None,
            }
        })


class LogoutView(APIView):
    # A user must be able to discard a pending MFA session as well as a fully
    # authenticated session.
    authentication_classes = [SessionAuthentication]
    # Logout must also be safe to repeat after an expired or already-cleared
    # session. The endpoint only revokes a session when one is authenticated.
    permission_classes = [AllowAny]

    def post(self, request):
        if request.user.is_authenticated and request.session.session_key:
            record = request.user.user_sessions.filter(
                session_key=request.session.session_key,
            ).first()
            if record:
                authentication.revoke_session(user=request.user, session_id=record.id)
        logout(request)
        return Response(status=204)


class InviteView(APIView):
    """Issue an invitation; the raw activation token is sent only by email."""

    def post(self, request):
        serializer = InviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authentication.invite_user(
            actor=request.user,
            program_id=request.user.program_id,
            **serializer.validated_data,
        )
        return Response({"data": {"id": str(user.id), "email": user.email, "status": user.status}}, status=202)


class BulkStudentInviteView(APIView):
    """Preview or issue student invitations for a coordinator's institution."""

    def post(self, request):
        serializer = BulkStudentInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = authentication.bulk_invite_students(
            actor=request.user,
            **serializer.validated_data,
        )
        return Response({"data": result})


class BulkMentorInviteView(APIView):
    """Preview or issue mentor invitations for a nurse manager's facility."""

    def post(self, request):
        serializer = BulkInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = authentication.bulk_invite_mentors(
            actor=request.user,
            **serializer.validated_data,
        )
        return Response({"data": result})


class PeopleView(APIView):
    """List the current programme's people with bounded server pagination."""

    def get(self, request):
        serializer = PeopleQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response({"data": selectors.program_people(actor=request.user, **serializer.validated_data)})


class FacilityMentorsView(APIView):
    """Facility-scoped mentor register for Nurse Manager operations."""
    def get(self, request, mentor_id=None):
        if mentor_id is None:
            serializer = FacilityMentorQuerySerializer(data=request.query_params)
            serializer.is_valid(raise_exception=True)
            return Response({"data": selectors.facility_mentors(actor=request.user, **serializer.validated_data)})
        actor = request.user
        if actor.status != Status.ACTIVE or actor.role != Role.NURSE_MANAGER or not actor.facility_id:
            return Response({"error": {"code": "UnauthorizedFacilityAccess", "message": "This mentor is outside your facility scope."}}, status=403)
        from apps.core.models import AuditEntry
        entries = AuditEntry.objects.filter(
            entity_id=mentor_id, entity_table="identity_user", action="mentor.availability_changed",
            scope__program_id=str(actor.program_id), scope__facility_id=str(actor.facility_id),
        ).select_related("actor").order_by("-occurred_at")[:50]
        return Response({"data": [{"id": str(entry.id), "actor": entry.actor.full_name, "actor_role": entry.actor_role,
                                    "occurred_at": entry.occurred_at.isoformat(), "changes": entry.changes or {},
                                    "reason": entry.override_reason} for entry in entries]})

    def patch(self, request, mentor_id):
        serializer = FacilityMentorUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = request.user
        if actor.status != Status.ACTIVE or actor.role != Role.NURSE_MANAGER or not actor.facility_id:
            return Response({"error": {"code": "UnauthorizedFacilityAccess", "message": "This mentor is outside your facility scope."}}, status=403)
        with transaction.atomic():
            mentor = User.objects.select_for_update().filter(
                id=mentor_id, program_id=actor.program_id, facility_id=actor.facility_id, role=Role.MENTOR,
            ).first()
            if mentor is None:
                return Response({"error": {"code": "MentorNotFound", "message": "This mentor is outside your facility scope."}}, status=404)
            previous = {
                "accepting_students": mentor.accepting_students,
                "max_active_placements": mentor.max_active_placements,
            }
            changes = {field: {"from": previous[field], "to": value} for field, value in serializer.validated_data.items() if field in previous and previous[field] != value}
            for field, value in serializer.validated_data.items():
                if field != "reason":
                    setattr(mentor, field, value)
            mentor.save(update_fields=[field for field in serializer.validated_data if field != "reason"] + ["updated_at"])
            if changes:
                from apps.placements.models import MentorAssignment
                affected = MentorAssignment.objects.filter(mentor_id=mentor.id, ended_at=None).count()
                audit.record(actor=actor, action="mentor.availability_changed", entity_table="identity_user", entity_id=mentor.id,
                             scope={"program_id": str(actor.program_id), "facility_id": str(actor.facility_id)},
                             changes={**changes, "affected_active_placements": affected},
                             override_reason=serializer.validated_data.get("reason") or "Manager allocation rule update")
        return Response({"data": {"id": str(mentor.id), "accepting_students": mentor.accepting_students, "max_active_placements": mentor.max_active_placements}})


class DashboardSummaryView(APIView):
    def get(self, request):
        return Response({"data": selectors.program_summary(actor=request.user)})


class ProgrammeSettingsView(APIView):
    def get(self, request):
        if request.user.role != "program_admin" or request.user.status != "active":
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "This programme setting is not available."}}, status=403)
        programme = request.user.program
        owners = User.objects.filter(program_id=programme.id, role=Role.PROGRAM_ADMIN, status=Status.ACTIVE).order_by("first_name", "last_name")
        current_owner = programme.owner
        if current_owner is None or current_owner.status != Status.ACTIVE or current_owner.program_id != programme.id:
            current_owner = request.user
        return Response({"data": {"id": str(programme.id), "name": programme.name, "short_name": programme.short_name,
                                    "description": programme.description, "academic_year": programme.academic_year,
                                    "owner_id": str(current_owner.id),
                                    "directory_reviewed_at": programme.directory_reviewed_at,
                                    "directory_reviewed_by_name": programme.directory_reviewed_by.full_name if programme.directory_reviewed_by_id else None,
                                    "owners": [{"id": str(owner.id), "name": owner.full_name} for owner in owners],
                                    "require_mentor_training_before_placement": programme.require_mentor_training_before_placement}})

    def patch(self, request):
        serializer = ProgrammeSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        programme = authentication.update_programme_settings(actor=request.user, **serializer.validated_data)
        if not programme:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "This programme setting is not available."}}, status=403)
        return Response({"data": {"id": str(programme.id), "name": programme.name, "short_name": programme.short_name,
                                    "description": programme.description, "academic_year": programme.academic_year,
                                    "owner_id": str(programme.owner_id) if programme.owner_id else str(request.user.id),
                                    "directory_reviewed_at": programme.directory_reviewed_at,
                                    "directory_reviewed_by_name": programme.directory_reviewed_by.full_name if programme.directory_reviewed_by_id else None,
                                    "require_mentor_training_before_placement": programme.require_mentor_training_before_placement}})


class AccessPolicyView(APIView):
    def get(self, request):
        if request.user.role != "program_admin" or request.user.status != "active":
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "This access policy is not available."}}, status=403)
        return Response({"data": capabilities.policy_summary()})


class ActivityView(APIView):
    def get(self, request):
        serializer = ActivityQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response({"data": core_selectors.program_activity(actor=request.user, **serializer.validated_data)})


class InvitationResendView(APIView):
    def post(self, request, user_id):
        target = authentication.User.objects.filter(id=user_id).first()
        if not target or not authentication.resend_invitation(actor=request.user, target=target):
            return Response({"error": {"code": "UnauthorizedInvitationAction", "message": "This invitation cannot be resent."}}, status=403)
        target.refresh_from_db(fields=["status"])
        return Response({"data": {"id": str(target.id), "status": target.status}})


class ActivateView(APIView):
    # Activation must be independent of any account already open in the
    # browser. The endpoint remains CSRF-protected by Django middleware.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_activate"

    def post(self, request):
        serializer = ActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authentication.user_from_uid(serializer.validated_data["uid"])
        if not user:
            return Response({"error": {"code": "InvalidInvitation", "message": "This invitation is invalid or expired."}}, status=400)
        activated = authentication.activate_user(user=user, token=serializer.validated_data["token"], password=serializer.validated_data["password"])
        if not activated:
            return Response({"error": {"code": "InvalidInvitation", "message": "This invitation is invalid or expired."}}, status=400)
        login(request, activated)
        request.session.set_expiry(12 * 60 * 60)
        authentication.register_session(request=request, user=activated)
        if authentication.mfa_required(activated):
            request.session[authentication.MFA_VERIFIED_SESSION_KEY] = False
            return Response({"data": {"mfa_required": True, "mfa_setup_required": True}}, status=202)
        return Response({"data": _user_payload(activated)}, status=201)


class EmailVerificationView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_email_verify"

    def post(self, request):
        serializer = EmailVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not authentication.verify_email_code(user=request.user, code=serializer.validated_data["code"]):
            return Response({"error": {"code": "InvalidEmailVerification", "message": "That code is invalid or expired."}}, status=400)
        return Response({"data": {"verified": True, "mfa_required": authentication.mfa_required(request.user), "mfa_setup_required": authentication.mfa_required(request.user) and not authentication.mfa_is_enabled(request.user)}})


class EmailVerificationResendView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_email_challenge"

    def post(self, request):
        if request.user.email_verified_at:
            return Response({"data": {"accepted": True}})
        authentication.issue_email_verification(request.user)
        return Response({"data": {"accepted": True}})


class MFASetupView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_mfa_setup"

    def post(self, request):
        return Response({"data": authentication.begin_mfa_setup(request=request, user=request.user)})


class MFAVerifySetupView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_mfa"

    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = authentication.complete_mfa_setup(
            request=request, user=request.user, code=serializer.validated_data["code"],
        )
        if codes is None:
            return Response({"error": {"code": "InvalidMFA", "message": "That code did not match. Check your authenticator app and try again."}}, status=400)
        return Response({"data": {"enabled": True, "recovery_codes": codes}})


class MFAVerifyLoginView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_mfa"

    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not authentication.verify_mfa(
            request=request, user=request.user, code=serializer.validated_data["code"],
        ):
            return Response({"error": {"code": "InvalidMFA", "message": "That sign-in code did not match. Check it and try again."}}, status=400)
        return Response({"data": _user_payload(request.user)})


class MFAEmailSetupView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_mfa_setup"

    def post(self, request):
        if authentication.mfa_required(request.user) and request.session.get(authentication.MFA_VERIFIED_SESSION_KEY) is not True:
            return Response({"error": {"code": "MFARequired", "message": "Verify MFA before changing MFA settings."}}, status=403)
        with IdempotentCommand(request, "enable_email_mfa") as command:
            if command.replayed:
                return Response({"data": {"enabled": True}, "meta": {"idempotency_replayed": True}})
            authentication.enable_email_mfa(user=request.user)
            command.record(request.user.id)
        return Response({"data": {"enabled": True}, "meta": {"idempotency_replayed": False}}, status=201)

    def delete(self, request):
        if authentication.mfa_required(request.user) and request.session.get(authentication.MFA_VERIFIED_SESSION_KEY) is not True:
            return Response({"error": {"code": "MFARequired", "message": "Verify MFA before changing MFA settings."}}, status=403)
        with IdempotentCommand(request, "disable_email_mfa") as command:
            if command.replayed:
                return Response(status=204)
            authentication.disable_email_mfa(user=request.user)
            command.record(request.user.id)
        return Response(status=204)


class MFAEmailChallengeView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_email_challenge"

    def post(self, request):
        with IdempotentCommand(request, "request_email_mfa_challenge") as command:
            if command.replayed:
                return Response({"data": {"sent": True}, "meta": {"idempotency_replayed": True}})
            authentication.request_email_mfa_challenge(user=request.user)
            command.record(request.user.id)
        return Response({"data": {"sent": True}, "meta": {"idempotency_replayed": False}}, status=202)


class MFAEmailVerifyView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_mfa"

    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not authentication.verify_email_mfa(
            request=request, user=request.user, code=serializer.validated_data["code"],
        ):
            return Response({"error": {"code": "InvalidEmailMFA", "message": "That email sign-in code did not match or has expired. Try again."}}, status=400)
        return Response({"data": _user_payload(request.user)})


class MFADeviceView(APIView):
    def get(self, request):
        authenticators = request.user.authenticator_set.all()
        devices = [{
            "type": item.type, "id": str(item.id),
            "created_at": item.created_at, "last_used_at": item.last_used_at,
        } for item in authenticators]
        email_device = authentication.email_mfa_device(request.user)
        if email_device:
            devices.append({
                "type": "email", "id": str(email_device.id),
                "created_at": email_device.created_at, "last_used_at": email_device.last_used_at,
            })
        return Response({"data": devices})

    def delete(self, request):
        if not authentication.remove_totp(user=request.user):
            return Response({"error": {"code": "MFARequired", "message": "This account must retain an MFA device."}}, status=400)
        return Response(status=204)


class RecoveryCodesRegenerateView(APIView):
    def post(self, request):
        if authentication.mfa_required(request.user) and request.session.get(authentication.MFA_VERIFIED_SESSION_KEY) is not True:
            return Response({"error": {"code": "MFARequired", "message": "Verify MFA before regenerating recovery codes."}}, status=403)
        return Response({"data": {"recovery_codes": authentication.regenerate_recovery_codes(user=request.user)}})


class MFARecoveryView(APIView):
    def post(self, request, user_id):
        serializer = MFARecoverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pending = None
        if request.user.status == Status.ACTIVE and request.user.role == Role.PROGRAM_ADMIN:
            from apps.identity.models import MFARecoveryRequest
            pending = MFARecoveryRequest.objects.filter(
                user_id=user_id, user__program_id=request.user.program_id,
                status=MFARecoveryRequest.Status.PENDING,
            ).order_by("created_at").first()
        if not pending or not authentication.review_mfa_recovery_request(
            actor=request.user, request_id=pending.id, decision="recover",
            reason=serializer.validated_data["reason"],
        ):
            return Response({"error": {"code": "UnauthorizedMFARecovery", "message": "This MFA recovery action is not permitted."}}, status=403)
        return Response({"data": {"recovered": True}})


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            authentication.request_password_reset(**serializer.validated_data)
        except Exception:
            logger.exception("Password reset request could not be queued")
            return Response(
                {"error": {"code": "RecoveryUnavailable", "message": "Password recovery is temporarily unavailable. Please try again shortly."}},
                status=503,
            )
        return Response({"data": {"accepted": True}})


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_password_reset_confirm"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authentication.user_from_uid(serializer.validated_data["uid"])
        if not user:
            return Response({"error": {"code": "InvalidReset", "message": "This reset link is invalid or expired."}}, status=400)
        if not authentication.reset_password(user=user, token=serializer.validated_data["token"], password=serializer.validated_data["password"]):
            return Response({"error": {"code": "InvalidReset", "message": "This reset link is invalid or expired."}}, status=400)
        return Response({"data": {"accepted": True}})


class PasswordChangeView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not authentication.change_password(
            user=request.user,
            current_password=serializer.validated_data["current_password"],
            new_password=serializer.validated_data["new_password"],
            current_session_key=request.session.session_key,
        ):
            return Response({"error": {"code": "InvalidPassword", "message": "The current password is incorrect."}}, status=400)
        update_session_auth_hash(request, request.user)
        return Response({"data": {"accepted": True}})


class MeView(APIView):
    """Identity, scope, and capability flags.

    The UI gates on the flags, never on the role string, so the client cannot
    re-implement the authorisation matrix and drift from it (FE-04).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": _user_payload(request.user)})

    def patch(self, request):
        serializer = ProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authentication.update_profile(user=request.user, **serializer.validated_data)
        return Response({"data": _user_payload(user)})


class MFARecoveryRequestView(APIView):
    # A password-authenticated session may ask for help before MFA completes;
    # all other protected recovery operations still require completed MFA.
    authentication_classes = [SessionAuthentication]

    def get(self, request):
        if not authentication.session_is_valid(request=request, user=request.user):
            return Response({"error": {"code": "SessionExpired", "message": "Sign in again to continue."}}, status=403)
        if request.user.status != Status.ACTIVE or request.user.role != Role.PROGRAM_ADMIN:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "This recovery list is not available."}}, status=403)
        if authentication.mfa_required(request.user) and request.session.get(authentication.MFA_VERIFIED_SESSION_KEY) is not True:
            return Response({"error": {"code": "MFARequired", "message": "Verify your sign-in code to review recovery requests."}}, status=403)
        from apps.identity.models import MFARecoveryRequest
        records = MFARecoveryRequest.objects.filter(
            status=MFARecoveryRequest.Status.PENDING, user__program_id=request.user.program_id,
        ).exclude(user_id=request.user.id).select_related("user").order_by("created_at")[:100]
        return Response({"data": [{"id": str(item.id), "user_id": str(item.user_id),
            "name": item.user.full_name, "email": item.user.email, "role": item.user.role,
            "reason": item.reason, "created_at": item.created_at} for item in records]})

    def post(self, request):
        if not authentication.session_is_valid(request=request, user=request.user):
            return Response({"error": {"code": "SessionExpired", "message": "Sign in again to request help."}}, status=403)
        serializer = MFARecoveryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_record = authentication.create_mfa_recovery_request(user=request.user, **serializer.validated_data)
        if request_record is None:
            return Response({"error": {"code": "RecoveryRequestUnavailable", "message": "A recovery request could not be created."}}, status=400)
        return Response({"data": {"id": str(request_record.id), "status": request_record.status}}, status=202)


class MFARecoveryRequestResolveView(APIView):
    def post(self, request, request_id):
        serializer = MFARecoveryDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not authentication.review_mfa_recovery_request(actor=request.user, request_id=request_id,
                                                          **serializer.validated_data):
            return Response({"error": {"code": "RecoveryRequestUnavailable", "message": "This request cannot be reviewed."}}, status=403)
        return Response({"data": {"reviewed": True}})


class AccountSessionsRevokeView(APIView):
    def post(self, request, user_id):
        serializer = MFARecoverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = User.objects.filter(pk=user_id).first()
        count = authentication.revoke_account_sessions(actor=request.user, target=target,
                                                       **serializer.validated_data) if target else None
        if count is None:
            return Response({"error": {"code": "UnauthorizedSessionRevocation", "message": "These sessions cannot be revoked."}}, status=403)
        return Response({"data": {"revoked_count": count}})


class PersonActivityView(APIView):
    def get(self, request, user_id):
        if request.user.status != Status.ACTIVE or request.user.role != Role.PROGRAM_ADMIN:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "This activity is not available."}}, status=403)
        target = User.objects.filter(pk=user_id, program_id=request.user.program_id).first()
        if not target:
            return Response({"error": {"code": "PersonNotFound", "message": "Person not found."}}, status=404)
        from apps.core.models import AuditEntry
        rows = AuditEntry.objects.filter(entity_table="identity_user", entity_id=target.id,
            scope__program_id=str(request.user.program_id)).select_related("actor").order_by("-occurred_at")[:30]
        from apps.core import activity_feed
        return Response({"data": [{"id": item["id"], "action": item["title"],
            "actor_name": item["actor"], "actor_role": item["actor_role"],
            "occurred_at": item["occurred_at"]} for item in activity_feed.describe_many(rows, request.user, scope_view=True)]})


class SessionListView(APIView):
    def get(self, request):
        records = request.user.user_sessions.filter(revoked_at=None, expires_at__gt=timezone.now()).order_by("-last_seen_at")
        current_key = request.session.session_key
        return Response({"data": [{
            "id": str(record.id), "device": record.device_label,
            "ip_address": record.ip_address, "created_at": record.created_at,
            "last_seen_at": record.last_seen_at, "expires_at": record.expires_at,
            "current": record.session_key == current_key,
        } for record in records]})


class SessionRevokeView(APIView):
    def delete(self, request, session_id):
        if not authentication.revoke_session(user=request.user, session_id=session_id):
            return Response({"error": {"code": "SessionNotFound", "message": "Session not found."}}, status=404)
        return Response(status=204)


class SessionRevokeOthersView(APIView):
    def post(self, request):
        count = authentication.revoke_other_sessions(
            user=request.user, current_session_key=request.session.session_key,
        )
        return Response({"data": {"revoked": count}})


class AccountStatusView(APIView):
    def patch(self, request, user_id):
        serializer = AccountStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = authentication.User.objects.filter(id=user_id).first()
        if not target:
            return Response({"error": {"code": "AccountNotFound", "message": "Account not found."}}, status=404)
        changed = authentication.change_status(actor=request.user, target=target, **serializer.validated_data)
        if not changed:
            return Response({"error": {"code": "UnauthorizedAccountAction", "message": "This account action is not permitted."}}, status=403)
        return Response({"data": {"id": str(target.id), "status": target.status}})


class AccountAccessView(APIView):
    def patch(self, request, user_id):
        serializer = AccountAccessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = authentication.User.objects.filter(id=user_id).first()
        if not target:
            return Response({"error": {"code": "AccountNotFound", "message": "Account not found."}}, status=404)
        changed = authentication.change_access(actor=request.user, target=target, **serializer.validated_data)
        if not changed:
            return Response({"error": {"code": "InvalidAccountAccess", "message": "That role and scope combination is not permitted."}}, status=400)
        return Response({"data": {"id": str(target.id), "role": target.role, "institution_id": target.institution_id, "facility_id": target.facility_id}})


def _mentor_profile_payload(profile):
    return {
        "cadre": profile.cadre,
        "department": profile.department,
        "years_of_practice": profile.years_of_practice,
        "mentorship_experience_years": profile.mentorship_experience_years,
        "cpd_identifier": profile.cpd_identifier,
        "digital_literacy": profile.digital_literacy,
    }


class MentorProfileView(APIView):
    """A mentor's own professional profile. Optional; never a placement gate."""

    permission_classes = [IsAuthenticated]

    def _profile(self, request):
        from apps.core.errors import UnauthorizedFacilityAccess
        from apps.identity.models import MentorProfile

        if request.user.role != Role.MENTOR or request.user.status != Status.ACTIVE:
            raise UnauthorizedFacilityAccess()
        profile, _ = MentorProfile.objects.get_or_create(user=request.user)
        return profile

    def get(self, request):
        return Response({"data": _mentor_profile_payload(self._profile(request))})

    def patch(self, request):
        from apps.identity.serializers import MentorProfileSerializer

        profile = self._profile(request)
        payload = MentorProfileSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        with transaction.atomic():
            for field, value in payload.validated_data.items():
                setattr(profile, field, value.strip() if isinstance(value, str) else value)
            profile.save()
            audit.record(
                actor=request.user, action="mentor.profile_updated", entity_table="identity_mentor_profile",
                entity_id=profile.id, scope={"program_id": str(request.user.program_id)},
                changes={"fields": sorted(payload.validated_data)},
            )
        return Response({"data": _mentor_profile_payload(profile)})
