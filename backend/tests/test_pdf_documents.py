"""Branded PDF documents (docs/ux/document-design-system.md)."""

import datetime as dt
import shutil
import subprocess
import pytest

from apps.core.documents import renderer
from apps.core.documents.reports import allocation_list_pdf, placement_report_pdf


def _row(**overrides):
    row = {
        "student_name": "Amina Otieno", "registration_number": "MID-2026-001", "student_email": "amina@example.test",
        "cohort": "BSc Midwifery 2026", "institution": "School of Nursing", "facility": "County Referral Hospital",
        "ward": "Labour Ward", "mentor": "Grace Achieng", "state": "active", "planned_start": dt.date(2026, 9, 1),
        "planned_end": dt.date(2026, 11, 30), "actual_end": "", "sessions_logged": 4, "induction_percentage": 100,
        "final_assessment_submitted": False, "open_safeguarding_concerns": 0, "placement_id": "p-1",
    }
    row.update(overrides)
    return row


def _text(pdf: bytes) -> str:
    if not shutil.which("pdftotext"):
        pytest.skip("poppler-utils not installed")
    return subprocess.run(["pdftotext", "-layout", "-", "-"], input=pdf, capture_output=True, check=True).stdout.decode()


def test_placement_report_is_branded_paginated_and_uses_the_brand_fonts():
    pdf = placement_report_pdf([_row(student_name=f"Student {n}") for n in range(40)], scope="School of Nursing", period="1 Sep – 30 Nov 2026")
    assert pdf.startswith(b"%PDF")
    text = _text(pdf)
    assert "Placement report" in text and "School of Nursing" in text
    assert "Page 1 of" in text and "Page 2 of" in text  # running footer with total pages
    assert "EAT" in text  # generated time states its timezone
    assert "Placement register" in text and "Student 39" in text
    fonts = subprocess.run(["pdffonts", "-"], input=pdf, capture_output=True, check=True).stdout.decode() if shutil.which("pdffonts") else ""
    if fonts:
        assert "Inter" in fonts and "Manrope" in fonts and "Helvetica" not in fonts


def test_header_and_watermark_use_master_logo_files_not_live_text():
    """Brand Guidelines §05: master files only; never a re-set logotype or a letter-M stand-in."""
    accent = renderer.logo_data_uri("logo-horizontal-accent.svg")
    watermark = renderer.logo_data_uri("logo-horizontal-mono.svg", renderer.NAVY)
    assert accent.startswith("data:image/svg+xml;base64,") and watermark != accent
    import base64

    mono = base64.b64decode(watermark.split(",", 1)[1]).decode()
    assert "currentColor" not in mono and renderer.NAVY in mono
    from django.template.loader import render_to_string

    html = render_to_string("documents/placement_report.html", {"page": {"title": "Placement report", "orientation": "landscape",
                            "generated": "now", "logo": accent, "watermark": watermark}, "rows": [], "kpis": [], "meta": []})
    assert 'class="watermark"' in html and "opacity: 0.05" in html and "rotate" not in html.split("watermark")[1][:300]
    assert ">M<" not in html


