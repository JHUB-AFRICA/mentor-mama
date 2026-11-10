from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.assistant import navigation, service
from apps.assistant.serializers import ChatSerializer
from apps.core.ai import is_configured


class MentaThrottle(SimpleRateThrottle):
    scope = "menta"
    rate = "40/hour"

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


def _error(code, message, http_status):
    return Response({"error": {"code": code, "message": message}}, status=http_status)


class MentaChatView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [MentaThrottle]

    def post(self, request):
        if not is_configured():
            return _error("ai_unavailable", "Menta is not available right now.", status.HTTP_503_SERVICE_UNAVAILABLE)
        payload = ChatSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        history = data.get("history", [])
        texts = [data["message"], *(turn["content"] for turn in history if turn["role"] == "user")]
        if any(service.contains_personal_identifier(text) for text in texts):
            return _error(
                "personal_details",
                "Please don't include personal or patient details such as emails or ID and phone numbers. Rephrase without them and try again.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        try:
            result = service.answer(user=request.user, message=data["message"], history=history, page=data["page"])
        except service.AIProviderError:
            return _error("ai_unavailable", "Menta couldn't answer just now. Please try again.", status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"data": result})


class MentaNavigationView(APIView):
    """The screens this user's role can open, for Menta's instant jump suggestions."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": [d.as_dict() for d in navigation.for_role(request.user.role)]})
