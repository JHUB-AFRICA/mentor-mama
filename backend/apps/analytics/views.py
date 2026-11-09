
from django.conf import settings
from django.core import signing
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.db import transaction

from apps.analytics import export_service
from apps.analytics.models import ExportRecord
from apps.analytics import selectors
from apps.analytics.storage import get_export_storage
from apps.core import audit
from apps.core.errors import ExportFileUnavailable, UnauthorizedFacilityAccess


class DashboardView(APIView):
    """Return only the authenticated actor's role-scoped indicators."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": selectors.dashboard(actor=request.user)})


class ReportOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        start = parse_date(request.query_params.get("from", "")) or today.replace(day=1)
        end = parse_date(request.query_params.get("to", "")) or today
        if start > end or (end - start).days > 366:
            return Response({"error": {"code": "invalid_report_period", "message": "Choose a valid reporting period of one year or less."}}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"data": selectors.report_overview(actor=request.user, period_start=start, period_end=end)})


class InterruptionDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": selectors.interruptions(actor=request.user)})


class FeedbackDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": selectors.feedback(actor=request.user)})


class AnonymousFeedbackReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in {"coordinator", "nurse_manager"}:
            raise UnauthorizedFacilityAccess()
        return Response({"data": selectors.anonymous_feedback_report(actor=request.user)})


class PlacementProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, placement_id):
        return Response({"data": selectors.placement_progress(actor=request.user, placement_id=placement_id)})


class CohortProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, cohort_id):
        data = selectors.cohort_progress(actor=request.user, cohort_id=cohort_id)
        if not data:
            raise UnauthorizedFacilityAccess()
        return Response({"data": data})


def _export_data(record, request=None):
    data = {
        "id": str(record.id), "export_type": record.export_type, "format": record.format,
        "status": record.status, "row_count": record.row_count,
        "filters": record.filters, "created_at": record.created_at.isoformat(),
        "completed_at": record.completed_at.isoformat() if record.completed_at else None,
    }
    if record.status == "completed" and record.expires_at and record.expires_at > timezone.now() and request:
        token = signing.TimestampSigner().sign(str(record.id))
        data["download_url"] = request.build_absolute_uri(f"/api/v1/exports/{record.id}/download?token={token}")
    else:
        data["download_url"] = None
    return data


class ExportListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        records = ExportRecord.objects.filter(actor_id=request.user.id).order_by("-created_at")[:50]
        return Response({"data": [_export_data(record, request) for record in records]})

    def post(self, request):
        export_type = request.data.get("export_type", "placements")
        filters = {key: request.data[key] for key in ("cohort_id", "facility_id", "from", "to") if request.data.get(key)}
        export_format = request.data.get("format", "csv")
        try:
            record = export_service.create_export(actor=request.user, export_type=export_type, filters=filters, format=export_format)
        except UnauthorizedFacilityAccess:
            raise
        except (TypeError, ValueError):
            return Response({"error": {"code": "invalid_export_request", "message": "Choose a supported export and scope."}}, status=status.HTTP_400_BAD_REQUEST)
        from apps.analytics.tasks import generate_export_task
        transaction.on_commit(lambda: generate_export_task.delay(str(record.id)))
        return Response({"data": _export_data(record), "meta": {"job_id": str(record.id)}}, status=status.HTTP_202_ACCEPTED)


class ExportDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, export_id):
        record = ExportRecord.objects.filter(id=export_id, actor_id=request.user.id).first()
        if record is None:
            raise UnauthorizedFacilityAccess()
        return Response({"data": _export_data(record, request)})


class ExportDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, export_id):
        record = ExportRecord.objects.filter(id=export_id, actor_id=request.user.id, status="completed").first()
        if record is None or not record.expires_at or record.expires_at <= timezone.now():
            raise UnauthorizedFacilityAccess()
        try:
            signed_id = signing.TimestampSigner().unsign(request.query_params.get("token", ""), max_age=900)
        except signing.BadSignature:
            raise UnauthorizedFacilityAccess()
        if signed_id != str(record.id):
            raise UnauthorizedFacilityAccess()
        if not get_export_storage().exists(record.storage_key):
            raise ExportFileUnavailable()
        audit.record(actor=request.user, action="export.download", entity_table="analytics_export_record", entity_id=record.id, scope=record.scope, changes={"row_count": record.row_count, "format": record.format})
        content_types = {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "json": "application/json", "pdf": "application/pdf"}
        return FileResponse(get_export_storage().open(record.storage_key), as_attachment=True, content_type=content_types.get(record.format, "application/octet-stream"), filename=f"mentormama-{record.export_type}-{record.id}.{record.format}")
