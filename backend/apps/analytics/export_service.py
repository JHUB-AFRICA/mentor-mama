"""Safe asynchronous operational exports owned by analytics."""

from __future__ import annotations

import csv
import json
from datetime import timedelta
from io import StringIO

from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.analytics.models import ExportRecord
from apps.assessments import api as assessments
from apps.induction import api as induction
from apps.identity.scope import resolve
from apps.mentorship import api as mentorship
from apps.placements import api as placements
from apps.safeguarding import api as safeguarding
from apps.analytics.storage import get_export_storage
from apps.identity import capabilities
from apps.identity.models import Status


EXPORT_FIELDS = [
    "placement_id", "student_name", "student_email", "registration_number",
    "cohort", "institution", "facility", "ward", "state", "planned_start",
    "planned_end", "actual_end", "mentor", "sessions_logged", "induction_percentage",
    "final_assessment_submitted", "open_safeguarding_concerns",
]
SUPPORTED_FORMATS = {"csv", "xlsx", "json", "pdf"}


def create_export(*, actor, export_type: str, filters: dict, format: str = "csv") -> ExportRecord:
    capabilities.require(actor, "export_reports")
    if export_type not in {"placements", "cohort"}:
        raise ValueError("unsupported export type")
    if export_type == "cohort" and not filters.get("cohort_id"):
        raise ValueError("cohort_id is required")
    if format not in SUPPORTED_FORMATS:
        raise ValueError("unsupported export format")
    return ExportRecord.objects.create(
        actor_id=actor.id,
        export_type=export_type,
        scope={"program_id": str(actor.program_id), "role": actor.role,
               "institution_id": str(actor.institution_id) if actor.institution_id else None,
               "facility_id": str(actor.facility_id) if actor.facility_id else None},
        filters=filters,
        format=format,
    )


def _placement_row(placement, viewer=None) -> dict:
    student = placement.student_assignments.filter(ended_at=None).select_related("student").first()
    mentor = placement.mentor_assignments.filter(ended_at=None).select_related("mentor").first()
    ward = placement.ward_assignments.filter(ended_at=None).select_related("ward").first()
    induction_data = induction.progress(placement.id)
    return {
        "placement_id": str(placement.id),
        "student_name": student.student.full_name if student else "",
        "student_email": student.student.email if student else "",
        "registration_number": student.student.registration_number if student else "",
        "cohort": placement.cohort.name,
        "institution": placement.cohort.institution.name,
        "facility": placement.facility.name if placement.facility else "",
        "ward": ward.ward.name if ward else "",
        "state": placement.state,
        "planned_start": placement.planned_start,
        "planned_end": placement.planned_end,
        "actual_end": placement.actual_end or "",
        "mentor": mentor.mentor.full_name if mentor else "",
        "sessions_logged": mentorship.session_count(placement.id),
        "induction_percentage": induction_data["percentage"] if induction_data["percentage"] is not None else "",
        "final_assessment_submitted": assessments.progress(placement.id)["final_submitted"],
        "open_safeguarding_concerns": safeguarding.open_count(placement.id, viewer=viewer),
    }


def _serialize(rows: list[dict], format: str, title: str) -> bytes:
    if format == "csv":
        output = StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=EXPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
        return output.getvalue().encode("utf-8")
    if format == "json":
        return json.dumps({"title": title, "columns": EXPORT_FIELDS, "rows": rows}, default=str, indent=2).encode("utf-8")
    if format == "xlsx":
        import tablib
        dataset = tablib.Dataset(headers=EXPORT_FIELDS)
        for row in rows:
            dataset.append([row[field] for field in EXPORT_FIELDS])
        return dataset.export("xlsx", column_width="adaptive")
    if format == "pdf":
        from apps.analytics.export_pdf import render_placement_pdf

        return render_placement_pdf(rows, title)
    raise ValueError("unsupported export format")


def generate_export(record_id) -> ExportRecord:
    record = ExportRecord.objects.get(id=record_id)
    record.status = "running"
    record.save(update_fields=["status", "updated_at"])
    try:
        from apps.identity.models import User
        actor = User.objects.get(id=record.actor_id)
        if actor.status != Status.ACTIVE or not capabilities.capabilities_for(actor).get("export_reports", False):
            record.status = "failed"
            record.error_code = "actor_access_changed"
            record.save(update_fields=["status", "error_code", "updated_at"])
            return record
        scope = resolve(actor)
        rows = placements.export_rows(scope).order_by("cohort__name", "planned_start")
        if record.export_type == "cohort":
            rows = rows.filter(cohort_id=record.filters["cohort_id"])
        if record.filters.get("facility_id"):
            rows = rows.filter(facility_id=record.filters["facility_id"])
        if record.filters.get("from") and record.filters.get("to"):
            period_start = parse_date(record.filters["from"])
            period_end = parse_date(record.filters["to"])
            if period_start and period_end:
                rows = rows.filter(planned_start__lte=period_end, planned_end__gte=period_start)

        data = [_placement_row(placement, actor) for placement in rows]
        storage_key = f"{record.id}.{record.format}"
        title = "Placement report" if record.export_type == "placements" else "Cohort placement report"
        content = _serialize(data, record.format, title)
        if record.format == "pdf" and not content.startswith(b"%PDF"):
            raise ValueError("PDF export did not produce a valid PDF document")
        get_export_storage().save(storage_key, content)
        count = len(data)
        now = timezone.now()
        record.status = "completed"
        record.row_count = count
        record.storage_key = storage_key
        record.completed_at = now
        record.expires_at = now + timedelta(minutes=15)
        record.save(update_fields=["status", "row_count", "storage_key", "completed_at", "expires_at", "updated_at"])
        return record
    except Exception:
        record.status = "failed"
        record.error_code = "export_generation_failed"
        record.save(update_fields=["status", "error_code", "updated_at"])
        raise
