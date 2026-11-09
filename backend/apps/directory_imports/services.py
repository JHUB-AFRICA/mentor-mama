"""Atomic, preview-first CSV imports for programme directory records.

This application layer coordinates the owning modules. It does not write their
models directly; each imported row is created through its domain service.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import unicodedata
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from apps.core import audit, errors
from apps.facilities import api as facilities_api, services as facilities_services
from apps.identity import api as identity
from apps.institutions import services as institutions_services
from apps.placements import services as placements_services

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 500
PREVIEW_MAX_AGE = 15 * 60

SCHEMAS = {
    "institutions": {
        "headers": ("name", "type", "county", "contact_person", "contact_email", "contact_phone"),
        "lengths": {"name": 200, "type": 60, "county": 60, "contact_person": 120, "contact_email": 254, "contact_phone": 32},
    },
    "facilities": {
        "headers": ("name", "county", "level", "maternity_unit_name", "contact_person", "contact_email", "contact_phone"),
        "lengths": {"name": 200, "county": 60, "level": 60, "maternity_unit_name": 200, "contact_person": 120, "contact_email": 254, "contact_phone": 32},
    },
    "wards": {
        "headers": ("name", "shift_pattern", "max_students"),
        "lengths": {"name": 200, "shift_pattern": 120},
    },
}


def _authorized(actor) -> bool:
    return actor.status == identity.STATUSES.ACTIVE and actor.role == identity.ROLES.PROGRAM_ADMIN


def _issue(row: int | None, field: str, message: str) -> dict:
    return {"row": row, "field": field, "message": message}


def _directory_fingerprint(rows) -> str:
    snapshot = sorted(
        (str(item.id), item.name.strip().casefold(), str(getattr(item, "archived_at", None)))
        for item in rows
    )
    return hashlib.sha256(json.dumps(snapshot, separators=(",", ":")).encode()).hexdigest()


def _read_upload(uploaded_file) -> tuple[bytes, str]:
    raw = uploaded_file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise errors.DirectoryImportInvalid("Choose a CSV file that is 2 MB or smaller.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise errors.DirectoryImportInvalid(
            "Save the file as UTF-8 CSV before importing.",
            issues=[_issue(None, "file", "The file is not valid UTF-8.")],
        ) from exc
    return raw, text


def _records_for(actor, kind: str, facility_id=None):
    if kind == "institutions":
        rows = institutions_services.list_institutions(actor=actor)
        return rows, None
    if kind == "facilities":
        rows = facilities_services.list_facilities(actor=actor)
        return rows, None
    if kind == "wards":
        if not facility_id or not facilities_api.facility_belongs_to_program(
            facility_id=facility_id, program_id=actor.program_id,
        ):
            raise errors.DirectoryImportInvalid(
                "Choose an active facility in this programme before importing wards.",
                issues=[_issue(None, "facility_id", "Facility is missing, inactive, or outside this programme.")],
            )
        rows = facilities_api.ward_directory(program_id=actor.program_id, facility_id=facility_id)
        return rows, facility_id
    raise errors.DirectoryImportInvalid(
        "Choose institutions, facilities, or wards as the CSV resource type.",
        issues=[_issue(None, "resource_type", "Unsupported directory resource type.")],
    )


def _parse_rows(text: str, kind: str) -> tuple[list[dict], list[dict]]:
    schema = SCHEMAS[kind]
    errors_found: list[dict] = []
    parsed: list[dict] = []
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        header = next(reader, None)
        if not header:
            return [], [_issue(1, "header", "The CSV needs a header row and at least one data row.")]
        normalized = [value.strip().lower() for value in header]
        if len(set(normalized)) != len(normalized):
            return [], [_issue(1, "header", "The CSV contains duplicate column names.")]
        expected = list(schema["headers"])
        missing = [field for field in expected if field not in normalized]
        extra = [field for field in normalized if field not in expected]
        if missing or extra:
            messages = []
            if missing:
                messages.append(f"Missing columns: {', '.join(missing)}.")
            if extra:
                messages.append(f"Unknown columns: {', '.join(extra)}.")
            return [], [_issue(1, "header", " ".join(messages))]

        data_rows = 0
        for row_number, values in enumerate(reader, start=2):
            if not any(value.strip() for value in values):
                continue
            data_rows += 1
            if data_rows > MAX_ROWS:
                errors_found.append(_issue(row_number, "file", f"Import no more than {MAX_ROWS} records at a time."))
                break
            if len(values) != len(expected):
                errors_found.append(_issue(row_number, "row", "The number of values does not match the template columns."))
                continue
            record = {field: (value or "").strip() for field, value in zip(normalized, values)}
            if any(unicodedata.category(character) == "Cc" for value in record.values() for character in value):
                errors_found.append(_issue(row_number, "row", "Remove unsupported control characters from this row."))
                continue
            parsed.append({"row": row_number, "data": record})
        if data_rows == 0:
            errors_found.append(_issue(None, "file", "Add at least one data row below the header."))
    except csv.Error as exc:
        errors_found.append(_issue(None, "file", "The CSV formatting is invalid. Check quoted values and commas."))
    return parsed, errors_found


def _preview_data(*, actor, kind: str, uploaded_file, facility_id=None) -> dict:
    if not _authorized(actor):
        return {"authorized": False}
    if kind not in SCHEMAS:
        raise errors.DirectoryImportInvalid("Choose institutions, facilities, or wards.")
    if kind != "wards" and facility_id is not None:
        raise errors.DirectoryImportInvalid("A facility is only selected for ward imports.")
    raw, text = _read_upload(uploaded_file)
    existing_rows, scoped_facility_id = _records_for(actor, kind, facility_id)
    parsed, file_errors = _parse_rows(text, kind)
    output_rows = []
    previous_names: set[str] = set()
    existing_names = {item.name.strip().casefold() for item in existing_rows}
    all_errors = list(file_errors)
    warnings = []
    for parsed_row in parsed:
        row_number = parsed_row["row"]
        data = parsed_row["data"]
        row_errors = []
        row_warnings = []
        schema = SCHEMAS[kind]
        name = data["name"]
        if len(name) < 2:
            row_errors.append(_issue(row_number, "name", "Enter a name with at least 2 characters."))
        for field, max_length in schema["lengths"].items():
            if len(data[field]) > max_length:
                row_errors.append(_issue(row_number, field, f"Use no more than {max_length} characters."))
        if data.get("contact_email"):
            try:
                validate_email(data["contact_email"])
            except ValidationError:
                row_errors.append(_issue(row_number, "contact_email", "Enter a valid email address."))
        if kind == "wards":
            try:
                capacity = int(data["max_students"])
                if capacity < 1:
                    raise ValueError
                data["max_students"] = capacity
            except (TypeError, ValueError):
                row_errors.append(_issue(row_number, "max_students", "Enter a whole number greater than zero."))
        name_key = name.casefold()
        if name_key and (name_key in existing_names or name_key in previous_names):
            row_warnings.append(_issue(row_number, "name", "A record with this name already exists. Confirm that this is a distinct site or branch."))
        if name_key:
            previous_names.add(name_key)
        all_errors.extend(row_errors)
        warnings.extend(row_warnings)
        output_rows.append({
            "row": row_number,
            "name": name[:200],
            "status": "error" if row_errors else "warning" if row_warnings else "ready",
            "issues": [{"field": issue["field"], "message": issue["message"]} for issue in row_errors + row_warnings],
        })

    fingerprint_data = {
        "errors": all_errors,
        "warnings": warnings,
    }
    fingerprint = hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True).encode()).hexdigest()
    token_data = {
        "actor": str(actor.id),
        "program": str(actor.program_id),
        "kind": kind,
        "facility": str(scoped_facility_id) if scoped_facility_id else None,
        "file": hashlib.sha256(raw).hexdigest(),
        "preview": fingerprint,
        "directory": _directory_fingerprint(existing_rows),
    }
    token = signing.dumps(token_data, salt="directory-import-preview", compress=True)
    return {
        "authorized": True,
        "kind": kind,
        "rows": output_rows,
        "errors": all_errors,
        "warnings": warnings,
        "valid_count": len(output_rows) - sum(row["status"] == "error" for row in output_rows),
        "error_count": len(all_errors),
        "warning_count": len(warnings),
        "preview_token": token,
        "facility_id": scoped_facility_id,
    }


def preview(*, actor, kind: str, uploaded_file, facility_id=None) -> dict | None:
    result = _preview_data(actor=actor, kind=kind, uploaded_file=uploaded_file, facility_id=facility_id)
    if not result["authorized"]:
        return None
    result.pop("authorized")
    return result


def _verify_token(*, token: str, actor, kind: str, facility_id, preview_data: dict) -> None:
    try:
        signed = signing.loads(token, salt="directory-import-preview", max_age=PREVIEW_MAX_AGE)
    except signing.BadSignature as exc:
        raise errors.DirectoryImportPreviewStale() from exc
    current = {
        "actor": str(actor.id),
        "program": str(actor.program_id),
        "kind": kind,
        "facility": str(facility_id) if facility_id else None,
        "file": preview_data["_file_digest"],
        "preview": preview_data["_fingerprint"],
        "directory": preview_data["_directory_fingerprint"],
    }
    if signed != current:
        raise errors.DirectoryImportPreviewStale()


def _validated_commit_preview(*, actor, kind: str, uploaded_file, facility_id):
    # Keep this parsing shared with the preview path so commit cannot interpret
    # bytes differently from what the admin reviewed.
    raw, text = _read_upload(uploaded_file)
    existing_rows, scoped_facility_id = _records_for(actor, kind, facility_id)
    parsed, file_errors = _parse_rows(text, kind)
    errors_found = list(file_errors)
    warnings = []
    names_seen: set[str] = set()
    existing_names = {item.name.strip().casefold() for item in existing_rows}
    normalized_rows = []
    output_rows = []
    for parsed_row in parsed:
        row_number = parsed_row["row"]
        data = parsed_row["data"]
        row_errors = []
        row_warnings = []
        name = data["name"]
        if len(name) < 2:
            row_errors.append(_issue(row_number, "name", "Enter a name with at least 2 characters."))
        for field, max_length in SCHEMAS[kind]["lengths"].items():
            if len(data[field]) > max_length:
                row_errors.append(_issue(row_number, field, f"Use no more than {max_length} characters."))
        if data.get("contact_email"):
            try:
                validate_email(data["contact_email"])
            except ValidationError:
                row_errors.append(_issue(row_number, "contact_email", "Enter a valid email address."))
        if kind == "wards":
            try:
                capacity = int(data["max_students"])
                if capacity < 1:
                    raise ValueError
                data["max_students"] = capacity
            except (TypeError, ValueError):
                row_errors.append(_issue(row_number, "max_students", "Enter a whole number greater than zero."))
        key = name.casefold()
        if key and (key in existing_names or key in names_seen):
            row_warnings.append(_issue(row_number, "name", "A record with this name already exists. Confirm that this is a distinct site or branch."))
        if key:
            names_seen.add(key)
        errors_found.extend(row_errors)
        warnings.extend(row_warnings)
        output_rows.append({"row": row_number, "status": "error" if row_errors else "warning" if row_warnings else "ready"})
        normalized_rows.append(data)
    fingerprint_data = {"errors": errors_found, "warnings": warnings}
    fingerprint = hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True).encode()).hexdigest()
    return {
        "raw": raw,
        "rows": normalized_rows,
        "errors": errors_found,
        "warnings": warnings,
        "fingerprint": fingerprint,
        "file_digest": hashlib.sha256(raw).hexdigest(),
        "directory_fingerprint": _directory_fingerprint(existing_rows),
        "facility_id": scoped_facility_id,
        "output_rows": output_rows,
    }


@transaction.atomic
def commit(*, actor, kind: str, uploaded_file, facility_id=None, preview_token: str, confirm_warnings: bool, command_id):
    if not _authorized(actor):
        return None
    if kind not in SCHEMAS:
        raise errors.DirectoryImportInvalid("Choose institutions, facilities, or wards.")
    current = _validated_commit_preview(actor=actor, kind=kind, uploaded_file=uploaded_file, facility_id=facility_id)
    _verify_token(
        token=preview_token, actor=actor, kind=kind,
        facility_id=current["facility_id"],
        preview_data={
            "_file_digest": current["file_digest"],
            "_fingerprint": current["fingerprint"],
            "_directory_fingerprint": current["directory_fingerprint"],
        },
    )
    if current["errors"]:
        raise errors.DirectoryImportInvalid(issues=current["errors"])
    if current["warnings"] and not confirm_warnings:
        raise errors.DirectoryImportWarningsUnconfirmed(issues=current["warnings"])

    created = []
    for values in current["rows"]:
        if kind == "institutions":
            item = institutions_services.create_institution(actor=actor, **values)
        elif kind == "facilities":
            item = facilities_services.create_facility(actor=actor, **values)
        else:
            item = placements_services.create_programme_ward(
                actor=actor, facility_id=current["facility_id"], **values,
            )
        if item is None:
            raise errors.UnauthorizedFacilityAccess()
        created.append(item)

    audit.record(
        actor=actor, action="directory_import.completed",
        entity_table="directory_import_command", entity_id=command_id,
        scope={"program_id": str(actor.program_id)},
        changes={"resource_type": kind, "created_count": len(created)},
    )
    return {"resource_type": kind, "created_count": len(created)}
