"""CSV cells that open safely in Excel, LibreOffice and Google Sheets.

A cell that starts with ``= + - @`` (or a tab/carriage return) is evaluated as a formula by spreadsheet apps, so a
student or ward name like ``=HYPERLINK(...)`` could run when someone opens an export. Such text gets a leading
apostrophe, the convention spreadsheets use for "this is text". Numbers, dates and booleans are left alone.
"""

from __future__ import annotations

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
#: Excel needs the byte-order mark to read UTF-8 (names with accents, en dashes) correctly.
BOM = "\ufeff"


def cell(value):
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


def row(values):
    return [cell(value) for value in values]


def mapping(values: dict) -> dict:
    return {key: cell(value) for key, value in values.items()}
