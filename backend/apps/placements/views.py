"""HTTP surface for placements. Commands, not CRUD (ADR 0010)."""

from __future__ import annotations

from uuid import UUID

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction

from apps.core import errors
from apps.core.errors import UnauthorizedFacilityAccess
from apps.core.http import IdempotentCommand
from apps.core.models import IdempotencyKey
from apps.identity import api as identity
from apps.placements import api as placements_api, events, selectors, serializers, services
from apps.placements.models import MentorAssignment, Placement, PlacementBatch, State


class PlacementListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = identity.resolve_scope(request.user)
        try:
            page_number = max(int(request.query_params.get("page", 1)), 1)
            page_size = int(request.query_params.get("page_size", 12))
        except ValueError:
            page_number, page_size = 1, 12
        rows, total, page_size = selectors.page(scope, page_number=page_number, page_size=page_size,
                                                search=request.query_params.get("search", "").strip(),
                                                state=request.query_params.get("state", "").strip(),
                                                cohort_id=request.query_params.get("cohort", "").strip(),
                                                institution_id=request.query_params.get("institution", "").strip(),
                                                facility_id=request.query_params.get("facility", "").strip(),
                                                ward_id=request.query_params.get("ward", "").strip(),
                                                mentor_id=request.query_params.get("mentor", "").strip())
        return Response({"data": {"results": serializers.PlacementSerializer(rows, many=True).data,
                                   "pagination": {"page": page_number, "page_size": page_size, "total_count": total,
                                                   "total_pages": (total + page_size - 1) // page_size,
                                                   "has_next": page_number * page_size < total,
                                                   "has_previous": page_number > 1}}})

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


class BulkPlacementCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = serializers.BulkCreatePlacementsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "bulk_create_placements") as command:
            if command.replayed:
                batch = PlacementBatch.objects.filter(id=command.result_ref, actor_id=request.user.id).first()
                if batch:
                    return Response({"data": _batch_payload(batch), "meta": {"idempotency_replayed": True}})
                created_query = Placement.objects.filter(
                    cohort_id=payload.validated_data["cohort_id"],
                    planned_start=payload.validated_data["planned_start"],
                    planned_end=payload.validated_data["planned_end"],
                    created_by=request.user,
                    created_at__gte=IdempotencyKey.objects.get(command_id=command.command_id).created_at,
                )
                if not payload.validated_data["all_eligible"]:
                    created_query = created_query.filter(
                        student_assignments__student_id__in=payload.validated_data["student_ids"]
                    )
                created_query = created_query.distinct().order_by("created_at")
                return Response({"data": {
                    "created": serializers.PlacementSerializer(created_query, many=True).data,
                    "skipped": [], "batch_id": str(command.command_id), "status": "completed", "replayed": True,
                }})
            if payload.validated_data["all_eligible"] or len(payload.validated_data["student_ids"]) > 50:
                batch = PlacementBatch.objects.create(
                    actor_id=request.user.id,
                    cohort_id=payload.validated_data["cohort_id"],
                    planned_start=payload.validated_data["planned_start"],
                    planned_end=payload.validated_data["planned_end"],
                    student_ids=[str(value) for value in payload.validated_data["student_ids"]],
                    all_eligible=payload.validated_data["all_eligible"],
                )
                command.record(batch.id)
                from apps.placements.tasks import process_placement_batch_task
                transaction.on_commit(lambda: process_placement_batch_task.delay(str(batch.id)))
                return Response({"data": _batch_payload(batch), "meta": {"async": True}}, status=status.HTTP_202_ACCEPTED)
            result = services.bulk_create_placements(
                services.BulkCreatePlacements(**payload.validated_data), actor=request.user
            )
            # The idempotency table stores one result reference. A sentinel is
            # used when every requested student was skipped so retries remain
            # safe and do not get stuck as "in progress".
            command.record(result["created"][0].id if result["created"] else UUID(int=0))
        return Response({"data": {
            "created": serializers.PlacementSerializer(result["created"], many=True).data,
            "skipped": result["skipped"],
            "batch_id": str(command.command_id),
            "status": "completed",
            "replayed": False,
        }}, status=status.HTTP_201_CREATED)


class PlacementBatchStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        batch = PlacementBatch.objects.filter(id=batch_id, actor_id=request.user.id).first()
        if batch is None:
            raise UnauthorizedFacilityAccess()
        return Response({"data": _batch_payload(batch)})


class PlacementBatchListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        batches = PlacementBatch.objects.filter(actor_id=request.user.id).order_by("-created_at")[:50]
        # ?summary=1 leaves out each batch's placements (``created`` is then empty; use ``created_count``): the activity list needs only counts.
        full = request.query_params.get("summary") not in {"1", "true"}
        return Response({"data": [_batch_payload(batch, include_placements=full) for batch in batches]})


class PlacementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        placement = _get_in_scope(request, placement_id)
        return Response({"data": serializers.PlacementSerializer(placement).data})


class PlacementOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = identity.resolve_scope(request.user)
        cohorts, wards, mentors = selectors.options(scope)
        return Response({"data": {
            "cohorts": [{"id": str(item.id), "name": item.name, "institution_id": str(item.institution_id), "institution_name": item.institution.name, "start_date": item.start_date.isoformat(), "end_date": item.end_date.isoformat()} for item in cohorts],
            "wards": [{"id": str(item.id), "name": item.name, "facility_id": str(item.facility_id), "facility_name": item.facility.name, "capacity": item.max_students} for item in wards],
            "mentors": [{"id": str(item.id), "name": item.full_name, "email": item.email, "facility_id": str(item.facility_id), "accepting_students": item.accepting_students, "active_placements": item.active_placement_count, "max_active_placements": item.max_active_placements} for item in mentors],
        }})


class PlacementEligibleStudentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, cohort_id):
        query = serializers.PlacementEligibilityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response({"data": services.placement_eligible_students(
            actor=request.user, cohort_id=cohort_id, **query.validated_data
        )})


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


class PlacementActivityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        scope = identity.resolve_scope(request.user)
        entries = selectors.activity(scope, placement_id)
        if entries is None:
            raise UnauthorizedFacilityAccess()
        from apps.core import activity_feed
        items = activity_feed.describe_many(entries, request.user, scope_view=True)
        return Response({"data": [{
            "id": item["id"], "action": item["title"], "title": item["title"], "summary": item["summary"],
            "actor": item["actor"], "actor_role": item["actor_role"], "occurred_at": item["occurred_at"].isoformat(),
            "details": item["details"], "changes": {}, "override_reason": None,
        } for item in items]})


class PlacementNotesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        placement = _get_in_scope(request, placement_id)
        return Response({"data": serializers.PlacementNoteSerializer(
            placement.notes.select_related("author"), many=True
        ).data})

    def post(self, request, placement_id):
        placement = _get_in_scope(request, placement_id)
        payload = serializers.CreatePlacementNoteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "add_placement_note") as command:
            if command.replayed:
                note = placement.notes.select_related("author").filter(id=command.result_ref).first()
                return Response({"data": serializers.PlacementNoteSerializer(note).data})
            note = placement.notes.create(author=request.user, body=payload.validated_data["body"])
            command.record(note.id)
        return Response({"data": serializers.PlacementNoteSerializer(note).data}, status=status.HTTP_201_CREATED)


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


class ConfirmPlacementView(_CommandView):
    """Student confirmation is an explicit assertion on the system transition."""
    command_type = "confirm_placement"
    serializer_class = serializers.ConfirmPlacementSerializer

    def run(self, request, placement, data):
        return services.confirm_student_placement(
            placement.id, data["signed_name"], actor=request.user,
        )


class PlacementAcknowledgementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        _get_in_scope(request, placement_id)
        record = services.placement_acknowledgement(placement_id, actor=request.user)
        data = serializers.PlacementAcknowledgementSerializer(record).data if record else None
        return Response({"data": data})


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


class InvitePlacementView(_CommandView):
    """Release a scheduled placement to its assigned student."""
    command_type = "invite_placement"

    def run(self, request, placement, data):
        result = services.transition(placement.id, State.AWAITING_STUDENT, actor=request.user)
        assignment = placement.student_assignments.filter(ended_at=None).values("student_id").first()
        if assignment:
            from apps.core import outbox
            outbox.publish(events.PlacementInvitationIssued(
                placement_id=placement.id, student_id=assignment["student_id"]
            ))
        return result


class ReassignMentorView(_CommandView):
    command_type = "reassign_mentor"
    serializer_class = serializers.MentorSerializer

    def run(self, request, placement, data):
        return services.reassign_mentor(
            placement.id, data["mentor_id"], actor=request.user, reason=data.get("reason", "")
        )


