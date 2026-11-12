"""Website enquiries and support requests.

Public: `POST /api/v1/public/enquiries` (no sign-in, no cookies, so no CSRF; rate-limited; honeypot).
Platform: `/api/v1/platform/enquiries...` for administrators to read, assign, reply, change status and convert.
"""

from __future__ import annotations

import csv
import hmac
import time
import urllib.parse
import urllib.request

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from apps.core import audit
from apps.core.documents import csvsafe
from apps.identity.models import Role, Status, User
from apps.platform import enquiries, selectors
from apps.platform.models import Enquiry, SavedReply
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
    turnstile_token = serializers.CharField(required=False, allow_blank=True, default="", max_length=4096)
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


def _turnstile_ok(token: str, request) -> bool:
    """Cloudflare Turnstile, only when TURNSTILE_SECRET_KEY is set. If Cloudflare cannot be reached we let people through
    (the rate limits still apply) rather than blocking real senders."""
    secret = settings.TURNSTILE_SECRET_KEY
    if not secret:
        return True
    if not token:
        return False
    try:
        data = urllib.parse.urlencode({"secret": secret, "response": token}).encode()
        with urllib.request.urlopen("https://challenges.cloudflare.com/turnstile/v0/siteverify", data=data, timeout=5) as response:  # noqa: S310
            import json

            return bool(json.load(response).get("success"))
    except Exception:  # noqa: BLE001
        return True


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
        if not _turnstile_ok(data.get("turnstile_token", ""), request):
            return Response({"error": {"code": "CheckFailed", "message": "We could not confirm you are a person. Reload the page and try again."}}, status=400)
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


# ------------------------------------------------------------------ public status lookup and inbound replies

class StatusThrottle(AnonRateThrottle):
    scope = "public_enquiry_status"


class StatusQuerySerializer(serializers.Serializer):
    reference = serializers.CharField(max_length=24)
    email = serializers.EmailField(max_length=254)


class PublicEnquiryStatusView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [StatusThrottle]

    def post(self, request):
        query = StatusQuerySerializer(data=request.data)
        query.is_valid(raise_exception=True)
        result = enquiries.public_status(**query.validated_data)
        if result is None:  # wrong reference, wrong address and spam all look the same
            return Response({"error": {"code": "NotFound", "message": "We could not find a request with that reference and email address."}}, status=404)
        return Response({"data": result})


