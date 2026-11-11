"""The allocation list: where each student is placed, as a downloadable CSV, XLSX or PDF.

Coordinators use it early to prepare students and facilities. It carries placement metadata only:
no safeguarding, induction or assessment information.
"""

from __future__ import annotations

import csv
from io import StringIO

from apps.core import audit, errors
from apps.core.documents import csvsafe
from apps.identity import api as identity
from apps.placements import selectors

COLUMNS = [
    ("student", "Student"), ("registration_number", "Registration number"), ("cohort", "Cohort"),
    ("facility", "Facility"), ("ward", "Ward"), ("mentor", "Mentor"), ("dates", "Dates"), ("status", "Status"),
]
FORMATS = {"csv": "text/csv; charset=utf-8", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "pdf": "application/pdf"}


def _status(placement, has_ward: bool, has_mentor: bool) -> str:
    if placement.state in {"completed", "archived", "withdrawn"}:
        return placement.state.title()
    if has_ward and has_mentor:
        return "Arranged"
    if placement.facility_id is None:
        return "Requested of facility" if placement.requested_facility_id else "Not yet requested"
    return "Awaiting ward or mentor"


def rows_for(actor, *, cohort_id=None, file_format: str = "") -> list[dict]:
    identity.require_capability(actor, "download_allocation_list")
    scope = identity.resolve_scope(actor)
    placements = selectors.in_scope(scope).select_related("cohort", "facility", "requested_facility").order_by("cohort__name", "planned_start")
    if cohort_id:
        import uuid

        try:
            cohort_id = uuid.UUID(str(cohort_id))
        except ValueError as exc:
            raise errors.InvalidTransition("Choose a valid cohort.") from exc
        placements = placements.filter(cohort_id=cohort_id)
    out = []
    for placement in placements:
        student = placement.student_assignments.filter(ended_at=None).select_related("student").first()
        ward = placement.ward_assignments.filter(ended_at=None).select_related("ward").first()
        mentor = placement.mentor_assignments.filter(ended_at=None).select_related("mentor").first()
        facility = placement.facility.name if placement.facility else (f"Requested: {placement.requested_facility.name}" if placement.requested_facility else "")
        out.append({
            "student": student.student.full_name if student else "",
            "registration_number": (student.student.registration_number or "") if student else "",
            "cohort": placement.cohort.name,
            "facility": facility,
            "ward": ward.ward.name if ward else "",
            "mentor": mentor.mentor.full_name if mentor else "",
            "dates": f"{placement.planned_start:%d %b %Y} – {placement.planned_end:%d %b %Y}",  # CSV format unchanged
            "planned_start": placement.planned_start,
            "planned_end": placement.planned_end,
            "status": _status(placement, bool(ward), bool(mentor)),
        })
    audit.record(actor=actor, action="export.allocation_list", entity_table="placements_placement", entity_id=actor.id,
                 scope={"program_id": str(actor.program_id), "institution_id": str(actor.institution_id) if actor.institution_id else None,
                        "facility_id": str(actor.facility_id) if actor.facility_id else None},
                 changes={"rows": len(out), "format": file_format, "cohort_id": str(cohort_id) if cohort_id else None})
    return out


def render(rows: list[dict], fmt: str, *, scope_label: str = "") -> bytes:
    if fmt == "csv":
        buffer = StringIO(newline="")
        writer = csv.writer(buffer)
        writer.writerow([label for _, label in COLUMNS])
        for row in rows:
            writer.writerow(csvsafe.row([row[key] for key, _ in COLUMNS]))
        return buffer.getvalue().encode("utf-8-sig")  # BOM so Excel opens it with the right encoding
    if fmt == "xlsx":
        from django.utils import timezone

        from apps.core.documents.spreadsheet import build_xlsx

        columns = [("student", "Student", "text"), ("registration_number", "Registration number", "text"), ("cohort", "Cohort", "text"),
                   ("facility", "Facility", "text"), ("ward", "Ward", "text"), ("mentor", "Mentor", "text"),
                   ("planned_start", "Start", "date"), ("planned_end", "End", "date"), ("status", "Status", "status")]
        about = [
            "Where each student is placed: facility, ward, mentor and dates, with the arrangement status.",
            "Handling: this list holds student names and registration numbers. Share it only with the facility and university "
            "staff involved in these placements, and delete local copies after the placement starts.",
        ]
        return build_xlsx(title="Placement allocation list", scope_label=scope_label, generated_at=timezone.now(),
                          columns=columns, rows=rows, about_lines=about)
    if fmt == "pdf":
        from apps.core.documents.reports import allocation_list_pdf

        return allocation_list_pdf(rows, scope=scope_label)
    raise ValueError("unsupported format")