class PlacementAcknowledgementReminderView(_CommandView):
    """Ask the assigned student to revisit a pending orientation acknowledgement."""
    command_type = "placement_acknowledgement_reminder"

    def run(self, request, placement, data):
        if placement.state != State.ORIENTATION:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("A reminder is available only while orientation acknowledgement is pending.")
        assignment = placement.student_assignments.filter(ended_at=None).values("student_id").first()
        if not assignment:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("This placement has no assigned student to remind.")
        from apps.core import outbox
        outbox.publish(events.PlacementAcknowledgementReminderRequested(
            placement_id=placement.id, student_id=assignment["student_id"]
        ))
        return placement


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


class ArchiveView(_CommandView):
    command_type = "archive_placement"

    def run(self, request, placement, data):
        return services.transition(
            placement.id,
            State.ARCHIVED,
            actor=request.user,
            asserted_by="programme_admin.archive_placement",
        )


class WithdrawView(_CommandView):
    command_type = "withdraw_placement"
    serializer_class = serializers.WithdrawalSerializer

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


def _batch_payload(batch, *, include_placements: bool = True):
    placements = Placement.objects.filter(id__in=batch.created_placement_ids).order_by("created_at") if include_placements else []
    return {
        "batch_id": str(batch.id),
        "status": batch.status,
        "created": serializers.PlacementSerializer(placements, many=True).data,
        "created_count": len(batch.created_placement_ids),
        "skipped_count": len(batch.skipped or []),
        "skipped": batch.skipped,
        "error_message": batch.error_message,
        "cohort_id": str(batch.cohort_id),
        "planned_start": batch.planned_start.isoformat(),
        "planned_end": batch.planned_end.isoformat(),
        "all_eligible": batch.all_eligible,
        "created_at": batch.created_at.isoformat(),
    }


def _replayed(command):
    placement = Placement.objects.filter(id=command.result_ref).first()
    body = serializers.PlacementSerializer(placement).data if placement else None
    response = Response({"data": body,
                         "meta": {"command": command.command_type, "idempotency_replayed": True}})
    response["Idempotency-Replayed"] = "true"
    return response


def _programme_ward_payload(ward_row):
    if ward_row is None:
        return None
    return {**ward_row, "id": str(ward_row["id"]), "facility_id": str(ward_row["facility_id"])}


def _ward_row_for_actor(actor, ward_id):
    rows = services.programme_ward_directory(actor=actor) or []
    return next((row for row in rows if row["id"] == ward_id), None)


_WARD_MANAGERS = {identity.ROLES.PROGRAM_ADMIN, identity.ROLES.NURSE_MANAGER}


def _programme_admin_denied():
    return Response(
        {"error": {"code": "UnauthorizedProgrammeAction", "message": "Ward configuration is available to Programme Administrators and the facility's Nurse Manager."}},
        status=status.HTTP_403_FORBIDDEN,
    )


class ProgrammeWardDirectoryView(APIView):
    """Role-scoped ward directory and idempotent ward creation command."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = services.programme_ward_directory(actor=request.user)
        if rows is None:
            raise UnauthorizedFacilityAccess()
        return Response({"data": [_programme_ward_payload(row) for row in rows]})

    def post(self, request):
        if request.user.role not in _WARD_MANAGERS or request.user.status != identity.STATUSES.ACTIVE:
            return _programme_admin_denied()
        payload = serializers.CreateProgrammeWardSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "create_programme_ward") as command:
            if command.replayed:
                row = _ward_row_for_actor(request.user, command.result_ref)
                response = Response({"data": _programme_ward_payload(row), "meta": {"command": command.command_type, "idempotency_replayed": True}})
                response["Idempotency-Replayed"] = "true"
                return response
            ward = services.create_programme_ward(actor=request.user, **payload.validated_data)
            if ward is None:
                raise UnauthorizedFacilityAccess()
            command.record(ward.id)
        row = _ward_row_for_actor(request.user, ward.id)
        return Response({"data": _programme_ward_payload(row), "meta": {"command": command.command_type, "idempotency_replayed": False}}, status=status.HTTP_201_CREATED)


class ProgrammeWardConfigurationView(APIView):
    """Programme Admin ward changes run under the placement capacity invariant."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, ward_id):
        if request.user.role not in _WARD_MANAGERS or request.user.status != identity.STATUSES.ACTIVE:
            return _programme_admin_denied()
        payload = serializers.UpdateProgrammeWardSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "update_programme_ward") as command:
            if command.replayed:
                row = _ward_row_for_actor(request.user, command.result_ref)
                response = Response({"data": _programme_ward_payload(row), "meta": {"command": command.command_type, "idempotency_replayed": True}})
                response["Idempotency-Replayed"] = "true"
                return response
            ward = services.update_programme_ward(actor=request.user, ward_id=ward_id, **payload.validated_data)
            if ward is None:
                raise UnauthorizedFacilityAccess()
            command.record(ward.id)
        row = _ward_row_for_actor(request.user, ward.id)
        return Response({"data": _programme_ward_payload(row), "meta": {"command": command.command_type, "idempotency_replayed": False}})


