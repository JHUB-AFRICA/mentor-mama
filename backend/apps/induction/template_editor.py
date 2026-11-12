"""Programme-admin editing of the induction checklist template.

Lifecycle of a version::

    (blank | clone | enhanced draft) -> DRAFT -> publish -> LIVE -> (next publish) -> RETIRED
                                         \\-> discard -> DISCARDED

Rules that matter:

* A published version is immutable. Checklists already opened point at the version they
  started with, so editing one would silently change what a mentor already signed.
  Changes are made by starting a new draft (from the live version, an old version, the
  enhanced draft, or blank) and publishing it.
* One draft and one live version per programme (database constraints back this up).
* New checklists use the live version; publishing retires the previous live version for
  new checklists only. In-flight checklists keep working unchanged.
* Every write is audited. Nothing here ever touches patient data, and the validator
  refuses wording that invites patient identifiers.
"""

from __future__ import annotations

import re
from uuid import UUID

from django.db import IntegrityError, models, transaction
from django.utils import timezone

from apps.core import audit, errors
from apps.identity import api as identity
from apps.induction import enhanced_draft
from apps.induction.models import Checklist, ChecklistTemplate, TemplateItem

TABLE = "induction_checklist_template"
CAPABILITY = "manage_induction_template"

ROLES = ("mentor", "nurse_manager", "mentor_or_nurse_manager", "mentor_and_student")
KINDS = ("standard", "scheduled_date")

MAX_ITEMS = 60
MAX_LABEL = 300
MAX_GUIDANCE = 600
MAX_SECTION = 80
MAX_TITLE = 120
MAX_NOTES = 1000
MIN_LABEL = 5

# -- patient-identifier guard ---------------------------------------------------------------
_PERSON = r"(?:patient|patients|woman|women|mother|mothers|baby|babies|client|clients|her|his|their)"
_IDENTIFIER = (
    r"(?:full\s+|first\s+|last\s+|real\s+)?(?:names?|initials|ids?|id\s+numbers?|hospital\s+numbers?|"
    r"phone\s+numbers?|telephone\s+numbers?|addresses|address|dates?\s+of\s+birth|dob|photos?|photographs?|bed\s+numbers?)"
)
_INVITES = re.compile(
    rf"\b{_PERSON}(?:'s|s')?\s+{_IDENTIFIER}\b"
    r"|\b(?:hospital|mrn|file|folder|ip|op|medical\s+record|national\s+id|patient)\s+(?:number|no\.?)\b"
    r"|\bpatient\s+identifiers?\b"
    r"|\b(?:photos?|photographs?|pictures?|screenshots?)\s+(?:of|from)\s+(?:the\s+|a\s+|each\s+)?(?:patient|patients|woman|women|mother|baby|babies|records?|notes)\b",
    re.IGNORECASE,
)
# Wording that tells people NOT to record identifiers is exactly what we want in the checklist.
_NEGATION = re.compile(r"\b(?:not|never|no|without|don't|do\s+not|avoid|anonymous|anonymise|anonymised|rather\s+than)\b", re.IGNORECASE)
_RAW_IDENTIFIER = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+|(?<!\d)\+?\d[\d\s-]{7,}\d")


def invites_identifiers(text: str) -> bool:
    """True when text looks like it asks someone to write down who a patient is."""
    if not text:
        return False
    if _RAW_IDENTIFIER.search(text):
        return True
    return bool(_INVITES.search(text)) and not _NEGATION.search(text)


# -- payload helpers -----------------------------------------------------------------------
def _clean(value) -> str:
    return re.sub(r"[ \t]+", " ", str(value or "")).strip()


def normalise_items(raw_items: list[dict]) -> list[dict]:
    """Trim and type-coerce incoming items. Does not judge them: validate() does that."""
    items = []
    for raw in raw_items:
        items.append({
            "section": _clean(raw.get("section")),
            "label": re.sub(r"\s+", " ", str(raw.get("label") or "")).strip(),
            "guidance": _clean(raw.get("guidance")),
            "is_required": bool(raw.get("is_required", True)),
            "completed_by_role": str(raw.get("completed_by_role") or "mentor"),
            "response_kind": str(raw.get("response_kind") or "standard"),
        })
    return items


