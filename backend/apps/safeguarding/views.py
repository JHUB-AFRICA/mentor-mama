from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.http import IdempotentCommand
from apps.safeguarding import serializers, services
from apps.safeguarding.models import Escalation


def _list_shape(row):
    return {"id": str(row.id), "category": row.category, "severity": row.severity,
            "state": row.state, "placement_id": str(row.placement_id) if row.placement_id else None,
            "submitted_at": row.created_at.isoformat(), "reviewer": row.reviewer.full_name if row.reviewer else None,
            "routed_to": row.routed_to, "rereview_count": row.rereview_count,
            "rereview_requested_at": row.rereview_requested_at.isoformat() if row.rereview_requested_at else None,
            "updated_at": row.updated_at.isoformat(),
            "related_escalation_id": str(row.related_escalation_id) if row.related_escalation_id else None}


class EscalationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": [_list_shape(row) for row in services.list_for(request.user)]})

    def post(self, request):
        payload = serializers.RaiseEscalationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "raise_escalation") as command:
            if command.replayed:
                return Response({"data": {"submitted": True}, "meta": {"command": command.command_type, "idempotency_replayed": True}})
            row = services.raise_concern(services.RaiseConcern(**payload.validated_data), actor=request.user)
            command.record(row.id)
        return Response({"data": _list_shape(row), "meta": {"command": command.command_type, "idempotency_replayed": False}}, status=201)


class EscalationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, escalation_id):
        row = Escalation.objects.select_related("placement__cohort__institution", "submitted_by", "reviewer").filter(id=escalation_id).first()
        if row and not services.can_read_detail(request.user, row) and services.can_review(request.user, row):
            # In scope but not the assigned reviewer: show the queue metadata only. The narrative is
            # released when the person takes the concern, which is audited (docs/decisions/0029).
            return Response({"data": {**_list_shape(row), "access": "summary", "can_claim": row.reviewer_id is None and row.state == "open"}})
        if not row or not services.can_read_detail(request.user, row):
            from apps.core.errors import EscalationAccessDenied
            raise EscalationAccessDenied()
        from apps.core import audit
        audit.record(actor=request.user, action="escalation.read_sensitive", entity_table="safeguarding_escalation", entity_id=row.id)
        return Response({"data": {**_list_shape(row), "access": "full", "can_claim": False, "description": row.description, "finding": row.finding,
                                   "action_taken": row.action_taken, "resolution_outcome": row.resolution_outcome,
                                   "referral_note": row.referral_note, "rereview_reason": row.rereview_reason, "closure_date": row.closure_date.isoformat() if row.closure_date else None,
                                   "submitted_by": row.submitted_by.full_name, "reviewer_id": str(row.reviewer_id) if row.reviewer_id else None}})


class _EscalationCommand(APIView):
    permission_classes = [IsAuthenticated]
    command_type = ""
    serializer_class = None

    def run(self, escalation_id, data, actor): raise NotImplementedError

    def post(self, request, escalation_id):
        payload = self.serializer_class(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, self.command_type) as command:
            if command.replayed:
                return Response({"data": {"submitted": True}, "meta": {"command": command.command_type, "idempotency_replayed": True}})
            row = self.run(escalation_id, payload.validated_data, request.user)
            command.record(row.id)
        return Response({"data": _list_shape(row), "meta": {"command": command.command_type, "idempotency_replayed": False}})


class AssignReviewerView(_EscalationCommand):
    command_type = "assign_escalation_reviewer"
    serializer_class = serializers.ReviewerSerializer

    def run(self, escalation_id, data, actor):
        return services.assign_reviewer(escalation_id, data["reviewer_id"], actor=actor)


class RecordFindingView(_EscalationCommand):
    command_type = "record_escalation_finding"
    serializer_class = serializers.FindingSerializer

    def run(self, escalation_id, data, actor):
        return services.record_finding(escalation_id, data["finding"], actor=actor)


class RecordActionView(_EscalationCommand):
    command_type = "record_escalation_action"
    serializer_class = serializers.ActionSerializer

    def run(self, escalation_id, data, actor):
        return services.record_action(
            escalation_id,
            data["action_taken"],
            actor=actor,
            resolution_outcome=data.get("resolution_outcome"),
            referral_note=data.get("referral_note"),
        )


class CloseEscalationView(_EscalationCommand):
    command_type = "close_escalation"
    serializer_class = serializers.CloseSerializer

    def run(self, escalation_id, data, actor):
        return services.close(escalation_id, data["closure_date"], actor=actor)


class RequestRereviewView(_EscalationCommand):
    command_type = "request_escalation_rereview"
    serializer_class = serializers.RereviewSerializer

    def run(self, escalation_id, data, actor):
        return services.request_rereview(escalation_id, data["reason"], actor=actor)