class ProgrammeDirectoryReviewView(APIView):
    """Record pilot coverage only when active directory layers exist."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != identity.ROLES.PROGRAM_ADMIN or request.user.status != identity.STATUSES.ACTIVE:
            return _programme_admin_denied()
        with IdempotentCommand(request, "confirm_programme_directory_coverage") as command:
            if command.replayed:
                programme = request.user.program
                response = Response({"data": _directory_review_payload(programme), "meta": {"command": command.command_type, "idempotency_replayed": True}})
                response["Idempotency-Replayed"] = "true"
                return response
            programme = services.confirm_programme_directory_coverage(actor=request.user)
            if programme is None:
                return _programme_admin_denied()
            command.record(programme.id)
        return Response({"data": _directory_review_payload(programme), "meta": {"command": command.command_type, "idempotency_replayed": False}})


def _directory_review_payload(programme):
    return {
        "directory_reviewed_at": programme.directory_reviewed_at,
        "directory_reviewed_by_name": programme.directory_reviewed_by.full_name if programme.directory_reviewed_by_id else None,
    }


class IncomingPlacementsView(APIView):
    """Students a coordinator has asked this facility to host, not yet placed in a ward."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.placements import allocation

        rows = allocation.incoming(actor=request.user, facility_id=request.query_params.get("facility_id") or None)
        return Response({"data": serializers.PlacementSerializer(rows, many=True).data})


class OrphanedPlacementsView(APIView):
    """Open placements whose mentor is suspended or deactivated and need reassigning."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.placements import orphans

        return Response({"data": orphans.orphaned(actor=request.user, facility_id=request.query_params.get("facility_id") or None)})


class AutoArrangeView(APIView):
    """Preview or apply an automatic arrangement of incoming students into wards and mentors."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.placements import allocation

        payload = serializers.AutoArrangeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        preview = data.pop("preview")
        data["seed"] = data.get("seed") or None
        data["facility_id"] = data.get("facility_id")
        if preview:
            data.pop("expected_plan_hash", None)
            return Response({"data": allocation.plan_auto_arrange(actor=request.user, **data)})
        data["expected_plan_hash"] = data.get("expected_plan_hash") or None
        with IdempotentCommand(request, "auto_arrange_placements") as command:
            if command.replayed:
                from apps.placements.models import AllocationRun

                stored = AllocationRun.objects.filter(id=command.result_ref, actor=request.user).first()
                return Response({"data": stored.result if stored else {"replayed": True}, "meta": {"idempotency_replayed": True}})
            result = allocation.apply_auto_arrange(actor=request.user, **data)
            command.record(UUID(result["run_id"]))
        return Response({"data": result}, status=status.HTTP_201_CREATED)


