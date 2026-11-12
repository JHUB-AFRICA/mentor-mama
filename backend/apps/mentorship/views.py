from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from apps.core.errors import DuplicateSession
from apps.core.http import IdempotentCommand
from apps.identity import api as identity
from apps.mentorship import followups, serializers, services
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
        sessions = sessions.select_related("follow_up_resolution").prefetch_related("topics").order_by("-session_date", "-submitted_at").distinct()
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


class FollowUpListView(APIView):
    """The signed-in mentor's follow-ups (or, for a nurse manager, supervisor reviews on their facility)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        identity.require_capability(request.user, "manage_follow_ups")
        query = serializers.FollowUpQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        value = query.validated_data
        result = followups.listing(request.user, followups.Filters(
            status=value["status"], action=value["action"],
            placement_id=str(value["placement_id"] or ""), student_id=str(value["student_id"] or ""),
            min_age_days=value["min_age_days"], page=value["page"], page_size=value["page_size"],
        ))
        return Response(result)


class FollowUpSummaryView(APIView):
    """Cheap counts for the sidebar badge and the overview card."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        identity.require_capability(request.user, "manage_follow_ups")
        return Response({"data": followups.counts(request.user)})


class FollowUpResolveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        payload = serializers.FollowUpResolveSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        _, created = services.resolve_follow_up(
            session_id, actor=request.user, note=payload.validated_data["note"],
            outcome=payload.validated_data["outcome"],
        )
        return Response({"data": followups.detail(session_id), "meta": {"changed": created}})


class FollowUpReopenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        changed = services.reopen_follow_up(session_id, actor=request.user)
        return Response({"data": followups.detail(session_id), "meta": {"changed": changed}})
