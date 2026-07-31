"""Factories for the walking skeleton.

Deliberately plain functions rather than a factory library: the skeleton should
not need a dependency to be readable.
"""

from __future__ import annotations

import datetime as dt

import pytest

from apps.assessments.models import Assessment, AssessmentKind
from apps.facilities.models import Facility, Ward
from apps.identity.models import Program, Role, Status, User
from apps.induction.models import ChecklistTemplate, TemplateItem
from apps.institutions.models import Cohort, CohortMembership, Institution
from apps.placements import services as placement_services
from apps.placements.models import State


@pytest.fixture
def program(db):
    return Program.objects.create(name="JKUAT Pilot")


@pytest.fixture
def institution(program):
    return Institution.objects.create(program=program, name="JKUAT School of Nursing")


@pytest.fixture
def facility(program):
    return Facility.objects.create(program=program, name="Kenyatta National Hospital")


@pytest.fixture
def ward(facility):
    return Ward.objects.create(facility=facility, name="Labour Ward", max_students=2)


@pytest.fixture
def cohort(institution):
    return Cohort.objects.create(
        institution=institution,
        name="2026 Term 1",
        start_date=dt.date(2026, 7, 1),
        end_date=dt.date(2026, 12, 1),
        planned_capacity=20,
    )


def _user(program, role, email, institution=None, facility=None):
    return User.objects.create_user(
        email=email, password="pw", first_name=email.split("@")[0].title(), last_name="Test",
        role=role, status=Status.ACTIVE, program=program,
        institution_id=institution.id if institution else None,
        facility_id=facility.id if facility else None,
    )


@pytest.fixture
def coordinator(program, institution):
    return _user(program, Role.COORDINATOR, "coordinator@jkuat.ac.ke", institution=institution)


@pytest.fixture
def nurse_manager(program, facility):
    return _user(program, Role.NURSE_MANAGER, "manager@knh.go.ke", facility=facility)


@pytest.fixture
def mentor(program, facility):
    return _user(program, Role.MENTOR, "mentor@knh.go.ke", facility=facility)


@pytest.fixture
def other_mentor(program, facility):
    return _user(program, Role.MENTOR, "mentor2@knh.go.ke", facility=facility)


@pytest.fixture
def student(program, institution, cohort):
    person = _user(program, Role.STUDENT, "student@students.jkuat.ac.ke", institution=institution)
    CohortMembership.objects.create(cohort=cohort, student=person)
    return person


@pytest.fixture
def checklist_template(program):
    template = ChecklistTemplate.objects.create(
        program=program, version=1, published_at=dt.datetime.now(dt.timezone.utc)
    )
    for position, label in enumerate(
        ["Student welcomed and introduced to the ward team",
         "Ward layout, emergency exits and PPE shown",
         "Emergency escalation protocols briefed"], start=1
    ):
        TemplateItem.objects.create(template=template, position=position, label=label)
    return template


@pytest.fixture
def draft_placement(cohort, student, coordinator):
    return placement_services.create_placement(
        placement_services.CreatePlacement(
            cohort_id=cohort.id, student_id=student.id,
            planned_start=dt.date(2026, 7, 1), planned_end=dt.date(2026, 9, 1),
        ),
        actor=coordinator,
    )


@pytest.fixture
def scheduled_placement(draft_placement, ward, mentor, coordinator, nurse_manager):
    """T-01 fires when the assignment set completes — see WFR-002."""
    placement_services.allocate_ward(draft_placement.id, ward.id, actor=coordinator)
    placement_services.assign_mentor(draft_placement.id, mentor.id, actor=nurse_manager)
    draft_placement.refresh_from_db()
    return draft_placement


@pytest.fixture
def active_placement(scheduled_placement, checklist_template, coordinator, student, mentor, nurse_manager):
    """Walk the real lifecycle to Active — no shortcuts, no direct state writes."""
    from apps.induction import services as induction_services
    from apps.induction.models import TemplateItem as Item

    placement_services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    placement_services.transition(scheduled_placement.id, State.ORIENTATION, actor=student)
    checklist = induction_services.open_induction(scheduled_placement.id, actor=mentor)
    for item in Item.objects.filter(template=checklist.template):
        induction_services.answer_item(checklist.id, item.id, "yes", actor=mentor)
    induction_services.sign_induction(checklist.id, actor=mentor)
    scheduled_placement.refresh_from_db()
    return scheduled_placement


@pytest.fixture
def exit_survey(active_placement):
    """INV-08's precondition, so completion tests can isolate INV-07."""
    return Assessment.objects.create(placement=active_placement, kind=AssessmentKind.EXIT_SURVEY)
