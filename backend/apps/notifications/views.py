import hashlib
import hmac
import json
import uuid

from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications import serializers, services


class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preferences = services.get_preferences(user=request.user)
        return Response({"data": serializers.NotificationPreferenceSerializer(preferences).data})

    def patch(self, request):
        payload = serializers.NotificationPreferenceSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        preferences = services.update_preferences(user=request.user, **payload.validated_data)
        return Response({"data": serializers.NotificationPreferenceSerializer(preferences).data})


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        unread_only = request.query_params.get("unread") == "true"
        rows = services.inbox(user=request.user, unread_only=unread_only)
        return Response({"data": serializers.NotificationSerializer(rows, many=True).data})


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id):
        row = services.mark_read(user=request.user, notification_id=notification_id)
        if row is None:
            return Response({"error": {"code": "NotificationNotFound", "message": "Notification not found."}}, status=404)
        return Response({"data": serializers.NotificationSerializer(row).data})


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated_count = services.mark_all_read(user=request.user)
        return Response({"data": {"updated_count": updated_count}})


@method_decorator(csrf_exempt, name="dispatch")
class MailtrapWebhookView(APIView):
    """Receive normalized Mailtrap delivery/bounce callbacks."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        secret = settings.MAILTRAP_WEBHOOK_SECRET
        supplied = request.headers.get("X-Mailtrap-Signature", "")
        expected = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest() if secret else ""
        if not secret or not supplied or not hmac.compare_digest(supplied, expected):
            return Response({"error": {"code": "InvalidWebhookSignature", "message": "Webhook signature is invalid."}}, status=401)
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return Response({"error": {"code": "InvalidWebhookPayload", "message": "Webhook payload is invalid."}}, status=400)
        metadata = payload.get("metadata") or {}
        notification_id = payload.get("notification_id") or metadata.get("notification_id")
        status = payload.get("status") or payload.get("event")
        provider_event_id = str(payload.get("id") or payload.get("event_id") or "")
        if not notification_id or not status or not provider_event_id:
            return Response({"error": {"code": "InvalidWebhookPayload", "message": "Webhook payload is incomplete."}}, status=400)
        try:
            notification_id = uuid.UUID(str(notification_id))
        except ValueError:
            return Response({"error": {"code": "InvalidWebhookPayload", "message": "Notification identifier is invalid."}}, status=400)
        row = services.record_provider_event(
            notification_id=notification_id, status=status, provider_event_id=provider_event_id,
        )
        if row is None:
            return Response({"data": {"accepted": True}})
        return Response({"data": {"accepted": True, "notification_id": str(row.id)}})
