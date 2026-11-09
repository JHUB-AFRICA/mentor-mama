from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.institutions import services
from apps.institutions.serializers import CohortBulkEnrolmentSerializer, CohortEnrolmentSerializer, CohortMembershipRemovalSerializer, CohortSerializer, CohortUpdateSerializer, InstitutionSerializer, InstitutionStudentQuerySerializer, InstitutionUpdateSerializer, StudentProfileSerializer


def _payload(item):
    return {"id": str(item.id), "name": item.name, "type": item.type, "county": item.county, "contact_person": item.contact_person, "contact_email": item.contact_email, "contact_phone": item.contact_phone, "logo_url": item.logo.url if item.logo else None, "is_active": item.is_active, "archived_at": item.archived_at}


class InstitutionListView(APIView):
    def get(self, request):
        institutions = services.list_institutions(actor=request.user)
        if institutions is None:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "Institution configuration is not available."}}, status=403)
        return Response({"data": [_payload(item) for item in institutions]})

    def post(self, request):
        serializer = InstitutionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        institution = services.create_institution(actor=request.user, **serializer.validated_data)
        if institution is None:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "Institution configuration is not available."}}, status=403)
        return Response({"data": _payload(institution)}, status=201)


class InstitutionDetailView(APIView):
    def patch(self, request, institution_id):
        serializer = InstitutionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        institution = services.update_institution(actor=request.user, institution_id=institution_id, **serializer.validated_data)
        if institution is None:
            return Response({"error": {"code": "UnauthorizedProgrammeAction", "message": "Institution configuration is not available."}}, status=403)
        return Response({"data": _payload(institution)})


def _cohort_payload(item):
    return {
        "id": str(item.id),
        "name": item.name,
        "start_date": item.start_date.isoformat(),
        "end_date": item.end_date.isoformat(),
        "planned_capacity": item.planned_capacity,
        "member_count": getattr(item, "member_count", item.memberships.filter(removed_at=None).count()),
        "archived_at": item.archived_at.isoformat() if item.archived_at else None,
    }


def _student_payload(item):
    return {"id": str(item.id), "name": item.full_name, "email": item.email, "phone": item.phone, "registration_number": item.registration_number, "status": item.status, "cohort_names": [membership.cohort.name for membership in item.cohort_memberships.all()]}


class CohortListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": [_cohort_payload(item) for item in services.list_cohorts(actor=request.user)]})

    def post(self, request):
        serializer = CohortSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cohort = services.create_cohort(actor=request.user, **serializer.validated_data)
        return Response({"data": _cohort_payload(cohort)}, status=201)


class CohortDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, cohort_id):
        serializer = CohortUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        cohort = services.update_cohort(actor=request.user, cohort_id=cohort_id, **serializer.validated_data)
        return Response({"data": _cohort_payload(cohort)})

    def post(self, request, cohort_id):
        cohort = services.archive_cohort(actor=request.user, cohort_id=cohort_id)
        return Response({"data": _cohort_payload(cohort)})


class InstitutionStudentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = InstitutionStudentQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        current, paginator = services.page_institution_students(actor=request.user, **query.validated_data)
        return Response({"data": {"results": [_student_payload(item) for item in current.object_list], "pagination": {"page": current.number, "page_size": query.validated_data["page_size"], "total_count": paginator.count, "total_pages": paginator.num_pages, "has_next": current.has_next(), "has_previous": current.has_previous()}}})


class CohortEnrolmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, cohort_id):
        serializer = CohortEnrolmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership, created = services.enrol_student(actor=request.user, cohort_id=cohort_id, **serializer.validated_data)
        return Response({"data": {"id": str(membership.id), "cohort_id": str(membership.cohort_id), "student_id": str(membership.student_id), "created": created}}, status=201 if created else 200)


class CohortBulkEnrolmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, cohort_id):
        serializer = CohortBulkEnrolmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if request.query_params.get("preview") == "1":
            return Response({"data": services.preview_bulk_enrolment(actor=request.user, cohort_id=cohort_id, **serializer.validated_data)})
        return Response({"data": services.bulk_enrol(actor=request.user, cohort_id=cohort_id, **serializer.validated_data)})


class CohortMembershipRemovalView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, cohort_id):
        serializer = CohortMembershipRemovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = services.remove_cohort_membership(actor=request.user, cohort_id=cohort_id, **serializer.validated_data)
        return Response({"data": {"id": str(membership.id), "removed_at": membership.removed_at.isoformat()}})


class CohortStudentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, cohort_id):
        cohort = services.get_cohort(actor=request.user, cohort_id=cohort_id)
        return Response({"data": [_student_payload(item) for item in services.list_cohort_students(actor=request.user, cohort_id=cohort.id)]})


class StudentProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": _student_profile_payload(services.get_student_profile(actor=request.user))})

    def patch(self, request):
        serializer = StudentProfileSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        profile = services.update_student_profile(actor=request.user, **serializer.validated_data)
        return Response({"data": _student_profile_payload(profile)})


def _student_profile_payload(profile):
    return {
        "course_name": profile.course_name,
        "year_of_study": profile.year_of_study,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "emergency_contact_name": profile.emergency_contact_name,
        "emergency_contact_phone": profile.emergency_contact_phone,
        "emergency_contact_relationship": profile.emergency_contact_relationship,
    }
