from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.http import IdempotentCommand
from apps.core import audit, outbox
from apps.induction import services, template_editor
from apps.induction.models import Checklist, ChecklistTemplate, InductionBatch, InductionBatchResult, ItemResponse, OrientationAcknowledgement
from apps.induction.serializers import (
    AnswerItemSerializer, ChecklistSerializer, CreateTemplateDraftSerializer, OpenInductionBatchSerializer,
    OrientationAcknowledgementSerializer, TemplateDraftSerializer,
)
from apps.placements import api as placements, events as placement_events
from apps.core.errors import UnauthorizedFacilityAccess
from apps.identity import api as identity


def _payload(checklist):
    responses = {row.template_item_id: row for row in checklist.responses.all()}
    return {
        "id": checklist.id,
        "placement_id": checklist.placement_id,
        "completed_at": checklist.completed_at,
        "opened_at": checklist.opened_at,
        "template_version": checklist.template.version,
        "template_id": str(checklist.template_id),
        "signed_by": checklist.signed_by.full_name if checklist.signed_by else None,
        "items": [{"id": item.id, "label": item.label, "is_required": item.is_required,
                   "section": item.section, "guidance": item.guidance,
                   "completed_by_role": item.completed_by_role, "response_kind": item.response_kind,
                   "response": responses.get(item.id).response if responses.get(item.id) else None,
                   "comment": responses.get(item.id).comment if responses.get(item.id) else None,
                   "answered_at": responses.get(item.id).answered_at if responses.get(item.id) else None}
                  for item in checklist.template.items.all()],
    }


class OpenInductionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, placement_id):
        with IdempotentCommand(request, "open_induction") as command:
            if command.replayed:
                checklist = Checklist.objects.filter(id=command.result_ref).first()
            else:
                checklist = services.open_induction(placement_id, actor=request.user)
                command.record(checklist.id)
        return Response({"data": ChecklistSerializer(_payload(checklist)).data})


class OrientationAcknowledgementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        placements.assert_access(placement_id, actor=request.user)
        identity.require_capability(request.user, "confirm_placement")
        acknowledgement = OrientationAcknowledgement.objects.filter(
            placement_id=placement_id, student=request.user,
        ).first()
        return Response({"data": {
            "acknowledged": acknowledgement is not None,
            "acknowledged_at": acknowledgement.acknowledged_at if acknowledgement else None,
        }})

    def post(self, request, placement_id):
        payload = OrientationAcknowledgementSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "acknowledge_orientation") as command:
            if command.replayed:
                acknowledgement = OrientationAcknowledgement.objects.filter(id=command.result_ref).first()
            else:
                acknowledgement = services.acknowledge_orientation(placement_id, actor=request.user, **payload.validated_data)
                command.record(acknowledgement.id)
        return Response({"data": {"id": str(acknowledgement.id), "placement_id": str(acknowledgement.placement_id), "acknowledged_at": acknowledgement.acknowledged_at}})


class ChecklistDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        placements.assert_access(placement_id, actor=request.user)
        checklist = Checklist.objects.filter(placement_id=placement_id).prefetch_related("template__items", "responses").first()
        if checklist is None:
            return Response({"data": None})
        return Response({"data": ChecklistSerializer(_payload(checklist)).data})


class AnswerItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, placement_id, item_id):
        checklist = Checklist.objects.filter(placement_id=placement_id).first()
        if checklist is None:
            raise UnauthorizedFacilityAccess()
        payload = AnswerItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        item = checklist.template.items.filter(id=item_id).first()
        if item is None:
            raise UnauthorizedFacilityAccess()
        with IdempotentCommand(request, "answer_induction_item") as command:
            if command.replayed:
                row = ItemResponse.objects.filter(id=command.result_ref).first()
            else:
                row = services.answer_item(checklist.id, item.id, actor=request.user, **payload.validated_data)
                command.record(row.id)
        return Response({"data": {"id": str(row.id), "item_id": str(row.template_item_id), "response": row.response, "comment": row.comment}})


class SignInductionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, placement_id):
        checklist = Checklist.objects.filter(placement_id=placement_id).first()
        if checklist is None:
            raise UnauthorizedFacilityAccess()
        with IdempotentCommand(request, "sign_induction") as command:
            if command.replayed:
                checklist = Checklist.objects.filter(id=command.result_ref).first()
            else:
                checklist = services.sign_induction(checklist.id, actor=request.user)
                command.record(checklist.id)
        return Response({"data": ChecklistSerializer(_payload(checklist)).data})


class InductionReadinessView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        identity.require_capability(request.user, "open_induction")
        raw_ids = request.query_params.get("placement_ids", "")
        query = OpenInductionBatchSerializer(data={"placement_ids": raw_ids.split(",") if raw_ids else []})
        query.is_valid(raise_exception=True)
        rows = []
        for placement_id in query.validated_data["placement_ids"]:
            placement = placements.assert_access(placement_id, actor=request.user)
            checklist = Checklist.objects.filter(placement_id=placement_id).select_related("template").prefetch_related("template__items", "responses").first()
            current_template = ChecklistTemplate.objects.filter(
                program_id=request.user.program_id, published_at__isnull=False, retired_at=None,
            ).order_by("-version").first()
            rows.append({
                "placement_id": str(placement_id),
                "state": str(placement.state),
                "orientation_acknowledged": OrientationAcknowledgement.objects.filter(placement_id=placement_id).exists(),
                "template_id": str(checklist.template_id if checklist else current_template.id) if checklist or current_template else None,
                "template_version": checklist.template.version if checklist else current_template.version if current_template else None,
                "checklist": ChecklistSerializer(_payload(checklist)).data if checklist else None,
            })
        return Response({"data": rows})


