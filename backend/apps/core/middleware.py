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
