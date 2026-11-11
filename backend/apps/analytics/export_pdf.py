"""Branded PDF rendering for placement exports (MentorMAMA teal, A4 landscape, readable columns)."""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from io import BytesIO

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle

TEAL = colors.HexColor("#0b9696")
TEAL_DARK = colors.HexColor("#087575")
NAVY = colors.HexColor("#10223b")
SLATE = colors.HexColor("#5b6b7e")
LINE = colors.HexColor("#dbe4ed")
ZEBRA = colors.HexColor("#f5f9fa")
TINT = colors.HexColor("#e7f5f5")

# A readable subset: the full field list stays available in CSV/XLSX.
COLUMNS = [
    ("Student", "student_name", 38),
    ("Reg. no.", "registration_number", 24),
    ("Cohort", "cohort", 34),
    ("Facility · ward", "_place", 46),
    ("Mentor", "mentor", 34),
    ("Stage", "_state", 24),
    ("Dates", "_dates", 40),
    ("Sessions", "sessions_logged", 19),
    ("Induction", "_induction", 17),
    ("Final", "_final", 13),
    ("Concerns", "open_safeguarding_concerns", 20),
]

STATE_LABELS = {
    "draft": "Draft", "scheduled": "Scheduled", "awaiting_student": "Awaiting student", "orientation": "Orientation",
    "induction": "Induction", "active": "Active", "paused": "Paused", "completed": "Completed",
    "archived": "Archived", "withdrawn": "Withdrawn",
}
STATE_COLORS = {
    "active": "#0b9696", "induction": "#7958c9", "orientation": "#3479ca", "awaiting_student": "#e6aa38",
    "scheduled": "#6fa8dc", "completed": "#3f9f6b", "draft": "#9aa8b6", "paused": "#d96a5f",
}


def _date(value) -> str:
    text = str(value or "")
    try:
        return datetime.fromisoformat(text).strftime("%d %b %Y")
    except ValueError:
        return text


def _cell_value(row: dict, key: str) -> str:
    if key == "_place":
        return " · ".join(part for part in (row["facility"], row["ward"]) if part) or "Not allocated"
    if key == "_state":
        return STATE_LABELS.get(row["state"], str(row["state"]).title())
    if key == "_dates":
        return f"{_date(row['planned_start'])} – {_date(row['planned_end'])}"
    if key == "_induction":
        return "—" if row["induction_percentage"] in ("", None) else f"{row['induction_percentage']}%"
    if key == "_final":
        return "Yes" if row["final_assessment_submitted"] else "No"
    value = row.get(key, "")
    return "—" if value in ("", None) else str(value)


def _stage_chart(counts: Counter, width: float) -> Drawing:
    items = sorted(counts.items(), key=lambda item: -item[1])[:8] or [("none", 0)]
    height = 18 + 17 * len(items)
    drawing = Drawing(width, height)
    chart = HorizontalBarChart()
    chart.x, chart.y, chart.width, chart.height = 78, 6, width - 110, height - 12
    chart.data = [[value for _, value in reversed(items)]]
    chart.categoryAxis.categoryNames = [STATE_LABELS.get(name, name.title()) for name, _ in reversed(items)]
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 8
    chart.categoryAxis.labels.fillColor = NAVY
    chart.categoryAxis.strokeColor = LINE
    chart.categoryAxis.visibleTicks = False
    chart.valueAxis.visible = False
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(1, max(value for _, value in items)) * 1.2
    chart.barWidth = 9
    chart.groupSpacing = 6
    chart.bars[0].fillColor = TEAL
    chart.bars[0].strokeColor = None
    chart.barLabelFormat = "%d"
    chart.barLabels.fontName = "Helvetica-Bold"
    chart.barLabels.fontSize = 8
    chart.barLabels.fillColor = NAVY
    chart.barLabels.boxAnchor = "w"
    chart.barLabels.dx = 4
    chart.strokeColor = None
    drawing.add(chart)
    return drawing


