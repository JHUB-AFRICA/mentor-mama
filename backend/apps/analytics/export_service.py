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
#: A PDF is for reading; above this a spreadsheet is the right tool (and rendering stays inside the task budget).
PDF_MAX_ROWS = 1500


class ExportTooLarge(Exception):
    """The export is too big for a readable PDF. The record is marked failed with `pdf_too_large`."""


def create_export(*, actor, export_type: str, filters: dict, format: str = "csv") -> ExportRecord:
    capabilities.require(actor, "export_reports")
    if export_type not in {"placements", "cohort", "training"}:
        raise ValueError("unsupported export type")
    if export_type == "cohort" and not filters.get("cohort_id"):
        raise ValueError("cohort_id is required")
    if format not in SUPPORTED_FORMATS:
        raise ValueError("unsupported export format")
    filters = _clean_filters(filters)
    return ExportRecord.objects.create(
        actor_id=actor.id,
        export_type=export_type,
        scope={"program_id": str(actor.program_id), "role": actor.role,
               "institution_id": str(actor.institution_id) if actor.institution_id else None,
               "facility_id": str(actor.facility_id) if actor.facility_id else None},
        filters=filters,
        format=format,
    )


def _clean_filters(filters: dict) -> dict:
    """Reject malformed filters at request time, so a bad id is a clear 400, not a failed export later."""
    import uuid

    clean = {}
    for key in ("cohort_id", "facility_id"):
        if filters.get(key):
            try:
                clean[key] = str(uuid.UUID(str(filters[key])))
            except ValueError as exc:
                raise ValueError(f"invalid {key}") from exc
    start, end = filters.get("from"), filters.get("to")
    if start or end:
        start_date, end_date = parse_date(str(start or "")), parse_date(str(end or ""))
        if not start_date or not end_date or start_date > end_date:
            raise ValueError("a period needs a valid from and to date")
        clean["from"], clean["to"] = start_date.isoformat(), end_date.isoformat()
    return clean


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


XLSX_COLUMNS = [
    ("student_name", "Student", "text"), ("registration_number", "Registration number", "text"),
    ("student_email", "Email", "text"), ("cohort", "Cohort", "text"), ("institution", "Institution", "text"),
    ("facility", "Facility", "text"), ("ward", "Ward", "text"), ("mentor", "Mentor", "text"), ("state", "Stage", "status"),
    ("planned_start", "Start", "date"), ("planned_end", "End", "date"), ("actual_end", "Ended", "date"),
    ("sessions_logged", "Sessions logged", "number"), ("induction_percentage", "Induction", "percent"),
    ("final_assessment_submitted", "Final assessment", "bool"), ("open_safeguarding_concerns", "Open concerns", "number"),
    ("placement_id", "Placement ID", "text"),
]
ABOUT = [
    "One row per placement in your scope, with stage, induction, mentorship session count and close-out status.",
    "Never included: session notes, feedback text, safeguarding concern content or any clinical or patient information.",
    "Open concerns counts only the concerns you are allowed to see.",
    "Handling: this file holds names, registration numbers and emails. Share it only with people who need it for the "
    "placement programme and delete local copies when you no longer need them.",
]


def _period(filters: dict) -> str:
    start, end = parse_date(filters.get("from") or ""), parse_date(filters.get("to") or "")
    if start and end:
        from apps.core.documents.reports import date_span

        return date_span(start, end)
    return ""


def _serialize(rows: list[dict], format: str, title: str, *, scope: str = "", filters: dict | None = None, prepared_for: str = "") -> bytes:
    if format == "csv":
        from apps.core.documents import csvsafe

        output = StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=EXPORT_FIELDS)
        writer.writeheader()
        writer.writerows(csvsafe.mapping(row) for row in rows)
        return (csvsafe.BOM + output.getvalue()).encode("utf-8")
    if format == "json":
        return json.dumps({"title": title, "columns": EXPORT_FIELDS, "rows": rows}, default=str, indent=2).encode("utf-8")
    if format == "xlsx":
        from apps.core.documents.reports import STATE_LABELS
        from apps.core.documents.spreadsheet import build_xlsx

        readable = [{**row, "state": STATE_LABELS.get(row["state"], str(row["state"]).title())} for row in rows]
        return build_xlsx(title=title, scope_label=scope, generated_at=timezone.now(), columns=XLSX_COLUMNS, rows=readable, about_lines=ABOUT)
    if format == "pdf":
        from apps.core.documents.reports import placement_report_pdf

        return placement_report_pdf(rows, title=title, scope=scope, period=_period(filters or {}), prepared_for=prepared_for)
    raise ValueError("unsupported export format")


