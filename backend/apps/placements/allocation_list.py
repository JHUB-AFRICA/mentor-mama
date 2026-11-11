"""The allocation list: where each student is placed, as a downloadable CSV, XLSX or PDF.

Coordinators use it early to prepare students and facilities. It carries placement metadata only:
no safeguarding, induction or assessment information.
"""

from __future__ import annotations

import csv
from io import StringIO

from apps.core import audit
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


def rows_for(actor, *, cohort_id=None) -> list[dict]:
    identity.require_capability(actor, "download_allocation_list")
    scope = identity.resolve_scope(actor)
    placements = selectors.in_scope(scope).select_related("cohort", "facility", "requested_facility").order_by("cohort__name", "planned_start")
    if cohort_id:
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
            "dates": f"{placement.planned_start:%d %b %Y} – {placement.planned_end:%d %b %Y}",
            "status": _status(placement, bool(ward), bool(mentor)),
        })
    audit.record(actor=actor, action="export.allocation_list", entity_table="placements_placement", entity_id=actor.id,
                 scope={"program_id": str(actor.program_id)}, changes={"rows": len(out)})
    return out


def render(rows: list[dict], fmt: str, *, scope_label: str = "") -> bytes:
    if fmt == "csv":
        buffer = StringIO(newline="")
        writer = csv.writer(buffer)
        writer.writerow([label for _, label in COLUMNS])
        for row in rows:
            writer.writerow([row[key] for key, _ in COLUMNS])
        return buffer.getvalue().encode("utf-8-sig")  # BOM so Excel opens it with the right encoding
    if fmt == "xlsx":
        import tablib

        dataset = tablib.Dataset(headers=[label for _, label in COLUMNS])
        for row in rows:
            dataset.append([row[key] for key, _ in COLUMNS])
        return dataset.export("xlsx", column_width="adaptive")
    if fmt == "pdf":
        from apps.analytics.export_pdf import render_allocation_pdf

        return render_allocation_pdf(rows, scope_label=scope_label)
    raise ValueError("unsupported format")