def validate_content(title: str, notes: str, items: list[dict]) -> list[dict]:
    """Return every problem with a draft. An empty list means it can be published."""
    issues: list[dict] = []

    def add(code, message, *, item=None, field=None):
        issues.append({"code": code, "message": message, "item": item, "field": field})

    if len(title) > MAX_TITLE:
        add("title_too_long", f"Keep the title under {MAX_TITLE} characters.", field="title")
    if len(notes) > MAX_NOTES:
        add("notes_too_long", f"Keep the notes under {MAX_NOTES} characters.", field="notes")
    for field, text in (("title", title), ("notes", notes)):
        if invites_identifiers(text):
            add("patient_identifier", "Remove wording that asks for patient names or identifiers.", field=field)
    if not items:
        add("no_items", "Add at least one checklist item.")
    if len(items) > MAX_ITEMS:
        add("too_many_items", f"A checklist can have at most {MAX_ITEMS} items.")
    if items and not any(item["is_required"] for item in items):
        add("no_required_item", "Mark at least one item as required, or no one has to complete the induction.")

    seen: dict[str, int] = {}
    for index, item in enumerate(items):
        label = item["label"]
        if not label:
            add("label_empty", "Write the item text.", item=index, field="label")
        elif len(label) < MIN_LABEL:
            add("label_too_short", "Make the item text a little clearer.", item=index, field="label")
        elif len(label) > MAX_LABEL:
            add("label_too_long", f"Keep item text under {MAX_LABEL} characters. Move detail into the guidance.", item=index, field="label")
        if label:
            key = label.casefold().rstrip(". ")
            if key in seen:
                add("duplicate_label", f"This is the same as item {seen[key] + 1}.", item=index, field="label")
            else:
                seen[key] = index
        if len(item["guidance"]) > MAX_GUIDANCE:
            add("guidance_too_long", f"Keep guidance under {MAX_GUIDANCE} characters.", item=index, field="guidance")
        if len(item["section"]) > MAX_SECTION:
            add("section_too_long", f"Keep section names under {MAX_SECTION} characters.", item=index, field="section")
        if item["completed_by_role"] not in ROLES:
            add("invalid_role", "Choose who completes this item.", item=index, field="completed_by_role")
        if item["response_kind"] not in KINDS:
            add("invalid_kind", "Choose a valid answer type.", item=index, field="response_kind")
        for field in ("label", "guidance", "section"):
            if invites_identifiers(item[field]):
                add("patient_identifier", "Remove wording that asks for patient names or identifiers. MentorMAMA never records them.", item=index, field=field)
    return issues


# -- queries ---------------------------------------------------------------------------------
def _scoped(actor, template_id: UUID, *, lock: bool = False) -> ChecklistTemplate:
    identity.require_capability(actor, CAPABILITY)
    query = ChecklistTemplate.objects.filter(id=template_id, program_id=actor.program_id)
    template = (query.select_for_update() if lock else query).first()
    if template is None:
        raise errors.UnauthorizedFacilityAccess()
    return template


def _item_rows(template: ChecklistTemplate) -> list[dict]:
    return [{
        "id": str(item.id), "position": item.position, "section": item.section, "label": item.label,
        "guidance": item.guidance, "is_required": item.is_required,
        "completed_by_role": item.completed_by_role, "response_kind": item.response_kind,
    } for item in template.items.all().order_by("position")]


def _counts(template_id) -> dict:
    rows = Checklist.objects.filter(template_id=template_id)
    return {
        "in_progress": rows.filter(completed_at__isnull=True).count(),
        "completed": rows.filter(completed_at__isnull=False).count(),
    }