class FacilityRequestView(APIView):
    """Ask partner facilities to host draft placements, optionally splitting by free ward places.

    ``preview: true`` returns the plan (with ``plan_hash`` and the ``seed``); applying with the same ``seed`` and
    ``expected_plan_hash`` guarantees the reviewed split is the one recorded, or the call is refused.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.placements import allocation

        payload = serializers.FacilityRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        preview = data.pop("preview")
        data["seed"] = data.get("seed") or None
        expected = data.pop("expected_plan_hash", None) or None
        if preview:
            return Response({"data": allocation.plan_facility_split(actor=request.user, **data)})
        with IdempotentCommand(request, "request_facilities") as command:
            if command.replayed:
                from apps.placements.models import AllocationRun

                stored = AllocationRun.objects.filter(id=command.result_ref, actor=request.user).first()
                body = {**{k: v for k, v in stored.result.items() if k != "assignments"}, "run_id": str(stored.id), "seed": stored.seed} if stored else {"replayed": True}
                return Response({"data": body, "meta": {"idempotency_replayed": True}})
            if len(data["facility_ids"]) == 1 and not expected:
                result = allocation.request_facility(actor=request.user, placement_ids=data["placement_ids"], facility_id=data["facility_ids"][0])
            else:
                result = allocation.apply_facility_split(actor=request.user, expected_plan_hash=expected, **data)
            command.record(UUID(result["run_id"]))
        return Response({"data": result}, status=status.HTTP_201_CREATED)


class CohortAutoRequestView(APIView):
    """One step for a whole cohort: create the missing draft placements and share everyone across the partner facilities.

    ``preview: true`` returns the plan (``plan_hash`` and ``seed``) and writes nothing; applying with the same seed and
    ``expected_plan_hash`` is refused if capacity changed in between.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, cohort_id):
        from apps.placements import allocation

        payload = serializers.CohortAutoRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        preview = data.pop("preview")
        data["seed"] = data.get("seed") or None
        expected = data.pop("expected_plan_hash", None) or None
        if data.get("facility_ids"):
            data["facility_ids"] = [str(value) for value in data["facility_ids"]]
        if data.get("institution_id"):
            data["institution_id"] = str(data["institution_id"])
        if preview:
            return Response({"data": allocation.plan_cohort_auto_request(actor=request.user, cohort_id=cohort_id, **data)})
        with IdempotentCommand(request, "cohort_auto_request") as command:
            if command.replayed:
                from apps.placements.models import AllocationRun

                stored = AllocationRun.objects.filter(id=command.result_ref, actor=request.user).first()
                body = {**{k: v for k, v in stored.result.items() if k != "assignments"}, "run_id": str(stored.id), "seed": stored.seed} if stored else {"replayed": True}
                return Response({"data": body, "meta": {"idempotency_replayed": True}})
            result = allocation.apply_cohort_auto_request(actor=request.user, cohort_id=cohort_id, expected_plan_hash=expected, **data)
            command.record(UUID(result["run_id"]))
        return Response({"data": result}, status=status.HTTP_201_CREATED)


class AllocationListView(APIView):
    """Download where each student is placed (csv, xlsx or pdf)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.http import HttpResponse

        from apps.placements import allocation_list

        fmt = request.query_params.get("file", "csv").lower()
        if fmt not in allocation_list.FORMATS:
            raise errors.InvalidTransition("Choose CSV, XLSX or PDF.")
        rows = allocation_list.rows_for(request.user, cohort_id=request.query_params.get("cohort_id") or None,
                                        run_id=request.query_params.get("run_id") or None, file_format=fmt)
        from apps.core.documents.reports import scope_label

        content = allocation_list.render(rows, fmt, scope_label=scope_label(request.user))
        response = HttpResponse(content, content_type=allocation_list.FORMATS[fmt])
        response["Content-Disposition"] = f'attachment; filename="mentormama-allocation-list-{timezone.localdate():%Y-%m-%d}.{fmt}"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class OverrideArrangementView(APIView):
    """A coordinator changes the ward and/or mentor of a placement, with a reason the facility can see."""

    permission_classes = [IsAuthenticated]

    def post(self, request, placement_id):
        payload = serializers.OverrideArrangementSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        with IdempotentCommand(request, "override_arrangement") as command:
            if command.replayed:
                return Response({"data": {"replayed": True}, "meta": {"idempotency_replayed": True}})
            with transaction.atomic():
                if data.get("ward_id"):
                    services.allocate_ward(placement_id, data["ward_id"], actor=request.user, override_reason=data["reason"])
                if data.get("mentor_id"):
                    has_mentor = MentorAssignment.objects.filter(placement_id=placement_id, ended_at=None).exists()
                    if has_mentor:
                        services.reassign_mentor(placement_id, data["mentor_id"], actor=request.user, reason=data["reason"], override=True)
                    else:
                        services.assign_mentor(placement_id, data["mentor_id"], actor=request.user, override_reason=data["reason"])
            command.record(placement_id)
        placement = _get_in_scope(request, placement_id)
        return Response({"data": serializers.PlacementSerializer(placement).data}, status=status.HTTP_200_OK)


class AllocationRunsView(APIView):
    """Recent allocation runs the caller may read (a coordinator's own institution, a manager's facility)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.placements import allocation

        try:
            limit = min(max(int(request.query_params.get("limit", 8)), 1), 50)
        except ValueError:
            limit = 8
        return Response({"data": allocation.runs_for(actor=request.user, limit=limit, mode=request.query_params.get("mode") or None)})


class AllocationRunDetailView(APIView):
    """The result of one run: summary, fill before/after, mentor spread, and every student with the outcome."""

    permission_classes = [IsAuthenticated]

    def get(self, request, run_id):
        from apps.placements import allocation_results

        query = serializers.RunDetailQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response({"data": allocation_results.run_detail(actor=request.user, run_id=run_id, **query.validated_data)})


