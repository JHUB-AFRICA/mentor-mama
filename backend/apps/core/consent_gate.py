"""Block changes by students and mentors who have not yet accepted the published consent wording.

Only active once a programme admin has published a version, so it is inert until then.
Reading, signing out, and accepting consent itself always work.
"""

from django.http import JsonResponse

ALLOWED_PREFIXES = ("/api/v1/consent/", "/api/v1/auth/", "/api/v1/notifications")
SAFE = {"GET", "HEAD", "OPTIONS"}


class ConsentGateMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if (
            request.method not in SAFE
            and request.path.startswith("/api/v1/")
            and not request.path.startswith(ALLOWED_PREFIXES)
            and user is not None and user.is_authenticated
        ):
            from apps.identity import consent

            if consent.is_required(user):
                return JsonResponse(
                    {"error": {"code": "ConsentRequired", "message": "Please read and accept the programme's consent wording to continue."}},
                    status=403,
                )
        return self.get_response(request)