TRAINING_COLUMNS = [
    ("name", "Mentor", "text"), ("email", "Email", "text"), ("progress", "Required modules done", "text"),
    ("state", "Status", "status"), ("last_activity", "Last activity", "date"),
]
TRAINING_STATE_LABELS = {"complete": "Complete", "in_progress": "In progress", "not_started": "Not started", "needs_refresh": "Needs refresh"}


def _build_training(record, actor) -> tuple[bytes, int]:
    """Mentor training completion in the requested format (CSV, XLSX, JSON or branded PDF)."""
    from apps.analytics import training_report
    from apps.core.documents import csvsafe
    from apps.core.documents.reports import ROLE_LABELS, scope_label, training_report_pdf

    report = training_report.training_report(actor=actor)
    rows = [{"name": m["name"], "email": m["email"], "progress": f"{m['required_completed']} of {m['required_total']}",
             "state": TRAINING_STATE_LABELS[m["state"]], "last_activity": m["last_activity"].date() if m["last_activity"] else None}
            for m in report["mentors"]]
    title, scope = "Mentor training report", scope_label(actor)
    if record.format == "pdf":
        if len(rows) > PDF_MAX_ROWS:
            record.status, record.error_code = "failed", "pdf_too_large"
            record.save(update_fields=["status", "error_code", "updated_at"])
            raise ExportTooLarge(record.id)
        return training_report_pdf(report, rows, title=title, scope=scope, prepared_for=ROLE_LABELS.get(actor.role, "")), len(rows)
    if record.format == "xlsx":
        from apps.core.documents.spreadsheet import build_xlsx

        about = ["Required modules are the published modules marked required for mentors.",
                 "Needs refresh means a major change was published more than 30 days ago after the mentor completed an earlier version.",
                 "Contains mentor names and email addresses. Share only with people who follow up on training."]
        return build_xlsx(title=title, scope_label=scope, generated_at=timezone.now(), columns=TRAINING_COLUMNS, rows=rows, about_lines=about), len(rows)
    if record.format == "json":
        return json.dumps({"title": title, "rows": rows}, default=str, indent=2).encode("utf-8"), len(rows)
    output = StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=[key for key, _, _ in TRAINING_COLUMNS])
    writer.writeheader()
    writer.writerows(csvsafe.mapping({k: ("" if v is None else v) for k, v in row.items()}) for row in rows)
    return (csvsafe.BOM + output.getvalue()).encode("utf-8"), len(rows)


def _complete(record, content: bytes, count: int):
    if record.format == "pdf" and not content.startswith(b"%PDF"):
        raise ValueError("PDF export did not produce a valid PDF document")
    storage_key = f"{record.id}.{record.format}"
    get_export_storage().save(storage_key, content)
    now = timezone.now()
    record.status = "completed"
    record.row_count = count
    record.storage_key = storage_key
    record.completed_at = now
    record.expires_at = now + timedelta(minutes=15)
    record.save(update_fields=["status", "row_count", "storage_key", "completed_at", "expires_at", "updated_at"])
    return record


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
        if record.export_type == "training":
            content, count = _build_training(record, actor)
            return _complete(record, content, count)
        rows = placements.export_rows(scope).order_by("cohort__name", "planned_start")
        if record.filters.get("cohort_id"):
            rows = rows.filter(cohort_id=record.filters["cohort_id"])
        if record.filters.get("facility_id"):
            rows = rows.filter(facility_id=record.filters["facility_id"])
        if record.filters.get("from") and record.filters.get("to"):
            period_start = parse_date(record.filters["from"])
            period_end = parse_date(record.filters["to"])
            if period_start and period_end:
                rows = rows.filter(planned_start__lte=period_end, planned_end__gte=period_start)

        if record.format == "pdf" and rows.count() > PDF_MAX_ROWS:
            record.status = "failed"
            record.error_code = "pdf_too_large"
            record.save(update_fields=["status", "error_code", "updated_at"])
            raise ExportTooLarge(record.id)
        data = [_placement_row(placement, actor) for placement in rows]
        title = "Placement report" if record.export_type == "placements" else "Cohort placement report"
        from apps.core.documents.reports import ROLE_LABELS, scope_label

        content = _serialize(data, record.format, title, scope=scope_label(actor), filters=record.filters,
                             prepared_for=ROLE_LABELS.get(actor.role, ""))
        if record.format == "pdf" and not content.startswith(b"%PDF"):
            raise ValueError("PDF export did not produce a valid PDF document")
        return _complete(record, content, len(data))
    except ExportTooLarge:
        raise
    except BaseException as exc:  # includes Celery's SoftTimeLimitExceeded
        from celery.exceptions import SoftTimeLimitExceeded

        record.status = "failed"
        record.error_code = "export_timed_out" if isinstance(exc, SoftTimeLimitExceeded) else "export_generation_failed"
        record.save(update_fields=["status", "error_code", "updated_at"])
        raise
