"""Platform read endpoints: health probes and command reconciliation."""

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.utils import DatabaseError
from django.http import HttpResponseForbidden, JsonResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import UnauthorizedFacilityAccess
from apps.core.models import IdempotencyKey


def csrf_failure(request, reason=""):
    """Return a safe API response without Django's debug HTML or CSRF detail."""
    if not request.path.startswith("/api/"):
        return HttpResponseForbidden("CSRF verification failed.")
    return JsonResponse({"error": {
        "code": "SessionExpired",
        "message": "Your secure session needs refreshing. Please try again.",
        "retryable": True,
    }}, status=403)


def live_health(_request):
    """Process liveness probe; deliberately has no dependency checks."""
    return JsonResponse({"status": "ok", "checks": {"process": "ok"}})


def ready_health(_request):
    """Dependency readiness probe with stable, non-sensitive component states."""
    checks = {}
    ready = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "ok"
    except DatabaseError:
        checks["database"] = "unavailable"
        ready = False

    if settings.USE_REDIS:
        try:
            cache.set("health:ready", "ok", timeout=10)
            checks["cache"] = "ok" if cache.get("health:ready") == "ok" else "unavailable"
        except Exception:
            checks["cache"] = "unavailable"
            ready = False
    else:
        checks["cache"] = "disabled"

    response = JsonResponse({"status": "ok" if ready else "unavailable", "checks": checks})
    response.status_code = 200 if ready else 503
    return response


class CommandDetailView(APIView):
    """Tell an offline queue whether its command committed, without a write."""

    permission_classes = [IsAuthenticated]

    def get(self, request, command_id):
        command = IdempotencyKey.objects.filter(command_id=command_id, actor=request.user).first()
        if command is None:
            raise UnauthorizedFacilityAccess()
        return Response({"data": {
            "id": str(command.command_id),
            "command": command.command_type,
            "status": "committed" if command.result_ref else "in_progress",
            "result_ref": str(command.result_ref) if command.result_ref else None,
        }})
