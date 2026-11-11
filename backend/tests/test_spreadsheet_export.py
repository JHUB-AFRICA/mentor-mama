import io
from datetime import date, datetime, timezone

from openpyxl import load_workbook

from apps.core.documents.spreadsheet import build_xlsx

COLUMNS = [
    ("name", "Name", "text"),
    ("when", "Start date", "date"),
    ("pct", "Progress", "percent"),
    ("n", "Sessions", "number"),
    ("ok", "Consent", "bool"),
    ("state", "Status", "status"),
]
GENERATED = datetime(2026, 11, 11, 11, 2, tzinfo=timezone.utc)  # 14:02 EAT


def _build(rows, **kw):
    data = build_xlsx(
        title="Mentoring pairs",
        scope_label="Kenya programme",
        generated_at=GENERATED,
        columns=COLUMNS,
        rows=rows,
        about_lines=["Contains pairs.", "Never contains private notes."],
        **kw,
    )
    return load_workbook(io.BytesIO(data))


ROWS = [
    {
        "name": "Amina",
        "when": "2026-03-04",
        "pct": 50,
        "n": 3,
        "ok": True,
        "state": "Completed",
    },
    {
        "name": '=HYPERLINK("http://x")',
        "when": date(2026, 4, 1),
        "pct": "",
        "n": 0,
        "ok": False,
        "state": "Awaiting mentor",
    },
    {"name": "@evil", "when": "", "pct": 12.5, "n": 7, "ok": False, "state": "Other"},
]


def test_report_sheet_layout():
    wb = _build(ROWS)
    ws = wb["Report"]
    assert ws["A1"].value == "Mentoring pairs"
    assert ws["A1"].font.b and ws["A1"].font.sz == 16
    assert (
        ws["A2"].value == "Kenya programme · 3 rows · Generated 11 Nov 2026, 14:02 EAT"
    )
    assert [c.value for c in ws[5]] == [c[1] for c in COLUMNS]
    assert ws["A5"].fill.start_color.rgb.endswith("0D1B33")
    assert ws.freeze_panes == "A6"
    assert ws.auto_filter.ref == "A5:F8"
    assert ws.print_title_rows.replace("$", "") == "5:5"
    assert ws.page_setup.orientation == "landscape"
    assert wb.properties.creator == "MentorMAMA"
    assert wb.properties.title == "Mentoring pairs"


def test_cell_kinds():
    ws = _build(ROWS)["Report"]
    assert isinstance(ws["B6"].value, datetime)
    assert ws["B6"].value.date() == date(2026, 3, 4)
    assert ws["B6"].number_format == "dd mmm yyyy"
    assert ws["C6"].value == 0.5 and ws["C6"].number_format == "0%"
    assert ws["C7"].value is None
    assert ws["D6"].value == 3 and ws["D6"].alignment.horizontal == "right"
    assert ws["E6"].value == "Yes" and ws["E7"].value == "No"
    assert ws["F6"].font.color.rgb.endswith("1D8C8C") and ws["F6"].font.b
    assert ws["F7"].font.color.rgb.endswith("D97757")
    assert ws["F8"].font.color.rgb.endswith("0D1B33")
    assert (
        ws["A7"].fill.start_color.rgb.endswith("F4F7F8")
        or ws["A7"].fill.fill_type == "solid"
    )


def test_formula_injection_is_inert():
    ws = _build(ROWS)["Report"]
    for ref, text in (("A7", '=HYPERLINK("http://x")'), ("A8", "@evil")):
        assert ws[ref].data_type == "s"
        assert ws[ref].value == text


def test_about_sheet():
    about = _build(ROWS)["About"]
    assert about["A1"].value == "Mentoring pairs"
    assert about["A3"].value == "Contains pairs."
    assert about["A4"].value == "Never contains private notes."
    assert about["A5"].value == "Generated 11 Nov 2026, 14:02 EAT"
    assert about.column_dimensions["A"].width == 100


def test_empty_state():
    ws = _build([])["Report"]
    assert ws["A6"].value == "No rows match this export."
    assert ws["A6"].font.i
    assert ws["A2"].value.startswith("Kenya programme · 0 rows")
    assert ws.auto_filter.ref == "A5:F6"
