"""Safe asynchronous operational exports owned by analytics."""

from __future__ import annotations

import csv
import json
from datetime import timedelta
from io import BytesIO, StringIO

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


def _placement_row(placement) -> dict:
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
        "open_safeguarding_concerns": safeguarding.open_count(placement.id),
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
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import landscape, letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.graphics.charts.lineplots import LinePlot
        from reportlab.graphics.charts.piecharts import Pie
        from reportlab.graphics.shapes import Drawing, String
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        output = BytesIO()
        document = SimpleDocTemplate(output, pagesize=landscape(letter), leftMargin=.35 * inch, rightMargin=.35 * inch, topMargin=.35 * inch, bottomMargin=.35 * inch)
        styles = getSampleStyleSheet()
        body = styles["BodyText"]
        body.fontSize = 6
        body.leading = 7
        heading = styles["Heading1"]
        heading.fontSize = 15
        content = [Paragraph(title, heading), Paragraph(f"{len(rows)} placements in this export", body), Spacer(1, .12 * inch)]
        states = {}
        starts = {}
        for row in rows:
            states[row["state"]] = states.get(row["state"], 0) + 1
            month = str(row["planned_start"])[:7]
            starts[month] = starts.get(month, 0) + 1
        chart = Drawing(700, 170)
        donut = Pie()
        donut.x, donut.y, donut.width, donut.height = 15, 15, 135, 135
        donut.data = list(states.values()) or [1]
        donut.labels = list(states.keys()) or ["No placements"]
        donut.slices.strokeWidth = 0
        donut.slices.strokeColor = colors.white
        donut.slices[0].fillColor = colors.HexColor("#0b9696")
        for index in range(1, len(donut.data)):
            donut.slices[index].fillColor = colors.HexColor(["#e6aa38", "#7958c9", "#3479ca", "#d96a5f"][index % 5])
        chart.add(donut)
        chart.add(String(185, 150, "Placement starts by month", fontName="Helvetica-Bold", fontSize=9, fillColor=colors.HexColor("#10223b")))
        plot = LinePlot()
        plot.x, plot.y, plot.width, plot.height = 185, 15, 490, 125
        points = [(index, value) for index, value in enumerate(starts.values())] or [(0, 0)]
        plot.data = [points]
        plot.lines[0].strokeColor = colors.HexColor("#0b9696")
        plot.lines[0].strokeWidth = 2
        plot.xValueAxis.valueMin = 0
        plot.xValueAxis.valueMax = max(len(points) - 1, 1)
        plot.yValueAxis.valueMin = 0
        plot.yValueAxis.valueMax = max(max(starts.values(), default=1), 1)
        plot.xValueAxis.visible = False
        plot.yValueAxis.visible = True
        chart.add(plot)
        content.extend([chart, Spacer(1, .08 * inch)])
        table_data = [[field.replace("_", " ").title() for field in EXPORT_FIELDS]]
        table_data.extend([[Paragraph(str(row[field]), body) for field in EXPORT_FIELDS] for row in rows])
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0b9696")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#dbe4ed")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafb")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        content.append(table)
        document.build(content)
        return output.getvalue()
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

        data = [_placement_row(placement) for placement in rows]
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
