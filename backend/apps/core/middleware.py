from django.http import JsonResponse


class SafeApiErrorResponseMiddleware:
    """Replace Django HTML error pages on API URLs with a small JSON contract."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (
            request.path.startswith("/api/")
            and response.status_code >= 400
            and "text/html" in response.get("Content-Type", "")
        ):
            status = response.status_code
            if status >= 500:
                code = "InternalError"
                message = "MentorMAMA is having a brief problem. Please try again shortly."
                retryable = True
            elif status == 404:
                code = "NotFound"
                message = "We couldn’t find that page. Check the link and try again."
                retryable = False
            elif status == 403:
                code = "AccessDenied"
                message = "You don’t have access to do that. Contact your programme team if you need help."
                retryable = False
            else:
                code = "RequestUnavailable"
                message = "We couldn’t complete that request. Please try again."
                retryable = False
            return JsonResponse({"error": {
                "code": code,
                "message": message,
                "retryable": retryable,
            }}, status=status)
        return response


class LivenessProbeMiddleware:
    """Answer ``/health/live`` before host validation.

    Platform health checks (Render, load balancers, Docker) call the container by its private IP, which is
    not in ALLOWED_HOSTS, so Django would reject them with 400 and the deploy would never go healthy. The
    response is the same static body as ``apps.core.views.live_health`` and touches no data, so exposing
    it without a host check reveals nothing. Readiness (``/health/ready``) still goes through normal routing.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/health/live" and request.method in {"GET", "HEAD"}:
            from django.http import JsonResponse

            return JsonResponse({"status": "ok", "checks": {"process": "ok"}})
        return self.get_response(request)