def serialise(template: ChecklistTemplate, *, detail: bool = False) -> dict:
    items = _item_rows(template)
    data = {
        "id": str(template.id), "version": template.version, "status": str(template.status),
        "title": template.title, "notes": template.notes, "source": template.source,
        "created_at": template.created_at, "published_at": template.published_at, "retired_at": template.retired_at,
        "item_count": len(items), "required_count": sum(1 for item in items if item["is_required"]),
        "checklists": _counts(template.id),
        "editable": template.status == ChecklistTemplate.Status.DRAFT,
    }
    if detail:
        data["items"] = items
        data["issues"] = validate_content(template.title, template.notes, normalise_items(items)) \
            if template.status == ChecklistTemplate.Status.DRAFT else []
    return data


def list_versions(actor) -> dict:
    identity.require_capability(actor, CAPABILITY)
    templates = ChecklistTemplate.objects.filter(program_id=actor.program_id).exclude(
        published_at__isnull=True, retired_at__isnull=False,   # discarded drafts
    ).order_by("-version")
    rows = [serialise(template) for template in templates]
    return {
        "live": next((row for row in rows if row["status"] == "published"), None),
        "draft": next((row for row in rows if row["status"] == "draft"), None),
        "versions": rows,
    }


def get_version(actor, template_id: UUID) -> dict:
    return serialise(_scoped(actor, template_id), detail=True)


def enhanced_draft_preview(actor) -> dict:
    identity.require_capability(actor, CAPABILITY)
    items = enhanced_draft.enhanced_items()
    return {
        "title": enhanced_draft.TITLE, "notes": enhanced_draft.NOTES,
        "items": [{**item, "position": position} for position, item in enumerate(items, start=1)],
        "issues": validate_content(enhanced_draft.TITLE, enhanced_draft.NOTES, normalise_items(items)),
    }


# -- commands --------------------------------------------------------------------------------
def _next_version(program_id) -> int:
    return (ChecklistTemplate.objects.filter(program_id=program_id).aggregate(top=models.Max("version"))["top"] or 0) + 1


def _write_items(template: ChecklistTemplate, items: list[dict]) -> None:
    template.items.all().delete()          # drafts have no responses, so nothing protected is lost
    TemplateItem.objects.bulk_create([
        TemplateItem(template=template, position=position, label=item["label"], section=item["section"],
                     guidance=item["guidance"], is_required=item["is_required"],
                     completed_by_role=item["completed_by_role"], response_kind=item["response_kind"])
        for position, item in enumerate(items, start=1)
    ])


@transaction.atomic
def create_draft(actor, *, mode: str, from_version_id: UUID | None = None) -> dict:
    """Start the programme's one draft: blank, cloned from a version, or from the enhanced draft."""
    identity.require_capability(actor, CAPABILITY)
    if mode not in ("blank", "clone", "enhanced"):
        raise errors.SessionValidationFailed(fields={"mode": "choose blank, clone or enhanced"})
    # Serialise concurrent starts for this programme.
    existing = list(ChecklistTemplate.objects.select_for_update().filter(program_id=actor.program_id))
    if any(t.status == ChecklistTemplate.Status.DRAFT for t in existing):
        raise errors.InvalidTransition("There is already a draft in progress. Publish or discard it before starting another.")

    title, notes, items, source = "", "", [], "blank"
    if mode == "clone":
        if from_version_id is None:
            raise errors.SessionValidationFailed(fields={"from_version_id": "choose the version to copy"})
        base = _scoped(actor, from_version_id)
        if base.status == ChecklistTemplate.Status.DISCARDED:
            raise errors.UnauthorizedFacilityAccess()
        title, notes, source = base.title, base.notes, f"version:{base.version}"
        items = normalise_items(_item_rows(base))
    elif mode == "enhanced":
        title, notes, source = enhanced_draft.TITLE, enhanced_draft.NOTES, "enhanced_draft"
        items = normalise_items(enhanced_draft.enhanced_items())

    try:
        with transaction.atomic():
            template = ChecklistTemplate.objects.create(
                program_id=actor.program_id, version=_next_version(actor.program_id),
                title=title, notes=notes, source=source, created_by=actor,
            )
    except IntegrityError as exc:
        raise errors.InvalidTransition("A draft was just started by someone else. Reload to see it.") from exc
    _write_items(template, items)
    audit.record(actor=actor, action="induction_template.draft_created", entity_table=TABLE, entity_id=template.id,
                 changes={"version": template.version, "source": source, "item_count": len(items)})
    return serialise(template, detail=True)