class InboundEnquiryReplyView(APIView):
    """Receives a sender's emailed reply from an inbound-mail provider. Closed unless ENQUIRY_INBOUND_SECRET is set.

    Accepts `{"from": "a@b.c" | "Name <a@b.c>", "subject": "Re: ... [CON-2026-0001]", "text": "..."}`, either at the top level
    or under `data` (Resend's envelope). The secret goes in the `X-Inbound-Secret` header or `?secret=`."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [GlobalEnquiryThrottle]

    def post(self, request):
        import re
        from email.utils import parseaddr

        secret = settings.ENQUIRY_INBOUND_SECRET
        given = request.headers.get("X-Inbound-Secret") or request.query_params.get("secret", "")
        if not secret or not hmac.compare_digest(given.encode(), secret.encode()):
            return Response(status=404)
        body = request.data.get("data") if isinstance(request.data.get("data"), dict) else request.data
        sender = parseaddr(str(body.get("from") or ""))[1]
        match = re.search(r"\b((?:CON|PIL|SUP)-\d{4}-\d{4})\b", str(body.get("subject") or ""))
        text = str(body.get("text") or body.get("body") or "").strip()
        if not (sender and match and text):
            return Response({"data": {"accepted": False}}, status=202)
        # Drop the quoted history: keep what is above the first "On ... wrote:" or ">" line.
        lines = []
        for line in text.splitlines():
            if line.startswith(">") or re.match(r"^On .+ wrote:\s*$", line):
                break
            lines.append(line)
        reply = "\n".join(lines).strip() or text[:2000]
        accepted = enquiries.receive_reply(reference=match.group(1), from_email=sender, body=reply) is not None
        return Response({"data": {"accepted": accepted}}, status=202)


# ------------------------------------------------------------------ platform: export and saved replies

class EnquiriesExportView(PlatformView):
    @guarded
    def get(self, request):
        query = EnquiriesQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = {**query.validated_data, "page": 1, "page_size": 100}
        rows = []
        for page in range(1, 51):  # at most 5,000 rows
            chunk = selectors.enquiries(actor=request.user, **{**params, "page": page})
            rows += chunk["results"]
            if page >= chunk["pagination"]["pages"]:
                break
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="mentormama-messages-{timezone.now():%Y-%m-%d}.csv"'
        response["Cache-Control"] = "no-store"
        response.write(csvsafe.BOM)
        writer = csv.writer(response)
        writer.writerow(["Reference", "Type", "Topic", "Status", "Priority", "Name", "Email", "Organisation", "Owner", "Received", "Last activity", "Overdue"])
        for row in rows:
            writer.writerow(csvsafe.row([
                row["reference"], row["kind"], row["topic"], row["status"], row["priority"], row["name"], row["email"], row["organisation"],
                (row["assigned_to"] or {}).get("name", ""), row["created_at"].isoformat(), row["last_activity_at"].isoformat(), "yes" if row["overdue"] else "no"]))
        audit.record(actor=request.user, action="platform.enquiries_exported", entity_table="platform_enquiry", entity_id=request.user.id,
                     scope={"platform": True}, changes={"rows": len(rows), "view": params["view"]})
        return response


class SavedReplySerializer(serializers.Serializer):
    title = serializers.CharField(min_length=2, max_length=80)
    body = serializers.CharField(min_length=2, max_length=5000)


def _reply_row(reply):
    return {"id": str(reply.id), "title": reply.title, "body": reply.body}


class SavedRepliesView(PlatformView):
    @guarded
    def get(self, request):
        return Response({"data": [_reply_row(r) for r in SavedReply.objects.all()]})

    @guarded
    def post(self, request):
        payload = SavedReplySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        reply, _ = SavedReply.objects.update_or_create(title=payload.validated_data["title"].strip(),
                                                       defaults={"body": payload.validated_data["body"].strip(), "created_by": request.user})
        audit.record(actor=request.user, action="platform.saved_reply_saved", entity_table="platform_saved_reply", entity_id=reply.id,
                     scope={"platform": True}, changes={"title": reply.title})
        return Response({"data": _reply_row(reply)}, status=201)


class SavedReplyDetailView(PlatformView):
    @guarded
    def delete(self, request, reply_id):
        reply = SavedReply.objects.filter(id=reply_id).first()
        if reply is None:
            return _missing()
        audit.record(actor=request.user, action="platform.saved_reply_deleted", entity_table="platform_saved_reply", entity_id=reply.id,
                     scope={"platform": True}, changes={"title": reply.title})
        reply.delete()
        return Response(status=204)


# ------------------------------------------------------------------ signed-in help

class HelpRequestSerializer(serializers.Serializer):
    topic = serializers.ChoiceField(choices=sorted(TOPICS[Enquiry.Kind.SUPPORT]), default="using_platform")
    message = serializers.CharField(min_length=10, max_length=5000, trim_whitespace=True)
    page = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class HelpRequestView(APIView):
    """A signed-in person asks for help. Name, email, role and programme come from the account, not the form."""

    def post(self, request):
        if request.user.role == Role.PLATFORM_ADMIN:
            return Response({"error": {"code": "NotForPlatformAdmins", "message": "Platform administrators answer help requests."}}, status=403)
        payload = HelpRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        user = request.user
        if not enquiries.email_allowance(f"help:{user.email}", limit=5):
            return Response({"error": {"code": "TooManyRequests", "message": "You have sent several requests recently. We will reply to them soon."}}, status=429)
        programme = user.program.name if user.program_id else ""
        enquiry, _ = enquiries.submit(
            kind=Enquiry.Kind.SUPPORT, topic=data["topic"], name=user.full_name or user.email, email=user.email, organisation=programme,
            message=data["message"], source_page=("portal" + data["page"])[:120], user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"account_role": user.role, "account_id": str(user.id), "programme": programme, "portal_page": data["page"]})
        return Response({"data": {"reference": enquiry.reference}}, status=201)
