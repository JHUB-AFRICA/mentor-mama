"""Website enquiries and support requests.

Public: `POST /api/v1/public/enquiries` (no sign-in, no cookies, so no CSRF; rate-limited; honeypot).
Platform: `/api/v1/platform/enquiries...` for administrators to read, assign, reply, change status and convert.
"""

from __future__ import annotations

import time

from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from apps.identity.models import Role, Status, User
from apps.platform import enquiries, selectors
from apps.platform.models import Enquiry
from apps.platform.views import PlatformView, _error, guarded

MIN_FILL_SECONDS = 1.5

TOPICS = {
    Enquiry.Kind.CONTACT: {"general", "partnership", "press", "other"},
    Enquiry.Kind.PILOT: {"pilot"},
    Enquiry.Kind.SUPPORT: {"sign_in", "account", "using_platform", "report_problem", "other"},
}


class PublicEnquiryThrottle(AnonRateThrottle):
    scope = "public_enquiry"


class GlobalEnquiryThrottle(SimpleRateThrottle):
    scope = "public_enquiry_global"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": "all"}


class PilotDetailsSerializer(serializers.Serializer):
    role_title = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    organisation_type = serializers.ChoiceField(
        choices=["training_institution", "health_facility", "county_or_ministry", "ngo", "other"], required=False, allow_blank=True, default="")
    county = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    mentors = serializers.IntegerField(min_value=0, max_value=100000, required=False, allow_null=True, default=None)
    students = serializers.IntegerField(min_value=0, max_value=100000, required=False, allow_null=True, default=None)
    start_term = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    units = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class PublicEnquirySerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Enquiry.Kind.values)
    topic = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    name = serializers.CharField(min_length=2, max_length=120)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    organisation = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    subject = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    message = serializers.CharField(min_length=10, max_length=5000, trim_whitespace=True)
    consent = serializers.BooleanField()
    details = PilotDetailsSerializer(required=False)
    source_page = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    website = serializers.CharField(required=False, allow_blank=True, default="", max_length=200)  # honeypot
    started_at = serializers.IntegerField(required=False, allow_null=True, default=None)  # when the form was opened (ms)

    def validate(self, attrs):
        topic = attrs.get("topic") or ""
        allowed = TOPICS[attrs["kind"]]
        if attrs["kind"] == Enquiry.Kind.PILOT:
            topic = "pilot"
        if topic not in allowed:
            raise serializers.ValidationError({"topic": "Choose what your message is about."})
        attrs["topic"] = topic
        if not attrs["consent"]:
            raise serializers.ValidationError({"consent": "Please agree that we may contact you about this."})
        if attrs["kind"] != Enquiry.Kind.PILOT:
            attrs.pop("details", None)
        return attrs


class PublicEnquiryView(APIView):
    authentication_classes: list = []  # no cookies are read, so there is nothing for a forged page to ride on
    permission_classes = [AllowAny]
    throttle_classes = [PublicEnquiryThrottle, GlobalEnquiryThrottle]

    def post(self, request):
        payload = PublicEnquirySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        started = data.get("started_at")
        too_fast = bool(started) and 0 <= time.time() - started / 1000 < MIN_FILL_SECONDS
        if data["website"] or too_fast:
            # A bot filled the hidden field or submitted instantly. Look successful; store nothing.
            return Response({"data": {"reference": "", "received": True}}, status=202)
        if not enquiries.email_allowance(data["email"]):
            return Response({"error": {"code": "TooManyRequests", "message": "You have sent several messages from this address recently. We will reply to them soon."}},
                            status=429)
        try:
            enquiry, created = enquiries.submit(
                kind=data["kind"], topic=data["topic"], name=data["name"], email=data["email"], phone=data["phone"],
                organisation=data["organisation"], subject=data["subject"], message=data["message"],
                details=dict(data.get("details") or {}), source_page=data["source_page"],
                user_agent=request.META.get("HTTP_USER_AGENT", ""))
        except enquiries.EnquiryError as error:
            return Response({"error": {"code": "TemporarilyUnavailable", "message": str(error), "retryable": True}}, status=503)
        return Response({"data": {"reference": enquiry.reference, "received": True}}, status=201 if created else 200)


