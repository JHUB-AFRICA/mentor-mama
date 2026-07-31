"""HTTP surface for placements. Commands, not CRUD (ADR 0010)."""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import UnauthorizedFacilityAccess
from apps.core.http import IdempotentCommand
from apps.identity import api as identity
from apps.placements import api as placements_api, selectors, serializers, services
from apps.placements.models import Placement, State


class PlacementListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = identity.resolve_scope(request.user)
        rows = selectors.in_scope(scope).order_by("-created_at")[:100]
        return Response({"data": serializers.PlacementSerializer(rows, many=True).data})

    def post(self, request):
        payload = serializers.CreatePlacementSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "create_placement") as command:
            if command.replayed:
                return _replayed(command)
            placement = services.create_placement(
                services.CreatePlacement(**payload.validated_data), actor=request.user
            )
            command.record(placement.id)
        return Response(
            {"data": serializers.PlacementSerializer(placement).data,
             "meta": {"command": "create_placement", "idempotency_replayed": False}},
            status=status.HTTP_201_CREATED,
        )


class PlacementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        placement = _get_in_scope(request, placement_id)
        return Response({"data": serializers.PlacementSerializer(placement).data})


class PlacementTransitionsView(APIView):
    """Which commands are legal now, and why not for the rest (Stage 6 §7.3).

    Exists so the UI never re-implements the state machine.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        placement = _get_in_scope(request, placement_id)
        return Response({"data": {
            "state": placement.state,
            "available": placements_api.available_transitions(placement.id),
            "blocked": placements_api.blocked_transitions(placement.id),
        }})


class _CommandView(APIView):
    permission_classes = [IsAuthenticated]
    command_type = ""
    serializer_class = None

    def run(self, request, placement, data):
        raise NotImplementedError

    def post(self, request, placement_id):
        placement = _get_in_scope(request, placement_id)
        data = {}
        if self.serializer_class is not None:
            payload = self.serializer_class(data=request.data)
            payload.is_valid(raise_exception=True)
            data = payload.validated_data
        with IdempotentCommand(request, self.command_type) as command:
            if command.replayed:
                return _replayed(command)
            result = self.run(request, placement, data)
            command.record(result.id)
        return Response({
            "data": serializers.PlacementSerializer(result).data,
            "meta": {"command": self.command_type, "idempotency_replayed": False},
        })


class AllocateWardView(_CommandView):
    command_type = "allocate_ward"
    serializer_class = serializers.WardSerializer

    def run(self, request, placement, data):
        return services.allocate_ward(placement.id, data["ward_id"], actor=request.user)


class AssignMentorView(_CommandView):
    command_type = "assign_mentor"
    serializer_class = serializers.MentorSerializer

    def run(self, request, placement, data):
        return services.assign_mentor(placement.id, data["mentor_id"], actor=request.user)


class ReassignMentorView(_CommandView):
    command_type = "reassign_mentor"
    serializer_class = serializers.MentorSerializer

    def run(self, request, placement, data):
        return services.reassign_mentor(
            placement.id, data["mentor_id"], actor=request.user, reason=data.get("reason", "")
        )


class PauseView(_CommandView):
    command_type = "pause_placement"
    serializer_class = serializers.PauseSerializer

    def run(self, request, placement, data):
        return services.pause(
            placement.id, actor=request.user, reason=data["reason"], note=data.get("note")
        )


class ResumeView(_CommandView):
    command_type = "resume_placement"

    def run(self, request, placement, data):
        return services.resume(placement.id, actor=request.user)


class CompleteView(_CommandView):
    command_type = "complete_placement"

    def run(self, request, placement, data):
        return services.transition(placement.id, State.COMPLETED, actor=request.user)


class WithdrawView(_CommandView):
    command_type = "withdraw_placement"
    serializer_class = serializers.TransitionSerializer

    def run(self, request, placement, data):
        return services.transition(
            placement.id, State.WITHDRAWN, actor=request.user, reason=data.get("reason")
        )


def _get_in_scope(request, placement_id):
    """A scope miss returns 404, never 403 (SEC-03, AUTH-004)."""
    scope = identity.resolve_scope(request.user)
    placement = selectors.in_scope(scope).filter(id=placement_id).first()
    if placement is None:
        raise UnauthorizedFacilityAccess()
    return placement


def _replayed(command):
    placement = Placement.objects.filter(id=command.result_ref).first()
    body = serializers.PlacementSerializer(placement).data if placement else None
    response = Response({"data": body,
                         "meta": {"command": command.command_type, "idempotency_replayed": True}})
    response["Idempotency-Replayed"] = "true"
    return response