@transaction.atomic
def update_draft(actor, template_id: UUID, *, title: str, notes: str, items: list[dict]) -> dict:
    """Replace a draft's content in one step: add, edit, remove and reorder are all just a new list."""
    template = _scoped(actor, template_id, lock=True)
    if template.status != ChecklistTemplate.Status.DRAFT:
        raise errors.InvalidTransition("Only a draft can be edited. Start a new draft from this version instead.")
    cleaned = normalise_items(items)
    if len(cleaned) > MAX_ITEMS:
        raise errors.SessionValidationFailed(fields={"items": f"at most {MAX_ITEMS} items"})
    template.title, template.notes = _clean(title), notes.strip()
    template.save(update_fields=["title", "notes", "updated_at"])
    _write_items(template, cleaned)
    audit.record(actor=actor, action="induction_template.draft_saved", entity_table=TABLE, entity_id=template.id,
                 changes={"version": template.version, "item_count": len(cleaned)})
    return serialise(template, detail=True)


def validate_draft(actor, template_id: UUID) -> dict:
    template = _scoped(actor, template_id)
    items = normalise_items(_item_rows(template))
    issues = validate_content(template.title, template.notes, items)
    return {"valid": not issues, "issues": issues}


@transaction.atomic
def publish(actor, template_id: UUID) -> dict:
    """Make a draft the live version for NEW checklists. Earlier checklists keep their own version."""
    template = _scoped(actor, template_id, lock=True)
    if template.status != ChecklistTemplate.Status.DRAFT:
        raise errors.InvalidTransition("Only a draft can be published.")
    issues = validate_content(template.title, template.notes, normalise_items(_item_rows(template)))
    if issues:
        raise errors.SessionValidationFailed(
            "Fix the highlighted problems before publishing.", fields={"issues": "see details"}, issues=issues,
        )
    now = timezone.now()
    previous = list(ChecklistTemplate.objects.select_for_update().filter(
        program_id=actor.program_id, published_at__isnull=False, retired_at__isnull=True,
    ))
    for old in previous:
        old.retired_at = now
        old.save(update_fields=["retired_at", "updated_at"])
    template.published_at = now
    template.save(update_fields=["published_at", "updated_at"])
    audit.record(actor=actor, action="induction_template.published", entity_table=TABLE, entity_id=template.id,
                 changes={"version": template.version, "retired_versions": [old.version for old in previous],
                          "item_count": template.items.count()})
    return serialise(template, detail=True)


@transaction.atomic
def discard(actor, template_id: UUID) -> dict:
    """Throw a draft away. The row is kept (marked discarded) so version numbers are never reused."""
    template = _scoped(actor, template_id, lock=True)
    if template.status != ChecklistTemplate.Status.DRAFT:
        raise errors.InvalidTransition("Only a draft can be discarded. Published versions are kept for the record.")
    template.retired_at = timezone.now()
    template.save(update_fields=["retired_at", "updated_at"])
    audit.record(actor=actor, action="induction_template.draft_discarded", entity_table=TABLE, entity_id=template.id,
                 changes={"version": template.version})
    return serialise(template)


@transaction.atomic
def restore(actor, template_id: UUID) -> dict:
    """Bring an old version back as a new draft; the old version itself is untouched."""
    base = _scoped(actor, template_id)
    result = create_draft(actor, mode="clone", from_version_id=base.id)
    audit.record(actor=actor, action="induction_template.restored", entity_table=TABLE, entity_id=UUID(result["id"]),
                 changes={"restored_from_version": base.version})
    return result