class PlanningOverviewView(APIView):
    """The coordinator's planning overview: the next cohort(s) with counts per pipeline status."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.placements import planning

        return Response({"data": planning.overview(actor=request.user, institution_id=request.query_params.get("institution_id") or None)})


class PlanningCohortView(APIView):
    """One cohort: counts per status, its placement dates, and the free places across the programme for those dates."""

    permission_classes = [IsAuthenticated]

    def get(self, request, cohort_id):
        from apps.placements import planning

        return Response({"data": planning.cohort_summary(actor=request.user, cohort_id=cohort_id, institution_id=request.query_params.get("institution_id") or None)})


class PlanningCohortStudentsView(APIView):
    """Every student in a cohort with their pipeline status; filter, search, sort and page."""

    permission_classes = [IsAuthenticated]

    def get(self, request, cohort_id):
        from apps.placements import planning

        query = serializers.PlanningStudentsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = dict(query.validated_data)
        if data.get("facility_id"):
            data["facility_id"] = str(data["facility_id"])
        if data.get("ward_id"):
            data["ward_id"] = str(data["ward_id"])
        return Response({"data": planning.cohort_students(actor=request.user, cohort_id=cohort_id, **data)})


class IncomingSummaryView(APIView):
    """A nurse manager's incoming requests grouped by institution and cohort, with room for those dates."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.placements import planning

        return Response({"data": planning.incoming_summary(actor=request.user, facility_id=request.query_params.get("facility_id") or None)})


class ReleasePlacementsView(APIView):
    """Release arranged placements to their students in bulk, with a per-student result."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.placements import planning

        payload = serializers.ReleasePlacementsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        with IdempotentCommand(request, "release_placements") as command:
            result = planning.release_placements(actor=request.user, placement_ids=data.get("placement_ids"), cohort_id=data.get("cohort_id"))
            command.record(UUID(int=0))
        return Response({"data": result, "meta": {"idempotency_replayed": command.replayed}})


class AllocationRunUndoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, run_id):
        from apps.placements import allocation

        with IdempotentCommand(request, "undo_auto_arrange") as command:
            if command.replayed:
                return Response({"data": {"replayed": True}, "meta": {"idempotency_replayed": True}})
            result = allocation.undo_auto_arrange(actor=request.user, run_id=run_id)
            command.record(run_id)
        return Response({"data": result})


class AllocationRunRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, run_id):
        from apps.placements import allocation

        with IdempotentCommand(request, "retry_auto_arrange") as command:
            if command.replayed:
                from apps.placements.models import AllocationRun

                stored = AllocationRun.objects.filter(id=command.result_ref, actor=request.user).first()
                return Response({"data": stored.result if stored else {"replayed": True}, "meta": {"idempotency_replayed": True}})
            result = allocation.retry_unplaced(actor=request.user, run_id=run_id)
            command.record(UUID(result["run_id"]))
        return Response({"data": result}, status=status.HTTP_201_CREATED)


class ShareWithStudentsView(APIView):
    """Email arranged students where they are placed, ahead of release. Repeating only re-sends what changed."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.placements import notices

        ids = request.data.get("placement_ids") or None
        with IdempotentCommand(request, "share_allocation") as command:
            if command.replayed:
                return Response({"data": {"replayed": True}, "meta": {"idempotency_replayed": True}})
            result = notices.share_with_students(actor=request.user, placement_ids=ids, cohort_id=request.data.get("cohort_id") or None)
            command.record(UUID(int=0))
        return Response({"data": result})


class DeclineRequestsView(APIView):
    """A facility declines requested students, with a reason the coordinator sees."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.placements import allocation

        payload = serializers.DeclineRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "decline_facility_requests") as command:
            if command.replayed:
                return Response({"data": {"replayed": True}, "meta": {"idempotency_replayed": True}})
            result = allocation.decline_requests(actor=request.user, **payload.validated_data)
            command.record(UUID(int=0))
        return Response({"data": result})


class WithdrawRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.placements import allocation

        payload = serializers.WithdrawRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "withdraw_facility_requests") as command:
            if command.replayed:
                return Response({"data": {"replayed": True}, "meta": {"idempotency_replayed": True}})
            result = allocation.withdraw_requests(actor=request.user, **payload.validated_data)
            command.record(UUID(int=0))
        return Response({"data": result})