def test_values_are_escaped_and_the_renderer_cannot_fetch_remote_or_local_files(tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("TOP SECRET")
    hostile = _row(student_name='<img src="https://example.invalid/x.png"><b>bold</b>', cohort=f'<img src="file://{secret}">')
    text = " ".join(_text(placement_report_pdf([hostile])).split())
    assert "<b>bold</b>" in text  # markup is printed as text, never interpreted
    assert "TOP SECRET" not in text
    fetcher = renderer._fetcher()
    for url in ("https://example.invalid/a.png", f"file://{secret}", "file:///etc/passwd"):
        with pytest.raises(renderer.BlockedResource):
            fetcher.fetch(url)


def test_empty_exports_render_a_calm_empty_state():
    assert "No placements match this export." in _text(placement_report_pdf([]))
    assert "No students to show." in _text(allocation_list_pdf([]))


def test_allocation_list_groups_students_by_facility_with_unrequested_last():
    rows = [
        {"student": "B", "registration_number": "", "cohort": "C", "facility": "", "ward": "", "mentor": "", "dates": "x", "status": "Not yet requested"},
        {"student": "A", "registration_number": "R1", "cohort": "C", "facility": "Alpha Hospital", "ward": "W", "mentor": "M", "dates": "x", "status": "Arranged"},
    ]
    text = _text(allocation_list_pdf(rows, scope="School of Nursing"))
    assert text.index("Alpha Hospital") < text.rindex("Not yet requested")


@pytest.mark.django_db
def test_oversized_pdf_export_fails_cleanly_and_is_not_retried(active_placement, coordinator, monkeypatch):
    from apps.analytics import export_service
    from apps.analytics.tasks import generate_export_task

    monkeypatch.setattr(export_service, "PDF_MAX_ROWS", 0)
    record = export_service.create_export(actor=coordinator, export_type="placements", filters={}, format="pdf")
    generate_export_task.apply(args=[str(record.id)])  # runs inline; must not raise or retry
    record.refresh_from_db()
    assert record.status == "failed" and record.error_code == "pdf_too_large"


@pytest.mark.django_db
def test_a_timed_out_export_is_marked_failed_not_left_running(active_placement, coordinator, monkeypatch):
    from celery.exceptions import SoftTimeLimitExceeded

    from apps.analytics import export_service

    def slow(*args, **kwargs):
        raise SoftTimeLimitExceeded()

    monkeypatch.setattr(export_service, "_serialize", slow)
    record = export_service.create_export(actor=coordinator, export_type="placements", filters={}, format="pdf")
    with pytest.raises(SoftTimeLimitExceeded):
        export_service.generate_export(record.id)
    record.refresh_from_db()
    assert record.status == "failed" and record.error_code == "export_timed_out"


@pytest.mark.django_db
def test_real_exports_render_branded_pdf_and_xlsx_for_staff(active_placement, coordinator):
    from apps.analytics import export_service
    from apps.placements import allocation_list

    for fmt in ("pdf", "xlsx"):
        record = export_service.generate_export(export_service.create_export(actor=coordinator, export_type="placements", filters={}, format=fmt).id)
        assert record.status == "completed" and record.row_count == 1
    pdf = allocation_list.render(allocation_list.rows_for(coordinator), "pdf", scope_label="Test School")
    assert "Test School" in _text(pdf)
    csv_text = allocation_list.render(allocation_list.rows_for(coordinator), "csv").decode("utf-8-sig")
    assert f"{active_placement.planned_start:%d %b %Y} – {active_placement.planned_end:%d %b %Y}" in csv_text  # CSV unchanged


def test_csv_cells_that_would_run_as_formulas_are_neutralised():
    from apps.core.documents import csvsafe

    assert csvsafe.row(["=HYPERLINK(\"x\")", "+254", "-1", "@SUM", "Amina", 5, None]) == [
        "'=HYPERLINK(\"x\")", "'+254", "'-1", "'@SUM", "Amina", 5, None]


@pytest.mark.django_db
def test_export_requests_are_validated_idempotent_limited_and_downloads_recheck_access(active_placement, coordinator, monkeypatch):
    import uuid

    from rest_framework.test import APIClient

    from apps.analytics.models import ExportRecord
    from apps.core.models import AuditEntry

    monkeypatch.setattr("apps.analytics.tasks.generate_export_task.delay", lambda *a, **k: None)
    client = APIClient()
    client.force_authenticate(coordinator)
    post = lambda body, key=None: client.post("/api/v1/exports", body, format="json", **({"HTTP_IDEMPOTENCY_KEY": key} if key else {}))  # noqa: E731
    assert post({"format": "csv", "cohort_id": "not-a-uuid"}).status_code == 400
    assert post({"format": "csv", "from": "2026-12-01", "to": "2026-01-01"}).json()["error"]["message"].startswith("Choose a valid period")
    key = str(uuid.uuid4())
    first, again = post({"format": "pdf"}, key), post({"format": "pdf"}, key)
    assert first.status_code == again.status_code == 202 and first.json()["data"]["id"] == again.json()["data"]["id"]
    assert AuditEntry.objects.filter(action="export.requested").count() == 1
    post({"format": "csv"})
    post({"format": "xlsx"})
    assert post({"format": "csv"}).status_code == 429  # three already being prepared
    record = ExportRecord.objects.filter(actor_id=coordinator.id).first()
    from django.utils import timezone

    ExportRecord.objects.filter(id=record.id).update(status="completed", storage_key="x", expires_at=timezone.now() - timezone.timedelta(minutes=1))
    expired = client.get(f"/api/v1/exports/{record.id}/download?token=x")
    assert expired.status_code == 410 and expired.json()["error"]["code"] == "export_expired"
