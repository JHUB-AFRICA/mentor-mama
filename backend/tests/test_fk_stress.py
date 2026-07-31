"""Stress test: is the cross-module foreign key load-bearing, or just coupling?

The argument for bare UUID columns instead of FKs is that they decouple modules.
This module tests whether that decoupling costs anything, and the answer is
concrete rather than aesthetic.
"""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from django.db import IntegrityError, connection, transaction

from apps.mentorship.models import Session
from apps.placements.models import MentorAssignment

pytestmark = pytest.mark.django_db(transaction=True)


def test_the_window_trigger_alone_does_not_catch_a_missing_placement(active_placement, mentor):
    """The decisive finding.

    Django declares foreign keys DEFERRABLE INITIALLY DEFERRED, so inside a
    transaction the FK is checked at COMMIT — after the trigger has run. That
    lets us observe exactly what would happen if the FK did not exist at all.

    The INV-04/INV-05 trigger reads the parent with
    `SELECT ... INTO p ... WHERE id = NEW.placement_id`. When no row matches,
    `p.state` is NULL, and `NULL <> 'active'` evaluates to NULL — which is not
    true — so **every guard in the trigger silently passes**. The insert is
    accepted, and only the deferred FK rejects it at commit.

    Conclusion: with bare UUIDs and no FK, a session with a bogus placement_id
    would be written with INV-04 and INV-05 unenforced. The FK is not decoration;
    it is the precondition that makes the trigger meaningful.
    """
    assignment = MentorAssignment.objects.filter(placement=active_placement, ended_at=None).first()
    orphan_placement_id = uuid.uuid4()

    with pytest.raises(IntegrityError) as raised:
        with transaction.atomic():
            # The trigger runs here. If it were doing the work, this line would
            # raise 'mentorship_session_window'. It does not.
            Session.objects.create(
                placement_id=orphan_placement_id,
                mentor_assignment=assignment,
                session_date=dt.date(2030, 1, 1),      # far outside any window
                session_type="debrief",
                created_by=mentor,
            )
            # Force the deferred constraint check while still inside the block.
            with connection.cursor() as cursor:
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")

    message = str(raised.value)
    assert "foreign key" in message.lower(), (
        "the foreign key is what rejected this, not the trigger: " + message
    )
    assert "mentorship_session_window" not in message, (
        "the trigger did not fire — it cannot, because the parent row is absent"
    )


def test_orphaned_rows_are_impossible_for_permitted_targets(active_placement, mentor):
    """The same guarantee, stated positively."""
    assignment = MentorAssignment.objects.filter(placement=active_placement, ended_at=None).first()
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Session.objects.create(
                placement_id=uuid.uuid4(), mentor_assignment=assignment,
                session_date=dt.date(2026, 7, 10), session_type="debrief", created_by=mentor,
            )


def test_placement_cannot_be_deleted_while_children_reference_it(active_placement, mentor):
    """on_delete=PROTECT reinforces INV-10 at the relational level.

    Without an FK there is no PROTECT, and a stray delete would orphan the
    audit trail of a placement rather than being refused.
    """
    from apps.mentorship import services as mentorship_services
    from django.db.models import ProtectedError

    mentorship_services.log_session(
        mentorship_services.LogSession(
            placement_id=active_placement.id, session_date=dt.date(2026, 7, 10),
            session_type="debrief", topics=("communication",),
        ), actor=mentor,
    )
    with pytest.raises(ProtectedError):
        active_placement.delete()
