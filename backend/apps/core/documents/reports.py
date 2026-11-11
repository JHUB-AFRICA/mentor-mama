"""View models for the branded report PDFs. Templates live in apps/core/templates/documents/."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime

from apps.core.documents import charts
from apps.core.documents.renderer import render_pdf

STATE_LABELS = {
    "draft": "Draft", "scheduled": "Scheduled", "awaiting_student": "Awaiting student", "orientation": "Orientation",
    "induction": "Induction", "active": "Active", "paused": "Paused", "completed": "Completed",
    "archived": "Archived", "withdrawn": "Withdrawn",
}
STATE_TONES = {
    "active": "teal", "induction": "teal", "orientation": "teal", "completed": "success",
    "paused": "attention", "withdrawn": "attention", "awaiting_student": "neutral",
}
IN_PROGRESS = {"orientation", "induction", "active"}
ROWS_PER_TABLE = 20


def _date(value) -> str:
    if isinstance(value, (date, datetime)):
        return f"{value:%d %b %Y}"
    text = str(value or "")
    try:
        return f"{datetime.fromisoformat(text):%d %b %Y}"
    except ValueError:
        return text


def _span(start, end) -> str:
    """'01 Sep – 30 Nov 2026' when both dates share a year, else both in full."""
    if isinstance(start, date) and isinstance(end, date) and start.year == end.year:
        return f"{start:%d %b} – {end:%d %b %Y}"
    return f"{_date(start)} – {_date(end)}"


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def placement_report_pdf(rows: list[dict], *, title: str = "Placement report", scope: str = "", period: str = "",
                         prepared_for: str = "") -> bytes:
    counts = Counter(row["state"] for row in rows)
    inductions = [float(row["induction_percentage"]) for row in rows if row["induction_percentage"] not in ("", None)]
    concerns = sum(int(row["open_safeguarding_concerns"] or 0) for row in rows)
    in_progress = sum(counts.get(state, 0) for state in IN_PROGRESS)
    kpis = [
        {"label": "Placements", "value": len(rows), "tone": "neutral"},
        {"label": "In progress", "value": in_progress, "hint": "Orientation, induction or active"},
        {"label": "Completed", "value": counts.get("completed", 0)},
        {"label": "Average induction", "value": f"{round(sum(inductions) / len(inductions))}%" if inductions else "—", "hint": "Across opened checklists"},
        {"label": "Sessions logged", "value": sum(int(row["sessions_logged"] or 0) for row in rows)},
        {"label": "Open concerns", "value": concerns, "tone": "attention" if concerns else "neutral", "hint": "Counts only"},
    ]
    stage_items = [(STATE_LABELS.get(state, state.title()), value) for state, value in counts.most_common(8)]
    complete = sum(1 for value in inductions if value >= 100)
    started = sum(1 for value in inductions if 0 < value < 100)
    induction_chart, induction_legend = charts.donut(
        [("Complete", complete), ("Under way", started), ("Not started", len(rows) - complete - started)],
        centre_label="placements", colours=["#1D8C8C", "#8FB8B5", "#D5DCE4"],
    )
    table = [{
        "student": row["student_name"] or "—",
        "registration_number": row.get("registration_number", ""),
        "cohort": row["cohort"],
        "facility": row["facility"],
        "ward": row["ward"],
        "mentor": row["mentor"],
        "stage": STATE_LABELS.get(row["state"], str(row["state"]).title()),
        "stage_tone": STATE_TONES.get(row["state"], "neutral"),
        "dates": _span(row["planned_start"], row["planned_end"]),
        "sessions": int(row["sessions_logged"] or 0),
        "induction": "" if row["induction_percentage"] in ("", None) else f"{round(float(row['induction_percentage']))}%",
        "final": "Yes" if row["final_assessment_submitted"] else "No",
        "concerns": int(row["open_safeguarding_concerns"] or 0),
    } for row in rows]
    meta = [{"label": "Scope", "value": scope or "Your programme scope"}, {"label": "Placements", "value": len(rows)}]
    if period:
        meta.insert(1, {"label": "Period", "value": period})
    if prepared_for:
        meta.append({"label": "Prepared for", "value": prepared_for})
    context = {
        "scope": scope,
        "description": "Where every placement stands: stage, induction, mentorship sessions and close-out. "
        "Counts only for safeguarding; no narratives or clinical details.",
        "meta": meta,
        "kpis": kpis,
        "rows": table,
        # Page-sized tables: WeasyPrint re-lays-out one long table on every page (quadratic); chunks keep it linear.
        "row_chunks": [table[i:i + ROWS_PER_TABLE] for i in range(0, len(table), ROWS_PER_TABLE)],
        "stage_chart": charts.bar_list(stage_items, width=330),
        "induction_chart": induction_chart,
        "induction_legend": induction_legend,
    }
    return render_pdf("documents/placement_report.html", context, title=title, subject=f"{title} · {_plural(len(rows), 'placement')}")


ALLOCATION_TONES = {"Arranged": "teal", "Completed": "success", "Awaiting ward or mentor": "attention",
                    "Requested of facility": "neutral", "Not yet requested": "attention"}


def allocation_list_pdf(rows: list[dict], *, title: str = "Placement allocation list", scope: str = "") -> bytes:
    by_status = Counter(row["status"] for row in rows)
    groups: dict[str, list] = defaultdict(list)
    for row in rows:
        facility = row["facility"] or "Not yet requested"
        dates = _span(row["planned_start"], row["planned_end"]) if row.get("planned_start") else row["dates"]
        groups[facility].append({**row, "dates": dates, "tone": ALLOCATION_TONES.get(row["status"], "neutral")})
    ordered = sorted(groups.items(), key=lambda item: (item[0].startswith(("Requested", "Not yet")), item[0].lower()))
    waiting = by_status.get("Awaiting ward or mentor", 0)
    unrequested = by_status.get("Not yet requested", 0)
    kpis = [
        {"label": "Students", "value": len(rows), "tone": "neutral"},
        {"label": "Arranged", "value": by_status.get("Arranged", 0), "hint": "Ward and mentor in place"},
        {"label": "Awaiting ward or mentor", "value": waiting, "tone": "attention" if waiting else "neutral"},
        {"label": "Requested of facility", "value": by_status.get("Requested of facility", 0), "tone": "neutral"},
        {"label": "Not yet requested", "value": unrequested, "tone": "attention" if unrequested else "neutral"},
    ]
    context = {
        "scope": scope,
        "description": "Where each student is placed, grouped by facility. Use it to brief wards and mentors before the placement starts.",
        "meta": [{"label": "Scope", "value": scope or "Your institution"}, {"label": "Students", "value": len(rows)},
                 {"label": "Facilities", "value": sum(1 for name, _ in ordered if not name.startswith(("Requested", "Not yet")))}],
        "kpis": kpis,
        "groups": [{"name": name, "count": len(items), "rows": items} for name, items in ordered],
    }
    return render_pdf("documents/allocation_list.html", context, title=title, subject=f"{title} · {_plural(len(rows), 'student')}")


TRAINING_TONES = {"Complete": "success", "In progress": "teal", "Needs refresh": "attention", "Not started": "attention"}


def training_report_pdf(report: dict, rows: list[dict], *, title: str = "Mentor training report", scope: str = "", prepared_for: str = "") -> bytes:
    summary = report["summary"]
    states = Counter(row["state"] for row in rows)
    kpis = [
        {"label": "Mentors", "value": summary["mentors"], "tone": "neutral"},
        {"label": "Fully trained", "value": summary["mentors_complete"], "hint": "Finished every required module"},
        {"label": "In progress", "value": states.get("In progress", 0), "tone": "neutral"},
        {"label": "Not started", "value": states.get("Not started", 0), "tone": "attention" if states.get("Not started") else "neutral"},
        {"label": "Needs refresh", "value": states.get("Needs refresh", 0), "tone": "attention" if states.get("Needs refresh") else "neutral"},
    ]
    context = {
        "scope": scope,
        "description": "Who has finished the required learning modules, and where to follow up. Contains mentor names and email addresses.",
        "meta": [{"label": "Scope", "value": scope or "Your programme"}, {"label": "Required modules", "value": summary["required_modules"]},
                 {"label": "Prepared for", "value": prepared_for or "—"}],
        "kpis": kpis,
        "mentors": [{**row, "tone": TRAINING_TONES.get(row["state"], "neutral"),
                     "last": _date(row["last_activity"]) if row["last_activity"] else "—"} for row in rows],
        "modules": report["modules"],
        "hard_questions": report["hard_questions"],
    }
    return render_pdf("documents/training_report.html", context, title=title, subject=f"{title} · {_plural(len(rows), 'mentor')}")


ROLE_LABELS = {"program_admin": "Programme admin", "coordinator": "University coordinator", "nurse_manager": "Nurse manager",
               "mentor": "Mentor", "student": "Student"}


def scope_label(user) -> str:
    """'Kenya Medical Training College' / 'Kenyatta National Hospital' / the programme name, for the document header."""
    from django.apps import apps

    if user.institution_id:
        name = apps.get_model("institutions", "Institution").objects.filter(id=user.institution_id).values_list("name", flat=True).first()
        if name:
            return name
    if user.facility_id:
        name = apps.get_model("facilities", "Facility").objects.filter(id=user.facility_id).values_list("name", flat=True).first()
        if name:
            return name
    return getattr(user.program, "name", "") or "Programme"


def date_span(start, end) -> str:
    return _span(start, end)