# ------------------------------------------------------------------ platform side

def _get(enquiry_id):
    return Enquiry.objects.select_related("assigned_to", "converted_programme").filter(id=enquiry_id).first()


def _missing():
    return _error("This message no longer exists.", 404, "NotFound")


class EnquiriesQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100, default=25)
    view = serializers.CharField(required=False, allow_blank=True, default="open", max_length=16)
    kind = serializers.ChoiceField(choices=["", *Enquiry.Kind.values], required=False, default="")
    search = serializers.CharField(required=False, allow_blank=True, default="", max_length=120)
    assigned = serializers.CharField(required=False, allow_blank=True, default="", max_length=16)


class EnquiriesView(PlatformView):
    @guarded
    def get(self, request):
        query = EnquiriesQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response({"data": selectors.enquiries(actor=request.user, **query.validated_data)})


class EnquiryDetailView(PlatformView):
    @guarded
    def get(self, request, enquiry_id):
        enquiry = _get(enquiry_id)
        if enquiry is None:
            return _missing()
        enquiries.mark_seen(actor=request.user, enquiry=enquiry)
        return Response({"data": selectors.enquiry_detail(enquiry)})


class _Action(PlatformView):
    """POST that changes an enquiry and answers with the refreshed detail."""

    serializer_class: type[serializers.Serializer]

    def run(self, request, enquiry, data):  # pragma: no cover - overridden
        raise NotImplementedError

    @guarded
    def post(self, request, enquiry_id):
        enquiry = _get(enquiry_id)
        if enquiry is None:
            return _missing()
        payload = self.serializer_class(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            self.run(request, enquiry, payload.validated_data)
        except enquiries.EnquiryError as error:
            return _error(str(error), 409, "EnquiryActionUnavailable")
        enquiry = _get(enquiry_id)
        return Response({"data": selectors.enquiry_detail(enquiry)})


class AssignSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(allow_null=True)


class EnquiryAssignView(_Action):
    serializer_class = AssignSerializer

    def run(self, request, enquiry, data):
        assignee = None
        if data["user_id"]:
            assignee = User.objects.filter(id=data["user_id"], role=Role.PLATFORM_ADMIN, status=Status.ACTIVE).first()
            if assignee is None:
                raise enquiries.EnquiryError("Choose an active platform administrator.")
        enquiries.assign(actor=request.user, enquiry=enquiry, assignee=assignee)


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Enquiry.Status.values)
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    notify = serializers.BooleanField(required=False, default=True)


class EnquiryStatusView(_Action):
    serializer_class = StatusSerializer

    def run(self, request, enquiry, data):
        enquiries.set_status(actor=request.user, enquiry=enquiry, **data)


class PrioritySerializer(serializers.Serializer):
    priority = serializers.ChoiceField(choices=Enquiry.Priority.values)


class EnquiryPriorityView(_Action):
    serializer_class = PrioritySerializer

    def run(self, request, enquiry, data):
        enquiries.set_priority(actor=request.user, enquiry=enquiry, **data)


class BodySerializer(serializers.Serializer):
    body = serializers.CharField(min_length=2, max_length=5000, trim_whitespace=True)


class EnquiryNoteView(_Action):
    serializer_class = BodySerializer

    def run(self, request, enquiry, data):
        enquiries.add_note(actor=request.user, enquiry=enquiry, **data)


class EnquiryReplyView(_Action):
    serializer_class = BodySerializer

    def run(self, request, enquiry, data):
        enquiries.reply(actor=request.user, enquiry=enquiry, **data)


class ResendSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()


class EnquiryEmailResendView(_Action):
    serializer_class = ResendSerializer

    def run(self, request, enquiry, data):
        enquiries.resend_email(actor=request.user, enquiry=enquiry, event_id=data["event_id"])


class ConvertAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=120)
    last_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")


class ConvertSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    short_name = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    academic_year = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    admin = ConvertAdminSerializer()
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)


class EnquiryConvertView(_Action):
    serializer_class = ConvertSerializer

    def run(self, request, enquiry, data):
        enquiries.convert_to_programme(actor=request.user, enquiry=enquiry, **data)
