from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from apps.core.errors import DuplicateSession
from apps.core.http import IdempotentCommand
from apps.mentorship import serializers, services
from apps.mentorship.models import Session, SessionBatch, SessionBatchResult


class SessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        role = getattr(request.user, "role", None)
        if role == "mentor":
            sessions = Session.objects.filter(
                placement_id=placement_id,
                mentor_assignment__mentor=request.user,
            )
        elif role == "student":
            # Students may read the session history attached to their own
            # placement. Do not require the assignment to remain open: ended
            # assignments still own historical learning records.
            sessions = Session.objects.filter(
                placement_id=placement_id,
                placement__student_assignments__student=request.user,
            )
        else:
            raise PermissionDenied("Only the assigned mentor or student may view mentorship sessions.")
        sessions = sessions.prefetch_related("topics").order_by("-session_date", "-submitted_at").distinct()
        return Response({"data": serializers.SessionSerializer(sessions, many=True).data})

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
            duplicate = False
            try:
                session = services.log_session(
                    services.LogSession(placement_id=placement_id, **data), actor=request.user
                )
            except DuplicateSession as duplicate_error:
                # WFR-014: a duplicate is satisfied, not rejected. The mentor is
                # told it worked, because it did.  Crucially, this command also
                # records the original result before commit, so a lost response
                # can be reconciled without another write.
                session = Session.objects.filter(id=duplicate_error.details.get("session_id")).first()
                duplicate = True
            command.record(session.id)
        if duplicate:
            return Response({
                "data": serializers.SessionSerializer(session).data,
                "meta": {"command": "log_session", "duplicate": True},
            })
        return Response(
            {"data": serializers.SessionSerializer(session).data,
             "meta": {"command": "log_session", "idempotency_replayed": False}},
            status=status.HTTP_201_CREATED,
        )


class SessionBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = serializers.LogSessionBatchSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "log_session_batch") as command:
            if command.replayed:
                batch = SessionBatch.objects.filter(id=command.result_ref).first()
                replayed = True
            else:
                data = dict(payload.validated_data)
                placement_ids = tuple(data.pop("placement_ids"))
                data["topics"] = tuple(data.get("topics") or ())
                batch, _ = services.log_session_batch(
                    services.LogSessionBatch(placement_ids=placement_ids, **data), actor=request.user
                )
                command.record(batch.id)
                replayed = False
        if batch is None:
            return Response({"data": None, "meta": {"command": "log_session_batch", "idempotency_replayed": True}})
        rows = SessionBatchResult.objects.filter(batch=batch).select_related(
            "session", "placement"
        ).prefetch_related("session__topics", "placement__student_assignments__student").order_by("placement_id")
        sessions = []
        for row in rows:
            session_data = serializers.SessionSerializer(row.session).data
            student_assignment = next(
                (item for item in row.placement.student_assignments.all() if item.ended_at is None),
                None,
            )
            sessions.append({
                "placement_id": str(row.placement_id),
                "student_name": student_assignment.student.full_name if student_assignment else "Assigned student",
                "duplicate": row.duplicate,
                "session": session_data,
            })
        return Response({
            "data": {"batch_id": str(batch.id), "sessions": sessions,
                     "created_count": sum(not row["duplicate"] for row in sessions),
                     "duplicate_count": sum(row["duplicate"] for row in sessions)},
            "meta": {"command": "log_session_batch", "idempotency_replayed": replayed},
        }, status=status.HTTP_200_OK if replayed else status.HTTP_201_CREATED)
