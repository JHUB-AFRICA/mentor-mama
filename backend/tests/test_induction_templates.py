"""Induction checklist template editor: permissions, draft lifecycle, immutability, and version pinning."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from rest_framework.test import APIClient

from apps.core.models import AuditEntry
from apps.identity.models import Program, Role, Status, User
from apps.induction import enhanced_draft, services, template_editor
from apps.induction.models import Checklist, ChecklistTemplate, TemplateItem
from apps.institutions.models import CohortMembership
from apps.placements import services as placement_services
from apps.placements.models import State

pytestmark = pytest.mark.django_db(transaction=True)

HEADERS = {"HTTP_X_REQUESTED_WITH": "mentormama"}
BASE = "/api/v1/induction/templates"


def client_for(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def write(client, method, url, body=None):
    return getattr(client, method)(url, body or {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS)


@pytest.fixture
def admin(program):
    return User.objects.create_user(
        email="admin@programme.test", password="pw", first_name="Pat", last_name="Admin",
        role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=program,
    )


@pytest.fixture
def other_admin(db):
    other = Program.objects.create(name="Other programme")
    return User.objects.create_user(
        email="admin@other.test", password="pw", first_name="Olu", last_name="Admin",
        role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=other,
    )


def item(label, *, section="", required=True, role="mentor", guidance="", kind="standard"):
    return {"label": label, "section": section, "is_required": required, "completed_by_role": role,
            "guidance": guidance, "response_kind": kind}


def start_enhanced(client):
    response = write(client, "post", BASE, {"mode": "enhanced"})
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def save(client, draft, items, title="Draft"):
    return write(client, "put", f"{BASE}/{draft['id']}", {"title": title, "notes": "", "items": items})


# -- permissions -------------------------------------------------------------------------------
@pytest.mark.parametrize("role_fixture", ["mentor", "nurse_manager", "coordinator", "student"])
def test_only_programme_admins_can_use_the_editor(role_fixture, request, admin, checklist_template):
    user = request.getfixturevalue(role_fixture)
    client = client_for(user)
    assert client.get(BASE, **HEADERS).status_code == 404
    assert client.get(f"{BASE}/{checklist_template.id}", **HEADERS).status_code == 404
    assert write(client, "post", BASE, {"mode": "blank"}).status_code == 404
    assert write(client, "post", f"{BASE}/{checklist_template.id}/publish").status_code == 404
    assert not ChecklistTemplate.objects.filter(published_at__isnull=True).exists()


def test_anonymous_requests_are_refused(checklist_template):
    assert APIClient().get(BASE, **HEADERS).status_code in (401, 403)


def test_other_programmes_cannot_see_or_change_a_programme_template(admin, other_admin, checklist_template):
    draft = start_enhanced(client_for(admin))
    theirs = client_for(other_admin)
    assert theirs.get(f"{BASE}/{checklist_template.id}", **HEADERS).status_code == 404
    assert theirs.get(f"{BASE}/{draft['id']}", **HEADERS).status_code == 404
    assert save(theirs, draft, [item("Welcome the student to the ward.")]).status_code == 404
    assert write(theirs, "post", f"{BASE}/{draft['id']}/publish").status_code == 404
    assert write(theirs, "post", f"{BASE}/{draft['id']}/discard").status_code == 404
    assert write(theirs, "post", BASE, {"mode": "clone", "from_version_id": str(checklist_template.id)}).status_code == 404
    assert theirs.get(BASE, **HEADERS).json()["data"]["versions"] == []
    assert ChecklistTemplate.objects.get(id=draft["id"]).published_at is None


def test_suspended_admin_is_refused(admin, checklist_template):
    admin.status = Status.SUSPENDED
    admin.save(update_fields=["status"])
    assert client_for(admin).get(BASE, **HEADERS).status_code == 404


# -- the enhanced draft ----------------------------------------------------------------------
def test_enhanced_draft_is_well_formed_and_valid():
    items = enhanced_draft.enhanced_items()
    assert 30 <= len(items) <= 40
    assert len({row["section"] for row in items}) == 8
    assert template_editor.validate_content(enhanced_draft.TITLE, enhanced_draft.NOTES,
                                            template_editor.normalise_items(items)) == []
    assert all(row["completed_by_role"] in template_editor.ROLES for row in items)
    assert sum(row["response_kind"] == "scheduled_date" for row in items) == 1
    assert any(row["is_required"] for row in items) and any(not row["is_required"] for row in items)
    assert all(row["guidance"] for row in items)
    assert any("identifiers" in row["label"] and "MentorMAMA" in row["label"] for row in items)


def test_enhanced_draft_preview_endpoint(admin):
    data = client_for(admin).get(f"{BASE}/enhanced-draft", **HEADERS).json()["data"]
    assert data["issues"] == [] and len(data["items"]) == len(enhanced_draft.enhanced_items())


def test_starting_from_enhanced_draft_does_not_publish_or_replace_default(program, admin):
    default, _ = services.ensure_default_template(program)
    draft = start_enhanced(client_for(admin))
    assert draft["status"] == "draft" and draft["source"] == "enhanced_draft"
    default.refresh_from_db()
    assert default.published_at is not None and default.retired_at is None
    assert default.items.count() == len(services.DEFAULT_CHECKLIST_ITEMS) == 8
    live = ChecklistTemplate.objects.filter(program=program, published_at__isnull=False, retired_at=None)
    assert list(live) == [default]


def test_default_template_is_still_version_one(program):
    template, created = services.ensure_default_template(program)
    assert created and template.version == 1 and template.status == "published"
    again, created_again = services.ensure_default_template(program)
    assert not created_again and again.id == template.id


# -- draft lifecycle --------------------------------------------------------------------------
def test_full_draft_lifecycle_with_audit_trail(program, admin):
    default, _ = services.ensure_default_template(program)
    client = client_for(admin)

    listing = client.get(BASE, **HEADERS).json()["data"]
    assert listing["live"]["version"] == 1 and listing["draft"] is None

    draft = start_enhanced(client)
    assert draft["version"] == 2 and draft["editable"] is True and draft["issues"] == []

    # Edit, add, remove and reorder in a single save.
    items = [{k: row[k] for k in ("section", "label", "guidance", "is_required", "completed_by_role", "response_kind")}
             for row in draft["items"]]
    first, second = items[0], items[1]
    items[0], items[1] = second, first            # reorder
    items[0]["label"] = "Student told who their mentor is and how to reach them."   # edit
    items.append(item("A newly added optional item.", section="Extras", required=False, role="nurse_manager"))
    removed = items.pop(5)
    saved = save(client, draft, items, title="Our labour ward checklist").json()["data"]
    assert saved["title"] == "Our labour ward checklist"
    assert [row["label"] for row in saved["items"]][:2] == ["Student told who their mentor is and how to reach them.", first["label"]]
    assert removed["label"] not in [row["label"] for row in saved["items"]]
    assert saved["items"][-1]["completed_by_role"] == "nurse_manager" and saved["items"][-1]["is_required"] is False
    assert [row["position"] for row in saved["items"]] == list(range(1, len(items) + 1))

    validation = write(client, "post", f"{BASE}/{draft['id']}/validate").json()["data"]
    assert validation == {"valid": True, "issues": []}

    published = write(client, "post", f"{BASE}/{draft['id']}/publish").json()["data"]
    assert published["status"] == "published" and published["editable"] is False

    default.refresh_from_db()
    assert default.status == "retired"
    listing = client.get(BASE, **HEADERS).json()["data"]
    assert listing["live"]["id"] == draft["id"] and listing["draft"] is None
    assert [row["status"] for row in listing["versions"]] == ["published", "retired"]

    actions = list(AuditEntry.objects.filter(action__startswith="induction_template.").order_by("occurred_at")
                   .values_list("action", flat=True))
    assert actions == ["induction_template.draft_created", "induction_template.draft_saved", "induction_template.published"]
    assert AuditEntry.objects.filter(action="induction_template.published", actor=admin).exists()


def test_only_one_draft_at_a_time_and_discard_frees_the_slot(program, admin):
    services.ensure_default_template(program)
    client = client_for(admin)
    draft = write(client, "post", BASE, {"mode": "blank"}).json()["data"]
    assert draft["items"] == []
    again = write(client, "post", BASE, {"mode": "enhanced"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "InvalidTransition"

    discarded = write(client, "post", f"{BASE}/{draft['id']}/discard").json()["data"]
    assert discarded["status"] == "discarded"
    assert client.get(BASE, **HEADERS).json()["data"]["draft"] is None
    assert all(row["id"] != draft["id"] for row in client.get(BASE, **HEADERS).json()["data"]["versions"])
    third = write(client, "post", BASE, {"mode": "blank"}).json()["data"]
    assert third["version"] == draft["version"] + 1          # version numbers are never reused
    assert AuditEntry.objects.filter(action="induction_template.draft_discarded").count() == 1
    # A discarded draft can no longer be edited or published.
    assert save(client, draft, [item("Welcome the student to the ward.")]).status_code == 409
    assert write(client, "post", f"{BASE}/{draft['id']}/publish").status_code == 409


def test_publish_is_blocked_until_the_draft_is_valid(program, admin):
    services.ensure_default_template(program)
    client = client_for(admin)
    blank = write(client, "post", BASE, {"mode": "blank"}).json()["data"]
    refused = write(client, "post", f"{BASE}/{blank['id']}/publish")
    assert refused.status_code == 422
    assert {issue["code"] for issue in refused.json()["error"]["details"]["issues"]} == {"no_items"}

    save(client, blank, [item("Welcome the student to the ward.", required=False)])
    refused = write(client, "post", f"{BASE}/{blank['id']}/publish")
    assert {issue["code"] for issue in refused.json()["error"]["details"]["issues"]} == {"no_required_item"}
    assert ChecklistTemplate.objects.get(id=blank["id"]).published_at is None
    assert ChecklistTemplate.objects.get(program=program, version=1).status == "published"


def test_validation_rules():
    def codes(items, title="", notes=""):
        return {(i["code"], i["item"]) for i in template_editor.validate_content(title, notes, template_editor.normalise_items(items))}

    ok = item("Welcome the student to the ward.")
    assert codes([ok, item("welcome the student to the ward")]) == {("duplicate_label", 1)}
    assert codes([item("")]) == {("label_empty", 0)}
    assert codes([item("x" * 301)]) == {("label_too_long", 0)}
    assert codes([item("Show emergency exits.", guidance="g" * 601)]) == {("guidance_too_long", 0)}
    assert codes([item("Show emergency exits.", role="boss")]) == {("invalid_role", 0)}
    assert codes([item("Show emergency exits.", kind="photo")]) == {("invalid_kind", 0)}
    assert codes([item(f"Item number {n} is here.") for n in range(61)]) == {("too_many_items", None)}
    # Wording that invites patient identifiers is refused; wording that forbids them is welcome.
    assert codes([item("Record the patient's name and hospital number.")]) == {("patient_identifier", 0)}
    assert codes([item("Note the woman's phone number in the comment.")]) == {("patient_identifier", 0)}
    assert codes([item("Write 0712345678 in the comment.")]) == {("patient_identifier", 0)}
    assert codes([item("Show the exits.", guidance="Take a photo of the patient's record.")]) == {("patient_identifier", 0)}
    assert codes([ok], notes="Collect each patient's name.") == {("patient_identifier", None)}
    assert codes([item("Never record patient names or hospital numbers in MentorMAMA.")]) == set()


def test_restore_an_old_version_as_a_new_draft(program, admin):
    v1, _ = services.ensure_default_template(program)
    client = client_for(admin)
    draft = start_enhanced(client)
    write(client, "post", f"{BASE}/{draft['id']}/publish")           # v2 live, v1 retired

    restored = write(client, "post", f"{BASE}/{v1.id}/restore").json()["data"]
    assert restored["status"] == "draft" and restored["version"] == 3
    assert [row["label"] for row in restored["items"]] == [label for label, _ in services.DEFAULT_CHECKLIST_ITEMS]
    v1.refresh_from_db()
    assert v1.status == "retired" and v1.items.count() == 8
    assert AuditEntry.objects.filter(action="induction_template.restored", changes__restored_from_version=1).exists()

    # Cloning from the live version works too, once the draft is gone.
    write(client, "post", f"{BASE}/{restored['id']}/discard")
    clone = write(client, "post", BASE, {"mode": "clone", "from_version_id": draft["id"]}).json()["data"]
    assert len(clone["items"]) == len(draft["items"]) and clone["source"] == "version:2"


# -- immutability ---------------------------------------------------------------------------
def test_published_versions_cannot_be_edited_discarded_or_republished(program, admin):
    v1, _ = services.ensure_default_template(program)
    client = client_for(admin)
    before = list(v1.items.values_list("label", flat=True))
    assert save(client, {"id": str(v1.id)}, [item("Changed text for the live version.")]).status_code == 409
    assert write(client, "post", f"{BASE}/{v1.id}/discard").status_code == 409
    assert write(client, "post", f"{BASE}/{v1.id}/publish").status_code == 409
    assert list(v1.items.values_list("label", flat=True)) == before
    detail = client.get(f"{BASE}/{v1.id}", **HEADERS).json()["data"]
    assert detail["editable"] is False and len(detail["items"]) == 8


def test_database_allows_one_live_and_one_draft_per_programme(program):
    from django.db import IntegrityError, transaction

    ChecklistTemplate.objects.create(program=program, version=1, published_at=dt.datetime.now(dt.timezone.utc))
    with pytest.raises(IntegrityError), transaction.atomic():
        ChecklistTemplate.objects.create(program=program, version=2, published_at=dt.datetime.now(dt.timezone.utc))
    ChecklistTemplate.objects.create(program=program, version=3)
    with pytest.raises(IntegrityError), transaction.atomic():
        ChecklistTemplate.objects.create(program=program, version=4)


def test_replayed_publish_does_not_publish_twice(program, admin):
    services.ensure_default_template(program)
    client = client_for(admin)
    draft = start_enhanced(client)
    key = str(uuid.uuid4())
    first = client.post(f"{BASE}/{draft['id']}/publish", {}, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)
    again = client.post(f"{BASE}/{draft['id']}/publish", {}, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)
    assert first.status_code == again.status_code == 200
    assert AuditEntry.objects.filter(action="induction_template.published").count() == 1


# -- pinning: in-flight checklists keep their version -----------------------------------------
def walk_to_orientation(placement, student, coordinator):
    placement_services.transition(placement.id, State.AWAITING_STUDENT, actor=coordinator)
    placement_services.transition(placement.id, State.ORIENTATION, actor=student, asserted_by="student.confirm_placement")
    services.acknowledge_orientation(
        placement.id, actor=student, understands_placement_details=True,
        understands_emergency_process=True, understands_safeguarding=True,
    )


def make_second_placement(program, institution, cohort, ward, mentor, coordinator, nurse_manager):
    second_student = User.objects.create_user(
        email="second@students.jkuat.ac.ke", password="pw", first_name="Second", last_name="Student",
        role=Role.STUDENT, status=Status.ACTIVE, program=program, institution_id=institution.id,
    )
    CohortMembership.objects.create(cohort=cohort, student=second_student)
    placement = placement_services.create_placement(
        placement_services.CreatePlacement(
            cohort_id=cohort.id, student_id=second_student.id,
            planned_start=dt.date(2026, 7, 1), planned_end=dt.date(2026, 9, 1),
        ), actor=coordinator,
    )
    placement_services.allocate_ward(placement.id, ward.id, actor=nurse_manager)
    placement_services.assign_mentor(placement.id, mentor.id, actor=nurse_manager)
    return placement, second_student


def test_in_flight_checklists_keep_their_version_and_new_ones_use_the_new_version(
    program, admin, scheduled_placement, student, mentor, coordinator, nurse_manager, institution, cohort, ward,
):
    v1, _ = services.ensure_default_template(program)
    walk_to_orientation(scheduled_placement, student, coordinator)
    old_checklist = services.open_induction(scheduled_placement.id, actor=mentor)
    assert old_checklist.template_id == v1.id
    first_item = v1.items.first()
    services.answer_item(old_checklist.id, first_item.id, "yes", actor=mentor)

    client = client_for(admin)
    draft = start_enhanced(client)
    assert write(client, "post", f"{BASE}/{draft['id']}/publish").status_code == 200
    detail = client.get(BASE, **HEADERS).json()["data"]
    assert detail["live"]["version"] == 2
    retired = next(row for row in detail["versions"] if row["version"] == 1)
    assert retired["checklists"] == {"in_progress": 1, "completed": 0}

    # The checklist opened earlier is untouched and still valid and signable.
    old_checklist.refresh_from_db()
    assert old_checklist.template_id == v1.id
    mentor_view = client_for(mentor).get(f"/api/v1/placements/{scheduled_placement.id}/induction/checklist", **HEADERS).json()["data"]
    assert mentor_view["template_version"] == 1 and len(mentor_view["items"]) == 8
    assert mentor_view["items"][0]["response"] == "yes" and mentor_view["items"][0]["section"] == ""
    for row in v1.items.exclude(id=first_item.id):
        services.answer_item(old_checklist.id, row.id, "yes", actor=mentor)
    services.sign_induction(old_checklist.id, actor=mentor)
    scheduled_placement.refresh_from_db()
    assert scheduled_placement.state == State.ACTIVE

    # A new student's checklist is opened from the new live version.
    second, second_student = make_second_placement(program, institution, cohort, ward, mentor, coordinator, nurse_manager)
    walk_to_orientation(second, second_student, coordinator)
    new_checklist = services.open_induction(second.id, actor=mentor)
    assert new_checklist.template.version == 2
    assert new_checklist.template.items.count() == len(enhanced_draft.enhanced_items())
    assert Checklist.objects.get(id=old_checklist.id).template.version == 1


def test_group_induction_uses_new_version_with_sections_and_guidance(
    program, admin, scheduled_placement, student, mentor, coordinator, nurse_manager, institution, cohort, ward,
):
    services.ensure_default_template(program)
    admin_client = client_for(admin)
    draft = start_enhanced(admin_client)
    write(admin_client, "post", f"{BASE}/{draft['id']}/publish")

    second, second_student = make_second_placement(program, institution, cohort, ward, mentor, coordinator, nurse_manager)
    walk_to_orientation(scheduled_placement, student, coordinator)
    walk_to_orientation(second, second_student, coordinator)

    mentor_client = client_for(mentor)
    opened = write(mentor_client, "post", "/api/v1/induction/batches",
                   {"placement_ids": [str(scheduled_placement.id), str(second.id)]})
    assert opened.status_code == 201
    batch = opened.json()["data"]
    assert batch["template_version"] == 2
    assert len(batch["items"]) == len(enhanced_draft.enhanced_items())
    assert {row["section"] for row in batch["items"]} >= {"Welcome and introductions", "Emergency preparedness"}
    assert all(row["guidance"] for row in batch["items"])
    assert {"scheduled_date"} == {row["response_kind"] for row in batch["items"] if row["response_kind"] != "standard"}

    # The scheduled-session item needs the agreed date and time before it can be marked done.
    scheduled_item = next(row for row in batch["items"] if row["response_kind"] == "scheduled_date")
    refused = write(mentor_client, "post", f"/api/v1/induction/batches/{batch['id']}/items/{scheduled_item['id']}",
                    {"response": "yes", "comment": ""})
    assert refused.status_code == 422
    for row in batch["items"]:
        comment = "Monday 09:00" if row["response_kind"] == "scheduled_date" else ""
        answered = write(mentor_client, "post", f"/api/v1/induction/batches/{batch['id']}/items/{row['id']}",
                         {"response": "yes", "comment": comment})
        assert answered.status_code == 200, answered.json()
    signed = write(mentor_client, "post", f"/api/v1/induction/batches/{batch['id']}/sign")
    assert signed.status_code == 200
    for placement in (scheduled_placement, second):
        placement.refresh_from_db()
        assert placement.state == State.ACTIVE
    # Checklists in a batch expose the same extra fields on the single-student view.
    single = mentor_client.get(f"/api/v1/placements/{second.id}/induction/checklist", **HEADERS).json()["data"]
    assert single["items"][0]["section"] and single["items"][0]["guidance"]


def test_optional_items_do_not_block_signing(program, admin, scheduled_placement, student, mentor, coordinator):
    services.ensure_default_template(program)
    client = client_for(admin)
    draft = write(client, "post", BASE, {"mode": "blank"}).json()["data"]
    save(client, draft, [item("Show the emergency exits.", section="Safety"),
                         item("Introduce the wider team.", section="Welcome", required=False)])
    write(client, "post", f"{BASE}/{draft['id']}/publish")
    walk_to_orientation(scheduled_placement, student, coordinator)
    checklist = services.open_induction(scheduled_placement.id, actor=mentor)
    required = checklist.template.items.get(is_required=True)
    services.answer_item(checklist.id, required.id, "yes", actor=mentor)
    services.sign_induction(checklist.id, actor=mentor)
    scheduled_placement.refresh_from_db()
    assert scheduled_placement.state == State.ACTIVE
    assert TemplateItem.objects.filter(template=checklist.template).count() == 2