def _render(*, title: str, scope_label: str, count_label: str, kpis: list[tuple[str, str]], stage_counts: Counter | None,
            columns: list[tuple[str, str, int]], table_rows: list[dict], table_title: str, empty_text: str) -> bytes:
    page = landscape(A4)
    margin = 12 * mm
    generated = datetime.now().strftime("%d %b %Y, %H:%M")
    output = BytesIO()

    def chrome(canvas, doc):
        canvas.saveState()
        width, height = page
        canvas.setFillColor(TEAL)
        canvas.rect(0, height - 20 * mm, width, 20 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.roundRect(margin, height - 15.5 * mm, 11 * mm, 11 * mm, 2.5 * mm, stroke=0, fill=1)
        canvas.setFillColor(TEAL_DARK)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawCentredString(margin + 5.5 * mm, height - 12.2 * mm, "M")
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(margin + 14 * mm, height - 11.2 * mm, "MentorMAMA")
        canvas.setFont("Helvetica", 8)
        canvas.drawString(margin + 14 * mm, height - 15.2 * mm, "Mentorship & clinical placement programme")
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawRightString(width - margin, height - 11.2 * mm, title)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(width - margin, height - 15.2 * mm, f"Generated {generated}")
        canvas.setStrokeColor(LINE)
        canvas.line(margin, 12 * mm, width - margin, 12 * mm)
        canvas.setFillColor(SLATE)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(margin, 8 * mm, "Confidential · programme metadata only. No narratives or clinical details. Handle under the MentorMAMA data policy.")
        canvas.drawRightString(width - margin, 8 * mm, f"Page {doc.page}")
        canvas.restoreState()

    document = BaseDocTemplate(
        output, pagesize=page, leftMargin=margin, rightMargin=margin, topMargin=26 * mm, bottomMargin=16 * mm,
        title=title, author="MentorMAMA", subject=title,
    )
    frame = Frame(margin, 16 * mm, page[0] - 2 * margin, page[1] - 42 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    document.addPageTemplates([PageTemplate(id="branded", frames=[frame], onPage=chrome)])
    usable = page[0] - 2 * margin

    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=NAVY, alignment=TA_LEFT)
    sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, leading=12, textColor=SLATE)
    h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=NAVY)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=7.4, leading=9.2, textColor=NAVY)
    head = ParagraphStyle("head", fontName="Helvetica-Bold", fontSize=7.4, leading=9, textColor=colors.white)

    tile = usable / len(kpis)
    kpi_table = Table(
        [[Paragraph(f'<font size="17" color="#087575"><b>{value}</b></font><br/><font size="7.5" color="#5b6b7e">{label}</font>', ParagraphStyle("k", leading=20, alignment=1)) for value, label in kpis]],
        colWidths=[tile] * len(kpis),
    )
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TINT), ("BOX", (0, 0), (-1, -1), .5, LINE), ("INNERGRID", (0, 0), (-1, -1), .5, colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story = [
        Paragraph(title, h1),
        Paragraph(f"{scope_label + ' · ' if scope_label else ''}{count_label}", sub),
        Spacer(1, 4 * mm), kpi_table, Spacer(1, 5 * mm),
    ]
    if stage_counts:
        story.append(KeepTogether([Paragraph("Placements by stage", h2), Spacer(1, 1.5 * mm), _stage_chart(stage_counts, min(usable, 180 * mm))]))
        story.append(Spacer(1, 5 * mm))

    total_weight = sum(weight for _, _, weight in columns)
    widths = [usable * weight / total_weight for _, _, weight in columns]
    data = [[Paragraph(label, head) for label, _, _ in columns]]
    for row in table_rows:
        data.append([Paragraph(str(row.get(key, "")).replace("&", "&amp;").replace("<", "&lt;"), body) for _, key, _ in columns])
    if not table_rows:
        data.append([Paragraph(empty_text, body)] + [""] * (len(columns) - 1))
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ZEBRA]),
        ("LINEBELOW", (0, 0), (-1, -1), .4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    story.extend([Paragraph(table_title, h2), Spacer(1, 1.5 * mm), table])
    document.build(story)
    return output.getvalue()


def render_placement_pdf(rows: list[dict], title: str, scope_label: str = "") -> bytes:
    counts = Counter(row["state"] for row in rows)
    active = counts.get("active", 0) + counts.get("induction", 0) + counts.get("orientation", 0)
    inductions = [float(row["induction_percentage"]) for row in rows if row["induction_percentage"] not in ("", None)]
    kpis = [
        (str(len(rows)), "Placements"),
        (str(active), "In progress"),
        (str(counts.get("completed", 0)), "Completed"),
        (f"{round(sum(inductions) / len(inductions))}%" if inductions else "—", "Avg. induction"),
        (str(sum(int(row["sessions_logged"] or 0) for row in rows)), "Sessions logged"),
        (str(sum(int(row["open_safeguarding_concerns"] or 0) for row in rows)), "Open concerns"),
    ]
    table_rows = [{key: _cell_value(row, key) for _, key, _ in COLUMNS} for row in rows]
    return _render(
        title=title, scope_label=scope_label, count_label=f"{len(rows)} {'placement' if len(rows) == 1 else 'placements'}",
        kpis=kpis, stage_counts=counts if rows else None, columns=COLUMNS, table_rows=table_rows,
        table_title="Placement register", empty_text="No placements match this export.",
    )


ALLOCATION_COLUMNS = [
    ("Student", "student", 40),
    ("Reg. no.", "registration_number", 24),
    ("Cohort", "cohort", 34),
    ("Facility", "facility", 42),
    ("Ward", "ward", 36),
    ("Mentor", "mentor", 36),
    ("Dates", "dates", 40),
    ("Status", "status", 30),
]


def render_allocation_pdf(rows: list[dict], title: str = "Placement allocation list", scope_label: str = "") -> bytes:
    arranged = sum(1 for row in rows if row["status"] == "Arranged")
    waiting = sum(1 for row in rows if row["status"] == "Awaiting ward or mentor")
    requested = sum(1 for row in rows if row["status"] == "Requested of facility")
    kpis = [
        (str(len(rows)), "Students"), (str(arranged), "Arranged"),
        (str(waiting), "Awaiting ward or mentor"), (str(requested), "Requested of facility"),
        (str(len(rows) - arranged - waiting - requested), "Not yet requested"),
    ]
    return _render(
        title=title, scope_label=scope_label, count_label=f"{len(rows)} {'student' if len(rows) == 1 else 'students'}",
        kpis=kpis, stage_counts=None, columns=ALLOCATION_COLUMNS, table_rows=rows,
        table_title="Where each student is placed", empty_text="No students to show.",
    )
