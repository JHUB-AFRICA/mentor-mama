"""Authenticated HTTP boundary for preview-first directory imports."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import UnauthorizedFacilityAccess
from apps.core.http import IdempotentCommand
from apps.directory_imports import serializers, services


class DirectoryImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, kind: str, stage: str):
        payload = serializers.DirectoryImportSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        values = payload.validated_data
        actor = request.user

        if stage == "preview":
            result = services.preview(
                actor=actor,
                kind=kind,
                uploaded_file=values["file"],
                facility_id=values.get("facility_id"),
            )
            if result is None:
                raise UnauthorizedFacilityAccess()
            return Response({"data": result})

        if stage != "commit":
            return Response({"error": {"code": "NotFound", "message": "Not found."}}, status=status.HTTP_404_NOT_FOUND)

        with IdempotentCommand(request, f"directory_import_{kind}") as command:
            if command.replayed:
                return Response({"data": {
                    "resource_type": kind,
                    "replayed": True,
                    "message": "This import was already completed.",
                }, "meta": {"idempotency_replayed": True}})
            result = services.commit(
                actor=actor,
                kind=kind,
                uploaded_file=values["file"],
                facility_id=values.get("facility_id"),
                preview_token=values.get("preview_token", ""),
                confirm_warnings=values.get("confirm_warnings", False),
                command_id=command.command_id,
            )
            if result is None:
                raise UnauthorizedFacilityAccess()
            command.record(command.command_id)

        return Response({"data": {**result, "replayed": False},
                         "meta": {"idempotency_replayed": False}}, status=status.HTTP_201_CREATED)
