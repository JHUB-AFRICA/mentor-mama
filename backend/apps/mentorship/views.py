from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import DuplicateSession
from apps.core.http import IdempotentCommand
from apps.mentorship import serializers, services
from apps.mentorship.models import Session


class SessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, placement_id):
        payload = serializers.LogSessionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "log_session") as command:
            if command.replayed:
                session = Session.objects.filter(id=command.result_ref).first()
                response = Response({
                    "data": serializers.SessionSerializer(session).data if session else None,
                    "meta": {"command": "log_session", "idempotency_replayed": True},
                })
                response["Idempotency-Replayed"] = "true"
                return response
            data = dict(payload.validated_data)
            data["topics"] = tuple(data.get("topics") or ())
            try:
                session = services.log_session(
                    services.LogSession(placement_id=placement_id, **data), actor=request.user
                )
            except DuplicateSession as duplicate:
                # WFR-014: a duplicate is satisfied, not rejected. The mentor is
                # told it worked, because it did.
                original = Session.objects.filter(id=duplicate.details.get("session_id")).first()
                return Response({
                    "data": serializers.SessionSerializer(original).data if original else None,
                    "meta": {"command": "log_session", "duplicate": True},
                })
            command.record(session.id)
        return Response(
            {"data": serializers.SessionSerializer(session).data,
             "meta": {"command": "log_session", "idempotency_replayed": False}},
            status=status.HTTP_201_CREATED,
        )
