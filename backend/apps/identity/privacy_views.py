"""Endpoints for formal data requests: the person's own (`/privacy/requests`) and the programme queue (`.../admin`)."""

from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.identity import capabilities, privacy
from apps.identity.models import DataRequest
from apps.identity.serializers import DataRequestCreateSerializer, DataRequestNoteSerializer, DataRequestQuerySerializer


class OwnRequestsView(APIView):
    """List and create the signed-in person's own requests. Nobody else's are ever returned."""

    throttle_scope = "privacy_request"

    def get_throttles(self):
        # Reading your own history is not limited; sending requests is.
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    def get(self, request):
        capabilities.require(request.user, "submit_data_request")
        return Response({"data": [privacy.own_payload(row) for row in privacy.own_requests(request.user)],
                         "meta": {"response_days": privacy.response_days()}})

    def post(self, request):
        serializer = DataRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = privacy.create_request(user=request.user, **serializer.validated_data)
        return Response({"data": privacy.own_payload(created)}, status=201)


class OwnRequestWithdrawView(APIView):
    def post(self, request, request_id):
        capabilities.require(request.user, "submit_data_request")
        return Response({"data": privacy.own_payload(privacy.withdraw_request(user=request.user, request_id=request_id))})


class AdminRequestsView(APIView):
    def get(self, request):
        serializer = DataRequestQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return Response({"data": privacy.admin_queue(actor=request.user, **serializer.validated_data)})


class AdminRequestDetailView(APIView):
    def get(self, request, request_id):
        return Response({"data": privacy.admin_payload(privacy.get_for_admin(actor=request.user, request_id=request_id))})


class AdminRequestActionView(APIView):
    """One verb per URL: review, complete, decline. Complete and decline need a note for the person."""

    action = ""

    def post(self, request, request_id):
        serializer = DataRequestNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor, note = request.user, serializer.validated_data["note"]
        if self.action == "review":
            row = privacy.start_review(actor=actor, request_id=request_id)
        elif self.action == "complete":
            row = privacy.complete(actor=actor, request_id=request_id, note=note)
        else:
            row = privacy.decline(actor=actor, request_id=request_id, note=note)
        row = DataRequest.objects.select_related("requester", "reviewed_by").get(id=row.id)
        return Response({"data": privacy.admin_payload(row)})
