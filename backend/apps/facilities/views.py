from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.facilities import services
from apps.facilities.serializers import FacilitySerializer, FacilityUpdateSerializer


def _payload(item):
    return {"id": str(item.id), "name": item.name, "county": item.county, "level": item.level, "maternity_unit_name": item.maternity_unit_name, "contact_person": item.contact_person, "contact_email": item.contact_email, "contact_phone": item.contact_phone, "logo_url": f"/api/v1/facilities/{item.id}/logo?v={int(item.updated_at.timestamp())}" if item.logo else None, "archived_at": item.archived_at}


class FacilityListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        facilities = services.list_facilities(actor=request.user)
        if facilities is None:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "Facility configuration is not available."}}, status=403)
        return Response({"data": [_payload(item) for item in facilities]})

    def post(self, request):
        serializer = FacilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        facility = services.create_facility(actor=request.user, **serializer.validated_data)
        if facility is None:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "Facility configuration is not available."}}, status=403)
        return Response({"data": _payload(facility)}, status=201)


class FacilityDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, facility_id):
        serializer = FacilityUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        facility = services.update_facility(actor=request.user, facility_id=facility_id, **serializer.validated_data)
        if facility is None:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "Facility configuration is not available."}}, status=403)
        return Response({"data": _payload(facility)})



class FacilityLogoView(APIView):
    """Partner logos are not sensitive, but are served only to signed-in people of the same programme."""

    permission_classes = [IsAuthenticated]

    def get(self, request, facility_id):
        from apps.core.storage import file_response
        from apps.facilities.models import Facility

        item = Facility.objects.filter(id=facility_id, program_id=request.user.program_id).first() if request.user.program_id else None
        if item is None or not item.logo:
            return Response({"error": {"code": "NotFound", "message": "Logo not found."}}, status=404)
        return file_response(item.logo, cache_seconds=86400)
