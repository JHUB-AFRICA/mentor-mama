from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity import api as identity


class MeView(APIView):
    """Identity, scope, and capability flags.

    The UI gates on the flags, never on the role string, so the client cannot
    re-implement the authorisation matrix and drift from it (FE-04).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = identity.resolve_scope(request.user)
        role = request.user.role
        return Response({"data": {
            "id": str(request.user.id),
            "email": request.user.email,
            "name": request.user.full_name,
            "role": role,
            "scope": scope.as_dict(),
            "capabilities": {
                "create_placement": role in ("coordinator", "program_admin"),
                "assign_mentor": role in ("nurse_manager", "program_admin"),
                "log_session": role == "mentor",
                "complete_placement": role in ("nurse_manager", "program_admin"),
                "withdraw_placement": role in ("nurse_manager", "coordinator", "program_admin"),
                "review_escalation": role in ("nurse_manager", "coordinator", "program_admin"),
                "export_reports": role in ("nurse_manager", "coordinator", "program_admin"),
            },
        }})
