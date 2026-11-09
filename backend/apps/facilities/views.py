from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.facilities import services
from apps.facilities.serializers import FacilitySerializer, FacilityUpdateSerializer


def _payload(item):
    return {"id": str(item.id), "name": item.name, "county": item.county, "level": item.level, "maternity_unit_name": item.maternity_unit_name, "contact_person": item.contact_person, "contact_email": item.contact_email, "contact_phone": item.contact_phone, "logo_url": item.logo.url if item.logo else None, "archived_at": item.archived_at}


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

