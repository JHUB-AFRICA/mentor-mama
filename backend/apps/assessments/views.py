from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assessments import serializers, services
from apps.assessments.models import Assessment
from apps.core.http import IdempotentCommand, require_command_id


class FinalAssessmentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        return Response({"data": services.final_status(placement_id, actor=request.user)})

    def post(self, request, placement_id):
        payload = serializers.FinalAssessmentSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "submit_final_assessment") as command:
            if command.replayed:
                assessment = Assessment.objects.filter(id=command.result_ref).first()
                return Response({"data": {"id": str(assessment.id) if assessment else None},
                                 "meta": {"command": command.command_type, "idempotency_replayed": True}})
            assessment = services.submit_final(
                services.FinalAssessment(placement_id=placement_id, **payload.validated_data),
                actor=request.user,
            )
            command.record(assessment.id)
        return Response({"data": {"id": str(assessment.id), "submitted": True},
                         "meta": {"command": command.command_type, "idempotency_replayed": False}}, status=201)


class BaselineAssessmentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        return Response({"data": services.baseline_status(placement_id, actor=request.user)})

    def post(self, request, placement_id):
        payload = serializers.BaselineAssessmentSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        with IdempotentCommand(request, "submit_baseline_assessment") as command:
            if command.replayed:
                return Response({"data": {"submitted": True}, "meta": {"command": command.command_type, "idempotency_replayed": True}})
            assessment = services.submit_baseline(
                placement_id, payload.validated_data["confidence_score"], actor=request.user
            )
            command.record(assessment.id)
        return Response({"data": {"id": str(assessment.id), "submitted": True}}, status=201)


class PlacementFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, placement_id):
        payload = serializers.ConfidentialFeedbackSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        if payload.validated_data["mode"] == "anonymous":
            from apps.core.errors import AnonymousFeedbackUnavailable
            raise AnonymousFeedbackUnavailable("Submit anonymous feedback through the privacy-protected endpoint.")
        with IdempotentCommand(request, "submit_feedback") as command:
            if command.replayed:
                return Response({"data": {"submitted": True}, "meta": {"command": command.command_type, "idempotency_replayed": True}})
            data = dict(payload.validated_data)
            data["responses"] = tuple(data.get("responses") or ())
            feedback = services.submit_feedback(
                services.SubmitFeedback(placement_id=placement_id, **data), actor=request.user
            )
            # Anonymous feedback deliberately has no client handle.
            command.record(feedback.id if feedback else placement_id)
        body = {"submitted": True}
        if feedback is not None:
            body["id"] = str(feedback.id)
        return Response({"data": body, "meta": {"command": command.command_type, "idempotency_replayed": False}}, status=201)


class AnonymousFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = serializers.AnonymousFeedbackSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        command_id = require_command_id(request)
        data = dict(payload.validated_data)
        placement_id = data.pop("placement_id")
        data["responses"] = tuple(data.get("responses") or ())
        _, replayed = services.submit_anonymous_feedback(
            services.SubmitFeedback(placement_id=placement_id, **data),
            actor=request.user,
            command_id=command_id,
        )
        return Response(
            {"data": {"submitted": True}, "meta": {"idempotency_replayed": replayed}},
            status=200 if replayed else 201,
        )


class ApprovedFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": services.approved_feedback(actor=request.user)})
