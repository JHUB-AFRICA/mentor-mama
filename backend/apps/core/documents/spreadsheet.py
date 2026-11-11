"""XLSX export builder following docs/ux/document-design-system.md (Spreadsheets)."""

from __future__ import annotations

import io
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

NAVY = "0D1B33"
NAVY_MUTED = "5E6C81"
TEAL = "1D8C8C"
MIST = "F4F7F8"
STONE = "E4E8EE"
TERRACOTTA = "D97757"

TZ = ZoneInfo("Africa/Nairobi")
HEADER_ROW = 5
FIRST_DATA_ROW = 6
MIN_WIDTH, MAX_WIDTH = 10, 48
_FORMULA_PREFIXES = ("=", "+", "-", "@")
_POSITIVE = ("completed", "arranged", "active")
_ATTENTION = ("awaiting", "requested", "not yet")


def _format_generated(generated_at: datetime) -> str:
    local = generated_at.astimezone(TZ)
    return f"{local.day} {local:%b %Y, %H:%M} {local.tzname()}"


def _to_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(TZ)
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None


def _to_number(value: Any) -> float | int | None:
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def _display(value: Any, kind: str) -> str:
    """Text used for width estimation."""
    if value is None:
        return ""
    if kind == "bool":
        return "Yes" if value else "No"
    if kind == "date":
        parsed = _to_date(value)
        return "00 Mmm 0000" if parsed else ""
    return str(value)


def _set_text(cell: Any, value: Any) -> None:
    text = "" if value is None else str(value)
    cell.value = text
    # Never let user data become a formula (CSV/formula injection).
    cell.data_type = "s"
    if text.startswith(_FORMULA_PREFIXES):
        cell.quotePrefix = True


def _status_font(text: str) -> Font:
    lowered = text.lower()
    if any(token in lowered for token in _ATTENTION):
        return Font(name="Inter", size=10, color=TERRACOTTA)
    if any(token in lowered for token in _POSITIVE):
        return Font(name="Inter", size=10, bold=True, color=TEAL)
    return Font(name="Inter", size=10, color=NAVY)


def build_xlsx(
    *,
    title: str,
    scope_label: str,
    generated_at: datetime,
    columns: list[tuple[str, str, str]],
    rows: list[dict],
    about_lines: list[str],
    sheet_name: str = "Report",
) -> bytes:
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=UTC)
    generated = _format_generated(generated_at)

    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name
    wb.properties.creator = "MentorMAMA"
    wb.properties.title = title

    ncols = max(len(columns), 1)
    stone_side = Side(style="thin", color=STONE)

    # Title block
    ws.cell(row=1, column=1, value=title).font = Font(
        name="Manrope", size=16, bold=True, color=NAVY
    )
    ws["A1"].data_type = "s"
    ws.row_dimensions[1].height = 26
    count = len(rows)
    noun = "row" if count == 1 else "rows"
    ws.cell(
        row=2, column=1, value=f"{scope_label} · {count} {noun} · Generated {generated}"
    ).font = Font(name="Inter", size=9, color=NAVY_MUTED)
    ws["A2"].data_type = "s"
    teal_rule = Border(bottom=Side(style="thin", color=TEAL))
    for col in range(1, ncols + 1):
        ws.cell(row=3, column=col).border = teal_rule

    # Header
    header_fill = PatternFill("solid", start_color=NAVY, end_color=NAVY)
    for idx, (_key, label, _kind) in enumerate(columns, start=1):
        cell = ws.cell(row=HEADER_ROW, column=idx)
        _set_text(cell, label)
        cell.font = Font(name="Inter", size=10, bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(
            vertical="center",
            horizontal="right" if columns[idx - 1][2] == "number" else "left",
            wrap_text=False,
        )
    ws.row_dimensions[HEADER_ROW].height = 22

    widths = [len(label) for _k, label, _kind in columns]

    # Data
    zebra = PatternFill("solid", start_color=MIST, end_color=MIST)
    row_border = Border(bottom=stone_side)
    if not rows:
        cell = ws.cell(row=FIRST_DATA_ROW, column=1, value="No rows match this export.")
        cell.data_type = "s"
        cell.font = Font(name="Inter", size=10, italic=True, color=NAVY_MUTED)
        cell.alignment = Alignment(vertical="center")
    for r_idx, row in enumerate(rows):
        excel_row = FIRST_DATA_ROW + r_idx
        for c_idx, (key, _label, kind) in enumerate(columns, start=1):
            raw = row.get(key)
            cell = ws.cell(row=excel_row, column=c_idx)
            font = Font(name="Inter", size=10, color=NAVY)
            horizontal = "left"
            if kind == "date":
                parsed = _to_date(raw)
                if parsed is not None:
                    cell.value = parsed
                    cell.number_format = "dd mmm yyyy"
                elif raw not in (None, ""):
                    _set_text(cell, raw)
            elif kind == "percent":
                number = _to_number(raw)
                if number is not None:
                    cell.value = number / 100
                    cell.number_format = "0%"
                    horizontal = "right"
            elif kind == "number":
                number = _to_number(raw)
                if number is not None:
                    cell.value = number
                    horizontal = "right"
                elif raw not in (None, ""):
                    _set_text(cell, raw)
            elif kind == "bool":
                _set_text(cell, "Yes" if raw else "No")
            elif kind == "status":
                text = "" if raw is None else str(raw)
                _set_text(cell, text)
                font = _status_font(text)
            else:
                _set_text(cell, raw)
            cell.font = font
            cell.alignment = Alignment(
                vertical="center", horizontal=horizontal, wrap_text=False
            )
            cell.border = row_border
            if r_idx % 2 == 1:
                cell.fill = zebra
            widths[c_idx - 1] = max(widths[c_idx - 1], len(_display(raw, kind)))

    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = max(
            MIN_WIDTH, min(MAX_WIDTH, width + 2)
        )

    # Navigation
    ws.freeze_panes = f"A{FIRST_DATA_ROW}"
    last_row = max(FIRST_DATA_ROW, HEADER_ROW + count)
    ws.auto_filter.ref = f"A{HEADER_ROW}:{get_column_letter(ncols)}{last_row}"

    # Print setup
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{HEADER_ROW}:{HEADER_ROW}"
    ws.oddHeader.center.text = f"MentorMAMA · {title}"
    ws.oddFooter.center.text = "Confidential · Page &P of &N"

    # About sheet
    about = wb.create_sheet("About")
    about.column_dimensions["A"].width = 100
    about["A1"] = title
    about["A1"].data_type = "s"
    about["A1"].font = Font(name="Manrope", size=16, bold=True, color=NAVY)
    about.row_dimensions[1].height = 26
    next_row = 3
    for line in [*about_lines, f"Generated {generated}"]:
        cell = about.cell(row=next_row, column=1)
        _set_text(cell, line)
        cell.font = Font(name="Inter", size=10, color=NAVY)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        next_row += 1

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