class OrientationReminderBatchView(APIView):
    """Request personal orientation reminders for a selected pending group."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = OpenInductionBatchSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        placement_ids = payload.validated_data["placement_ids"]
        with IdempotentCommand(request, "remind_orientation_batch") as command:
            if not command.replayed:
                identity.require_capability(request.user, "open_induction")
                prepared = []
                for placement_id in sorted(placement_ids, key=str):
                    placement = placements.assert_access(placement_id, actor=request.user)
                    if str(placement.state) != "orientation":
                        from apps.core.errors import InvalidTransition
                        raise InvalidTransition("Only students waiting to acknowledge orientation can be reminded.")
                    if OrientationAcknowledgement.objects.filter(placement_id=placement_id).exists():
                        from apps.core.errors import InvalidTransition
                        raise InvalidTransition("A student who has acknowledged orientation does not need a reminder.")
                    assignment = placement.student_assignments.filter(ended_at=None).values("student_id").first()
                    if assignment is None:
                        from apps.core.errors import InvalidTransition
                        raise InvalidTransition("A selected placement has no current student to remind.")
                    prepared.append((placement_id, assignment["student_id"]))
                for placement_id, student_id in prepared:
                    audit.record(actor=request.user, action="orientation.reminder_requested",
                                 entity_table="placements_placement", entity_id=placement_id)
                    outbox.publish(placement_events.PlacementAcknowledgementReminderRequested(
                        placement_id=placement_id, student_id=student_id,
                    ))
                command.record(request.user.id)
            replayed = command.replayed
        return Response({"data": {"requested_count": len(placement_ids)},
                         "meta": {"idempotency_replayed": replayed}})


class InductionBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = OpenInductionBatchSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "open_induction_batch") as command:
            if command.replayed:
                batch = InductionBatch.objects.filter(id=command.result_ref).first()
                replayed = True
            else:
                batch = services.open_induction_batch(
                    tuple(payload.validated_data["placement_ids"]), actor=request.user,
                )
                command.record(batch.id)
                replayed = False
        return Response({"data": _batch_payload(batch) if batch else None,
                         "meta": {"idempotency_replayed": replayed}},
                        status=200 if replayed else 201)


class InductionBatchItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, batch_id, item_id):
        payload = AnswerItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "answer_induction_batch_item") as command:
            if command.replayed:
                batch = InductionBatch.objects.filter(id=command.result_ref).first()
                replayed = True
            else:
                batch = services.answer_induction_batch_item(
                    batch_id, item_id, actor=request.user, **payload.validated_data,
                )
                command.record(batch.id)
                replayed = False
        return Response({"data": _batch_payload(batch) if batch else None,
                         "meta": {"idempotency_replayed": replayed}})


class SignInductionBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, batch_id):
        with IdempotentCommand(request, "sign_induction_batch") as command:
            if command.replayed:
                batch = InductionBatch.objects.filter(id=command.result_ref).first()
                replayed = True
            else:
                batch = services.sign_induction_batch(batch_id, actor=request.user)
                command.record(batch.id)
                replayed = False
        return Response({"data": _batch_payload(batch) if batch else None,
                         "meta": {"idempotency_replayed": replayed}})


def _batch_payload(batch):
    if batch is None:
        return None
    results = InductionBatchResult.objects.filter(batch=batch).select_related(
        "placement", "checklist__template",
    ).prefetch_related("checklist__template__items", "checklist__responses").order_by("placement_id")
    return {
        "id": str(batch.id),
        "template_version": batch.template.version,
        "items": [{"id": str(item.id), "label": item.label, "required": item.is_required,
                   "section": item.section, "guidance": item.guidance,
                   "completed_by_role": item.completed_by_role, "response_kind": item.response_kind}
                  for item in batch.template.items.all()],
        "students": [{
            "placement_id": str(result.placement_id),
            "checklist": ChecklistSerializer(_payload(result.checklist)).data,
        } for result in results],
    }


# -- programme-admin template editor ------------------------------------------------------------
class TemplateCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": template_editor.list_versions(request.user)})

    def post(self, request):
        payload = CreateTemplateDraftSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "create_induction_template_draft") as command:
            if command.replayed:
                data = template_editor.get_version(request.user, command.result_ref)
            else:
                data = template_editor.create_draft(
                    request.user, mode=payload.validated_data["mode"],
                    from_version_id=payload.validated_data["from_version_id"],
                )
                command.record(data["id"])
        return Response({"data": data}, status=200 if command.replayed else 201)


class EnhancedDraftView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": template_editor.enhanced_draft_preview(request.user)})


class TemplateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, template_id):
        return Response({"data": template_editor.get_version(request.user, template_id)})

    def put(self, request, template_id):
        payload = TemplateDraftSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "save_induction_template_draft") as command:
            if command.replayed:
                data = template_editor.get_version(request.user, template_id)
            else:
                data = template_editor.update_draft(request.user, template_id, **payload.validated_data)
                command.record(template_id)
        return Response({"data": data})


class TemplateValidateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, template_id):
        return Response({"data": template_editor.validate_draft(request.user, template_id)})


def _template_action(request, template_id, command_type, action):
    with IdempotentCommand(request, command_type) as command:
        if command.replayed:
            data = template_editor.get_version(request.user, command.result_ref)
        else:
            data = action(request.user, template_id)
            command.record(data["id"])
    return data, command.replayed


class TemplatePublishView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, template_id):
        data, _ = _template_action(request, template_id, "publish_induction_template", template_editor.publish)
        return Response({"data": data})


class TemplateDiscardView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, template_id):
        data, _ = _template_action(request, template_id, "discard_induction_template_draft", template_editor.discard)
        return Response({"data": data})


class TemplateRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, template_id):
        data, replayed = _template_action(request, template_id, "restore_induction_template", template_editor.restore)
        return Response({"data": data}, status=200 if replayed else 201)
